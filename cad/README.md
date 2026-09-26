# Recorder form-study CAD

The form-study geometry is generated parametrically with CadQuery/OpenCascade. Presentation
renders are generated in Blender from the exported STL geometry. All paths are relative to the
repository root.

## Regenerate solids

```bash
python cad/scripts/generate_forms.py
```

The Python environment must include CadQuery 2.6 or newer.

## Regenerate renders

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python cad/scripts/render_forms.py -- \
  --root "/absolute/path/to/Voice Recorder"
```

Add `--orthographic` to generate the five neutral views per form. Add `--only O1` to render
one form while tuning the scene.

## Regenerate sheets and PDFs

```bash
python cad/scripts/build_documents.py
```

The script expects the solids, renders, and orthographic views to exist. It generates comparison
contact sheets and both final PDFs.

## Design gate

Do not create production shell details from every candidate. Print and evaluate the ten neutral
handling forms, select one form and one CMF direction, and only then develop the working EVT
assembly and repairable rear-cover architecture.
