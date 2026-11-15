# Builds the room in Blender from artifacts/blender/room.glb + room.json (see tools/room-to-blender.mjs)
# and renders test stills. Run through the Blender MCP add-on: node tools/blender.mjs tools/blender-room.py
import bpy, bmesh, json, math, time, os, random
from mathutils import Matrix, Quaternion, Vector

ROOT = r"C:\Users\mayan\Desktop\Freelance Work\sunroof"
TEX = os.path.join(ROOT, "public", "sunrooof", "tex")
OUT = os.path.join(ROOT, "artifacts", "blender")
meta = json.load(open(os.path.join(OUT, "room.json")))

# ---- fresh scene with the room ----
bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "room.glb"))
scene = bpy.context.scene
Y_UP = Matrix.Rotation(math.radians(90), 4, "X")  # three.js (Y up) to Blender (Z up)

# ---- camera, exactly as in the film ----
c = meta["camera"]
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
scene.collection.objects.link(cam); scene.camera = cam
q = c["q"]; m3 = Matrix.Translation(Vector(c["p"])) @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4()
cam.matrix_world = Y_UP @ m3
cam.data.sensor_fit = "VERTICAL"; cam.data.angle_y = math.radians(c["fov"])
scene.render.resolution_x, scene.render.resolution_y = 1280, 720

# ---- materials ----
def img(name, colour=False):
    p = os.path.join(TEX, name)
    if not os.path.exists(p): p = os.path.join(OUT, "tex", name)  # Poly Haven 2k scans used only in Blender
    i = bpy.data.images.load(p, check_existing=True)
    i.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    return i

def scan(mat, tex, tile, tint=None, normal=.6, sheen=0.0, rough=None):
    """Principled material from a Poly Haven scan; the room's UVs are in metres."""
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    uv = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1 / tile,) * 3
    nt.links.new(uv.outputs["UV"], mp.inputs[0])
    def t(name, colour):
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = img(f"{tex}_{name}.jpg", colour); nt.links.new(mp.outputs[0], n.inputs[0]); return n
    d = t("diff", True)
    if tint:
        mul = nt.nodes.new("ShaderNodeVectorMath"); mul.operation = "MULTIPLY"; nt.links.new(d.outputs[0], mul.inputs[0]); mul.inputs[1].default_value = tint; nt.links.new(mul.outputs[0], bsdf.inputs["Base Color"])
    else:
        nt.links.new(d.outputs[0], bsdf.inputs["Base Color"])
    rt = t("rough", False)
    if rough:  # remap a too-glossy scan into (lo, hi): e.g. a satin floor, not a mirror
        mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[3].default_value, mr.inputs[4].default_value = rough
        mr.inputs[2].default_value = .25; nt.links.new(rt.outputs[0], mr.inputs[0]); nt.links.new(mr.outputs[0], bsdf.inputs["Roughness"])
    else: nt.links.new(rt.outputs[0], bsdf.inputs["Roughness"])
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs[0].default_value = normal
    nt.links.new(t("nor", False).outputs[0], nm.inputs[1]); nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    if sheen: bsdf.inputs["Sheen Weight"].default_value = sheen
    return bsdf

def paint(mat, colour, normal):
    """Flat paint over plaster relief."""
    b = scan(mat, "painted_plaster_wall", 2.5, normal=normal)
    nt = mat.node_tree
    for l in list(nt.links):
        if l.to_socket == b.inputs["Base Color"]: nt.links.remove(l)
    b.inputs["Base Color"].default_value = (*colour, 1)

def srgb(h):
    return tuple(((int(h[i:i + 2], 16) / 255 + .055) / 1.055) ** 2.4 for i in (1, 3, 5))

done = set()
# the panel frame is the material with that deep wood colour
frame_mat = next((m.name for m in bpy.data.materials if m.node_tree and any(n.type == "BSDF_PRINCIPLED" and abs(n.inputs["Base Color"].default_value[0] - .37) < .02 for n in m.node_tree.nodes)), None)
for ob in scene.objects:
    if ob.type != "MESH": continue
    key = ob.name.split(".")[0]
    for slot in ob.material_slots:
        m = slot.material
        if not m or m.name in done: continue
        done.add(m.name)
        if key == "wall": paint(m, srgb("#d8d0c3"), .7)
        elif key == "ceil": paint(m, srgb("#ece7df"), .2)
        elif key == "floor": scan(m, "herringbone_parquet", 1.6, normal=1.0, rough=(.35, .7))
        elif key == "rug": scan(m, "rough_linen", .9, tint=srgb("#d9cdb9"), normal=1)
        elif key == "linen": scan(m, "rough_linen", .45, tint=srgb("#e8dcc6"), normal=1, sheen=.3)
        elif key in ("oak", "slat"): scan(m, "wood_floor", .9, tint=srgb("#c8a27a") if key == "oak" else srgb("#8a6040"), normal=.5)
        elif m.name == frame_mat: scan(m, "wood_floor", .7, tint=srgb("#b07850"), normal=.4)
        elif key == "cushion": scan(m, "velour_velvet", .35, tint=srgb("#c2603e"), normal=.8, sheen=.8)

# ---- light: sun through the front, the panel as a skylight, soft sky ----
s = meta["sun"]; d = Y_UP @ Vector(s["dir"])
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); scene.collection.objects.link(sun)
sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler(); sun.data.energy = 3; sun.data.angle = math.radians(float(os.environ.get("SANG", 8)))  # a wider disc: softer patch edges and shafts
sun.data.color = s["color"]  # sunlight reaches the room only through the fixture opening (its glass and slabs cast no shadow below)
# close the open front of the cut-away room, just behind the camera
bm2 = bmesh.new(); bmesh.ops.create_cube(bm2, size=1); wm = bpy.data.meshes.new("Front"); bm2.to_mesh(wm); bm2.free()
front = bpy.data.objects.new("Front", wm); scene.collection.objects.link(front); front.location = Y_UP @ Vector((0, 1.7, 7.15)); front.scale = (11, .3, 3.6)
fm = bpy.data.materials.new("FrontWall"); fm.use_nodes = True; fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*srgb("#d8d0c3"), 1); front.data.materials.append(fm)

# skylight: an area light the size of the panel, a little below the ceiling, aimed down along the sun
H, PZ = 3.4, -.4
area = bpy.data.objects.new("Panel", bpy.data.lights.new("Panel", "AREA")); scene.collection.objects.link(area)
area.data.shape = "RECTANGLE"; area.data.size, area.data.size_y = 3.2, 2.0; area.data.energy = 1400
area.data.color = (1, .72, .48); area.data.spread = math.radians(14)  # a narrow beam throws sharp sun patches, as the product does
area.location = Y_UP @ Vector((0, 3.24, PZ)); area.rotation_euler = (0, 0, 0); area.visible_camera = False
# the diffuser also glows into the whole room, softly, like a real skylight does
fill = bpy.data.objects.new("PanelFill", bpy.data.lights.new("PanelFill", "AREA")); scene.collection.objects.link(fill)
fill.data.shape = "RECTANGLE"; fill.data.size, fill.data.size_y = 3.2, 2.0; fill.data.energy = 600; fill.data.color = (1, .9, .8); fill.data.volume_factor = 0
fill.location = Y_UP @ Vector((0, 3.24, PZ)); fill.visible_camera = False
# the glowing diffuser, seen between the frame bars
bm3 = bmesh.new(); bmesh.ops.create_grid(bm3, x_segments=1, y_segments=1, size=.5); bmesh.ops.scale(bm3, vec=(3.28, 2.08, 1), verts=bm3.verts); dm = bpy.data.meshes.new("Diffuser"); bm3.to_mesh(dm); bm3.free()
dif = bpy.data.objects.new("Diffuser", dm); scene.collection.objects.link(dif); dif.location = Y_UP @ Vector((0, 3.300, PZ)); dif.rotation_euler = (math.pi, 0, 0)  # between the grid bars (from 3.297 up) and the slab (3.304): the product mullions sit in front of the glow
em = bpy.data.materials.new("Diffuser"); em.use_nodes = True; en = em.node_tree; en.nodes.clear(); eg = en.nodes.new("ShaderNodeEmission"); eg.inputs[0].default_value = (1, .88, .72, 1); eg.inputs[1].default_value = 7
en.links.new(eg.outputs[0], en.nodes.new("ShaderNodeOutputMaterial").inputs[0]); dif.data.materials.append(em); dif.visible_shadow = False
glowing = []
for m in bpy.data.materials:
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.node_tree else None
    if b and b.inputs["Emission Color"].links: b.inputs["Emission Strength"].default_value = 6; glowing.append(b)  # the diffuser
