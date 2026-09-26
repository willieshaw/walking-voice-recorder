# Voice Recorder CAD Prototype Specification

## Status and Gate

This package implements the form-study stage for the standalone single-LED recorder. Ten
handling forms are modeled at 1:1 scale and rendered in ten CMF directions. The forms are
not production enclosures: they carry interface landmarks and a verified internal reservation,
but do not yet contain shell splits, bosses, gaskets, or working electronics.

The functional EVT enclosure remains gated until one form and one CMF direction are selected.
No candidate is the default winner.

## Coordinate System and Shared Parameters

- Units: millimetres.
- X: product width.
- Y: product depth; negative Y is the front/control face.
- Z: long axis; Z=0 is the lower USB-C datum.
- Required internal reservation: 62 H x 25 W x 14 D.
- LED aperture: 2.0 diameter, centered in X at Z=50% of body height.
- Button: 12 diameter, centered in X at Z=14.
- Button cap datum: 0.5 below the surrounding guard surface.
- EVT button target: 0.4-0.6 travel, 1.8-2.2 N actuation, quiet restrained tactile snap,
  and elastomeric acoustic isolation.
- Microphone fields: two 4.5-diameter fields, 14 center-to-center, centered at Z=height-7.
- Each field has seven approximately 0.45 holes over a replaceable hydrophobic acoustic mesh.
- USB-C landmark: 9.2 x 3.4, centered on a minimum 12 x 7 lower flat land; cable axis
  parallel to the long axis.
- RF window landmark: 28 x 12 on the upper rear.

## Form Set

| ID | Family | Description | Nominal envelope (H x W x D) |
|---|---|---|---|
| O1 | Organic | Round capsule with a subtly flattened control intent | 80 x 34 x 34 |
| O2 | Organic | Thin flattened capsule | 80 x 38 x 21 |
| O3 | Organic | Biaxial river pebble | 76 x 42 x 20 |
| O4 | Organic | Symmetrical tapered lozenge | 82 x 36 x 20 |
| O5 | Organic | Asymmetric thumbstone with a shallow waist | 76 x 40 x 23 |
| G1 | Geometric | Circular cylinder with flat end lands | 80 x 34 x 34 |
| G2 | Geometric | Rounded rectangular monolith | 76 x 38 x 20 |
| G3 | Geometric | Softened octagonal prism | 84 x 34 x 24 |
| G4 | Geometric | Soft triangular prism | 92 x 32 x 25 |
| G5 | Geometric | Tapered geometric baton | 90 x 34/30 x 21 |

The generated manifest records actual post-operation bounding boxes, volumes, source filenames,
and the result of the internal-core check. All candidates must report `passes: true` before release.

## Handling Model Details

- Models are closed, manifold solids intended for neutral 1:1 form evaluation.
- LED, button, microphone, USB-C, RF, and variant-code features are shallow landmarks.
- A shallow lower-rear split line represents the future removable cover without fixing its
  final perimeter before form selection.
- The button landmark is not a moving mechanism.
- Rear variant identity is encoded with one to ten shallow dimples so forms can be randomized
  without descriptive names.
- No support strategy, walling, infill, or printer process is prescribed.
- STEP is the authoritative neutral CAD exchange format. STL is the print-ready derivative.

## CMF Matrix

Every form is rendered in:

1. Natural bead-blasted anodized aluminum.
2. Graphite anodized aluminum.
3. Warm champagne anodized aluminum.
4. Deep cobalt anodized aluminum.
5. Matte black engineering polymer.
6. Warm off-white engineering polymer.
7. Vermilion engineering polymer.
8. Smoke-translucent polycarbonate.
9. Charcoal soft-touch elastomer over a rigid core.
10. Natural aluminum with contrasting black polymer details.

The CMF renders are comparative visualizations, not manufacturing color standards. Final CMF
requires physical plaques, approved master samples, and supplier-specific finish callouts.

## EVT Packaging Reservation

The selected form will be developed around a rigid-flex spine with these provisional envelopes:

- Main rigid island: 44 x 22 x 1; component height 3.5 front and 2.0 rear.
- Top microphone island: 24 x 8 x 1.
- Lower USB/control island: 22 x 16 x 1.
- Flex neck dynamic bend radius: 1.5 minimum.
- Pouch-cell reservation: 50 x 24 x 8.5, including swell clearance.
- General electronics clearance: 0.5 minimum.
- Machined 6061-T6 shell: 1.2 nominal wall, 1.0 minimum.
- Exterior edge radius: 1.5 minimum unless a larger form-defining radius applies.
- General CNC tolerance: +/-0.10; interface datums: +/-0.05.

## EVT Assembly and Tiered Repairability

- Machined front shell and removable rear cover.
- Two upper hooks plus two lower M1.6 x 4 T5 screws into replaceable metal threads.
- Keyed perimeter gasket at 25% +/-5% compression.
- Open, internally sealed water-resistant USB-C port.
- Mechanically retained LED lens, RF insert, and replaceable acoustic carriers.
- Owner-replaceable battery in under ten minutes using one T5 driver.
- Keyed battery connector, protected cable route, stretch-release pull tab, and replacement gasket.
- Shop-replaceable USB-C, button/LED, microphone flex, antenna, acoustic carriers, and seals.
- Integrated rigid-flex logic/storage spine with documented specialist recovery contacts.
- No heat, solvents, destructive clips, serial pairing, or proprietary activation for common repairs.
- Reassembly target: 0.12 N m screw torque with a fresh keyed gasket to restore the IP54 design condition.

## Selection Criteria

Walking capture drives the form decision. Evaluate secure one-handed grip (30%), button reach
and confidence (25%), pocket comfort and retrieval (20%), immediate orientation (15%), and
visual/tactile desirability (10%). Scores and comments inform the decision; the designer selects
the form and CMF that advance to EVT.

Use the designer and 5-8 additional users. Randomize order, conceal descriptive names, and test
pocket insertion/removal, walking carry, eyes-free orientation, thumb reach, simulated tap and
hold, grip changes, and a short spoken-note posture. Show CMF only after neutral-form handling.
Record preferred form and CMF, concerns, and qualitative comments without treating the weighted
score as an automatic selection.

## Deliverable Map

- `cad/output/step/`: ten authoritative STEP solids.
- `cad/output/stl/`: ten 1:1 watertight STL solids.
- `cad/output/renders/`: 100 individual CMF renders.
- `cad/output/orthographic/`: front, rear, side, top, and bottom views for every form.
- `cad/output/contact-sheets/`: CMF and form comparison sheets.
- `cad/output/forms-manifest.json`: dimensions, volume, paths, and internal-core validation.
- `output/pdf/recorder-form-study.pdf`: dimensioned comparison book.
- `output/pdf/recorder-cmf-matrix.pdf`: complete 100-render CMF matrix.

## EVT Exit Criteria

After a form is selected, the EVT CAD is complete only when it includes an assembly STEP,
individual service-part files, exploded view, interface-control drawing, gasket drawing,
fastener schedule, and preliminary BOM. Physical validation must cover button force and recorded
click noise, microphone obstruction, antenna performance, connector insertion, 1 m drops, and
IP54 before design freeze.
