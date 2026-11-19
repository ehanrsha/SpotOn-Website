/**
 * Scroll-scrubbed phone poses.
 *
 * Ported from the scroll-world engine: native scroll (we only READ it), connector clips fetched as Blobs
 * (always seekable), rAF-lerped target time, seek coalescing, iOS priming on first touch, stills as live
 * posters until a clip has painted, lazy prefetch of neighbouring clips, mobile clip variants.
 *
 * Progress p = scroll through the track mapped to [0, N-1]. i = floor(p), f = p - i.
 *   f < HOLD            -> connector i held on its first frame (dwell)
 *   f in [HOLD, 1)      -> connector i, currentTime = ease((f-HOLD)/(1-HOLD)) * duration
 *   stills are only a fallback until a clip has painted (and for reduced motion)
 */

export interface ScrubberOptions {
  track: HTMLElement;
  sticky: HTMLElement;
  stills: HTMLImageElement[];
  clips: string[];
  clipsMobile: string[];
  onStep?: (active: number, p: number) => void;
}

interface Seg {
  i: number;
  url: string;
  urlM: string;
  still: HTMLImageElement;
  video: HTMLVideoElement | null;
  state: 'idle' | 'loading' | 'ready' | 'failed';
  painted: boolean;
  cur: number;
  target: number;
  op: number;
}

const HOLD = 0.35;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ease = (x: number) => 0.5 * x + 0.5 * smooth(clamp(x));

export class PoseScrubber {
  private o: ScrubberOptions;
  private N: number;
  private segs: Seg[] = [];
  private stillOp: number[];
  private vidOp: number[];
  private range = 1;
  private near = false;
  private raf = 0;
  private active = -1;
  private userReady = false;
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  private small = matchMedia('(max-width: 734px)');
  private laidOutW = innerWidth;
  private p = 0;

  constructor(opts: ScrubberOptions) {
    this.o = opts;
    this.N = opts.stills.length;
    this.stillOp = new Array(this.N).fill(-1);
    this.vidOp = new Array(this.N).fill(-1);

    for (let i = 0; i < this.N - 1; i++) {
      this.segs.push({
        i, url: opts.clips[i], urlM: opts.clipsMobile[i], still: opts.stills[i],
        video: null, state: 'idle', painted: false, cur: 0, target: 0, op: 0,
      });
    }

    // Stills: swap to the portrait set on phones before they are fetched (they are lazy).
    if (this.isMobile()) {
      opts.stills.forEach((img) => { const m = img.dataset.m; if (m) img.src = m; });
    }

    this.layout();
    addEventListener('scroll', this.onScroll, { passive: true });
    addEventListener('resize', this.onResize);
    addEventListener('orientationchange', this.layout);
    addEventListener('load', this.layout);
    addEventListener('pointerdown', this.onFirstGesture, { once: true, passive: true });
    addEventListener('touchstart', this.onFirstGesture, { once: true, passive: true });

    new IntersectionObserver(
      (e) => {
        this.near = e[0].isIntersecting;
        if (this.near) { this.load(0); this.load(1); this.read(); }
      },
      { rootMargin: '200% 0px 200% 0px' },
    ).observe(opts.track);

    this.read();
  }

  private isMobile = () => this.coarse || this.small.matches;

  private layout = () => {
    this.laidOutW = innerWidth;
    this.range = Math.max(1, this.o.track.offsetHeight - this.o.sticky.offsetHeight);
    this.read();
  };

  private onResize = () => {
    // Mobile URL-bar show/hide fires height-only resizes; ignore them so nothing jumps.
    if (this.coarse && innerWidth === this.laidOutW) return;
    this.layout();
  };

  private onScroll = () => {
    if (!this.near) return;
    this.read();
  };

  /** scroll position (document y) at which step k's dwell begins */
  stepY(k: number) {
    const top = this.o.track.getBoundingClientRect().top + scrollY;
    return top + (clamp(k, 0, this.N - 1) / (this.N - 1)) * this.range;
  }

  scrollToStep(k: number) {
    scrollTo({ top: Math.round(this.stepY(k)) + 1, behavior: this.reduce ? 'auto' : 'smooth' });
  }