# three.js glow materials arrive unlit: near-white ones (the panes) become light sources, coloured ones plain surfaces
panes = []
for m in bpy.data.materials:
    e = next((n for n in m.node_tree.nodes if n.type == "EMISSION"), None) if m.node_tree else None
    if e and m.name != "Diffuser" and max(e.inputs[0].default_value[:3]) > .1 and not e.inputs[0].links:
        c = e.inputs[0].default_value[:3]; nt = m.node_tree; nt.nodes.clear()
        if min(c) / max(c) > .7:
            g = nt.nodes.new("ShaderNodeEmission"); g.inputs[0].default_value = (1, .8, .6, 1); g.inputs[1].default_value = 10; panes.append(g)
        else:
            g = nt.nodes.new("ShaderNodeBsdfPrincipled"); g.inputs["Base Color"].default_value = (*c, 1); g.inputs["Roughness"].default_value = .6
        nt.links.new(g.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
# glowing glass must not block the sun; scanned relief reads stronger under hard light
for ob in scene.objects:
    if ob.type == "MESH" and any(s.material and s.material.node_tree and any(n.type == "EMISSION" for n in s.material.node_tree.nodes) for s in ob.material_slots): ob.visible_shadow = False
for m in bpy.data.materials:
    for n in (m.node_tree.nodes if m.node_tree else []):
        if n.type == "NORMAL_MAP": n.inputs[0].default_value = max(n.inputs[0].default_value, 1.2)
# per-instance colours (the books) arrive as a colour attribute: multiply them into the base colour
for ob in scene.objects:
    if ob.type != "MESH" or not ob.data.color_attributes: continue
    for slot in ob.material_slots:
        m = slot.material; bs = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.node_tree else None
        if not bs or any(n.type == "VERTEX_COLOR" for n in m.node_tree.nodes): continue
        nt = m.node_tree; vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = ob.data.color_attributes[0].name
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1
        if bs.inputs["Base Color"].links: nt.links.new(bs.inputs["Base Color"].links[0].from_socket, mul.inputs[6])
        else: mul.inputs[6].default_value = bs.inputs["Base Color"].default_value
        nt.links.new(vc.outputs[0], mul.inputs[7]); nt.links.new(mul.outputs[2], bs.inputs["Base Color"])

# ---- realism pass: scanned surfaces by projection (no UV seams), bevelled edges, finer shadows ----
drums = []
bpy.context.view_layer.update()  # fresh world matrices for the bounding boxes below
def box_scan(m, tex, tile, tint, normal, sheen=0.0, rough=None):
    b = scan(m, tex, tile, tint=tint, normal=normal, sheen=sheen, rough=rough); nt = m.node_tree
    tc = next(n for n in nt.nodes if n.type == "TEX_COORD"); mp = next(n for n in nt.nodes if n.type == "MAPPING")
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    for n in nt.nodes:
        if n.type == "TEX_IMAGE": n.projection = "BOX"; n.projection_blend = .3
    return b
for ob in list(scene.objects):
    if ob.type != "MESH" or not ob.material_slots or not ob.material_slots[0].material: continue
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector([min(v[i] for v in bb) for i in range(3)]); hi = Vector([max(v[i] for v in bb) for i in range(3)]); d = hi - lo
    m = ob.material_slots[0].material; key = ob.name.split(".")[0]
    if key in ("Diffuser", "Front", "Haze", "Dust"): continue  # helpers built here, not room surfaces
    if key == "geometry_0":  # off-white boucle (Poly Haven curly teddy scan), lifted toward cream
        box_scan(m, "rough_linen", .3, tuple(1.4 * v for v in srgb("#cbbfab")), .9, sheen=.3)  # fine off-white linen weave: reads as upholstery fabric
        nt_ = m.node_tree; mul_ = next(n for n in nt_.nodes if n.type == "VECT_MATH" and n.operation == "MULTIPLY"); src_ = mul_.inputs[0].links[0].from_socket
        bw_ = nt_.nodes.new("ShaderNodeRGBToBW"); nt_.links.new(src_, bw_.inputs[0]); nt_.links.new(bw_.outputs[0], mul_.inputs[0])  # the scan is blue-grey linen: keep its weave, not its colour; print("REAL sofa", ob.name)
    elif key != "floor" and hi.z < .04 and d.x > 3: box_scan(m, "wool_boucle", .5, srgb("#d8cdbb"), 1.6, sheen=.4); print("REAL rug", ob.name)
    elif lo.z < .03 and .3 < hi.z < .5 and .5 < d.x < 1.2 and abs(d.x - d.y) < .1: ob.hide_render = True; drums.append(ob)  # replaced by a sculptural table below
    elif 3.29 < lo.z < 3.31 and d.x > 3 and len(ob.data.polygons) == 12:  # the product's diffuser slab: every face glows
        for sl in ob.material_slots:
            if not sl.material: continue
            nt = sl.material.node_tree; glowing[:] = [b for b in glowing if b.id_data != nt]; panes[:] = [p for p in panes if p.id_data != nt]
            nt.nodes.clear(); g = nt.nodes.new("ShaderNodeEmission"); g.inputs[0].default_value = (1, .9, .78, 1); g.inputs[1].default_value = 40; panes.append(g)
            nt.links.new(g.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
        ob.visible_shadow = False; print("REAL slab", ob.name)
    elif lo.z > 3.3 and m.surface_render_method == "BLENDED": ob.hide_render = True  # tinted glass layers only grey the panes
    elif 3.42 < lo.z < 3.44 and d.x > 3:  # the panes behind the product's grid: a light source that clips white
        nt = m.node_tree; glowing[:] = [b for b in glowing if b.id_data != nt]; panes[:] = [p for p in panes if p.id_data != nt]
        nt.nodes.clear(); g = nt.nodes.new("ShaderNodeEmission"); g.inputs[0].default_value = (1, .9, .78, 1); g.inputs[1].default_value = 40; panes.append(g)
        nt.links.new(g.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0]); ob.visible_shadow = False; print("REAL panes", ob.name)
    elif len(ob.data.polygons) <= 200 and key not in ("Diffuser", "Front"):
        bv = ob.modifiers.new("Bevel", "BEVEL"); bv.width = .004; bv.segments = 2; bv.harden_normals = True; bv.limit_method = "ANGLE"
# walnut veneer on the slat wall and the bookcase carcass
for ob in scene.objects:
    if ob.type != "MESH" or not ob.material_slots or not ob.material_slots[0].material: continue
    m = ob.material_slots[0].material; key = ob.name.split(".")[0]
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]; lox = min(v.x for v in bb)
    if m.get("veneer"): continue
    if key == "slat": box_scan(m, "smoked_walnut_veneer", 1.2, srgb("#9a7a64"), 1.0); m["veneer"] = 1
    elif lox > 4.55 and len(ob.data.polygons) <= 12 and not ob.data.color_attributes: box_scan(m, "black_walnut_veneer_01", 1.0, srgb("#6a4c3a"), 1.0); m["veneer"] = 1
# cream limewashed walls, mottled like real limewash; the side walls a touch warmer
wm_ = next(s.material for o in scene.objects if o.name.split(".")[0] == "wall" for s in o.material_slots)
nt = wm_.node_tree; bw = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
geo = nt.nodes.new("ShaderNodeNewGeometry"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(geo.outputs["Position"], sep.inputs[0])
isback = nt.nodes.new("ShaderNodeMath"); isback.operation = "GREATER_THAN"; isback.inputs[1].default_value = 3.3; nt.links.new(sep.outputs[1], isback.inputs[0])
noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1.6; noise.inputs["Detail"].default_value = 8; noise.inputs["Roughness"].default_value = .62
def tone(a, b):
    r = nt.nodes.new("ShaderNodeValToRGB"); nt.links.new(noise.outputs[0], r.inputs[0]); r.color_ramp.elements[0].position = .35; r.color_ramp.elements[1].position = .7
    r.color_ramp.elements[0].color = (*srgb(a), 1); r.color_ramp.elements[1].color = (*srgb(b), 1); return r
back, side = tone("#c9b28a", "#d8c6a2"), tone("#c4aa80", "#d4bf98")  # cream limewash: lifts the bounce light, the room reads airy
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; nt.links.new(isback.outputs[0], mix.inputs[0]); nt.links.new(side.outputs[0], mix.inputs[6]); nt.links.new(back.outputs[0], mix.inputs[7])
nt.links.new(mix.outputs[2], bw.inputs["Base Color"])
# a smaller room: side walls in from 5 m to 4.25 m; depth cut from 11.2 m to 6 m (back wall 4.2 -> 3.2, front -7 -> -2.8), centred near the skylight
SX, BACK, FRONT, NB, NF = .95, 4.2, -7.0, 3.5, -3.2  # ~12% roomier around the sunken seating
A_ = (NB - NF) / (BACK - FRONT); B_ = NB - A_ * BACK; AFF = Matrix.Translation((0, B_, 0)) @ Matrix.Diagonal((1, A_, 1, 1))
bpy.context.view_layer.update()
for ob in list(scene.objects):
    if ob.type != "MESH" or ob.parent is not None and ob.parent.type == "MESH": continue
    key = ob.name.split(".")[0]
    if key in ("Diffuser", "Front", "Haze", "Dust") or ob.name.startswith("geometry_0"): continue
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]; lo = Vector([min(v[i] for v in bb) for i in range(3)]); hi = Vector([max(v[i] for v in bb) for i in range(3)])
    if lo.z > 3.2 and abs((lo.x + hi.x) / 2) < 2: continue  # the skylight stays where the ceiling cutout is
    if key in ("wall", "ceil", "floor", "trim"):
        ob.data.transform(Matrix.Diagonal((SX, 1, 1, 1))); ob.data.transform(AFF); continue
    side = hi.x > 4.4 or lo.x < -4.4
    m = ob.matrix_world.copy()
    if side: m.translation.x += (-1 if lo.x > 0 else 1) * 5 * (1 - SX)  # in the world matrix, so the depth step below keeps it
    if side and hi.y - lo.y > 2: ob.matrix_world = AFF @ m  # slats, bookcase, rails: shorten along the wall
    elif side or lo.y > 3.5:  # short side pieces and everything on the back wall keep their size, ride with the walls
        cy = (lo.y + hi.y) / 2; m.translation.y += (A_ * cy + B_) - cy if side else NB - BACK; ob.matrix_world = m
front.location.y = NF - .15; front.visible_camera = False
for ob in scene.objects:
    if ob.type == "MESH" and ob.name.split(".")[0] == "floor" and ob.data.uv_layers:
        me = ob.data; ul = me.uv_layers.active.data; mw = ob.matrix_world
        for li, lp in enumerate(me.loops): v = mw @ me.vertices[lp.vertex_index].co; ul[li].uv = (v.x, v.y)
# seating: sectionals top and bottom facing each other, chaises on the left (open to the TV), a straight sofa on the right;
# every seat ~50 cm from a 1.1 x 1.5 m table, sectionals pushed left so each right-hand corner leaves a way in
C, TX, TY, G, CH, CW = Vector((.3, .4, 0)), 1.1, 1.5, .5, .47, .98
bpy.context.view_layer.update()
def box(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; return Vector([min(v[i] for v in bb) for i in range(3)]), Vector([max(v[i] for v in bb) for i in range(3)])
def shift(o, dx, dy):
    m = o.matrix_world.copy(); m.translation += Vector((dx, dy, 0)); o.matrix_world = m
L, LONG, LOVE, RUG = (bpy.data.objects.get(n) for n in ("geometry_0", "geometry_0.001", "geometry_0.002", "Mesh_12"))
lo, hi = box(LONG); shift(LONG, C.x - TX / 2 - CW - .5 - lo.x, C.y + TY / 2 + G - CH - lo.y)  # top, back to the painting
bpy.context.view_layer.update()
L.matrix_world = Matrix.Translation((0, C.y, 0)) @ Matrix.Diagonal((1, -1, 1, 1)) @ Matrix.Translation((0, -C.y, 0)) @ LONG.matrix_world  # bottom: its mirror
lo, hi = box(LOVE); c = (lo + hi) / 2; LOVE.matrix_world = Matrix.Translation((c.x, c.y, 0)) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation((-c.x, -c.y, 0)) @ LOVE.matrix_world
bpy.context.view_layer.update()
lo, hi = box(LOVE); shift(LOVE, C.x + TX / 2 + G - lo.x, C.y - (lo.y + hi.y) / 2)  # right, facing the table
lo, hi = box(RUG); shift(RUG, C.x - (lo.x + hi.x) / 2, C.y - (lo.y + hi.y) / 2)
# the library ladder leans at the back of the bookcase
FACE = 4.62 - 5 * (1 - SX)  # bookcase front after the side walls move
lad = [o for o in scene.objects if o.type == "MESH" and (lambda b: FACE - .77 < b[0].x < FACE - .01 and b[1].x < FACE + .03 and b[1].y - b[0].y < .6)(box(o))]  # rails and rungs leaning off the bookcase
if lad:
    cy = sum((box(o)[0].y + box(o)[1].y) / 2 for o in lad) / len(lad)
    for o in lad: shift(o, 0, 1.95 - cy)
    for o in scene.objects:  # stray brass rung pieces left at the old ladder spot
        if o.type == "MESH" and o.material_slots and o.material_slots[0].material and o.material_slots[0].material.name == "Material_23" and (lambda b: b[0].x > FACE - .01 and (b[0].y + b[1].y) / 2 < 0 and b[1].y - b[0].y < .6)(box(o)): o.hide_render = True
    print("REAL ladder", len(lad), round(cy, 2))
# real plants (Poly Haven, CC0) along the empty right side, on the floor
def imp(pid, x, y, z=0, rz=0, sc=1.0):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "assets", pid, pid + ".gltf"))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None: o.location = (x, y, z); o.rotation_euler.z += rz; o.scale = tuple(v * sc for v in o.scale)
    return new
# the console moves under the TV on the left wall; its plain decor gives way to real ceramics, brass and wood
bpy.context.view_layer.update()
grp = [o for o in scene.objects if o.type == "MESH" and not (o.parent and o.parent.type == "MESH") and not o.name.startswith(("geometry_0", "Front", "Diffuser", "Haze", "Dust"))
       and (lambda b: b[0].y > 2.6 and b[1].z < 1.3 and abs((b[0].x + b[1].x) / 2) < 2.2 and b[1].x - b[0].x < 3)(box(o))]
