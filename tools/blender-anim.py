# Renders the room part of the film in Blender (EEVEE, 1920x1080), one PNG per exported frame.
# Run headless:  blender -b -P tools/blender-anim.py   (needs artifacts/blender/room.glb, room.json, path.json)
import bpy, json, math, os, time
from mathutils import Matrix, Quaternion, Vector
ROOT = r"C:\Users\mayan\Desktop\Freelance Work\sunroof"
os.environ["ANIM"] = "1"
exec(open(os.path.join(ROOT, "tools", "blender-room.py")).read())  # builds the scene, skips its test stills
keys = json.load(open(os.path.join(ROOT, "artifacts", "blender", "path-wall.json" if os.environ.get("MODE") == "window" else "path.json")))  
peak = max(k["sunI"] for k in keys) or 1
PILOT = os.environ.get("PILOT")  # e.g. PILOT=130,200,280,430,485 renders only those keys, for a look test
if PILOT: keys = [keys[int(j)] for j in PILOT.split(",")]
OUT = os.path.join(ROOT, "artifacts", "blender", "pilot" if PILOT else "frames") + ("_window" if os.environ.get("MODE") == "window" else "")
OUT = os.environ.get("OUTDIR") or OUT  # a separate folder per test clip
os.makedirs(OUT, exist_ok=True)
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_depth = "8"; scene.render.dither_intensity = 1.5  # dithered 8-bit: 16-bit PNGs band when shown on 8-bit screens
bpy.context.preferences.system.anisotropic_filter = "FILTER_16"  # textures stay sharp at grazing angles
bpy.context.preferences.system.gl_texture_limit = "CLAMP_1024"  # the GPU shares system RAM: full-size scans pushed it past 90% and froze the machine
scene.render.filter_size = .6  # default 1.5 px blurs every edge; .6 keeps edges crisp
SS = os.environ.get("SS") in ("1", "4k", "3k", "720")  # supersample: render 4K, shrink to 1080p, so every edge is averaged from 4 pixels (~2.5x slower)
if SS: scene.render.resolution_x, scene.render.resolution_y = {"4k": (3840, 2160), "3k": (2880, 1620), "720": (1280, 720)}.get(os.environ.get("SS"), (2560, 1440)); scene.eevee.taa_render_samples = int(os.environ.get("TAA", 32)); scene.render.filter_size = 1.0; scene.eevee.shadow_pool_size = "512"  # 1440p straight: 4K ate the shared GPU memory and froze the machine
if SS: scene.eevee.ray_tracing_options.resolution_scale = scene.eevee.fast_gi_resolution = "2"
baked = None
CYC = os.environ.get("ENGINE") == "cycles"  # path-traced: real bounce light, no screen-space limits (CPU, slower)
if CYC:
    scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = int(os.environ.get("CYS", 128)); scene.cycles.adaptive_threshold = .02
    scene.cycles.use_denoising = True; scene.cycles.denoiser = "OPENIMAGEDENOISE"; scene.cycles.max_bounces = 8; scene.cycles.diffuse_bounces = 4; scene.cycles.glossy_bounces = 3
    scene.cycles.volume_bounces = 0; scene.cycles.sample_clamp_indirect = 10
    scene.render.resolution_x, scene.render.resolution_y = (1280, 720) if os.environ.get("CYLO") else (2560, 1440); scene.render.filter_size = 1.5; SS = False
    for o in scene.objects:
        if o.type == "LIGHT" and o.name.split(".")[0] in ("Bounce", "FloorBounce"): o.hide_render = True  # fakes for EEVEE's missing bounce
    fog.hide_render = True  # haze is costly in a path tracer and adds little here
    OUT += "_cycles"; os.makedirs(OUT, exist_ok=True)
