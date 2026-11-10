# Renders the room part of the film in Blender (EEVEE, 1920x1080), one PNG per exported frame.
# Run headless:  blender -b -P tools/blender-anim.py   (needs artifacts/blender/room.glb, room.json, path.json)
import bpy, json, math, os, time
from mathutils import Matrix, Quaternion, Vector
ROOT = r"C:\Users\mayan\Desktop\Freelance Work\sunroof"
os.environ["ANIM"] = "1"
exec(open(os.path.join(ROOT, "tools", "blender-room.py")).read())  # builds the scene, skips its test stills
OUT = os.path.join(ROOT, "artifacts", "blender", "frames")
os.makedirs(OUT, exist_ok=True)
keys = json.load(open(os.path.join(ROOT, "artifacts", "blender", "path.json")))
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
scene.render.image_settings.file_format = "PNG"
peak = max(k["sunI"] for k in keys) or 1
t0 = time.time()
for n, k in enumerate(keys):
    path = os.path.join(OUT, f"f{k['i']:05d}.png")
    if os.path.exists(path): continue  # resumable
    q = k["q"]; cam.matrix_world = Y_UP @ (Matrix.Translation(Vector(k["p"])) @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4())
    cam.data.angle_y = math.radians(k["fov"])
    lvl = max(.04, k["sunI"] / peak); c = k["sunCol"]; m = max(c) or 1
    area.data.energy = 1400 * lvl; area.data.color = tuple(.5 + .5 * v / m for v in c)
    next(n for n in em.node_tree.nodes if n.type == "EMISSION").inputs[1].default_value = 10 * lvl
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"{n + 1}/{len(keys)} frame {k['i']} {round(time.time() - t0)}s", flush=True)