if grp:
    body = max(grp, key=lambda o: (lambda b: (b[1].x - b[0].x) * (b[1].y - b[0].y))(box(o)))
    for o in grp:
        if o is not body: o.hide_render = True
    blo, bhi = box(body); top, cdep, cc = bhi.z, bhi.y - blo.y, (blo + bhi) / 2
    tv = next(o for o in scene.objects if o.type == "MESH" and o.name.split(".")[0] == "ink"); tlo, thi = box(tv); ty = (tlo.y + thi.y) / 2
    dty = .5 * ((NB + NF) / 2 - ty)
    tvp = [o for o in scene.objects if o.type == "MESH" and (lambda b: b[0].x > tlo.x - .05 and b[1].x < thi.x + .05 and b[0].y > tlo.y - .05 and b[1].y < thi.y + .05 and b[0].z > tlo.z - .05 and b[1].z < thi.z + .05)(box(o))]
    for o in tvp:
        if o.parent not in tvp: shift(o, 0, dty)
    ty += dty
    cx = -5 * SX + .08 + cdep / 2 + .02
    body.matrix_world = Matrix.Translation((cx, ty, 0)) @ Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Translation((-cc.x, -cc.y, 0)) @ body.matrix_world
    clen = bhi.x - blo.x
    for dy, rz in ((-(clen / 2 - .16), 1.2), (clen / 2 - .16, 2.9)):  # a matched pair at the far ends, clear of the TV
        imp("antique_ceramic_vase_01", cx, ty + dy, top, rz)
    fv = imp("brass_vase_03", cx, ty - clen / 2 - .32, 0, .3); bpy.context.view_layer.update()
    fh = max((o.matrix_world @ Vector(c)).z for o in fv if o.type == "MESH" for c in o.bound_box)
    for o in fv:
        if o.parent is None: o.scale = tuple(v * .85 / fh for v in o.scale)  # a tall floor vase, ~85 cm
    cm_ = bpy.data.materials.new("ConsoleWalnut"); box_scan(cm_, "black_walnut_veneer_01", 1.0, srgb("#6a4c3a"), 1.0)
    body.data.materials.clear(); body.data.materials.append(cm_)  # walnut, like the bookcase, instead of a flat grey block
    print("REAL console", body.name, round(top, 2), len(grp))
def place(pid, x, y, rz, sc, potted=False):
    z = 0
    if potted:  # pot-less Poly Haven plants go into a clay planter
        pot = imp("planter_pot_clay", x, y); bpy.context.view_layer.update()
        pz = max((o.matrix_world @ Vector(c)).z for o in pot if o.type == "MESH" for c in o.bound_box); k = .42 / pz
        for o in pot:
            if o.parent is None: o.scale = tuple(v * k for v in o.scale)
        z = .38
    imp(pid, x, y, z, rz, sc); print("REAL plant", pid)
imp("pachira_aquatica_01", -4.05, 3.0, .5 * 1.65, .4, 1.05)  # rooted in the urn below: taller, fuller corner
for args in [("potted_plant_01", -4.05, 3.0, 1.1, 1.65), ("anthurium_botany_01", -3.45, 3.2, .9, .95, True), ("calathea_orbifolia_01", 3.35, 3.2, 2.0, 1.2, True),
             ("fern_02", -1.75, 3.3, 1.3, 1.1, True), ("anthurium_botany_01", 2.45, 3.3, 2.6, .85, True)]:  # all potted, all at the back
    place(*args)
# the centre table: a black block with a carved walnut lattice (Poly Haven, CC0), where the drums stood
bpy.context.view_layer.update()
cs = [o.matrix_world @ (sum((Vector(c) for c in o.bound_box), Vector()) / 8) for o in drums]; tc_ = C
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "assets", "modern_coffee_table_02", "modern_coffee_table_02.gltf"))
new = [o for o in bpy.data.objects if o not in before]; bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in new if o.type == "MESH" for c in o.bound_box]
wx = max(p.x for p in pts) - min(p.x for p in pts); wy = max(p.y for p in pts) - min(p.y for p in pts)
piv = bpy.data.objects.new("TablePivot", None); scene.collection.objects.link(piv)
for o in new:
    if o.parent is None: o.parent = piv
piv.scale = (TX / wx, TY / wy, 1.0); piv.location = (tc_.x, tc_.y, 0)
print("REAL table", round(wx, 2), round(wy, 2))
ttop = max(p.z for p in pts)
bowl = imp("wooden_bowl_01", tc_.x, tc_.y, ttop, .6, 1.0); bpy.context.view_layer.update()
for o in bowl:
    if o.parent is None: o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted()
bpts = [o.matrix_world @ Vector(c) for o in bowl if o.type == "MESH" for c in o.bound_box]
br = (max(p.x for p in bpts) - min(p.x for p in bpts)) / 2; btop = max(p.z for p in bpts)
rnd2 = random.Random(11); pots_ = {}
for col in ("#7a2632", "#c0662a", "#5e3820", "#6a5888", "#d8c49c", "#9a3a2a"):
    mm = bpy.data.materials.new("Potpourri"); mm.use_nodes = True; q_ = mm.node_tree.nodes["Principled BSDF"]; q_.inputs["Base Color"].default_value = (*srgb(col), 1); q_.inputs["Roughness"].default_value = .7
    pots_[col] = (bmesh.new(), mm)
for _ in range(170):
    col = rnd2.choice(list(pots_)); bmq = pots_[col][0]; ang = rnd2.uniform(0, 6.283); d_ = br * .62 * math.sqrt(rnd2.random())
    r_ = rnd2.uniform(.008, .016); z_ = btop - .028 + .03 * (1 - (d_ / (br * .62)) ** 2) + rnd2.uniform(0, .006)
    mtx = Matrix.Translation((tc_.x + d_ * math.cos(ang), tc_.y + d_ * math.sin(ang), z_)) @ Matrix.Rotation(rnd2.uniform(0, 3), 4, "X") @ Matrix.Diagonal((1, 1, .45, 1))
    bmesh.ops.create_icosphere(bmq, subdivisions=2, radius=r_, matrix=mtx)
for col, (bmq, mm) in pots_.items():
    me = bpy.data.meshes.new("Potpourri"); bmq.to_mesh(me); bmq.free(); ob = bpy.data.objects.new("Potpourri", me); scene.collection.objects.link(ob); me.materials.append(mm)
    ob.parent = piv; ob.matrix_parent_inverse = piv.matrix_world.inverted()
# back wall: three Ohara Koson bird-and-flower prints (Rijksmuseum, CC0) in Ceiling mode, three arched windows in Window mode
bpy.context.view_layer.update()
for o in scene.objects:
    if o.type == "MESH" and not o.name.startswith("Front"):
        lo, hi = box(o)
        if lo.y > 2.9 and lo.z > 1.0 and hi.z < 2.7 and 1.3 < hi.x - lo.x < 1.95 and abs((lo.x + hi.x) / 2) < .3: o.hide_render = True
archl = []
dark = bpy.data.materials.new("ArchFrame"); dark.use_nodes = True; dp = dark.node_tree.nodes["Principled BSDF"]
dp.inputs["Base Color"].default_value = (*srgb("#1c1712"), 1); dp.inputs["Roughness"].default_value = .45; dp.inputs["Metallic"].default_value = .6
def arch_face(name, x, w, h, zb, y, mat):  # a round-headed opening in the wall plane, facing the room
    r = w / 2; pts = [(x - r, zb), (x + r, zb)] + [(x + r * math.cos(t * math.pi / 24), zb + h - r + r * math.sin(t * math.pi / 24)) for t in range(25)]
    bma = bmesh.new(); vs = [bma.verts.new((px, y, pz)) for px, pz in pts]; bma.faces.new(vs[::-1]); me = bpy.data.meshes.new(name); bma.to_mesh(me); bma.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); me.materials.append(mat); return ob
def slab(name, x0, x1, y0, y1, z0, z1, mat, uv=False):
    bmz = bmesh.new(); bmesh.ops.create_cube(bmz, size=1); me = bpy.data.meshes.new(name); bmz.to_mesh(me); bmz.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); me.transform(Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1))); me.materials.append(mat)  # size baked in: object coords stay in metres for box mapping
    if uv:  # world-metre UVs, like the room floor
        me.uv_layers.new(); ul = me.uv_layers[0].data
        for poly in me.polygons:
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co; ul[li].uv = (ob.location.x + co.x * ob.scale.x, ob.location.y + co.y * ob.scale.y)
    return ob
# recessed arches, like the reference: a hole in the wall (cut in Window mode), white plaster reveal, white frame and glazing grid, frosted glow at the back
ARD = .315  # recess depth, as the reference (315 mm)
white = bpy.data.materials.new("ArchWhite"); white.use_nodes = True; wp = white.node_tree.nodes["Principled BSDF"]
wp.inputs["Base Color"].default_value = (*srgb("#faf8f4"), 1); wp.inputs["Roughness"].default_value = .95; wp.inputs["Specular IOR Level"].default_value = .15; wp.inputs["Emission Color"].default_value = (1, .97, .92, 1); archw = [wp]
def outline(x, r, zb, h, n=24):  # bottom-left, up, over the round head, down to bottom-right; straight sides in short steps
    zs = [zb + (h - r) * i / n for i in range(n)]  # one tall quad per side split into two triangles that shaded differently: a visible step
    return [(x - r, z) for z in zs] + [(x + r * math.cos(math.pi - t * math.pi / 24), zb + h - r + r * math.sin(math.pi - t * math.pi / 24)) for t in range(25)] + [(x + r, z) for z in reversed(zs)]
def strip(name, A, B, mat):  # quads between two matching point rows
    bms = bmesh.new(); va = [bms.verts.new(p) for p in A]; vb = [bms.verts.new(p) for p in B]
    for i in range(len(A) - 1): bms.faces.new((va[i], va[i + 1], vb[i + 1], vb[i]))
    me = bpy.data.meshes.new(name); bms.to_mesh(me); bms.free(); ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); me.materials.append(mat); return ob