  // ── clips ──
  private async load(i: number) {
    const seg = this.segs[i];
    if (!seg || this.reduce || seg.state !== 'idle') return;
    seg.state = 'loading';
    const url = this.isMobile() && seg.urlM ? seg.urlM : seg.url;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('missing');
      const blob = await r.blob();
      if (blob.type.startsWith('text/') || blob.size < 1024) throw new Error('not a video');
      const v = document.createElement('video');
      v.className = 'fx-layer fx-video';
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
      v.style.opacity = '0';
      v.src = URL.createObjectURL(blob);
      v.addEventListener('loadeddata', () => {
        seg.state = 'ready';
        try { v.currentTime = 0.001; } catch { /* ignore */ }   // force a first painted frame
        if (this.userReady) this.prime(v);
        this.read();
      }, { once: true });
      v.addEventListener('seeked', () => { if (!seg.painted) { seg.painted = true; this.read(); } });
      v.addEventListener('error', () => { seg.state = 'failed'; seg.painted = false; this.read(); });
      seg.still.after(v);
      seg.video = v;
    } catch {
      seg.state = 'failed';
      this.read();
    }
  }

  private prime(v: HTMLVideoElement) {
    if (!this.isMobile()) return;
    try {
      const p = v.play();
      if (p && p.then) p.then(() => { try { v.pause(); } catch { /* ignore */ } }).catch(() => {});
    } catch { /* ignore */ }
  }

  private onFirstGesture = () => {
    if (this.userReady) return;
    this.userReady = true;
    this.segs.forEach((s) => s.video && this.prime(s.video));
  };

  // ── per-scroll work: weights + targets (cheap) ──
  private read() {
    const { N, segs } = this;
    const rect = this.o.track.getBoundingClientRect();
    const p = clamp(-rect.top / this.range) * (N - 1);
    this.p = p;
    const done = p >= N - 1;
    const i = done ? N - 2 : Math.floor(p);
    const f = done ? 1 : p - i;

    // prefetch around the current connector
    if (this.near) { this.load(i - 1); this.load(i); this.load(i + 1); }

    // targets for every clip
    for (const s of segs) {
      if (p <= s.i) s.target = 0;
      else if (p >= s.i + 1) s.target = 1;
      else s.target = ease(clamp((p - s.i - HOLD) / (1 - HOLD)));
    }

    // layer weights
    const sW = new Array(N).fill(0);
    const vW = new Array(N).fill(0);
    let soft = false;
    // Video-only: the phone is always a frame of a connector clip (dwell at step i = clip i's first
    // frame; the last step = the last clip's final frame). Stills are only a fallback while a clip
    // isn't loaded yet, so there is never a video->still swap (no pose or sharpness pop).
    const d = done ? N - 2 : i;
    const seg = segs[d];
    const usable = !!seg && seg.state === 'ready' && seg.painted && !!seg.video;
    if (usable) {
      vW[d] = 1;
    } else {
      soft = true;
      if (done) sW[N - 1] = 1;
      else if (f < HOLD || f < 0.65) sW[i] = 1;
      else sW[i + 1] = 1;
    }
    if (this.reduce) soft = true;
    this.o.sticky.classList.toggle('is-soft', soft);

    for (let k = 0; k < N; k++) {
      if (sW[k] !== this.stillOp[k]) { this.o.stills[k].style.opacity = String(sW[k]); this.stillOp[k] = sW[k]; }
      const v = segs[k]?.video;
      if (v && vW[k] !== this.vidOp[k]) { v.style.opacity = String(vW[k]); this.vidOp[k] = vW[k]; }
    }

    // UI step: the next step counts once the connector is 70% through
    const active = done ? N - 1 : f >= 0.7 ? i + 1 : i;
    if (active !== this.active) { this.active = active; this.o.onStep?.(active, p); }

    this.kick();
  }

  // ── rAF: lerp + coalesced seeks ──
  private kick() {
    if (!this.raf && this.near && !this.reduce) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.raf = 0;
    const eps = this.isMobile() ? 0.02 : 0.008;
    let moving = false;
    for (const s of this.segs) {
      const v = s.video;
      if (!v || s.state !== 'ready') continue;
      const dur = v.duration;
      if (!dur || !isFinite(dur)) continue;
      const d = s.target - s.cur;
      if (Math.abs(d) > 0.0005) { s.cur += d * 0.18; moving = true; } else if (d !== 0) s.cur = s.target;
      if (v.seeking) { moving = true; continue; }   // never queue a seek while the decoder is busy
      const t = clamp(s.cur, 0, 0.999) * dur;
      if (Math.abs(v.currentTime - t) > eps) { try { v.currentTime = t; } catch { /* ignore */ } moving = true; }
    }
    if (moving) this.raf = requestAnimationFrame(this.tick);
  };

  destroy() {
    removeEventListener('scroll', this.onScroll);
    removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.raf);
  }
}
