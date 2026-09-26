#!/usr/bin/env python3
"""Blender batch renderer for the recorder form and CMF matrix."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--only", default="")
    parser.add_argument("--orthographic", action="store_true")
    return parser.parse_args(argv)


CMF = [
    ("01-natural-aluminum", "Natural aluminum", (0.62, 0.64, 0.66, 1), 1.0, 0.28, "metal"),
    ("02-graphite-aluminum", "Graphite aluminum", (0.075, 0.082, 0.09, 1), 1.0, 0.32, "metal"),
    ("03-champagne-aluminum", "Champagne aluminum", (0.58, 0.46, 0.31, 1), 1.0, 0.30, "metal"),
    ("04-cobalt-aluminum", "Cobalt aluminum", (0.025, 0.13, 0.34, 1), 1.0, 0.31, "metal"),
    ("05-matte-black-polymer", "Matte black polymer", (0.018, 0.021, 0.025, 1), 0.0, 0.48, "polymer"),
    ("06-warm-white-polymer", "Warm white polymer", (0.79, 0.75, 0.67, 1), 0.0, 0.42, "polymer"),
    ("07-vermilion-polymer", "Vermilion polymer", (0.64, 0.025, 0.012, 1), 0.0, 0.39, "polymer"),
    ("08-smoke-translucent", "Smoke translucent", (0.16, 0.19, 0.22, 1), 0.0, 0.20, "translucent"),
    ("09-charcoal-soft-touch", "Charcoal soft-touch", (0.065, 0.07, 0.075, 1), 0.0, 0.76, "soft"),
    ("10-aluminum-hybrid", "Aluminum + black polymer", (0.58, 0.61, 0.63, 1), 1.0, 0.25, "hybrid"),
]


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def make_material(name: str, color: tuple[float, float, float, float], metallic: float, roughness: float, kind: str):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if kind == "translucent":
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.68
        bsdf.inputs["Coat Weight"].default_value = 0.18
        bsdf.inputs["IOR"].default_value = 1.47
    if kind == "soft":
        bsdf.inputs["Sheen Weight"].default_value = 0.16
    return material


def add_beveled_cube(name: str, dimensions: tuple[float, float, float], location: tuple[float, float, float], material, bevel=0.4):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    obj.data.materials.append(material)
    return obj


def add_cylinder(name: str, radius: float, depth: float, location: tuple[float, float, float], material):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=location, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def import_form(stl_path: Path, material):
    bpy.ops.wm.stl_import(filepath=str(stl_path))
    body = bpy.context.selected_objects[0]
    body.name = "form body"
    body.data.materials.append(material)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    bevel = body.modifiers.new("edge softness", "BEVEL")
    bevel.width = 0.18
    bevel.segments = 2
    return body


def surface_y(body, x: float, z: float, front: bool) -> float:
    origin = Vector((x, -100 if front else 100, z))
    direction = Vector((0, 1 if front else -1, 0))
    hit, location, _normal, _face = body.ray_cast(origin, direction)
    if hit:
        return location.y + (-0.16 if front else 0.16)
    return (-body.dimensions.y / 2 - 0.16) if front else (body.dimensions.y / 2 + 0.16)


def add_details(body, form: dict, dark, lens, show_rf: bool):
    h, w, d = form["height"], form["width"], form["depth"]
    button_y = surface_y(body, 0, 14.0, True)
    led_y = surface_y(body, 0, h / 2, True)
    add_cylinder("quiet tactile button", 6.0, 0.72, (0, button_y, 14.0), dark)
    add_cylinder("LED pin light", 1.05, 0.48, (0, led_y - 0.08, h / 2), lens)
    for field_x in (-7.0, 7.0):
        for dx, dz in ((0, 0), (1.25, 0), (-1.25, 0), (0, 1.25), (0, -1.25), (0.88, 0.88), (-0.88, -0.88)):
            x, z = field_x + dx, h - 7 + dz
            add_cylinder("micro perforation", 0.25, 0.32, (x, surface_y(body, x, z, True), z), dark)
    add_beveled_cube("USB-C", (9.2, 3.4, 0.45), (0, 0, -0.12), dark, 0.35)
    if show_rf:
        rear = surface_y(body, 0, h - 20, False)
        add_beveled_cube("RF window", (min(28, w - 4), 0.5, 12), (0, rear, h - 20), dark, 1.8)


def point_camera(camera, target: tuple[float, float, float]):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(form: dict, view: str):
    h, w, d = form["height"], form["width"], form["depth"]
    target = (0, 0, h * 0.48)
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    if view == "hero":
        camera.location = (h * 0.95, -h * 1.45, h * 1.05)
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = max(h * 1.22, w * 2.25)
    else:
        positions = {
            "front": (0, -h * 2.0, h / 2),
            "rear": (0, h * 2.0, h / 2),
            "side": (h * 2.0, 0, h / 2),
            "top": (0, -0.01, h * 2.5),
            "bottom": (0, 0.01, -h * 1.7),
        }
        camera.location = positions[view]
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = h * 1.18 if view in {"front", "rear", "side"} else max(w, d) * 1.7
        target = (0, 0, h / 2) if view in {"front", "rear", "side"} else (0, 0, h if view == "top" else 0)
    point_camera(camera, target)
    bpy.context.scene.camera = camera


def add_lighting(form: dict, include_ground: bool):
    h = form["height"]
    world = bpy.context.scene.world
    world.color = (0.45, 0.47, 0.50)
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.46, 0.52, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65
    for location, energy, size, color in [
        ((-85, -90, h * 1.25), 1900, 75, (1.0, 0.94, 0.86)),
        ((90, -30, h * 0.9), 1550, 62, (0.78, 0.88, 1.0)),
        ((0, 95, h * 1.05), 1200, 55, (0.75, 0.83, 1.0)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        point_camera(light, (0, 0, h / 2))
    if include_ground:
        ground_mat = make_material("ground", (0.24, 0.27, 0.31, 1), 0, 0.55, "polymer")
        add_beveled_cube("ground", (320, 320, 1.0), (0, 0, -1.0), ground_mat, 0)


def configure_render(output: Path, size: int):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.view_settings.look = "AgX - Medium High Contrast"


def render_one(root: Path, form: dict, cmf, view: str, output: Path, size: int):
    reset_scene()
    cmf_id, cmf_name, color, metallic, roughness, kind = cmf
    body_mat = make_material(cmf_name, color, metallic, roughness, kind)
    dark = make_material("detail polymer", (0.008, 0.01, 0.013, 1), 0.05, 0.34, "polymer")
    lens = make_material("unlit LED lens", (0.012, 0.016, 0.02, 1), 0.0, 0.16, "translucent")
    body = import_form(root / form["stl"], body_mat)
    add_details(body, form, dark, lens, view == "rear")
    add_camera(form, view)
    add_lighting(form, view == "hero")
    output.parent.mkdir(parents=True, exist_ok=True)
    configure_render(output, size)
    bpy.ops.render.render(write_still=True)
    print(f"rendered {form['id']} {cmf_id} {view}: {output}", flush=True)


def main():
    args = parse_args()
    root = Path(args.root).resolve()
    manifest = json.loads((root / "cad/output/forms-manifest.json").read_text())
    forms = [form for form in manifest["forms"] if not args.only or form["id"] == args.only]
    if args.orthographic:
        neutral = CMF[0]
        for form in forms:
            for view in ("front", "rear", "side", "top", "bottom"):
                output = root / "cad/output/orthographic" / form["id"] / f"{view}.png"
                render_one(root, form, neutral, view, output, 640)
    else:
        for form in forms:
            for cmf in CMF:
                output = root / "cad/output/renders" / form["id"] / f"{cmf[0]}.png"
                render_one(root, form, cmf, "hero", output, 640)


if __name__ == "__main__":
    main()