archg, arch_cut, arch_win = [], [], []  # arch_win: per arch (x, w, h, zb, yb, the window parts that fly in)
for x, w, h in ((0, 1.1, 2.6), (-1.5, .75, 1.95), (1.5, .75, 1.95)):  # tall and slim, like the 1010 x 2626 mm reference
    zb, r = .45, w / 2; yb = NB + ARD
    gl = bpy.data.materials.new("ArchGlow"); gl.use_nodes = True; nt = gl.node_tree; nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission"); em.inputs[0].default_value = (1, .88, .72, 1); em.inputs[1].default_value = 3; archg.append(em)
    nt.links.new(em.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
    g_ = arch_face("ArchGlow", x, w, h, zb, yb, gl); g_.visible_shadow = False
    ol = outline(x, r, zb, h)
    strip("ArchReveal", [(px, NB - .002, pz) for px, pz in ol + ol[:1]], [(px, yb + .01, pz) for px, pz in ol + ol[:1]], white)  # the plaster returns into the wall, sill included
    fo = strip("ArchFrame", [(px, yb - .02, pz) for px, pz in ol], [(px, yb - .02, pz) for px, pz in outline(x, r - .045, zb, h - .045)], white)
    win = [g_, fo, slab("ArchBar", x - r, x + r, yb - .08, yb - .02, zb, zb + .06, white)]  # bottom rail
    so = fo.modifiers.new("Solid", "SOLIDIFY"); so.thickness = .06; so.offset = 1
    n = max(2, round((h - r) / (.42 * w)))
    for bx0, bx1, bz0, bz1 in [(x - .011, x + .011, zb, zb + h - .02)] + [(x - r, x + r, zb + k * (h - r) / n - .011, zb + k * (h - r) / n + .011) for k in range(1, n + 1)]:  # glazing grid
        win.append(slab("ArchBar", bx0, bx1, yb - .07, yb - .02, bz0, bz1, white))
    arch_win.append((x, w, h, zb, yb, win))
    al = bpy.data.lights.new("ArchLight", "AREA"); al.shape = "RECTANGLE"; al.size, al.size_y = .9 * w, .9 * h; al.color = (1, .93, .85); al["base"] = 560 * w * h; al.specular_factor = .4  # ~2.6 kW for all three at midday, close to the skylight's lights
    alo = bpy.data.objects.new("ArchLight", al); scene.collection.objects.link(alo); alo.location = (x, yb + .3, zb + h / 2); alo.rotation_euler = (-math.pi / 2, 0, 0); archl.append(alo)  # behind the glass like daylight outside, facing straight in: a tilted plane or a narrow spread cuts dark wedges across wall and ceiling
    al.volume_factor = 0  # soft daylight; the shafts come from the sun spot below
    ca = strip("ArchFrame", [(px, NB - .014, pz) for px, pz in outline(x, r + .085, zb - .02, h + .105)], [(px, NB - .014, pz) for px, pz in outline(x, r - .004, zb - .02, h + .016)], white)  # casing: a raised rounded moulding over the cut edge
    cs = ca.modifiers.new("Solid", "SOLIDIFY"); cs.thickness = .03; cs.offset = 0; cb = ca.modifiers.new("Round", "BEVEL"); cb.width = .01; cb.segments = 3; win.append(ca)  # the casing flies in with its window: the wall starts plain
    win += [slab("ArchFrame", x - r - .085, x + r + .085, NB - .03, NB - .001, zb - .05, zb + .001, white), slab("ArchFrame", x - r - .012, x + r + .012, NB - .006, yb + .01, zb - .013, zb, white)]  # bottom casing and sill
    cbm = bmesh.new(); cv_ = [cbm.verts.new((px, NB - .05, pz)) for px, pz in outline(x, r + .012, zb - .012, h + .024)]; f_ = cbm.faces.new(cv_[::-1])  # the cutter for the wall hole
    ex = bmesh.ops.extrude_face_region(cbm, geom=[f_]); bmesh.ops.translate(cbm, vec=(0, ARD + .5, 0), verts=[v for v in ex["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(cbm, faces=cbm.faces); mc_ = bpy.data.meshes.new("ArchCut"); cbm.to_mesh(mc_); cbm.free()
    co_ = bpy.data.objects.new("ArchCut", mc_); scene.collection.objects.link(co_); co_.hide_render = co_.hide_viewport = True; arch_cut.append(co_)
fr = dark  # slim black frames
ims = [bpy.data.images.load(os.path.join(OUT, "tex", f"koson_{j}.jpg")) for j in (1, 2, 3)]; PHS = (1.6, 1.6, 1.6)
GAP = .14; ws = [p * im.size[0] / im.size[1] for p, im in zip(PHS, ims)]; x = -(sum(ws) + 2 * GAP) / 2
for j, (im, w_, PH) in enumerate(zip(ims, ws, PHS)):
    xc = x + w_ / 2; x += w_ + GAP
    bmf = bmesh.new(); bmesh.ops.create_cube(bmf, size=1); mf = bpy.data.meshes.new("Frame"); bmf.to_mesh(mf); bmf.free(); mf.transform(Matrix.Diagonal((w_ + .05, .04, PH + .05, 1)))
    ofr = bpy.data.objects.new("TriptychFrame", mf); scene.collection.objects.link(ofr); ofr.location = (xc, NB - .03, 2.0); mf.materials.append(fr)
    bv = ofr.modifiers.new("Bevel", "BEVEL"); bv.width = .005; bv.segments = 2
    cv = bpy.data.materials.new(f"Head{j}"); cv.use_nodes = True; nt = cv.node_tree; pb = nt.nodes["Principled BSDF"]; pb.inputs["Roughness"].default_value = .85; pb.inputs["Specular IOR Level"].default_value = .1  # matte paper: no skylight glare
    tcn = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); 
    ti = nt.nodes.new("ShaderNodeTexImage"); ti.image = im; ti.extension = "EXTEND"; hs = nt.nodes.new("ShaderNodeHueSaturation"); hs.inputs["Saturation"].default_value = 1.35; hs.inputs["Value"].default_value = .9
    nt.links.new(tcn.outputs["Generated"], mp.inputs[0]); nt.links.new(mp.outputs[0], ti.inputs[0]); nt.links.new(ti.outputs[0], hs.inputs["Color"]); nt.links.new(hs.outputs[0], pb.inputs["Base Color"])
    wv = nt.nodes.new("ShaderNodeTexImage"); wv.image = img("rough_linen_nor.jpg"); mw = nt.nodes.new("ShaderNodeMapping"); mw.inputs["Scale"].default_value = (5, 5, 5)
    nt.links.new(tcn.outputs["Generated"], mw.inputs[0]); nt.links.new(mw.outputs[0], wv.inputs[0]); nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs[0].default_value = .35
    nt.links.new(wv.outputs[0], nm.inputs[1]); nt.links.new(nm.outputs[0], pb.inputs["Normal"])
    bmc = bmesh.new(); bmesh.ops.create_grid(bmc, x_segments=1, y_segments=1, size=.5); mc = bpy.data.meshes.new("Canvas"); bmc.to_mesh(mc); bmc.free()
    ocv = bpy.data.objects.new("Canvas", mc); scene.collection.objects.link(ocv); ocv.location = (xc, NB - .054, 2.0); ocv.rotation_euler = (math.pi / 2, 0, 0); ocv.scale = (w_, PH, 1); mc.materials.append(cv)
# the rug: a wool herringbone weave (Poly Haven scan) on a 12 mm slab; texture, not strands: reads the same at this distance, renders far faster
rug = bpy.data.objects.get("Mesh_12")
if rug:
    rlo, rhi = box(rug); rx, ry = TX / 2 + G + .35, TY / 2 + G - .05
    bmr = bmesh.new(); bmesh.ops.create_grid(bmr, x_segments=1, y_segments=1, size=.5, matrix=Matrix.Translation((C.x, C.y, rhi.z)) @ Matrix.Diagonal((2 * rx, 2 * ry, 1, 1)))
    bmr.to_mesh(rug.data); bmr.free(); rug.matrix_world = Matrix.Identity(4)
    rm_ = bpy.data.materials.new("RugWool"); box_scan(rm_, "poly_wool_herringbone", .3, srgb("#55658a"), 1.6, sheen=.5)
    rug.data.materials.clear(); rug.data.materials.append(rm_)
    so = rug.modifiers.new("Thick", "SOLIDIFY"); so.thickness = .012; so.offset = 1
    bv_ = rug.modifiers.new("Edge", "BEVEL"); bv_.width = .004; bv_.segments = 2
    rug.hide_render = True  # only a corner ever shows past the sofas, reading as a stray plate: the pit floor carries the seating alone
    print("REAL rug wool")
# books: one mesh of plain boxes; round their edges and give the covers a bookcloth weave and varied sheen
bk = next((o for o in scene.objects if o.type == "MESH" and len(o.data.polygons) > 5000 and o.material_slots and o.material_slots[0].material and o.material_slots[0].material.name.startswith("Material_24")), None)
if bk:
    bvb = bk.modifiers.new("Round", "BEVEL"); bvb.width = .0025; bvb.segments = 2; bvb.limit_method = "ANGLE"
    nt = bk.material_slots[0].material.node_tree; pb = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (12, 12, 12); nt.links.new(tc.outputs["Object"], mp.inputs[0])
    def bt(n):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(f"book_pattern_{n}.jpg"); t.projection = "BOX"; t.projection_blend = .3; nt.links.new(mp.outputs[0], t.inputs[0]); return t
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs[0].default_value = .8; nt.links.new(bt("nor").outputs[0], nm.inputs[1]); nt.links.new(nm.outputs[0], pb.inputs["Normal"])
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[3].default_value, mr.inputs[4].default_value = .45, .85; nt.links.new(bt("rough").outputs[0], mr.inputs[0]); nt.links.new(mr.outputs[0], pb.inputs["Roughness"])
    print("REAL books", len(bk.data.polygons))
# a sunken seating area: two 15 cm risers (a foot) down on every side, parquet pit floor, oak treads and fascias
D, PX0, PX1, PY0, PY1, TR = .30, -2.35, 2.9, -2.4, 3.2, .25
bpy.context.view_layer.update()
def rbox(o):
    ms = [o] + list(o.children_recursive); pts_ = [m.matrix_world @ Vector(c) for m in ms if m.type == "MESH" for c in m.bound_box]
    return (Vector([min(p[i] for p in pts_) for i in range(3)]), Vector([max(p[i] for p in pts_) for i in range(3)])) if pts_ else (None, None)
def inpit(lo, hi):
    c = (lo + hi) / 2; return PX0 + TR < c.x < PX1 - TR and PY0 + TR < c.y < PY1 - TR and lo.z < .3 and hi.z < 2.6
skip = ("wall", "ceil", "floor", "trim", "Front", "Haze", "Dust", "Diffuser", "Canvas", "TriptychFrame")
moved = set()
for o in list(scene.objects):  # imported assets and the table pivot move as whole hierarchies
    if o.parent is None and o.type == "EMPTY":
        lo, hi = rbox(o)
        if lo and inpit(lo, hi): o.location.z -= D; moved.update([o] + list(o.children_recursive))
for o in list(scene.objects):  # room meshes (sofas, rug) move one by one
    if o.type != "MESH" or o in moved or o.name.split(".")[0] in skip or any(a in moved for a in [o.parent] if a): continue
    lo, hi = box(o)
    if inpit(lo, hi):
        m = o.matrix_world.copy(); m.translation.z -= D; o.matrix_world = m; moved.update([o] + list(o.children_recursive))
fl = next(o for o in scene.objects if o.name.split(".")[0] == "floor")
cut = bpy.data.objects.new("PitCut", bpy.data.meshes.new("PitCut")); scene.collection.objects.link(cut)
bmx = bmesh.new(); bmesh.ops.create_cube(bmx, size=1); bmx.to_mesh(cut.data); bmx.free()
cut.location = ((PX0 + PX1) / 2, (PY0 + PY1) / 2, -.45); cut.scale = (PX1 - PX0 + .08, PY1 - PY0 + .08, 1.0); cut.hide_render = True; cut.hide_viewport = True
bo = fl.modifiers.new("Pit", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cut; bo.solver = "EXACT"
flm = bpy.data.materials.new("PitParquet"); box_scan(flm, "herringbone_parquet", 1.6, None, 1.0, rough=(.35, .7))  # box-mapped: the slabs have no room UVs
oak = bpy.data.materials.new("OakTread"); box_scan(oak, "oak_veneer_01", .8, srgb("#b08a64"), 1.0)
bpy.context.view_layer.update()
def ring(x0, x1, y0, y1, w, z0, z1, mat):  # a rectangular band w wide: front, back, left, right
    slab("Step", x0, x1, y0, y0 + w, z0, z1, mat); slab("Step", x0, x1, y1 - w, y1, z0, z1, mat)
    slab("Step", x0, x0 + w, y0 + w, y1 - w, z0, z1, mat); slab("Step", x1 - w, x1, y0 + w, y1 - w, z0, z1, mat)
slab("PitFloor", PX0 + TR, PX1 - TR, PY0 + TR, PY1 - TR, -D - .05, -D, flm, uv=True)
for k in (1,):  # one tread: two 15 cm risers, a foot down
    e = (k - 1) * TR; ring(PX0 + e, PX1 - e, PY0 + e, PY1 - e, TR, -D - .05, -.15 * k, oak)
ring(PX0 - .05, PX1 + .05, PY0 - .05, PY1 + .05, .05, -.15, .003, oak)  # oak nosing that hides the cut edge
slab("FloorAhead", -6, 6, NF - 6, NF + .4, -.05, -.003, flm, uv=True)  # the floor runs on past the cut-away front, out of frame
print("REAL pit", len(moved))
# drifting dust motes inside the light column
import random
rnd = random.Random(7); bmd = bmesh.new()
for _ in range(90):  # a few motes that only glint where the beam catches them
    r = rnd.uniform(.0008, .0018); p = Vector((rnd.uniform(-1.7, 1.7), rnd.uniform(-.8, 1.6), rnd.uniform(.4, 3.2)))
    bmesh.ops.create_icosphere(bmd, subdivisions=1, radius=r, matrix=Matrix.Translation(p))
dmesh = bpy.data.meshes.new("Dust"); bmd.to_mesh(dmesh); bmd.free()
dust = bpy.data.objects.new("Dust", dmesh); scene.collection.objects.link(dust); dust.visible_shadow = False; dust.hide_render = True  # read as specks on the walls, not motes
dm_ = bpy.data.materials.new("Dust"); dm_.use_nodes = True; dpb = dm_.node_tree.nodes["Principled BSDF"]; dpb.inputs["Base Color"].default_value = (1, .95, .88, 1); dpb.inputs["Roughness"].default_value = .4
dpb.inputs["Emission Color"].default_value = (1, .9, .78, 1); dpb.inputs["Emission Strength"].default_value = 0; dpb.inputs["Roughness"].default_value = .15; dmesh.materials.append(dm_)
area.data.volume_factor = 2.0; area.data.spread = math.radians(9)  # a tighter beam reads as a shaft in faint haze
for ob in scene.objects:  # full-panel layers of the fixture let the sun through; the thin grid bars still cast their shadow
    if ob.type != "MESH": continue
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]; lo = Vector([min(v[i] for v in bb) for i in range(3)]); hi = Vector([max(v[i] for v in bb) for i in range(3)])
    if lo.z > 3.2 and abs((lo.x + hi.x) / 2) < 2.2 and ob.name.split(".")[0] not in ("ceil", "wall", "trim"): ob.visible_shadow = False  # the skylight never darkens its own ceiling
# ---- photoreal pass: frosted diffusers, real bookshelf, contact shading, surface variation, glossy TV ----
def node_src(nt, sock):  # what feeds a socket (or None)
    return sock.links[0].from_socket if sock.links else None
def frosted(em_node, ax=(0, 1), rand=False, sky=False):  # rand: each object a little brighter or dimmer; sky: blue overhead to warm horizon, as clear glass shows  # frosted acrylic: bright centre falling off toward the frame, fine slat lines showing through
    nt = em_node.id_data; tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Generated"], sp.inputs[0])
    def edge(c):
        s_ = nt.nodes.new("ShaderNodeMath"); s_.operation = "SUBTRACT"; s_.inputs[1].default_value = .5; nt.links.new(sp.outputs[c], s_.inputs[0])
        a_ = nt.nodes.new("ShaderNodeMath"); a_.operation = "ABSOLUTE"; nt.links.new(s_.outputs[0], a_.inputs[0]); return a_
    mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"; nt.links.new(edge(ax[0]).outputs[0], mx.inputs[0]); nt.links.new(edge(ax[1]).outputs[0], mx.inputs[1])
    fo = nt.nodes.new("ShaderNodeMapRange"); fo.interpolation_type = "SMOOTHSTEP"; fo.inputs[1].default_value, fo.inputs[2].default_value = .15, .5; fo.inputs[3].default_value, fo.inputs[4].default_value = 1, .88
    nt.links.new(mx.outputs[0], fo.inputs[0])
    wv = nt.nodes.new("ShaderNodeTexWave"); wv.bands_direction = "Y"; wv.inputs["Scale"].default_value = 28; nt.links.new(tc.outputs["Generated"], wv.inputs[0])
    st = nt.nodes.new("ShaderNodeMapRange"); st.inputs[3].default_value, st.inputs[4].default_value = 1, 1;  # no slat lines: they read as streaks nt.links.new(wv.outputs["Fac"], st.inputs[0])
    k = nt.nodes.new("ShaderNodeMath"); k.operation = "MULTIPLY"; nt.links.new(fo.outputs[0], k.inputs[0]); nt.links.new(st.outputs[0], k.inputs[1])
    gr = nt.nodes.new("ShaderNodeTexNoise"); gr.inputs["Scale"].default_value = 90; gr.inputs["Detail"].default_value = 6; nt.links.new(tc.outputs["Generated"], gr.inputs[0])  # frosted grain
    gm = nt.nodes.new("ShaderNodeMapRange"); gm.inputs[3].default_value, gm.inputs[4].default_value = .9, 1.04; nt.links.new(gr.outputs[0], gm.inputs[0])
    k2 = nt.nodes.new("ShaderNodeMath"); k2.operation = "MULTIPLY"; nt.links.new(k.outputs[0], k2.inputs[0]); nt.links.new(gm.outputs[0], k2.inputs[1]); k = k2
    if rand:
        oi = nt.nodes.new("ShaderNodeObjectInfo"); rr = nt.nodes.new("ShaderNodeMapRange"); rr.inputs[3].default_value, rr.inputs[4].default_value = .78, 1.12; nt.links.new(oi.outputs["Random"], rr.inputs[0])
        k3 = nt.nodes.new("ShaderNodeMath"); k3.operation = "MULTIPLY"; nt.links.new(k.outputs[0], k3.inputs[0]); nt.links.new(rr.outputs[0], k3.inputs[1]); k = k3
    sc = nt.nodes.new("ShaderNodeVectorMath"); sc.operation = "SCALE"; sc.inputs[0].default_value = em_node.inputs[0].default_value[:3]; nt.links.new(k.outputs[0], sc.inputs["Scale"])
    if sky:  # the anim script tints sc.inputs[0]; the sky colour rides in the second input
        rp = nt.nodes.new("ShaderNodeValToRGB"); rp.color_ramp.elements[0].color = (1, .93, .82, 1); rp.color_ramp.elements[1].color = (.58, .72, 1, 1); rp.color_ramp.elements[0].position = .25; nt.links.new(sp.outputs[ax[1]], rp.inputs[0])
        vs = nt.nodes.new("ShaderNodeVectorMath"); vs.operation = "SCALE"; nt.links.new(rp.outputs[0], vs.inputs[0]); nt.links.new(k.outputs[0], vs.inputs["Scale"])
        sc.operation = "MULTIPLY"; nt.links.new(vs.outputs[0], sc.inputs[1])
    nt.links.new(sc.outputs[0], em_node.inputs[0])
for p in panes: frosted(p)
frosted(eg, rand=True)
def shade(mat, ao_dist=0, var=None):  # contact darkening (AO) and large-scale tone variation on a material's base colour
    nt = mat.node_tree; b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"); src = node_src(nt, b.inputs["Base Color"])
    if mat.get("ao"): return
    mat["ao"] = 1
    if src is None:  # plain colour: feed it through a node so AO can multiply it
        rgb = nt.nodes.new("ShaderNodeRGB"); rgb.outputs[0].default_value = b.inputs["Base Color"].default_value; src = rgb.outputs[0]
    if var:
        gp = nt.nodes.new("ShaderNodeNewGeometry"); nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = var[0]; nz.inputs["Detail"].default_value = 3; nt.links.new(gp.outputs["Position"], nz.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[1].default_value, mr.inputs[2].default_value = .3, .7; mr.inputs[3].default_value, mr.inputs[4].default_value = var[1], var[2]; nt.links.new(nz.outputs[0], mr.inputs[0])
        mu = nt.nodes.new("ShaderNodeVectorMath"); mu.operation = "SCALE"; nt.links.new(src, mu.inputs[0]); nt.links.new(mr.outputs[0], mu.inputs["Scale"]); src = mu.outputs[0]
    if ao_dist:
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = ao_dist; ao.samples = 16; nt.links.new(src, ao.inputs["Color"]); src = ao.outputs["Color"]
    nt.links.new(src, b.inputs["Base Color"])
floor_mat = next(s.material for o in scene.objects if o.name.split(".")[0] == "floor" for s in o.material_slots)
shade(floor_mat, .35, (.45, .8, 1.08)); shade(flm, .35, (.45, .8, 1.08)); shade(oak, .25); shade(wm_, .5, (.35, .82, 1.1))
tvo = next((o for o in scene.objects if o.type == "MESH" and o.name.split(".")[0] == "ink"), None)
if tvo:  # a real screen: deep black glass that reflects the room
    tm = bpy.data.materials.new("Screen"); tm.use_nodes = True; tb = tm.node_tree.nodes["Principled BSDF"]
    tb.inputs["Base Color"].default_value = (.004, .004, .005, 1); tb.inputs["Roughness"].default_value = .2; tb.inputs["Specular IOR Level"].default_value = .35  # matte-coated panel: no mirror glare at grazing angles
    tvo.data.materials.clear(); tvo.data.materials.append(tm)
# books: split the shelf mesh into single books, vary heights, open a few gaps with a book leaning into each, gilt bands on some spines
if bk:
    for o in scene.objects: o.select_set(False)
    bpy.context.view_layer.objects.active = bk; bk.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=.0005); bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
    books = list(bpy.context.selected_objects)
    def wb(o):
        vs = [o.matrix_world @ v.co for v in o.data.vertices]; return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])
    def wtx(o, W): o.data.transform(o.matrix_world.inverted() @ W @ o.matrix_world)
    rb = random.Random(5); shelves = {}
    for o in books:
        lo, hi = wb(o)
        if hi.z - lo.z < .12 or hi.z - lo.z > .45: continue  # not a standing book (flat stacks, odd parts)
        wtx(o, Matrix.Translation((0, 0, lo.z)) @ Matrix.Diagonal((1, 1, rb.uniform(.84, 1.0), 1)) @ Matrix.Translation((0, 0, -lo.z)))
        shelves.setdefault((round(lo.z, 2), round(hi.x, 1)), []).append(o)
    gone = 0
    for row in shelves.values():
        row.sort(key=lambda o: wb(o)[0].y)
        i = 1
        while i < len(row) - 1:
            if rb.random() < .14:
                glo, ghi = wb(row[i]); row[i].hide_render = True; gone += 1
                nlo, nhi = wb(row[i + 1]); h = nhi.z - nlo.z; a = math.atan2(min(ghi.y - glo.y, .05) * .85, h)
                piv = Vector(((nlo.x + nhi.x) / 2, nlo.y, nlo.z)); wtx(row[i + 1], Matrix.Translation(piv) @ Matrix.Rotation(a, 4, "X") @ Matrix.Translation(-piv)); i += 3
            else: i += 1
    up = bk.matrix_world.inverted().to_3x3() @ Vector((0, 0, 1)); ax = max(range(3), key=lambda j: abs(up[j]))
    nt = bk.material_slots[0].material.node_tree; pb = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    src = node_src(nt, pb.inputs["Base Color"]); tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Generated"], sp.inputs[0])
    gz = sp.outputs[ax]
    if up[ax] < 0:
        inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1; nt.links.new(sp.outputs[ax], inv.inputs[1]); gz = inv.outputs[0]
    def band(c, w):
        s_ = nt.nodes.new("ShaderNodeMath"); s_.operation = "SUBTRACT"; s_.inputs[1].default_value = c; nt.links.new(gz, s_.inputs[0])
        a_ = nt.nodes.new("ShaderNodeMath"); a_.operation = "ABSOLUTE"; nt.links.new(s_.outputs[0], a_.inputs[0])
        l_ = nt.nodes.new("ShaderNodeMath"); l_.operation = "LESS_THAN"; l_.inputs[1].default_value = w; nt.links.new(a_.outputs[0], l_.inputs[0]); return l_
    bs_ = nt.nodes.new("ShaderNodeMath"); bs_.operation = "ADD"; nt.links.new(band(.86, .018).outputs[0], bs_.inputs[0]); nt.links.new(band(.12, .014).outputs[0], bs_.inputs[1])
    oi = nt.nodes.new("ShaderNodeObjectInfo"); gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; gt.inputs[1].default_value = .45; nt.links.new(oi.outputs["Random"], gt.inputs[0])
    mk = nt.nodes.new("ShaderNodeMath"); mk.operation = "MULTIPLY"; mk.use_clamp = True; nt.links.new(bs_.outputs[0], mk.inputs[0]); nt.links.new(gt.outputs[0], mk.inputs[1])
    mxc = nt.nodes.new("ShaderNodeMix"); mxc.data_type = "RGBA"; nt.links.new(mk.outputs[0], mxc.inputs[0]); mxc.inputs[7].default_value = (*srgb("#b8954f"), 1)
    if src: nt.links.new(src, mxc.inputs[6])
    else: mxc.inputs[6].default_value = pb.inputs["Base Color"].default_value
    nt.links.new(mxc.outputs[2], pb.inputs["Base Color"]); nt.links.new(mk.outputs[0], pb.inputs["Metallic"])
    print("REAL bookshelf", len(books), "gaps", gone)
# recessed wood skylight, as in the product photos: a coffer in the ceiling, four big panes split by deep crossed beams,
# a fine wood grid in each pane, frosted glow at the top; only a slim wood trim shows below the ceiling
for ob in scene.objects:
    if ob.type == "MESH" and ob.name.split(".")[0] not in ("ceil", "wall", "trim", "Diffuser"):
        lo, hi = box(ob)
        if lo.z > 3.2 and abs((lo.x + hi.x) / 2) < 2.2 and hi.z < 3.7: ob.hide_render = True  # the old product model
W_ = os.environ.get("MODE") == "window"
NX, NY = map(int, os.environ.get("GRID", "4x2" if W_ else "6x2").split("x")); K_ = float(os.environ.get("SKYS", "1" if W_ else ".56"))  # panes across x deep, and a size scale centred on the room (2x2 version: artifacts/_tmp/blender-room.2x2.py)
PW_, PD_ = (.8, 1.0) if W_ else (8.8 / 6, 4.1)  # pane pitch: a small 4x2 over the window room, a big 6x2 in the sunroof room
SX1 = NX * PW_ * K_ / 2; SY0, SY1 = -.5 - NY * PD_ * K_ / 2, -.5 + NY * PD_ * K_ / 2
SKYK = (PW_ * PD_ * K_ * K_) / (8.8 / 6 * 4.1 * .64) * (1 if W_ else .7)  # each pane light scales with its area; x.7 in the big sunroof room, which blew out
SX0, CZ, SD = -SX1, 3.4, (.16 if W_ else .28); top = CZ + SD  # the small skylight: a shallower well; cy = (SY0 + SY1) / 2
wood = bpy.data.materials.new("SkyWood"); box_scan(wood, "wood_floor", .7, srgb("#c49a5e"), .5); shade(wood, .2)
T = .04
for a in ((SX0 - T, SX0, SY0 - T, SY1 + T), (SX1, SX1 + T, SY0 - T, SY1 + T), (SX0, SX1, SY0 - T, SY0), (SX0, SX1, SY1, SY1 + T)):
    slab("SkyWell", *a, CZ - .002, top + .01, wood)
for a in ((SX0 - .08, SX0 + .02, SY0 - .08, SY1 + .08), (SX1 - .02, SX1 + .08, SY0 - .08, SY1 + .08), (SX0, SX1, SY0 - .08, SY0 + .02), (SX0, SX1, SY1 - .02, SY1 + .08)):
    slab("SkyTrim", *a, CZ - .016, CZ + .002, wood)  # the only part below the ceiling line
cy = (SY0 + SY1) / 2
# the whole unit: one empty at the frame's underside; the frame, each pane and the inner layers hang off it, so it can fly, sink to the stage and explode
unit = bpy.data.objects.new("Unit", None); scene.collection.objects.link(unit); unit.location = (0, cy, CZ); unit.rotation_mode = "ZYX"
def kid(o, par):
    bpy.context.view_layer.update(); w = o.matrix_world.copy(); o.parent = par; o.matrix_world = w
frameE = bpy.data.objects.new("FrameE", None); scene.collection.objects.link(frameE); frameE.location = unit.location; kid(frameE, unit)
for o in [o for o in scene.objects if o.name.startswith("SkyTrim")]: kid(o, frameE)  # the trim flies in with the frame: the ceiling starts plain
BW = .08 if W_ else .15  # slimmer beams on the small skylight
xs = [SX0 + i * (SX1 - SX0) / NX for i in range(NX + 1)]; ys = [SY0 + j * (SY1 - SY0) / NY for j in range(NY + 1)]
for x in xs[1:-1]: kid(slab("SkyBeam", x - BW / 2, x + BW / 2, SY0, SY1, CZ + .02, top - .01, wood), frameE)
for y in ys[1:-1]: kid(slab("SkyBeam", SX0, SX1, y - BW / 2, y + BW / 2, CZ + .02, top - .01, wood), frameE)
cells = [(xs[i] + (BW / 2 if i else 0), xs[i + 1] - (BW / 2 if i < NX - 1 else 0), ys[j] + (BW / 2 if j else 0), ys[j + 1] - (BW / 2 if j < NY - 1 else 0)) for i in range(NX) for j in range(NY)]
flyers = []  # one empty per pane, at its slot; the anim script flies each in
for x0, x1, y0, y1 in cells:  # a fine wood grid in each pane, bars about 40 cm apart
    fe = bpy.data.objects.new("Pane", None); scene.collection.objects.link(fe); fe.location = ((x0 + x1) / 2, (y0 + y1) / 2, top); fe["slot"] = fe.location.copy(); flyers.append(fe); kids = []
    nx_, ny_ = max(2, round((x1 - x0) / .42)), max(2, round((y1 - y0) / .42))
    for i in range(1, nx_): xm = x0 + i * (x1 - x0) / nx_; kids.append(slab("SkyMuntin", xm - .016, xm + .016, y0, y1, top - .07, top - .004, wood))
    for i in range(1, ny_): ym = y0 + i * (y1 - y0) / ny_; kids.append(slab("SkyMuntin", x0, x1, ym - .016, ym + .016, top - .07, top - .004, wood))
    dp = bpy.data.objects.new("DiffuserPane", dif.data); scene.collection.objects.link(dp); kids.append(dp)  # each pane carries its own frosted glass
    dp.location = (fe.location.x, fe.location.y, top - .002); dp.rotation_euler = dif.rotation_euler; dp.scale = ((x1 - x0) / 3.28, (y1 - y0) / 2.08, 1); dp.visible_shadow = False
    for k_ in kids: k_.parent = fe; k_.matrix_parent_inverse = Matrix.Translation(fe.location).inverted()
    kid(fe, unit); fe["home"] = fe.location.copy()  # pane slot in unit space
cap = bpy.data.materials.new("SkyCap"); cap.diffuse_color = (.02, .018, .016, 1); cap.use_nodes = True; cap.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.02, .018, .016, 1)
# (the dark SkyCap is now the SkyLid, below)
if True:  # open the ceiling over the coffer (the old fixture hung below an unbroken ceiling)
    ce_ = next(o for o in scene.objects if o.name.split(".")[0] == "ceil"); mw_ = ce_.matrix_world  # delete the faces inside the opening: a boolean left fan-shaped slivers
    bmc = bmesh.new(); bmc.from_mesh(ce_.data)
    bmesh.ops.delete(bmc, geom=[f for f in bmc.faces if (lambda c: SX0 < c.x < SX1 and SY0 < c.y < SY1)(mw_ @ f.calc_center_median())], context="FACES")
    bmc.to_mesh(ce_.data); bmc.free()
