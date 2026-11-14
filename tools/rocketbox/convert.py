"""Konverterar en Rocketbox-figur (FBX) till GLB med skelett och några ansiktsformer.

Källa: https://github.com/microsoft/Microsoft-Rocketbox (MIT-licens).
Kör:  blender --background --factory-startup --python tools/rocketbox/convert.py -- <fbx> <texturmapp> <ut.glb>
"""
import sys
import bpy

fbx, texdir, out = sys.argv[sys.argv.index("--") + 1 :][:3]

# ansiktsformer som behålls (tal, blinkning, bloss) – övriga 160 tas bort
KEEP = {
    "AA_VI_10_aa": "aa",
    "AA_VI_13_O": "oh",
    "AA_VI_12_I": "ee",
    "AA_VI_01_PP": "pp",
    "AK_09_EyeBlinkLeft": "blinkL",
    "AK_10_EyeBlinkRight": "blinkR",
    "AK_25_JawOpen": "jaw",
    "AK_38_MouthPucker": "pucker",
    "AK_44_MouthSmileLeft": "smileL",
    "AK_45_MouthSmileRight": "smileR",
    "AK_03_BrowInnerUp": "browUp",
    "AK_11_EyeLookDownLeft": "lookDownL",
    "AK_12_EyeLookDownRight": "lookDownR",
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx, use_anim=False)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
mesh = next(o for o in bpy.data.objects if o.type == "MESH")
for o in list(bpy.data.objects):
    if o not in (arm, mesh):
        bpy.data.objects.remove(o, do_unlink=True)

keys = mesh.data.shape_keys
if keys:
    for kb in list(keys.key_blocks):
        if kb.name == "Basis":
            continue
        if kb.name in KEEP:
            kb.name = KEEP[kb.name]
            kb.value = 0
        else:
            mesh.shape_key_remove(kb)


def material(mat, color, normal=None, alpha=False, rough=0.75):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], o.inputs["Surface"])
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(color)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        mat.blend_method = "BLEND"
    if normal:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(normal)
        n.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])


for mat in mesh.data.materials:
    if mat.name.endswith("_body"):
        material(mat, f"{texdir}/body_color.jpg", f"{texdir}/body_normal.jpg", rough=0.8)
        mat.name = "body"
    elif mat.name.endswith("_head"):
        material(mat, f"{texdir}/head_color.jpg", rough=0.62)
        mat.name = "head"
    elif mat.name.endswith("_opacity"):
        material(mat, f"{texdir}/opacity_color.png", alpha=True, rough=0.6)
        mat.name = "hair"

bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
mesh.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_morph=True,
    export_morph_normal=False,
    export_animations=False,
    export_yup=True,
    export_image_format="AUTO",
)
print("EXPORTED", out, "verts", len(mesh.data.vertices), "shapes", len(keys.key_blocks) if keys else 0)