# the film's scroll position per frame, and the night building, both exported by tools/city-to-blender.mjs
CJ = os.path.join(ROOT, "artifacts", "blender", "city.json"); CITY = json.load(open(CJ)) if os.path.exists(CJ) else None
def up(p, a, b): t = min(1, max(0, (p - a) / (b - a))); return t * t * t * (t * (6 * t - 15) + 10)  # same easing as three/shared.ts
FL = [Y_UP @ Vector(v) for v in ((1.4, 2.4, 11.5), (-1, 2.45, 5.6), (.6, 2.3, 1.6), (0, 2.3, -.4), (0, 3.38, -.4))]  # the product's flight in world.ts
def flight(t):  # Catmull-Rom through FL
    n = len(FL) - 1; s = min(t * n, n - 1e-6); j = int(s); u = s - j
    p0, p1, p2, p3 = FL[max(j - 1, 0)], FL[j], FL[j + 1], FL[min(j + 2, n)]
    return .5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u ** 3)
cityo, citym = [], []
def load_city():  # only once the film reaches the building: its 2M vertices cost ~1 GB the room frames do not need
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "artifacts", "blender", "city.glb"))
    gains = {n_: g_ for n_, _, g_ in CITY["parts"]}
    for o in set(bpy.data.objects) - before:
        if o.type != "MESH": continue
        import bmesh; bw = bmesh.new(); bw.from_mesh(o.data); n0 = len(bw.verts); bmesh.ops.remove_doubles(bw, verts=bw.verts, dist=1e-4); bw.to_mesh(o.data); print("CITY weld", o.name, n0, len(bw.verts)); bw.free()  # exported as loose triangles: welding cuts its memory ~3x
        if len(o.data.vertices) > 100000:  # the storeys: far, dim silhouettes, so 40% of the triangles is plenty (RAM)
            md = o.modifiers.new("dec", "DECIMATE"); md.ratio = .4; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier="dec"); print("CITY dec", o.name, len(o.data.vertices))
        cityo.append(o); o.visible_shadow = False; mt = bpy.data.materials.new("City"); mt.use_nodes = True; nt = mt.node_tree; nt.nodes.clear()
        at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_name = "Color"; e_ = nt.nodes.new("ShaderNodeEmission"); g_ = gains.get(o.data.name, gains.get(o.name.split(".")[0], [1, 1, 1]))
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1; mx.inputs[7].default_value = (*g_, 1)
        nt.links.new(at.outputs[0], mx.inputs[6]); nt.links.new(mx.outputs[2], e_.inputs[0]); nt.links.new(e_.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
        o.data.materials.clear(); o.data.materials.append(mt); citym.append(e_)
    print("CITY", len(cityo), "objects")
bg0 = tuple(bg.inputs[0].default_value); bgs0 = bg.inputs[1].default_value
# ---- the unit's flight, the dark stage and the exploded view, timed as in world.ts ----
def under(o, a):
    while o:
        if o == a: return True
        o = o.parent
    return False
SLOT = unit.location.copy(); STAGE = Y_UP @ Vector((0, 1.84, -.4)); SC = 3.3 / (SX1 - SX0)  # on the stage it is shown at the original unit's width
ORDER = sorted(range(len(flyers)), key=lambda j: (round(flyers[j]["home"][0], 2), flyers[j]["home"][1]))  # left to right, front pane then back pane
staged = set(layers) | set(beams) | {unit, frameE, lid} | set(flyers)
roomo = [o for o in scene.objects if o.type == "MESH" and not (under(o, unit) and not W_) and o not in staged and o != fog and not any(under(o, a_) for a_ in aw)]  # the arch windows hide themselves
for fe in flyers:
    for c in fe.children:
        if c.name.startswith("SkyMuntin"): c["h"] = c.location.copy()  # on the stage the pane's wood grid travels with the frame, the frosted plate stays with the sky layer
archL = [l for l in archl if l.name.startswith("ArchLight")]  # one per arch, in arch_win order
for o in roomo: o["h0"] = o.hide_render
gl = bpy.data.meshes.new("StageGlow"); bmz = bmesh.new(); bmesh.ops.create_grid(bmz, x_segments=1, y_segments=1, size=.5); bmz.to_mesh(gl); bmz.free()
glo = bpy.data.objects.new("StageGlow", gl); scene.collection.objects.link(glo); glo.location = (STAGE.x, STAGE.y, .01); glo.scale = (9, 7, 1); glo.visible_shadow = False
gm = bpy.data.materials.new("StageGlow"); gm.use_nodes = True; gt = gm.node_tree; gt.nodes.clear(); tco = gt.nodes.new("ShaderNodeTexCoord"); mp = gt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (2, 2.5, 1)
gr = gt.nodes.new("ShaderNodeTexGradient"); gr.gradient_type = "SPHERICAL"; gt.links.new(tco.outputs["Object"], mp.inputs[0]); gt.links.new(mp.outputs[0], gr.inputs[0])
pw2 = gt.nodes.new("ShaderNodeMath"); pw2.operation = "POWER"; pw2.inputs[1].default_value = 2.2; gt.links.new(gr.outputs[1], pw2.inputs[0])
gem = gt.nodes.new("ShaderNodeEmission"); gem.inputs[0].default_value = (1, .74, .46, 1); gmul = gt.nodes.new("ShaderNodeMath"); gmul.operation = "MULTIPLY"; gt.links.new(pw2.outputs[0], gmul.inputs[0]); gt.links.new(gmul.outputs[0], gem.inputs[1])
gtr = gt.nodes.new("ShaderNodeBsdfTransparent"); gad = gt.nodes.new("ShaderNodeAddShader"); gt.links.new(gtr.outputs[0], gad.inputs[0]); gt.links.new(gem.outputs[0], gad.inputs[1])  # additive like three.js: outside the glow the room floor shows through, no black sheet
gt.links.new(gad.outputs[0], gt.nodes.new("ShaderNodeOutputMaterial").inputs[0]); gl.materials.append(gm)
keyl = []  # soft studio lights for the exploded view: big boxes above and in front, so the metal has something to reflect
for nm, loc, sz, en in (("StageTop", (0, STAGE.y, 6), 5, 900), ("StageFront", (0, STAGE.y + 6, 3), 4, 500)):
    ld = bpy.data.lights.new(nm, "AREA"); ld.shape = "SQUARE"; ld.size = sz; ld.color = (1, .94, .86); ld["base"] = en; ld.volume_factor = 0; ld.specular_factor = .3  # soft glare only: full mirror hits on the glass sheets hid the layers
    lo_ = bpy.data.objects.new(nm, ld); scene.collection.objects.link(lo_); lo_.location = loc; lo_.rotation_euler = (Vector((0, STAGE.y, STAGE.z)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); keyl.append(lo_)
reset = {area.data, fill.data, sun.data} | {l.data for l in archl}
e0 = {l.data: l.data.energy for l in scene.objects if l.type == "LIGHT"}
t0 = time.time()
for n, k in enumerate(keys):
    path = os.path.join(OUT, f"f{k['i']:05d}.png")
    if os.path.exists(path): continue  # resumable
    q = k["q"]; cam.matrix_world = Y_UP @ (Matrix.Translation(Vector(k["p"])) @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4())
    p = CITY["ps"][k["i"] // 2] if CITY else k["i"] / 1439
    stage = up(p, .405, .45) * (1 - up(p, .665, .71)); lit = 1 - stage  # world.ts stageAt: the room goes dark for the exploded view
    dn = up(p, .43, .47) * (1 - up(p, .64, .7)); e = up(p, .47, .54) * (1 - up(p, .6, .66)); s = 1 + (SC - 1) * dn
    pw_ = max(up(p, .225, .29), stage) * (1 - e * .55)  # world.ts product.power: the LEDs and the sky plate light up on the stage
    glows["GlassEdge"].default_value = 2.5 * stage; glows["LED"].default_value = 6 * pw_ * stage
    if W_:  # the skylight is simply installed; the arch windows are the product
        lid.hide_render = True; seated = len(flyers)
        for o in layers: o.hide_render = True
        for r, j in enumerate((1, 0, 2)):  # left, middle, right
            a = .07 + r * .035; t = up(p, a, a + .055); e_ = aw[j]
            g_ = Vector((0, -(5.5 * (1 - up(t, 0, .8)) + .45 * (1 - up(t, .7, 1))), .3 * (1 - up(t, 0, .8))))  # glide in from the room at head height, then push back into the recess
            e_.location = (Vector(e_["home"]).lerp(STAGE + Vector((0, 0, .3)), dn) if j == 0 else Vector(e_["home"])) + g_
            for o in e_.children:
                if not o.get("inner"): o.hide_render = t < .001 or (j and stage > .995)
            alid[j].location.y = alid[j]["dy"] * up(p, .03, .065); archL[j].hide_render = t < .999
        aws = 1 + .3 * dn; aw[0].scale = (aws, aws, aws)  # the arch is a third of the ceiling unit's width: shown larger on the stage
        aw[0].rotation_euler = (math.pi / 2 * dn, float(os.environ.get("WTILT", -.3)) * e, math.radians(115) * up(p, .45, .53) + math.radians(65) * up(p, .61, .68))  # on the stage it lies flat like the ceiling unit, layers stacked upward; it turns slowly on its own axis and holds still at three-quarters while the labels show
        for o in aexp:
            if o.get("inner"): o.hide_render = dn < .01
            o.location = Vector(o["home"]) + Vector((0, o["lift"] * e * 1.1 / aws, 0))  # world spread close to the ceiling unit's
    else:
        lid.location.z = lid["z0"] + (top + .01 - CZ) * up(p, .03, .065)  # the plain ceiling recesses
        d = lambda t: Vector((0, -6.6 * (1 - up(t, 0, .8)), -.58 * (1 - up(t, .7, 1))))  # glide in from above the camera just under the ceiling, level, then lift into the recess; each piece keeps its place in the formation
        tf = up(p, .07, .125); frameE.location = d(tf) + Vector((0, 0, (-1.28 - .025) * e / s))  # the frame first, then the panes one by one
        seated = 0
        for r, j in enumerate(ORDER):
            a = .095 + r * .075 / max(1, len(ORDER) - 1); t = up(p, a, a + .045); fe = flyers[j]
            fe.location = Vector(fe["home"]) + d(t) + Vector((0, 0, (-.74 - .022) * e / s)); seated += t > .999
            for c in fe.children:
                if "h" in c: c.location = Vector(c["h"]) + Vector((0, 0, (-1.305 + .762) * e / s))
            if not W_:
                for l_ in skyl[2 * j:2 * j + 2]: l_.hide_render = t < .999  # its light comes on once it sits in its slot
        for o in layers: o.hide_render = dn < .01; o.location = Vector(o["home"]) + Vector((0, 0, o["lift"] * e / s))
        unit.location = SLOT.lerp(STAGE, dn); unit.rotation_euler = (e * .22, 0, up(p, .45, .67) * math.pi * 2); unit.scale = (s, s, s)
    for o in roomo: o.hide_render = stage > .995 or o["h0"]
    glo.hide_render = stage < .01; gmul.inputs[1].default_value = stage * 1.2
    for l_ in keyl: l_.hide_render = stage < .01; l_.data.energy = l_.data["base"] * stage
    fin = up(p, .88, .96)  # the building reveal at night
    if CITY and p > .86 and not cityo: load_city()
    for o in cityo: o.hide_render = p <= .86
    fog.hide_render = p > .86 or stage > .5 or CYC; area.data.use_shadow = p <= .86 and not W_  # at the building pull-out the haze and pane shadows do not read; dropping them keeps RAM under 90%
    for e_ in citym: e_.inputs[1].default_value = (fin + .03) / 1.03
    bg.inputs[0].default_value = tuple(a * (1 - fin) + b * fin for a, b in zip(bg0, (.012, .016, .03, 1))); bg.inputs[1].default_value = bgs0 * (1 - fin) + fin
    fwd = cam.matrix_world.to_quaternion() @ Vector((0, 0, -1)); cam.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()  # level horizon: no camera roll
    cam.data.angle_y = math.radians(k["fov"])  # the film's own lens, as on the website
    dust.location = (.04 * math.sin(k["i"] * .011), .03 * math.cos(k["i"] * .007), -((k["i"] * .0004) % .2))  # slow drift
    ign = up(p, .225, .29); lvl = max(.04 + .3 * (1 - ign), k["sunI"] / peak) * lit; c = k["sunCol"]; m = max(c) or 1  # a dull grey room before sunrise (world.ts dullC), dark on the stage
    lsun = k["sunI"] / peak * lit  # real sun only: no shafts before sunrise
    AMB = float(os.environ.get("AMB", .35 + .5 * min(1, max(0, (lvl - .6) / .4))))  # more sky fill toward noon (side walls went dark); dawn and dusk keep their contrast  # skylight/arch fill against the sun: lower = more contrast
    area.data.energy = 440 * lvl * SKYK * AMB  # x4: one per pane
    fill.data.energy = 220 * lvl * SKYK * AMB
    RAMP = ((0, (1, .3, .08)), (.15, (1, .32, .1)), (.35, (1, .5, .18)), (.6, (1, .78, .45)), (.9, (1, .96, .9)), (1, (1, .97, .93)))  # red-orange, orange, yellow, white by sun height: dawn climbs it, dusk walks back down
    j_ = next(j for j in range(1, len(RAMP)) if lvl <= RAMP[j][0]); (a0, c0), (a1, c1) = RAMP[j_ - 1], RAMP[j_]; w_ = (lvl - a0) / (a1 - a0)
    tint = tuple((x + (y - x) * w_) * ign + g * (1 - ign) for x, y, g in zip(c0, c1, (.74, .71, .67)))  # smooth: interpolated, no pink (the path colour's blue floor read pink)
    dk = up(p, .84, .9); tint = tuple(a * (1 - dk) + v * dk for a, v in zip(tint, (1, .6, .3)))  # dusk: a deep, vivid orange (the website's 18:00 look)
    area.data.color = tint; cool = .45 * ign * (1 - .5 * dk); fill.data.color = tuple(a * (1 - cool) + b * cool for a, b in zip(tint, (.8, .87, 1)))  # the fill is sky light: cooler than the sun
    for l in archl:
        if l.name.startswith(("ArchLight", "SunShaft")): l.data.color = tint
    for em_, base_ in [(eg, (1, .88, .72))] + [(g, (1, .88, .72)) for g in archg]:  # the frosted glass glows in the same colour
        sc_ = em_.inputs[0].links[0].from_node if em_.inputs[0].links else None
        if sc_: sc_.inputs[0].default_value = tuple(a * (b * (1 - stage) + c_ * stage) for a, b, c_ in zip(base_, tint, (1, .93, .82)))  # warm white plate on the stage
    eg.inputs[1].default_value = max(float(os.environ.get("DGLOW", 4)) * lvl, 2.2 * pw_ * stage)  # reads as glowing, the frost falloff still shows
    for b in glowing: b.inputs["Emission Strength"].default_value = 0  # the frame wood was self-lit, which read as painted on
    for pn_ in panes: pn_.inputs[1].default_value = 4 * lvl  # below clipping, so the frosted falloff shows
    for l in archl: l.data.energy = l.data["base"] * (lsun ** .5 if l.name.startswith("SunShaft") else lvl * (AMB if l.name.startswith("ArchLight") else 1))  # low sun still throws strong rays: dawn and dusk shafts no longer fade out with the room light
    for g in archg: g.inputs[1].default_value = max(float(os.environ.get("AGLOW", 5.4)) * lvl, 3 * pw_ * stage * (g == archg[0]))  # bright daylight glass; AgX rolls the top off softly, the bloom haloes it
    sd = Y_UP @ Vector(k["sunDir"]); el0 = math.asin(max(-1, min(1, sd.z))); hw = 0 if W_ else up(math.degrees(el0), 45, 75)  # (window mode: its sun already stands low outside the back wall) a noon sun straight down lit the whole view evenly under this big skylight: cap it at 60 deg, from behind the camera, so the patch lands where it is seen
    hz = Vector((sd.x, sd.y, 0)); hz = (hz.normalized() if hz.length > 1e-4 else Vector((0, -1, 0))) * (1 - hw) + Vector((0, -1, 0)) * hw; el = el0 if W_ else min(el0, math.radians(float(os.environ.get("SUNEL", 60))))
    sd = hz.normalized() * math.cos(el) + Vector((0, 0, math.sin(el))); sun.rotation_euler = (-sd).to_track_quat("-Z", "Y").to_euler()
    sun.data.energy = float(os.environ.get("SUN", 80)) * (float(os.environ.get("WSUNK", 2)) if W_ else 1) * lsun * (1 - up(p, .885, .915));  # the panel beam stays flat: tilted, its edge pokes through the ceiling sun.data.color = tuple(.3 + .7 * v / m for v in c)
    scene.view_settings.exposure = -.2 - float(os.environ.get("XPULL", 1.6)) * max(0, lvl - .7) + (.6 if os.environ.get("MODE") == "window" else 0)  # the arches light less of the room than the skylight  # midday sun is ~4x dawn: pull exposure so it doesn't blow out
    beamv = (.17 - .05 * up(p, .7, .8)) * (1 - up(p, .86, 1)) * (1 - e * .4) * lit  # world.ts dayBeam
    sz_ = max(.05, sd.z)
    for b_ in beams:
        px_, py_, w_, d_ = b_["pane"]; z_ = top - .01; L_ = z_ / sz_
        b_.matrix_world = Matrix(((w_, 0, sd.x * L_, px_), (0, d_, sd.y * L_, py_), (0, 0, sd.z * L_, z_), (0, 0, 0, 1)))
        b_.hide_render = beamv * lsun < .002 or seated < len(flyers) or W_
    beam_em.inputs[0].default_value = (*tint, 1); beam_gain.default_value = float(os.environ.get("BEAM", 0)) * beamv * lsun ** .5
    for l_, en_ in e0.items():
        if l_ not in reset and not l_.name.startswith("Stage"): l_.energy = en_ * lit
    bg.inputs[1].default_value *= max(.02, lit)
    if not CYC and stage < .995 and (baked is None or abs(lvl - baked) > .05 * max(baked, .2)):  # re-bake the bounce light only when the light level moved (~11 s)
        for o in scene.objects: o.select_set(False)
        bpy.context.view_layer.objects.active = bvol; bvol.select_set(True); vis = [o.hide_render for o in cityo]
        for o in cityo: o.hide_render = o.hide_viewport = True  # the building is far outside the probe and its 2M vertices ran the GPU out of memory
        bpy.ops.object.lightprobe_cache_bake(subset="ACTIVE"); baked = lvl
        for o, v in zip(cityo, vis): o.hide_render = v; o.hide_viewport = False
    if os.environ.get("TOPDOWN"):  # plan view for checking the layout: ortho from above, ceiling clipped away
        cam.data.type = "ORTHO"; cam.data.ortho_scale = 10.5; cam.matrix_world = Matrix.Translation((0, .2, 20)); cam.data.clip_start = 16.9
        path = os.path.join(OUT, "top.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"{n + 1}/{len(keys)} frame {k['i']} {round(time.time() - t0)}s", flush=True)