# the plain ceiling at the start: a lid in the ceiling's own plaster closes the opening, then recesses to the top of the well
lid = slab("SkyLid", SX0 - .12, SX1 + .12, SY0 - .12, SY1 + .12, CZ - .004, CZ + .016, ce_.material_slots[0].material, uv=True); lid.visible_shadow = W_; lid["z0"] = lid.location.z
vc_ = next((n.layer_name for n in ce_.material_slots[0].material.node_tree.nodes if n.type == "VERTEX_COLOR"), None)
if vc_ is not None:  # the plaster material multiplies a vertex-colour layer: without one the lid rendered black
    ca_ = lid.data.color_attributes.new(vc_ or "Col", "FLOAT_COLOR", "POINT")
    src_ = ce_.data.color_attributes.get(vc_) if vc_ else None; cols_ = [tuple(v.color) for v, w in zip(src_.data, ce_.data.vertices) if (lambda q: abs(q.x) < SX1 + .6 and SY0 - .6 < q.y < SY1 + .6 and q.z < CZ + .01)(ce_.matrix_world @ w.co)] if src_ and src_.domain == "POINT" else [tuple(v.color) for v in src_.data] if src_ else [(1, 1, 1, 1)]
    cols_ = cols_ or [(1, 1, 1, 1)]; avg_ = tuple(sum(c[i] for c in cols_) / len(cols_) for i in range(4))  # match the ceiling's average tone
    for v_ in ca_.data: v_.color = avg_
