# WC3 Asset Studio v1.3

## Workflow upgrade

- Added a visual animation timeline with editable KGTR/KGRT/KGSC keyframes, interpolation, copy/paste pose, reverse track and action retiming.
- Added rig editing for Bone/Helper name, parent, pivot and inheritance flags, plus safe Bone/Helper creation and Helper deletion.
- Added Reforged MDX SKIN4 weight normalization while preserving BONE chunk order.
- Added a Scene Outliner for geosets, rig nodes, materials, cameras and FX.
- Added a Material / PBR editor for filter mode, alpha, flags, shader and Reforged texture slots (Diffuse, Normal, ORM, Emissive, Team Color and Reflections).
- Added a Warcraft Asset Browser backed by the Warcraft III TACT/CDN root index, including texture/model/effect/sound filtering.
- Added Camera and ParticleEmitter2 property editors.
- Added model comparison and partial animation import by matching node name/type.
- Added geometry utility actions (mirror, normals, center) and Model Lab keyboard shortcuts.
- Added model analysis / safe trailing texture cleanup.
- Model edit undo snapshots now also preserve texture-definition state and Reforged SKIN weights.
- Extended MDX/MDL save support for edited rig tracks, materials, cameras and ParticleEmitter2 tracks.

## Compatibility and safety

- Existing BONE order is never destructively reordered when editing Reforged models.
- Existing unknown MDX chunks continue to be preserved.
- MDL SKIN weight rewriting is intentionally not performed; SKIN normalization is enabled for MDX/Reforged models only.
- The CASC asset browser uses Blizzard CDN fallback when the local CascLib backend is unavailable.

## Automatic Model Test
- Added a safe end-to-end **Automatic Model Test** runner for MDX, MDL and ZIP fixtures.
- The suite exercises Texture Paint, Undo/Redo, texture path editing/rename, geoset selection/visibility/clone/transforms, v1.3 geometry utilities, action duplication/rename, Timeline keyframes, Rig/SKIN4, Material/PBR, Scene Outliner, Camera/ParticleEmitter2 editing, workspace `.wc3asset` generation, model serializer round-trip, CASC/CDN status, Asset Browser bridge and preferences.
- Every step is written to the runtime Log as **START / PASS / FAIL / SKIP** with timing and diagnostic details.
- Destructive checks run against a temporary workspace snapshot and the original model/texture/history/viewport state is restored after the suite or cancellation.
- Added **Run Auto Test**, **Test Model / ZIP…**, **Open Log** and **Stop** controls to Model Lab.

## 2026-09-20 · Texture Paint layout + full automatic coverage pass
- Fixed the Texture Paint drop hint so its text is never hidden behind or clipped by the canvas. The stage now uses a fixed overlay header plus a dedicated inner scroll viewport, so Fit, auto-fit and manual pan/zoom cannot scroll the hint out of view.
- Auto Test now contains 51 runtime checks across Texture Paint, model viewport, geosets, animation/timeline, rig/SKIN, materials/PBR, outliner, cameras, ParticleEmitter2, Sanity, WC3 Buttons, save/export, compare/import, recovery, preferences, CASC bridges and history.
- ZIP fixtures are no longer reduced to their first model: every MDX/MDL in the package is parser/serializer round-trip tested and logged. The richest model is selected for the interactive portion of the suite.
- Added a final feature-coverage audit so a declared user-facing feature family cannot silently disappear from the suite.
- Fixed the false-negative Load to Paint test by synchronizing against the `wc3-texture-paint-ready` event and validating the loaded slot/dimensions after completion.
- Fixed Batch Analyzer MDL decoding (TextDecoder path) and exposed safe dry-run hooks used by the expanded suite.


## CASC / TACT reliability fix
- Blizzard TACT/CDN is now the safe primary asset backend; native CascLib is an offline/local fallback instead of the first probe.
- Reads the active Warcraft III `.build.info` and local `Data/config` entries so CDN resolution matches the installed game build.
- Remembers native fail-fast crashes per Warcraft build and does not repeatedly trigger `0xC0000409` on the same build.
- Fixed the native reader payload bug (`extra` was undefined) and the CDN Asset Browser payload forwarding bug (`search` was not reaching the helper).
- Keeps CASC asset search, model/effect reads and legacy BLP/TGA -> DDS aliases on the same resolver path.
