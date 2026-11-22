"""
SpotOn phone renders for the website, built headless in Blender.

  blender -b --factory-startup -P assets/3d/build_scene.py -- \
      --shot features|morph --variant desktop|mobile [--preview] [--stills|--anim] [--out DIR]

Shots
  features  Six held poses for the "How it works" card. Clicking a step plays the
            transition clip between two poses (see export.sh), so each SEG-frame
            segment of this timeline becomes one clip.
  morph     The "One app. Every spot." scroll sequence: a phone rises, a second one
            slides out from behind it, and both drift up out of frame.

Layout (frame coordinates: fx 0 = left, 1 = right; fy 0 = top, 1 = bottom)
  desktop   The render fills the whole card behind the text, so the left ~40% stays
            empty for the pills. Phones may bleed off the top/bottom card edges.
  mobile    The render sits above the text, so phones stay fully inside a safe margin.
Every frame is checked against those rules and violations are printed (FAIL on poses).

Screens come from assets/3d/screens/<name>.png (1284x2778). Missing screens fall back to
a stand-in and print a warning, so a new screenshot only needs dropping in + re-render.
"""
import bpy, sys, os, math
from mathutils import Vector, Euler
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
SHOT = arg('--shot', 'features')
VARIANT = arg('--variant', 'desktop')
PREVIEW = '--preview' in argv
SHADOW_PASS = arg('--pass') == 'shadow'     # features only: the floor-shadow layer
SCALE = float(arg('--scale', '1'))          # resolution multiplier (2 = Retina-sharp)
OUT = arg('--out', os.path.join(HERE, 'render', f'{SHOT}-{VARIANT}'))
FPS = 30

SCREEN_FILES = {
    'find': '1-find', 'gameday': '2-gameday', 'book': '3-book', 'schedule': '3b-schedule',
    'pay': '4-pay', 'reservation': '5-reservation', 'message': '6-message', 'listing': '7-listing',
}
STAND_INS = {'schedule': 'book', 'listing': 'reservation'}

CAMERAS = {  # resolution, preview resolution, lens (mm, 36 mm horizontal sensor)
    'desktop': dict(res=(1600, 900), prev=(960, 540), lens=70),
    'mobile': dict(res=(960, 1200), prev=(540, 675), lens=60),
    'morph-desktop': dict(res=(1600, 900), prev=(800, 450), lens=70),
    'morph-mobile': dict(res=(720, 1280), prev=(360, 640), lens=50),
}

# ── Shots ──────────────────────────────────────────────────────────────────────
# Pose per phone: rot = (pitch X, roll Y, yaw Z) degrees, applied yaw → pitch → roll;
# at = {variant: (fx, fy, distance from camera in metres)}.
OFF_BELOW = {'desktop': (0.80, 1.75, 0.75), 'mobile': (0.70, 1.75, 0.38)}
OFF_ABOVE = {'desktop': (0.80, -0.75, 0.75), 'mobile': (0.70, -0.75, 0.38)}
B_ROT = (-4, -4, -26)