# the inner layers of the exploded view, stacked above the panes (hidden until the stage); "lift" is the exploded offset in the original 3.3 m unit
def pbsdf(name, col, metal=0., rough=.5, alpha=1.):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(col), 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough; b.inputs["Alpha"].default_value = alpha
    if alpha < 1: m.surface_render_method = "BLENDED"
    return m
layers, glows = [], {}  # glows: emission inputs the anim script drives on the stage
def layer(o, y0, y1):
    o.hide_render = True; o.visible_shadow = False; kid(o, unit); o["lift"] = y1 - y0; o["home"] = o.location.copy(); layers.append(o); return o
def emis(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); e_ = nt.nodes.new("ShaderNodeEmission"); e_.inputs[0].default_value = (*col, 1); e_.inputs[1].default_value = 0
    nt.links.new(e_.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0]); glows[name] = e_.inputs[1]; return m
def grid(o, n1, v1, n2=1, v2=(0, 0, 0)):  # repeat o n1 times along v1 and n2 times along v2
    for c_, v_ in ((n1, v1), (n2, v2)):
        if c_ > 1: a_ = o.modifiers.new("arr", "ARRAY"); a_.count = c_; a_.use_relative_offset = False; a_.use_constant_offset = True; a_.constant_offset_displace = v_
    return o
def mesh_ob(name, fill, mat, loc, rot=None):  # a small primitive built with bmesh, its origin at loc
    b_ = bmesh.new(); fill(b_)
    if rot: bmesh.ops.transform(b_, verts=b_.verts, matrix=rot.to_4x4())
    me = bpy.data.meshes.new(name); b_.to_mesh(me); b_.free(); me.materials.append(mat); o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); o.location = loc; return o
def rim(o):  # lit edges on a glass sheet, as in the three.js film
    e_ = bpy.data.objects.new(o.name + "Rim", o.data.copy()); scene.collection.objects.link(e_); e_.location = o.location; e_.data.materials.clear(); e_.data.materials.append(edge_m)
    for m_ in o.modifiers:
        if m_.type == "SOLIDIFY": s_ = e_.modifiers.new("s", "SOLIDIFY"); s_.thickness = m_.thickness
    w_ = e_.modifiers.new("w", "WIREFRAME"); w_.thickness = .007; return e_
