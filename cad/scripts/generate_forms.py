#!/usr/bin/env python3
"""Generate the ten recorder form-study solids as STEP and STL.

Coordinates are millimetres. X is width, Y is depth (negative is the control
face), and Z is the long vertical axis with the lower datum at Z=0.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import cadquery as cq
from cadquery import exporters


ROOT = Path(__file__).resolve().parents[2]
OUT_STEP = ROOT / "cad" / "output" / "step"
OUT_STL = ROOT / "cad" / "output" / "stl"
OUT_STEP.mkdir(parents=True, exist_ok=True)
OUT_STL.mkdir(parents=True, exist_ok=True)

CORE = (25.0, 14.0, 62.0)
LED_DIAMETER = 2.0
BUTTON_DIAMETER = 12.0
BUTTON_Z = 14.0
MIC_SPACING = 14.0
MIC_FIELD_DIAMETER = 4.5
MIC_HOLE_DIAMETER = 0.45
USB = (9.2, 3.4)
RF_WINDOW = (28.0, 12.0)
BUTTON_RECESS = 0.5


@dataclass(frozen=True)
class FormSpec:
    id: str
    family: str
    name: str
    height: float
    width: float
    depth: float
    construction: str
    notes: str


FORMS = [
    FormSpec("O1", "organic", "Round capsule", 80, 34, 34, "organic_loft", "Subtly flattened control face"),
    FormSpec("O2", "organic", "Thin flattened capsule", 80, 38, 21, "organic_loft", "Thin elliptical section"),
    FormSpec("O3", "organic", "Biaxial river pebble", 76, 42, 20, "organic_loft", "Offset crown and asymmetric section"),
    FormSpec("O4", "organic", "Symmetrical tapered lozenge", 82, 36, 20, "organic_loft", "Long symmetric taper"),
    FormSpec("O5", "organic", "Asymmetric thumbstone", 76, 40, 23, "organic_loft", "Shallow lower waist"),
    FormSpec("G1", "geometric", "Circular cylinder", 80, 34, 34, "cylinder", "Flat end lands"),
    FormSpec("G2", "geometric", "Rounded rectangular monolith", 76, 38, 20, "rounded_box", "Constant section, R6 corners"),
    FormSpec("G3", "geometric", "Softened octagonal prism", 84, 34, 24, "octagon", "Faceted section with softened edges"),
    FormSpec("G4", "geometric", "Soft triangular prism", 92, 32, 25, "soft_triangle", "Truncated triangular section"),
    FormSpec("G5", "geometric", "Tapered geometric baton", 90, 34, 21, "tapered_baton", "34 mm upper width, 30 mm lower width"),
]


def ellipse_wire(z: float, width: float, depth: float, x: float = 0.0, y: float = 0.0) -> cq.Wire:
    return (
        cq.Workplane("XY", origin=(x, y, z))
        .ellipse(width / 2.0, depth / 2.0)
        .wire()
        .val()
    )


def loft_ellipses(sections: list[tuple[float, float, float, float, float]]) -> cq.Workplane:
    wires = [ellipse_wire(*section) for section in sections]
    # Ruled lofting keeps every form inside its declared envelope. Blender applies
    # smooth shading for presentation while the solid remains deterministic.
    return cq.Workplane(obj=cq.Solid.makeLoft(wires, True))


def organic_body(spec: FormSpec) -> cq.Workplane:
    h, w, d = spec.height, spec.width, spec.depth
    if spec.id == "O1":
        radius = w / 2
        middle = cq.Workplane("XY").circle(radius).extrude(h - 2 * radius).translate((0, 0, radius))
        lower = cq.Workplane("XY").sphere(radius).translate((0, 0, radius))
        upper = cq.Workplane("XY").sphere(radius).translate((0, 0, h - radius))
        usb_land = cq.Workplane("XY").ellipse(7.0, 4.5).extrude(0.8)
        return middle.union(lower).union(upper).union(usb_land)
    elif spec.id == "O2":
        sections = [
            (0, 14, 7, 0, 0), (6, 31, 17, 0, 0), (9, w, d, 0, 0),
            (h - 9, w, d, 0, 0), (h - 6, 31, 17, 0, 0), (h, 4, 3, 0, 0),
        ]
    elif spec.id == "O3":
        sections = [
            (0, 14, 7, -0.5, 0.2), (6, w - 0.4, d, -0.2, 0),
            (h * 0.38, w - 1, d, 0.5, 0), (h * 0.68, 40.5, d, 0.2, 0),
            (h - 6, w - 0.4, d, -0.2, 0), (h, 6, 4, -1.0, 0.4),
        ]
    elif spec.id == "O4":
        sections = [
            (0, 14, 7, 0, 0), (10, w, d, 0, 0), (h * 0.32, w, d, 0, 0),
            (h * 0.68, w, d, 0, 0), (h - 10, w, d, 0, 0), (h, 4, 3, 0, 0),
        ]
    else:  # O5
        sections = [
            (0, 14, 8, -0.5, 0), (7, w, d, 0, 0),
            (h * 0.32, 38, 21, -0.8, 0), (h * 0.52, w - 2, d, 1.0, 0),
            (h * 0.76, 38, 22, 0.5, 0), (h - 7, w, d, 0, 0),
            (h, 7, 4, -0.5, 0),
        ]
    return loft_ellipses(sections)


def polygon_prism(points: list[tuple[float, float]], height: float, fillet: float = 0.0) -> cq.Workplane:
    body = cq.Workplane("XY").polyline(points).close().extrude(height)
    if fillet:
        try:
            body = body.edges("|Z").fillet(fillet)
        except Exception:
            pass
    return body


def geometric_body(spec: FormSpec) -> cq.Workplane:
    h, w, d = spec.height, spec.width, spec.depth
    if spec.id == "G1":
        body = cq.Workplane("XY").circle(w / 2).extrude(h)
        try:
            return body.edges("%Circle").fillet(1.5)
        except Exception:
            return body
    if spec.id == "G2":
        body = cq.Workplane("XY").box(w, d, h, centered=(True, True, False))
        return body.edges("|Z").fillet(6).edges("#Z").fillet(2)
    if spec.id == "G3":
        c = 5.0
        points = [(-w/2+c, -d/2), (w/2-c, -d/2), (w/2, -d/2+c),
                  (w/2, d/2-c), (w/2-c, d/2), (-w/2+c, d/2),
                  (-w/2, d/2-c), (-w/2, -d/2+c)]
        return polygon_prism(points, h, 1.3).edges("#Z").fillet(1.5)
    if spec.id == "G4":
        points = [(-w/2+4, -d/2), (w/2-4, -d/2), (w/2, -d/2+5),
                  (w/2-3, d/2), (-w/2+3, d/2), (-w/2, -d/2+5)]
        return polygon_prism(points, h, 2.2).edges("#Z").fillet(1.5)

    # G5: tapered, chamfered polygon sections.
    def baton_wire(z: float, width: float) -> cq.Wire:
        chamfer = 3.5
        pts = [(-width/2+chamfer, -d/2), (width/2-chamfer, -d/2),
               (width/2, -d/2+chamfer), (width/2, d/2-chamfer),
               (width/2-chamfer, d/2), (-width/2+chamfer, d/2),
               (-width/2, d/2-chamfer), (-width/2, -d/2+chamfer)]
        return cq.Workplane("XY", origin=(0, 0, z)).polyline(pts).close().wire().val()
    body = cq.Workplane(obj=cq.Solid.makeLoft([baton_wire(0, 30), baton_wire(h, 34)], True))
    try:
        return body.edges("|Z").fillet(1.5)
    except Exception:
        return body


def cylinder_cut(radius: float, depth: float, x: float, y: float, z: float, direction: tuple[float, float, float]) -> cq.Workplane:
    solid = cq.Solid.makeCylinder(radius, depth, cq.Vector(x, y, z), cq.Vector(*direction))
    return cq.Workplane(obj=solid)


def add_landmarks(body: cq.Workplane, spec: FormSpec) -> cq.Workplane:
    bbox = body.val().BoundingBox()
    front = bbox.ymin - 0.05
    rear = bbox.ymax + 0.05
    h = spec.height

    # LED and button recesses on the control face.
    body = body.cut(cylinder_cut(LED_DIAMETER / 2, 0.55, 0, front, h / 2, (0, 1, 0)))
    body = body.cut(cylinder_cut(BUTTON_DIAMETER / 2, BUTTON_RECESS, 0, front, BUTTON_Z, (0, 1, 0)))

    # Two seven-hole microphone fields. These are shallow print landmarks, not EVT bores.
    ring_r = 1.35
    for field_x in (-MIC_SPACING / 2, MIC_SPACING / 2):
        positions = [(field_x, h - 7)]
        for dx, dz in ((ring_r, 0), (-ring_r, 0), (0, ring_r), (0, -ring_r),
                       (0.95, 0.95), (-0.95, -0.95)):
            positions.append((field_x + dx, h - 7 + dz))
        for x, z in positions:
            body = body.cut(cylinder_cut(MIC_HOLE_DIAMETER / 2, 0.42, x, front, z, (0, 1, 0)))

    # Bottom USB-C landmark.
    usb_cut = cq.Workplane("XY").box(USB[0], USB[1], 0.55, centered=(True, True, False)).translate((0, 0, -0.05))
    body = body.cut(usb_cut)

    # Upper-rear RF window recess. Keep it shallow so it cannot approach the core.
    rf_cut = cq.Workplane("XY").box(RF_WINDOW[0], 0.42, RF_WINDOW[1], centered=(True, True, True)).translate((0, rear, h - 20))
    body = body.cut(rf_cut)

    # Shallow lower-rear line denotes the removable cover without prescribing
    # the final perimeter geometry before a form is selected.
    cover_seam = cq.Workplane("XY").box(min(spec.width - 6, 24), 0.42, 0.35, centered=(True, True, True)).translate((0, rear, 10))
    body = body.cut(cover_seam)

    # Discreet machine-readable variant code: one to ten shallow rear dimples.
    index = FORMS.index(spec) + 1
    columns = min(index, 5)
    rows = 1 if index <= 5 else 2
    for row in range(rows):
        count = columns if row == rows - 1 else 5
        for col in range(count):
            x = (col - (count - 1) / 2) * 1.8
            z = 5.5 + row * 1.8
            body = body.cut(cylinder_cut(0.32, 0.35, x, rear, z, (0, -1, 0)))
    return body


def build_form(spec: FormSpec) -> cq.Workplane:
    body = organic_body(spec) if spec.family == "organic" else geometric_body(spec)
    return add_landmarks(body, spec)


def check_core(body: cq.Workplane, spec: FormSpec) -> dict[str, float | bool]:
    core = cq.Workplane("XY").box(*CORE, centered=(True, True, True)).translate((0, 0, spec.height / 2))
    outside = core.val().cut(body.val())
    outside_volume = abs(outside.Volume()) if outside else 0.0
    return {
        "core_width_mm": CORE[0],
        "core_depth_mm": CORE[1],
        "core_height_mm": CORE[2],
        "outside_volume_mm3": round(outside_volume, 4),
        "passes": outside_volume < 0.05,
    }


def main() -> None:
    manifest = {
        "units": "mm",
        "coordinate_system": {"x": "width", "y": "depth; negative is front", "z": "height"},
        "landmarks": {
            "led_diameter_mm": LED_DIAMETER,
            "button_diameter_mm": BUTTON_DIAMETER,
            "button_center_z_mm": BUTTON_Z,
            "button_recess_mm": BUTTON_RECESS,
            "microphone_spacing_mm": MIC_SPACING,
            "microphone_field_diameter_mm": MIC_FIELD_DIAMETER,
            "microphone_hole_diameter_mm": MIC_HOLE_DIAMETER,
            "microphone_holes_per_field": 7,
            "usb_c_opening_mm": USB,
            "rf_window_mm": RF_WINDOW,
        },
        "forms": [],
    }
    failures: list[str] = []
    for spec in FORMS:
        body = build_form(spec)
        bbox = body.val().BoundingBox()
        check = check_core(body, spec)
        step_path = OUT_STEP / f"{spec.id}_{spec.name.lower().replace(' ', '_')}.step"
        stl_path = OUT_STL / f"{spec.id}_{spec.name.lower().replace(' ', '_')}.stl"
        exporters.export(body, str(step_path))
        exporters.export(body, str(stl_path), tolerance=0.04, angularTolerance=0.08)
        if not check["passes"]:
            failures.append(f"{spec.id}: core protrudes by {check['outside_volume_mm3']} mm^3")
        manifest["forms"].append({
            **asdict(spec),
            "actual_bbox_mm": [round(bbox.xlen, 3), round(bbox.ylen, 3), round(bbox.zlen, 3)],
            "volume_mm3": round(body.val().Volume(), 2),
            "core_check": check,
            "step": str(step_path.relative_to(ROOT)),
            "stl": str(stl_path.relative_to(ROOT)),
        })
        print(f"generated {spec.id}: {bbox.xlen:.2f} x {bbox.ylen:.2f} x {bbox.zlen:.2f} mm")

    manifest_path = ROOT / "cad" / "output" / "forms-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"manifest: {manifest_path}")


if __name__ == "__main__":
    main()