FEATURES = dict(
    seg=40,
    screens={'A': ['find', 'gameday', 'book', 'pay', 'reservation', 'message'], 'B': ['schedule']},
    poses=[
        # 1 Find a spot — big, upright, bleeding off the bottom edge
        {'A': dict(rot=(-6, 4, -18), at={'desktop': (0.69, 0.71, 0.49), 'mobile': (0.5, 0.5, 0.30)}),
         'B': dict(rot=B_ROT, at=OFF_BELOW)},
        # 2 Gameday — turned in perspective, looking up at it, bleeding off the top
        {'A': dict(rot=(14, -3, 34), at={'desktop': (0.68, 0.33, 0.50), 'mobile': (0.5, 0.5, 0.31)}),
         'B': dict(rot=B_ROT, at=OFF_BELOW)},
        # 3 Book by the hour — hourly phone steps back left, scheduling phone rises from below
        {'A': dict(rot=(-4, 3, -20), at={'desktop': (0.56, 0.50, 0.90), 'mobile': (0.30, 0.45, 0.42)}),
         'B': dict(rot=B_ROT, at={'desktop': (0.80, 0.56, 0.74), 'mobile': (0.70, 0.55, 0.38)})},
        # 4 Pay your way — scheduling phone leaves up, payment phone comes forward off the top
        {'A': dict(rot=(5, -3, -12), at={'desktop': (0.68, 0.36, 0.49), 'mobile': (0.5, 0.5, 0.30)}),
         'B': dict(rot=B_ROT, at=OFF_ABOVE)},
        # 5 Your reservation — tipped back on a diagonal, bleeding off the bottom
        {'A': dict(rot=(-30, -28, -10), at={'desktop': (0.665, 0.80, 0.52), 'mobile': (0.5, 0.5, 0.34)}),
         'B': dict(rot=B_ROT, at=OFF_ABOVE)},
        # 6 Message your host — flipped round, floating fully in view
        {'A': dict(rot=(-5, -6, -16), at={'desktop': (0.69, 0.50, 0.64), 'mobile': (0.5, 0.5, 0.31)}),
         'B': dict(rot=B_ROT, at=OFF_ABOVE)},
    ],
    # Per transition: screen events (phone, kind, screen, start, end) in frames from the
    # segment start; spins add whole turns to that phone from the next pose on.
    transitions=[
        dict(events=[('A', 'push', 'gameday', 6, 28)]),
        dict(events=[('A', 'fade', 'book', 10, 20)]),
        dict(events=[('A', 'sheet', 'pay', 10, 30)]),
        dict(events=[('A', 'fade', 'reservation', 10, 26)]),
        dict(events=[('A', 'swap', 'message', 20, 20)], spin={'A': (0, 0, 360)},
             power={'A': [(4, 1), (12, 0), (28, 0), (36, 1)]}),
    ],
)

MORPH = dict(
    screens={'A': ['listing'], 'B': ['find']},
    keys=[  # frame → per-phone pose
        (0, {'A': dict(rot=(-6, 3, -20), at={'desktop': (0.50, 0.98, 0.62), 'mobile': (0.50, 0.95, 0.26)}),
             'B': dict(rot=(-6, 3, -20), at={'desktop': (0.50, 0.98, 0.70), 'mobile': (0.50, 0.95, 0.30)})}),
        (30, {'A': dict(rot=(-4, 2, -16), at={'desktop': (0.50, 0.52, 0.62), 'mobile': (0.50, 0.50, 0.26)}),
              'B': dict(rot=(-4, 2, -16), at={'desktop': (0.50, 0.52, 0.70), 'mobile': (0.50, 0.50, 0.30)})}),
        (60, {'A': dict(rot=(-6, 6, -22), at={'desktop': (0.42, 0.45, 0.62), 'mobile': (0.36, 0.42, 0.26)}),
              'B': dict(rot=(-4, -6, 24), at={'desktop': (0.60, 0.60, 0.66), 'mobile': (0.65, 0.60, 0.28)})}),
        (90, {'A': dict(rot=(-6, 6, -22), at={'desktop': (0.42, -0.05, 0.62), 'mobile': (0.36, -0.02, 0.26)}),
              'B': dict(rot=(-4, -6, 24), at={'desktop': (0.60, 0.15, 0.66), 'mobile': (0.65, 0.15, 0.28)})}),
    ],
)


# ── Scene ──────────────────────────────────────────────────────────────────────
def screen_path(name):
    p = os.path.join(HERE, 'screens', SCREEN_FILES[name] + '.png')
    if not os.path.exists(p):
        alt = STAND_INS[name]
        print(f'WARNING: screens/{SCREEN_FILES[name]}.png missing; using {alt} as a stand-in')
        p = os.path.join(HERE, 'screens', SCREEN_FILES[alt] + '.png')
    return p