edge_m = emis("GlassEdge", (.45, .75, 1)); led_m = emis("LED", (1, .78, .5))
glass_m = pbsdf("Glass", "#dff1ff", rough=.3, alpha=.16); dome_m = pbsdf("Dome", "#eef6ff", rough=.25, alpha=.38); rib_m = pbsdf("Rib", "#dff1ff", rough=.3, alpha=.3)
board_m = pbsdf("LightSource", "#16211c", .3, .6); fin_m = pbsdf("Fins", "#2a2b2d", .9, .4); metal_m = pbsdf("Housing", "#c9c3b8", 1., .5)
F_ = (SX1 - SX0) / 3.3; I_ = .06  # F_: this unit's size against the original 3.3 m one
X0, X1, Y0, Y1 = SX0 + I_, SX1 - I_, SY0 + I_, SY1 - I_; M_ = .14 * F_
for o in (slab("Lenses", X0, X1, Y0, Y1, top + .018, top + .024, glass_m),): r_ = rim(o); layer(o, .085, -.28); layer(r_, .085, -.28)  # rim first: kid() turns location local
dome = mesh_ob("Domes", lambda b_: bmesh.ops.create_uvsphere(b_, u_segments=14, v_segments=8, radius=.058 * F_), dome_m, (X0 + M_, Y0 + M_, top + .014), Matrix.Diagonal((1, 1, .42)))
layer(grid(dome, 22, ((X1 - X0 - 2 * M_) / 21, 0, 0), 14, (0, (Y1 - Y0 - 2 * M_) / 13, 0)), .085, -.28)
for o in (slab("Optics", X0, X1, Y0, Y1, top + .038, top + .044, glass_m),): r_ = rim(o); layer(o, .115, .14); layer(r_, .115, .14)
layer(grid(slab("Ribs", X0 + .06, X1 - .06, Y0 + .071 * F_, Y0 + .089 * F_, top + .03, top + .037, rib_m), 26, (0, (Y1 - Y0 - .16 * F_) / 25, 0)), .115, .14)
layer(slab("LightSource", X0, X1, Y0, Y1, top + .062, top + .075, board_m), .15, .58)
led = mesh_ob("LEDs", lambda b_: bmesh.ops.create_cone(b_, cap_ends=True, segments=10, radius1=.024 * F_, radius2=.024 * F_, depth=.014), led_m, (X0 + M_, Y0 + M_, top + .056))
layer(grid(led, 26, ((X1 - X0 - 2 * M_) / 25, 0, 0), 16, (0, (Y1 - Y0 - 2 * M_) / 15, 0)), .15, .58)
layer(grid(slab("Fins", SX0 + .1, SX0 + .12, SY0 + .1, SY1 - .1, top + .09, top + .135, fin_m), 60, ((SX1 - SX0 - .22) / 59, 0, 0)), .2, 1.0)
hs = slab("Housing", SX0 - .03, SX1 + .03, SY0 - .03, SY1 + .03, top + .15, top + .15 + .2 * F_, metal_m)
bv = hs.modifiers.new("bev", "BEVEL"); bv.width = .035 * F_; bv.segments = 3
layer(hs, .26, 1.42)
# window mode: the arch windows are the product. Each flies in from the room; the middle one sinks to the stage and explodes along its depth
aw, alid, aexp = [], [], []
if W_:
    wl_ = next(o for o in scene.objects if o.name.split(".")[0] == "wall"); wm_ = wl_.material_slots[0].material
    vw_ = next((n.layer_name for n in wm_.node_tree.nodes if n.type == "VERTEX_COLOR"), None)
    for j, (x, w, h, zb, yb, win) in enumerate(arch_win):
        e_ = bpy.data.objects.new("ArchWin", None); scene.collection.objects.link(e_); e_.location = (x, yb, zb + h / 2)
        for o in win: kid(o, e_)
        e_["home"] = e_.location.copy(); aw.append(e_)
        ld_ = arch_face("ArchLid", x, w + .03, h + .015, zb - .015, NB - .004, wm_); ld_.visible_shadow = False; ls_ = ld_.modifiers.new("s", "SOLIDIFY"); ls_.thickness = .01; ls_.offset = 0; ld_["dy"] = yb + .012 - (NB - .004); alid.append(ld_)  # the plain wall at the start, then it recesses
        if vw_ is not None:  # same vertex-colour need as the ceiling lid
            src_ = wl_.data.color_attributes.get(vw_) if vw_ else None; cs_ = [tuple(v.color) for v in src_.data] if src_ else [(1, 1, 1, 1)]
            av_ = tuple(sum(c[i] for c in cs_) / len(cs_) for i in range(4)); ca_ = ld_.data.color_attributes.new(vw_ or "Col", "FLOAT_COLOR", "POINT")
            for v_ in ca_.data: v_.color = av_
    x, w, h, zb, yb, win = arch_win[0]; r = w / 2; K = .8  # the middle arch; K: depth spread against the original's height spread
    def ax(o, lift, inner=True):
        kid(o, aw[0]); o["lift"] = lift * K; o["home"] = o.location.copy(); o["inner"] = inner; aexp.append(o)
        if inner: o.hide_render = True; o.visible_shadow = False
        return o
    def asheet(name, y_, th, mat, grow=-.02):
        o = arch_face(name, x, w + 2 * grow, h + grow, zb - grow, y_, mat); s_ = o.modifiers.new("s", "SOLIDIFY"); s_.thickness = th; return o
    ax(win[0], -.762, False)
    for o in win[1:]: ax(o, -1.305, False)
    zt = zb + h - r - .04; gx0, gz0 = x - r + .1, zb + .1
    for o in (asheet("ALens", yb + .012, .006, glass_m),): r_ = rim(o); ax(o, -.365); ax(r_, -.365)
    ax(grid(mesh_ob("ADomes", lambda b_: bmesh.ops.create_uvsphere(b_, u_segments=14, v_segments=8, radius=.04), dome_m, (gx0, yb + .008, gz0), Matrix.Diagonal((1, .42, 1))), 8, ((w - .2) / 7, 0, 0), 18, (0, 0, (zt - gz0) / 17)), -.365)
    for o in (asheet("AOptics", yb + .03, .006, glass_m),): r_ = rim(o); ax(o, .025); ax(r_, .025)
    ax(grid(slab("ARibs", x - r + .05, x + r - .05, yb + .024, yb + .029, gz0 - .005, gz0 + .005, rib_m), 26, (0, 0, (zt - gz0) / 25)), .025)
    ax(asheet("ALight", yb + .05, .012, board_m), .435)
    ax(grid(mesh_ob("ALEDs", lambda b_: bmesh.ops.create_cone(b_, cap_ends=True, segments=10, radius1=.017, radius2=.017, depth=.012), led_m, (gx0, yb + .044, gz0), Matrix.Rotation(math.pi / 2, 3, "X")), 9, ((w - .2) / 8, 0, 0), 22, (0, 0, (zt - gz0) / 21)), .435)
    ax(grid(slab("AFins", x - r + .06, x - r + .075, yb + .07, yb + .11, zb + .05, zt, fin_m), 24, ((w - .135) / 23, 0, 0)), .8)
    hb = asheet("AHousing", yb + .13, .12, metal_m, .03); bb = hb.modifiers.new("bev", "BEVEL"); bb.width = .02; bb.segments = 3; ax(hb, 1.16)
