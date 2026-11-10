# Builds the room in Blender from artifacts/blender/room.glb + room.json (see tools/room-to-blender.mjs)
# and renders test stills. Run through the Blender MCP add-on: node tools/blender.mjs tools/blender-room.py
import bpy, bmesh, json, math, time, os
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
    i = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    i.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    return i

def scan(mat, tex, tile, tint=None, normal=.6, sheen=0.0):
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
    nt.links.new(t("rough", False).outputs[0], bsdf.inputs["Roughness"])
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
        if key == "wall": paint(m, srgb("#d8d0c3"), .35)
        elif key == "ceil": paint(m, srgb("#ece7df"), .2)
        elif key == "floor": scan(m, "wood_floor", 2.2, normal=.8)
        elif key == "rug": scan(m, "rough_linen", .9, tint=srgb("#d9cdb9"), normal=1)
        elif key == "linen": scan(m, "rough_linen", .45, tint=srgb("#e8dcc6"), normal=1, sheen=.3)
        elif key in ("oak", "slat"): scan(m, "wood_floor", .9, tint=srgb("#c8a27a") if key == "oak" else srgb("#8a6040"), normal=.5)
        elif m.name == frame_mat: scan(m, "wood_floor", .7, tint=srgb("#b07850"), normal=.4)
        elif key == "cushion": scan(m, "velour_velvet", .35, tint=srgb("#c2603e"), normal=.8, sheen=.8)

# ---- light: sun through the front, the panel as a skylight, soft sky ----
s = meta["sun"]; d = Y_UP @ Vector(s["dir"])
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); scene.collection.objects.link(sun)
sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler(); sun.data.energy = 3; sun.data.angle = math.radians(1.5)
sun.data.color = s["color"]; sun.hide_render = True  # the room is closed: light comes only from the panel
# close the open front of the cut-away room, just behind the camera
bm2 = bmesh.new(); bmesh.ops.create_cube(bm2, size=1); wm = bpy.data.meshes.new("Front"); bm2.to_mesh(wm); bm2.free()
front = bpy.data.objects.new("Front", wm); scene.collection.objects.link(front); front.location = Y_UP @ Vector((0, 1.7, 7.15)); front.scale = (11, .3, 3.6)
fm = bpy.data.materials.new("FrontWall"); fm.use_nodes = True; fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*srgb("#d8d0c3"), 1); front.data.materials.append(fm)

# skylight: an area light the size of the panel, a little below the ceiling, aimed down along the sun
H, PZ = 3.4, -.4
area = bpy.data.objects.new("Panel", bpy.data.lights.new("Panel", "AREA")); scene.collection.objects.link(area)
area.data.shape = "RECTANGLE"; area.data.size, area.data.size_y = 3.2, 2.0; area.data.energy = 1400
area.data.color = (1, .72, .48); area.data.spread = math.radians(50)
area.location = Y_UP @ Vector((0, H - .1, PZ)); area.rotation_euler = (0, 0, 0); area.visible_camera = False
# the glowing diffuser, seen between the frame bars
bm3 = bmesh.new(); bmesh.ops.create_grid(bm3, x_segments=1, y_segments=1, size=.5); dm = bpy.data.meshes.new("Diffuser"); bm3.to_mesh(dm); bm3.free()
dif = bpy.data.objects.new("Diffuser", dm); scene.collection.objects.link(dif); dif.location = Y_UP @ Vector((0, H - .008, PZ)); dif.scale = (3.3, 2.1, 1); dif.rotation_euler = (math.pi, 0, 0)
em = bpy.data.materials.new("Diffuser"); em.use_nodes = True; en = em.node_tree; en.nodes.clear(); eg = en.nodes.new("ShaderNodeEmission"); eg.inputs[0].default_value = (1, .86, .7, 1); eg.inputs[1].default_value = 7
en.links.new(eg.outputs[0], en.nodes.new("ShaderNodeOutputMaterial").inputs[0]); dif.data.materials.append(em); dif.visible_shadow = False
for m in bpy.data.materials:
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.node_tree else None
    if b and b.inputs["Emission Color"].links: b.inputs["Emission Strength"].default_value = 6  # the diffuser
# three.js glow materials arrive unlit: make the bright ones (the panes) real light sources
for m in bpy.data.materials:
    e = next((n for n in m.node_tree.nodes if n.type == "EMISSION"), None) if m.node_tree else None
    if e and max(e.inputs[0].default_value[:3]) > .1 and not e.inputs[0].links:
        nt = m.node_tree; nt.nodes.clear(); g = nt.nodes.new("ShaderNodeEmission"); g.inputs[0].default_value = (1, .8, .6, 1); g.inputs[1].default_value = 10
        nt.links.new(g.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])

world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (.36, .34, .36, 1); bg.inputs[1].default_value = .18

# haze, so the light from the panel reads as shafts
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); fogMesh = bpy.data.meshes.new("Haze"); bm.to_mesh(fogMesh); bm.free()
fog = bpy.data.objects.new("Haze", fogMesh); scene.collection.objects.link(fog)
fog.location = Y_UP @ Vector((0, H / 2, 1.4)); fog.scale = (10, 8.4, H)
vm = bpy.data.materials.new("Haze"); vm.use_nodes = True; vn = vm.node_tree; vn.nodes.remove(vn.nodes["Principled BSDF"])
vol = vn.nodes.new("ShaderNodeVolumePrincipled"); vol.inputs["Density"].default_value = .008
vn.links.new(vol.outputs[0], vn.nodes["Material Output"].inputs["Volume"]); fog.data.materials.append(vm)

# ---- colour management: filmic look ----
scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Medium High Contrast"; scene.view_settings.exposure = .3

times = {}
def shoot(engine, name):
    scene.render.engine = engine; scene.render.filepath = os.path.join(OUT, name)
    t0 = time.time(); bpy.ops.render.render(write_still=True); times[name] = round(time.time() - t0, 1)

scene.eevee.use_raytracing = True; scene.eevee.taa_render_samples = 64
scene.eevee.use_shadows = True; scene.eevee.volumetric_tile_size = "4"
if not os.environ.get("ANIM"):  # tools/blender-anim.py reuses this scene for the film
    shoot("BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE", "eevee.png")
    
    # Cycles settings kept for stills
    scene.cycles.device = "CPU"; scene.cycles.samples = 96; scene.cycles.use_denoising = True; scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.max_bounces = 6; scene.cycles.volume_bounces = 0
    shoot(scene.render.engine, "eevee2.png")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "room.blend"))
    result = times