def import_phone(tag):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, 'iphone.glb'))
    objs = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in objs if o.type == 'MESH']
    zs = [(o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box]
    cz = (min(zs) + max(zs)) / 2
    pivot = bpy.data.objects.new(f'Phone{tag}', None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot.rotation_mode = 'ZXY'
    for o in objs:
        if o.parent is None:
            o.parent = pivot
            o.location.z -= cz
    screen = next(o for o in meshes if o.name.startswith('Front_Screen'))
    return pivot, meshes, screen


def soften_materials():
    """Apple's silver reads soft and satin, not chrome: rougher metals, quieter glass."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type != 'BSDF_PRINCIPLED':
                continue
            r = n.inputs['Roughness']
            if 'Silver' in m.name and not r.is_linked:
                r.default_value = max(r.default_value, 0.32)
            if 'Glass' in m.name and not r.is_linked:
                n.inputs['Specular IOR Level'].default_value = min(n.inputs['Specular IOR Level'].default_value, 0.3)


def screen_material(screen_obj, names, tag):
    """Emissive screen stacking `names` (later = on top). Each layer has animatable
    du/dv offsets (slides; clipped UVs mask themselves) and a visibility factor f.
    'power' dims the whole display (used while it faces away during a flip)."""
    mat = bpy.data.materials.new(f'Screen{tag}')
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    N = nt.nodes.new; L = nt.links.new
    out = N('ShaderNodeOutputMaterial')
    bsdf = N('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.004, 0.004, 0.005, 1)
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Specular IOR Level'].default_value = 0.04
    bsdf.inputs['Emission Strength'].default_value = 1.0
    L(bsdf.outputs[0], out.inputs[0])
    sep = N('ShaderNodeSeparateXYZ')
    L(N('ShaderNodeTexCoord').outputs['UV'], sep.inputs[0])
    layers, col = {}, None
    for i, name in enumerate(names):
        tex = N('ShaderNodeTexImage'); tex.extension = 'CLIP'; tex.interpolation = 'Cubic'
        tex.image = bpy.data.images.load(screen_path(name), check_existing=True)
        du, dv, f = (N('ShaderNodeValue') for _ in range(3))
        du.name, dv.name, f.name = f'du_{name}', f'dv_{name}', f'f_{name}'
        f.outputs[0].default_value = 1.0 if i == 0 else 0.0
        au = N('ShaderNodeMath'); av = N('ShaderNodeMath')
        L(sep.outputs[0], au.inputs[0]); L(du.outputs[0], au.inputs[1])
        L(sep.outputs[1], av.inputs[0]); L(dv.outputs[0], av.inputs[1])
        cmb = N('ShaderNodeCombineXYZ')
        L(au.outputs[0], cmb.inputs[0]); L(av.outputs[0], cmb.inputs[1]); L(cmb.outputs[0], tex.inputs[0])
        if col is None:
            col = tex.outputs['Color']
        else:
            fac = N('ShaderNodeMath'); fac.operation = 'MULTIPLY'
            L(tex.outputs['Alpha'], fac.inputs[0]); L(f.outputs[0], fac.inputs[1])
            mix = N('ShaderNodeMix'); mix.data_type = 'RGBA'
            L(fac.outputs[0], mix.inputs['Factor']); L(col, mix.inputs[6]); L(tex.outputs['Color'], mix.inputs[7])
            col = mix.outputs[2]
        layers[name] = dict(du=du, dv=dv, f=f)
    power = N('ShaderNodeValue'); power.name = 'power'; power.outputs[0].default_value = 1.0
    pw = N('ShaderNodeCombineColor')
    for k in range(3):
        L(power.outputs[0], pw.inputs[k])
    dim = N('ShaderNodeMix'); dim.data_type = 'RGBA'; dim.blend_type = 'MULTIPLY'
    dim.inputs['Factor'].default_value = 1.0
    L(col, dim.inputs[6]); L(pw.outputs[0], dim.inputs[7]); L(dim.outputs[2], bsdf.inputs['Emission Color'])
    screen_obj.data.materials.clear(); screen_obj.data.materials.append(mat)
    return mat, layers, power


def shadow_catcher(pivot, tag):
    """A small floor that follows the phone (not its rotation) and only shows the
    soft shadow cast by the overhead light: Apple's floating-product shadow."""
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    p = bpy.context.active_object; p.name = f'Shadow{tag}'
    p.is_shadow_catcher = True
    p.visible_shadow = False          # floors never shadow each other
    p.location = (0, 0, -0.115)
    c = p.constraints.new('COPY_LOCATION'); c.target = pivot; c.use_offset = True
    return p
    return p


def lights_and_world():
    sc = bpy.context.scene
    w = bpy.data.worlds.new('Studio'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    ver = '.'.join(bpy.app.version_string.split('.')[:2])
    env.image = bpy.data.images.load(f'/Applications/Blender.app/Contents/Resources/{ver}/datafiles/studiolights/world/studio.exr')
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 0.4
    o = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(env.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], o.inputs[0])

    def area(name, loc, size, energy, aim=(0, 0.6, 0), shadow=False):
        d = bpy.data.lights.new(name, 'AREA'); d.shape = 'RECTANGLE'
        d.size, d.size_y = size; d.energy = energy
        d.use_shadow = shadow   # only the overhead light draws the floor shadow
        ob = bpy.data.objects.new(name, d); sc.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    # Camera sits at the origin looking down +Y; subjects live around y = 0.3 … 0.9.
    area('Key', (-0.6, 0.0, 0.6), (0.6, 0.6), 22)
    area('Fill', (0.8, 0.1, 0.1), (0.8, 0.4), 5)
    area('Rim', (0.5, 1.4, 0.5), (0.3, 0.9), 16)
    area('Top', (0.0, 0.6, 1.0), (0.5, 0.5), 18, aim=(0, 0.6, -1), shadow=True)
    # The studio HDRI lights the metal but must not darken the shadow floors.
    w.cycles_visibility.shadow = False if hasattr(w, 'cycles_visibility') else None


def setup_camera(key):
    sc = bpy.context.scene
    cfg = CAMERAS[key]
    d = bpy.data.cameras.new('Cam'); d.lens = cfg['lens']; d.sensor_width = 36; d.sensor_fit = 'HORIZONTAL'
    cam = bpy.data.objects.new('Cam', d); sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    w, h = cfg['prev'] if PREVIEW else cfg['res']
    w, h = round(w * SCALE), round(h * SCALE)
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    return cam


def frame_point(cam, fx, fy, dist):
    """World point at `dist` in front of the camera that projects to (fx, fy)."""
    tr, br, bl, tl = cam.data.view_frame(scene=bpy.context.scene)
    hx, hy, z0 = tr.x, tr.y, -tr.z
    local = Vector(((2 * fx - 1) * hx * dist / z0, (1 - 2 * fy) * hy * dist / z0, -dist))
    return cam.matrix_world @ local


def key_phone(cam, pivot, frame, pose, variant, extra=(0, 0, 0)):
    fx, fy, d = pose['at'][variant]
    pivot.location = frame_point(cam, fx, fy, d)
    pivot.rotation_euler = Euler([math.radians(a + e) for a, e in zip(pose['rot'], extra)], 'ZXY')
    pivot.keyframe_insert('location', frame=frame)
    pivot.keyframe_insert('rotation_euler', frame=frame)


CONSTANT = set()   # (material name, data_path) whose keys should not ease


def key_value(mat, node, frame, value, constant=False):
    node.outputs[0].default_value = value
    node.outputs[0].keyframe_insert('default_value', frame=frame)
    if constant:
        CONSTANT.add((mat.name, node.outputs[0].path_from_id('default_value')))


def iter_fcurves(action):
    if hasattr(action, 'layers') and action.layers:
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    yield from cb.fcurves
    else:
        yield from action.fcurves


def finalize_interpolation(mats):
    for mat in mats:
        ad = mat.node_tree.animation_data
        if not ad or not ad.action:
            continue
        for fc in iter_fcurves(ad.action):
            const = (mat.name, fc.data_path) in CONSTANT
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT' if const else 'BEZIER'


# ── Animation ──────────────────────────────────────────────────────────────────
def animate_features(cam, phones, mats, variant):
    S = FEATURES['seg']
    F = lambda k: 1 + S * k
    acc = {t: [0, 0, 0] for t in phones}
    for k, pose in enumerate(FEATURES['poses']):
        for t, (pivot, _, _) in phones.items():
            key_phone(cam, pivot, F(k), pose[t], variant, acc[t])
        if k < len(FEATURES['transitions']):
            for t, turn in FEATURES['transitions'][k].get('spin', {}).items():
                acc[t] = [a + s for a, s in zip(acc[t], turn)]
    for k, tr in enumerate(FEATURES['transitions']):
        s = F(k)
        for t, keys in tr.get('power', {}).items():
            mat, _, power = mats[t]
            for off, v in keys:
                key_value(mat, power, s + off, v)
        for t, kind, name, a, b in tr['events']:
            mat, layers, _ = mats[t]
            L = layers[name]
            if kind == 'fade':
                key_value(mat, L['f'], s + a, 0); key_value(mat, L['f'], s + b, 1)
            else:
                key_value(mat, L['f'], s + a - 1, 0, True); key_value(mat, L['f'], s + a, 1, True)
                if kind == 'push':      # slides in from the right, iOS navigation style
                    key_value(mat, L['du'], s, -1); key_value(mat, L['du'], s + a, -1); key_value(mat, L['du'], s + b, 0)
                elif kind == 'sheet':   # rises from the bottom like a sheet
                    key_value(mat, L['dv'], s, 1); key_value(mat, L['dv'], s + a, 1); key_value(mat, L['dv'], s + b, 0)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, F(len(FEATURES['poses']) - 1)
    return [F(k) for k in range(len(FEATURES['poses']))]


def animate_morph(cam, phones, variant):
    for frame, poses in MORPH['keys']:
        for t, (pivot, _, _) in phones.items():
            key_phone(cam, pivot, frame + 1, poses[t], variant)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, MORPH['keys'][-1][0] + 1
    return [k + 1 for k, _ in MORPH['keys']]


# ── Margin check ───────────────────────────────────────────────────────────────
def phone_rect(cam, meshes):
    sc = bpy.context.scene
    pts = [world_to_camera_view(sc, cam, o.matrix_world @ Vector(c)) for o in meshes for c in o.bound_box]
    return min(p.x for p in pts), max(p.x for p in pts), 1 - max(p.y for p in pts), 1 - min(p.y for p in pts)


def hide_offscreen_floors(cam, phones, floors):
    """A phone parked out of frame must not leave its floor in view: the floor would
    catch a faint, grainy shadow along the card edge."""
    sc = bpy.context.scene
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f)
        for t, (_, meshes, _) in phones.items():
            x0, x1, y0, y1 = phone_rect(cam, meshes)
            off = x1 < 0 or x0 > 1 or y1 < 0 or y0 > 1
            floors[t].hide_render = off
            floors[t].keyframe_insert('hide_render', frame=f)


def check_margins(cam, phones, pose_frames, rules):
    sc = bpy.context.scene
    fails, warns = [], []
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f)
        for t, (_, meshes, _) in phones.items():
            pts = [world_to_camera_view(sc, cam, o.matrix_world @ Vector(c)) for o in meshes for c in o.bound_box]
            x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
            y0, y1 = 1 - max(p.y for p in pts), 1 - min(p.y for p in pts)   # 0 = top
            if x1 < 0 or x0 > 1 or y1 < 0 or y0 > 1:
                continue   # entirely out of frame (entering / leaving)
            bad = []
            if x0 < rules['left']: bad.append(f'left {x0:.2f}<{rules["left"]}')
            if x1 > rules['right']: bad.append(f'right {x1:.2f}>{rules["right"]}')
            if 'top' in rules and y0 < rules['top']: bad.append(f'top {y0:.2f}<{rules["top"]}')
            if 'bottom' in rules and y1 > rules['bottom']: bad.append(f'bottom {y1:.2f}>{rules["bottom"]}')
            if bad:
                (fails if f in pose_frames else warns).append(f'frame {f} phone {t}: ' + ', '.join(bad))
    for m in fails:
        print('MARGIN FAIL', m)
    if warns:
        print(f'MARGIN WARN {len(warns)} transition frames, e.g.', warns[0], '|', warns[-1])
    print('MARGIN CHECK', 'OK' if not fails else f'{len(fails)} pose failures')