# sun shafts as in the three.js film: a soft glowing prism from each pane along the sun, fading toward the floor and at its edges
bmz = bmesh.new(); bmesh.ops.create_cube(bmz, size=1); bmesh.ops.translate(bmz, verts=bmz.verts, vec=(0, 0, -.5)); bm_ = bpy.data.meshes.new("Beam"); bmz.to_mesh(bm_); bmz.free()
bmat = bpy.data.materials.new("Beam"); bmat.use_nodes = True; bmat.surface_render_method = "BLENDED"; bmat.use_backface_culling = False; nt = bmat.node_tree; nt.nodes.clear()
tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Generated"], sp.inputs[0])
fall = nt.nodes.new("ShaderNodeMath"); fall.operation = "POWER"; fall.inputs[1].default_value = 1.6; nt.links.new(sp.outputs[2], fall.inputs[0])  # generated z: 1 at the pane, 0 at the floor
lw = nt.nodes.new("ShaderNodeLayerWeight"); lw.inputs[0].default_value = .5; fac = nt.nodes.new("ShaderNodeMath"); fac.operation = "POWER"; fac.inputs[0].default_value = 1; fac.inputs[1].default_value = 1.3
inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1; nt.links.new(lw.outputs["Facing"], inv.inputs[1]); nt.links.new(inv.outputs[0], fac.inputs[0])  # bright face-on, gone at the silhouette
mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; nt.links.new(fall.outputs[0], mul.inputs[0]); nt.links.new(fac.outputs[0], mul.inputs[1])
em_b = nt.nodes.new("ShaderNodeEmission"); em_b.inputs[0].default_value = (1, .85, .6, 1); beam_em = em_b
mul2 = nt.nodes.new("ShaderNodeMath"); mul2.operation = "MULTIPLY"; mul2.inputs[1].default_value = 0; beam_gain = mul2.inputs[1]; nt.links.new(mul.outputs[0], mul2.inputs[0]); nt.links.new(mul2.outputs[0], em_b.inputs[1])
tr = nt.nodes.new("ShaderNodeBsdfTransparent"); ad = nt.nodes.new("ShaderNodeAddShader"); nt.links.new(em_b.outputs[0], ad.inputs[0]); nt.links.new(tr.outputs[0], ad.inputs[1])
nt.links.new(ad.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0]); bm_.materials.append(bmat)
beams = []
for x0, x1, y0, y1 in cells:
    b_ = bpy.data.objects.new("SunBeam", bm_); scene.collection.objects.link(b_); b_.visible_shadow = False; b_["pane"] = ((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0); beams.append(b_)
for ob in scene.objects:
    if ob.name.startswith("SkyMuntin"): ob.visible_shadow = True  # the grid bars split the sun into shafts in the haze (were shadowless: read as streaks with thin haze)
dif.hide_render = True  # replaced by one piece per pane (DiffuserPane)
skyl = [area, fill]  # one light per pane, under the grid and between the beams (a light inside geometry shadows the whole room)
fill.data.use_shadow = False  # the soft fill needs no shadows: halves the shadowed lights (RAM, speed)
pw, ph = cells[0][1] - cells[0][0], cells[0][3] - cells[0][2]
for l_ in (area, fill): l_.data.size, l_.data.size_y = pw - .04, ph - .04
for j, (px, py) in enumerate(((x0 + x1) / 2, (y0 + y1) / 2) for x0, x1, y0, y1 in cells):
    for l_ in (area, fill):
        o_ = l_ if j == 0 else bpy.data.objects.new(l_.name + "Q", l_.data)
        if j: scene.collection.objects.link(o_); o_.visible_camera = False; skyl.append(o_)
        o_.location = (px, py, top - .085); o_.rotation_euler = l_.rotation_euler
if W_:  # the small skylight: one light pair under the beams for the whole opening; 16 shadowed lights pushed RAM past 90%
    for l_ in (area, fill): l_.data.size, l_.data.size_y = SX1 - SX0 - .04, SY1 - SY0 - .04; l_.location = (0, cy, top - .085); l_.data.use_shadow = False  # up in the well, shadowless: 1 cm over the ceiling it leaked onto the underside as streaks
    for o_ in skyl[2:]: bpy.data.objects.remove(o_)
    skyl = [area, fill]; SKYK *= NX * NY * 3  # x3: at equal watts per glass area it barely registered next to the arches
# light off the sunlit floor back up onto the ceiling and the coffer wood (EEVEE misses most of this bounce)
ub = bpy.data.lights.new("FloorBounce", "AREA"); ub.shape = "RECTANGLE"; ub.size, ub.size_y = 3.6, 2.6; ub.color = (1, .9, .8); ub["base"] = 260; ub.specular_factor = 0; ub.use_shadow = False  # soft bounce: no hard shadows of the grid
ubo = bpy.data.objects.new("FloorBounce", ub); scene.collection.objects.link(ubo); ubo.location = (0, cy, -.45); ubo.rotation_euler = (math.pi, 0, 0); ubo.visible_camera = False  # below the floor pit: an area light lights only what is in front of its plane, so at 1.2 m it drew a line along every wall
archl.append(ubo); skyl.append(ubo)
for m in bpy.data.materials:
    if m.get("veneer"): shade(m, .3)
sofa_m = {s.material for o in scene.objects if o.name.startswith("geometry_0") for s in o.material_slots if s.material}
for m in sofa_m:  # off-white fabric (~0.75 albedo): pure white clipped flat in the sun
    for n_ in m.node_tree.nodes:
        if n_.type == "BSDF_PRINCIPLED" and not n_.inputs["Base Color"].links: n_.inputs["Base Color"].default_value = tuple(c * .8 for c in n_.inputs["Base Color"].default_value[:3]) + (1,)
    shade(m, .2, (3, .9, 1.04))  # darker seams and folds, slight tonal drift: fabric, not plastic  # contact darkening in the shelf bays and slat grooves
for g in archg: frosted(g, (0, 2), sky=True)
if grp:  # a casual stack of books on the console, near the right-hand vase
    rbk = random.Random(11); zb_ = top
    for col in ("#7a2e24", "#2f4a5c", "#c9b48a"):
        bmat = bpy.data.materials.new("StackBook"); bmat.use_nodes = True; bp_ = bmat.node_tree.nodes["Principled BSDF"]
        bp_.inputs["Base Color"].default_value = (*srgb(col), 1); bp_.inputs["Roughness"].default_value = .7
        h_ = rbk.uniform(.025, .04); ob_ = slab("StackBook", cx - .12, cx + .12, ty + clen / 2 - .585, ty + clen / 2 - .415, zb_, zb_ + h_, bmat)
        ob_.rotation_euler.z = rbk.uniform(-.2, .2); zb_ += h_
for m in list(bpy.data.materials):  # contact shadow everywhere: plant pots, cushions, frames, the console's base
    if m.node_tree and not m.get("veneer") and any(n.type == "BSDF_PRINCIPLED" for n in m.node_tree.nodes) and not any(n.type == "EMISSION" for n in m.node_tree.nodes): shade(m, .25)
WINDOW = os.environ.get("MODE") == "window"
for ob in scene.objects:
    n = ob.name.split(".")[0]
    if n in ("ArchFrame", "ArchGlow", "ArchBar", "ArchLight", "ArchReveal"): ob.hide_render = not WINDOW
    if n in ("TriptychFrame", "Canvas"): ob.hide_render = WINDOW
if WINDOW:  # its own small skylight stays; only stray fixture parts near the ceiling go
    bpy.context.view_layer.update(); fx = []
    for ob in scene.objects:
        if ob.type == "MESH" and ob.name.split(".")[0] not in ("ceil", "wall", "trim") and not ob.name.startswith(("Sky", "DiffuserPane")):
            lo, hi = box(ob)
            if lo.z > 3.2 and abs((lo.x + hi.x) / 2) < 2.2: ob.hide_render = True; fx.append((lo, hi))
    pass  # the skylight lights stay on
    # (closed-ceiling patch dropped: the ceiling now opens over the small skylight)  #     ce = next(o for o in scene.objects if o.name.split(".")[0] == "ceil"); cz = min((ce.matrix_world @ v.co).z for v in ce.data.vertices)
    # (closed-ceiling patch dropped: the ceiling now opens over the small skylight)  #     slab("CeilPatch", min(l.x for l, h in fx) - .05, max(h.x for l, h in fx) + .05, min(l.y for l, h in fx) - .05, max(h.y for l, h in fx) + .05, cz + .001, cz + .06, ce.material_slots[0].material, uv=True)
    # EEVEE only bounces light off what is on screen: a broad soft card from the room's front stands in for daylight
    # bouncing off the floor and ceiling back onto the window wall
    bl = bpy.data.lights.new("Bounce", "AREA"); bl.shape = "RECTANGLE"; bl.size, bl.size_y = 7, 2.6; bl.color = (1, .92, .84); bl["base"] = 450
    blo = bpy.data.objects.new("Bounce", bl); scene.collection.objects.link(blo); blo.location = (0, NF + .6, 1.9); blo.rotation_euler = (math.pi / 2, 0, 0); blo.visible_camera = False; bl.specular_factor = 0; archl.append(blo)  # a fake: never seen in reflections (it lit the TV glass)
    bl.use_shadow = False; bl["base"] = 300  # a soft stand-in for wall/floor bounce; the arches do the main lighting
    sun.hide_render = os.environ.get("WSUN") == "0"  # it shone in through the arch openings and cut each reveal in half with a hard edge
    wl = next(o for o in scene.objects if o.name.split(".")[0] == "wall")
    for c_ in arch_cut: b_ = wl.modifiers.new("Arch", "BOOLEAN"); b_.operation = "DIFFERENCE"; b_.object = c_; b_.solver = "EXACT"; b_.use_hole_tolerant = True
    print("REAL window mode", len(fx))
else:  # the same soft light from the room's front, so sofa backs and the near floor aren't black
    bl = bpy.data.lights.new("Bounce", "AREA"); bl.shape = "RECTANGLE"; bl.size, bl.size_y = 7, 2.6; bl.color = (1, .92, .84); bl["base"] = 260; bl.specular_factor = 0; bl.use_shadow = False  # low from the front, its shadows of the skylight grid read as streaks
    blo = bpy.data.objects.new("Bounce", bl); scene.collection.objects.link(blo); blo.location = (0, NF + .6, 1.9); blo.rotation_euler = (math.pi / 2, 0, 0); blo.visible_camera = False; archl.append(blo)
# baked bounce light: EEVEE's ray tracing only sees what is on screen; this volume also sees the camera-hidden front wall
bvol = bpy.data.objects.new("BounceVol", bpy.data.lightprobes.new("BounceVol", "VOLUME")); scene.collection.objects.link(bvol)
bvol.location = (0, (NB + NF) / 2, 1.52); bvol.scale = (4.3, (NB - NF) / 2, 1.86); bvol.data.resolution_x, bvol.data.resolution_y, bvol.data.resolution_z = 24, 18, 14  # fitted floor pit to ceiling, ~27 cm layers: coarser layers sat inside the floor and drew a dark line along the walls
bvol.data.intensity = 1.6  # EEVEE's bake under-counts repeated bounces between pale walls, ceiling and floor
scene.eevee.gi_diffuse_bounces = 4
scene.eevee.use_fast_gi = True; scene.eevee.fast_gi_method = "GLOBAL_ILLUMINATION"; scene.eevee.fast_gi_ray_count = 4; scene.eevee.fast_gi_step_count = 12; scene.eevee.fast_gi_quality = .5
area.data.spread = math.radians(70)  # a frosted panel scatters light widely, not a narrow beam
area.data.volume_factor = 0  # its shafts through the grid read as streaks in the haze
scene.eevee.shadow_resolution_scale = .5; scene.eevee.ray_tracing_options.resolution_scale = "2"; scene.eevee.fast_gi_resolution = "2"  # half-res GI: ~invisible, much faster on an integrated GPU

world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (.36, .34, .36, 1); bg.inputs[1].default_value = .18

# haze, so the light from the panel reads as shafts
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); fogMesh = bpy.data.meshes.new("Haze"); bm.to_mesh(fogMesh); bm.free()
fog = bpy.data.objects.new("Haze", fogMesh); scene.collection.objects.link(fog)
fog.location = Y_UP @ Vector((0, H / 2, 1.4)); fog.scale = (10, 8.4, H)
vm = bpy.data.materials.new("Haze"); vm.use_nodes = True; vn = vm.node_tree; vn.nodes.remove(vn.nodes["Principled BSDF"])
vol = vn.nodes.new("ShaderNodeVolumePrincipled"); vol.inputs["Density"].default_value = float(os.environ.get("HAZE", .006 if W_ else .004)); vol.inputs["Anisotropy"].default_value = .4  # thicker, forward-scattering haze: only sunlight lights it, so it shows as shafts, not milk
sun.data.volume_factor = float(os.environ.get("SVOL", 0 if W_ else 4))  # the sun's shafts through the skylight read in the haze
vn.links.new(vol.outputs[0], vn.nodes["Material Output"].inputs["Volume"]); fog.data.materials.append(vm)
for o in scene.objects:  # only sunlight lights the haze: shafts, not an even glow
    if o.type == "LIGHT" and o.name.split(".")[0] != "Sun": o.data.volume_factor = 0
# sunlight: one small, distant spot, so the wall and glazing bars (or the skylight beams) cut sharp parallel shafts in the haze
sl = bpy.data.lights.new("SunShaft", "SPOT"); sl.spot_blend = 1.; sl.shadow_soft_size = float(os.environ.get("SOFT", .45)); sl.specular_factor = .5; sl.volume_factor = float(os.environ.get("WVOL", 7))  # x2: the rays read too faint in the test clips
slo = bpy.data.objects.new("SunShaft", sl); scene.collection.objects.link(slo); archl.append(slo)
if WINDOW: sl.spot_size = math.radians(50); sl["base"] = 40000; slo.location = (1.2, NB + 6, 6.2); aim = Vector((-.3, NB - 2.6, 0))
else: sl.spot_size = math.radians(55); sl["base"] = 26000; sl.volume_factor = float(os.environ.get("CVOL", 2.2)); slo.location = (.8, (SY0 + SY1) / 2 + 1.2, 9); aim = Vector((-.2, (SY0 + SY1) / 2 - .5, 0))  # high above the skylight, a little off vertical
slo.rotation_euler = (aim - slo.location).to_track_quat("-Z", "Y").to_euler()
for l_ in [fill] + [l for l in archl if l.name.startswith("ArchLight")]: l_.data.volume_factor = float(os.environ.get("FVOL", .35))  # a faint even glow in the haze under the skylight and in front of the arches: rays plus diffuse light

# ---- colour management: filmic look ----
scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Punchy"; scene.view_settings.exposure = .3  # softer: no crushed blacks, no hot whites

# soft halation round bright glass, as a camera lens records a lit window
cng = bpy.data.node_groups.new("Comp", "CompositorNodeTree"); cng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
crl = cng.nodes.new("CompositorNodeRLayers"); cgl = cng.nodes.new("CompositorNodeGlare"); cgo = cng.nodes.new("NodeGroupOutput")
cgl.inputs["Type"].default_value = "Bloom"; cgl.inputs["Highlights Threshold"].default_value = 1.2; cgl.inputs["Strength"].default_value = .22; cgl.inputs["Size"].default_value = .7; cgl.inputs["Quality"].default_value = "High"
cng.links.new(crl.outputs["Image"], cgl.inputs["Image"]); cng.links.new(cgl.outputs[0], cgo.inputs[0]); scene.compositing_node_group = cng
times = {}
def shoot(engine, name):
    scene.render.engine = engine; scene.render.filepath = os.path.join(OUT, name)
    t0 = time.time(); bpy.ops.render.render(write_still=True); times[name] = round(time.time() - t0, 1)

scene.eevee.use_raytracing = True; scene.eevee.taa_render_samples = 32
scene.eevee.use_shadows = True; scene.eevee.volumetric_tile_size = "8"
scene.eevee.use_volumetric_shadows = True  # without it the haze glows evenly: no shafts behind the bars and muntins
if not os.environ.get("ANIM"):  # tools/blender-anim.py reuses this scene for the film
    shoot("BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE", "eevee.png")
    
    # Cycles settings kept for stills
    scene.cycles.device = "CPU"; scene.cycles.samples = 96; scene.cycles.use_denoising = True; scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.max_bounces = 6; scene.cycles.volume_bounces = 0
    shoot(scene.render.engine, "eevee2.png")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "room.blend"))
    result = times
