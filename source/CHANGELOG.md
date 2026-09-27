- v1.4: verified spatial Sanity repair with animation-invariance proof, Smart Auto Fix v4.1, standalone texture resolution, single-save/idempotency guards, Effects Lab reflow fixes, Effects Runtime packaging, expanded MDL/SKIN4/model-pack/parser regression coverage, and 1.4 build metadata cleanup.
- v1.3: integrated Automatic Model Test suite for model/texture/geoset/animation/rig/PBR/outliner/camera/FX/CASC/save workflows with full Log reporting and safe state restoration.
# Changelog

## 1.2

- Added a **Simple Action Editor** for creating new animations from existing Warcraft III sequences.
- Added **Duplicate Action** so an action such as `Stand` can be copied to `Stand Swim` while retaining all of its original animation keyframes.
- Added **Rename Action** for sequence/action names.
- Added per-action root **Position, Rotation and Scale** offsets; edits are applied only to the selected action while preserving the copied motion.
- Animation edits now save back to both **MDX and MDL**, including sequence timelines, animated tracks, event tracks and geoset sequence extents.
- Animation duplicate, rename and transform operations participate in the unified **75-step Undo/Redo** history.
- Added Windows file association support for **BLP, TGA, MDL and MDX**, including Default Apps registration, Open With support and double-click handoff into the correct workspace.
- Fixed cold-start file association handoff so **BLP/TGA open directly in Texture Paint** and **MDL/MDX open directly in Model Lab** after all workspace APIs are ready.
- Expanded Texture Paint and Model Lab Undo/Redo history from 25 to **75 states**.
- Updated application, portable and installer version to **1.2**.

## 1.1.2

- Added a dedicated **Geosets** sub-tab in Model Lab with per-geoset selection and visibility controls.
- Added geoset **Select, Move, Drag, Scale and Rotate** tools with viewport gizmos.
- Added Show all / Hide selected / Focus controls and direct selection from the geoset list or viewport.
- Added a separate 25-step undo/redo history for geoset geometry edits.
- Model Save now writes edited bind-pose vertices, normals and recalculated extents back to MDX/MDL.
- Updated application, portable and installer version to **1.1.2**.

## 1.1

- Improved Texture Paint navigation with horizontal scrolling while zoomed.
- Added move and rotate workflows to Texture Paint and Model Editor.
- Fixed `Edit Alpha Only` so toggling it no longer turns textures white or damages RGB data.
- Improved UV inspection across all geosets, including tiled/out-of-range UV coordinates.
- Improved CASC verification, diagnostics and effect-source reporting.
- Improved playback for supported CASC/model animation data and model effects.
- Added automatic texture discovery when opening MDX/MDL files, with missing-texture warnings.
- Expanded Warcraft III button border styles, passive/autocast variants and border color controls.
- Improved icon artwork fitting to prevent transparent gaps around frames.
- Added/updated credits for the Sanity Checker sources and other third-party projects.
- Updated application version to 1.1.