RULES = {
    ('features', 'desktop'): dict(left=0.40, right=0.98),                       # top/bottom may bleed
    ('features', 'mobile'): dict(left=0.03, right=0.97, top=0.03, bottom=0.97),
    ('morph', 'desktop'): dict(left=0.03, right=0.97),
    ('morph', 'mobile'): dict(left=0.02, right=0.98),
}


def render_settings():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'METAL'
    sc.cycles.device = 'GPU'
    sc.cycles.samples = 64 if SHADOW_PASS else (24 if PREVIEW else 128)
    sc.cycles.use_denoising = True
    sc.render.fps = FPS
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    spec = FEATURES if SHOT == 'features' else MORPH
    phones = {t: import_phone(t) for t in spec['screens']}
    soften_materials()
    mats = {t: screen_material(phones[t][2], spec['screens'][t], t) for t in phones}
    if SHADOW_PASS:
        # Floor shadows render on their own: phones are invisible to the camera but still
        # cast shadows onto floors that follow them. export.sh lays this pass under the
        # phones, so a floor can never slice through a phone that bleeds or crosses it.
        floors = {}
        for t, (pivot, meshes, _) in phones.items():
            floors[t] = shadow_catcher(pivot, t)
            for o in meshes:
                o.visible_camera = False
    lights_and_world()
    cam = setup_camera(VARIANT if SHOT == 'features' else f'morph-{VARIANT}')
    if SHOT == 'features':
        pose_frames = animate_features(cam, phones, mats, VARIANT)
    else:
        pose_frames = animate_morph(cam, phones, VARIANT)
    finalize_interpolation([m for m, _, _ in mats.values()])
    if SHADOW_PASS:
        hide_offscreen_floors(cam, phones, floors)
    render_settings()
    check_margins(cam, phones, pose_frames, RULES[(SHOT, VARIANT)])
    if not SHADOW_PASS:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, f'{SHOT}-{VARIANT}.blend'))
    sc = bpy.context.scene
    os.makedirs(OUT, exist_ok=True)
    if '--frames' in argv:   # specific frames, e.g. --frames 61,81
        for f in map(int, arg('--frames').split(',')):
            sc.frame_set(f)
            sc.render.filepath = os.path.join(OUT, f'frame-{f}.png')
            bpy.ops.render.render(write_still=True)
    elif '--stills' in argv:
        for i, f in enumerate(pose_frames):
            sc.frame_set(f)
            sc.render.filepath = os.path.join(OUT, f'pose-{i + 1}.png')
            bpy.ops.render.render(write_still=True)
    elif '--anim' in argv:
        sc.render.filepath = os.path.join(OUT, 'f_')
        bpy.ops.render.render(animation=True)


main()
