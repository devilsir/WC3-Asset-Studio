- v1.5: PKB Structured Decoder v3, same-size corpus field correlation, evidence registry integration, guarded confirmed-field scalar patching/patch plans, and full 1.5 application/installer metadata.
- v1.4: verified spatial Sanity repair with animation-invariance proof, Smart Auto Fix v4.1, standalone texture resolution, single-save/idempotency guards, Effects Lab reflow fixes, Effects Lab native project model, CFX interoperability adapter, pluggable external PKB backend, expanded MDL/SKIN4/model-pack/parser regression coverage, and 1.4 build metadata cleanup.
- v1.3: integrated Automatic Model Test suite for model/texture/geoset/animation/rig/PBR/outliner/camera/FX/CASC/save workflows with full Log reporting and safe state restoration.
# Changelog


## 1.5

- Added Multi-Array Transaction Domains for atomically shadow-copying connected confirmed arrays such as Renderer + Sampler + Curve while remapping confirmed cross-array pointers.
- Added staged `keep`, `duplicate`, `remove` and guarded `insert-native` operations with append-only base/count updates and preservation of unknown stride bytes.
- Added paired-clone pointer remapping so inserted related records in different arrays can continue pointing to each other after relocation.
- Added bounded Native Effects Project template synthesis: confirmed scalar fields may be written into a confirmed binary template while all undocumented bytes are inherited unchanged.
- Pointer-table resizing, stride synthesis, compaction and arbitrary native record construction remain blocked.
- Prepared the dedicated Effects Lab regression suite for **201 scenarios**.

- Added PKB Relocation Domains over confirmed Structural Layout evidence.
- Added shadow-copy contiguous-array transactions with guarded duplicate/insert-copy and remove operations.
- Array transactions preserve stride and unknown bytes, atomically rewrite confirmed base/count and absolute/relative pointer references, and retain the original source array.
- Unsafe removal, unconfirmed pointer interpretations, pointer-table resizing, stride changes and compaction remain blocked.
- Prepared the dedicated Effects Lab regression suite for 195 scenarios.

- Promoted the application, portable build, runtime identity and installer metadata to **v1.5.0**.
- Added PKB Structured Decoder v3 fixed-width scalar research for `u8`, `u16`, `u32`, `i32` and `f32`.
- Added same-size PKB pair/corpus correlation with changed-run analysis, stable-neighborhood scoring and semantic/xref anchors.
- Extended the Structure Registry with numeric-field candidates while preserving the rule that repeated evidence may become `probable` but is never auto-confirmed.
- Added guarded lossless scalar editing for manually confirmed fields and atomic non-overlapping patch plans.
- Added Effects Lab controls for pair correlation, numeric candidate inspection, confirmed-field patch preview and patched-PKB save.
- Preserved byte-identical no-op round trips and copy-through handling of all unknown/raw PKB regions.
- Expanded the dedicated Effects Lab regression suite to **173 scenarios** for the v1.5 research/writer workflow.
- Added `RELEASE_NOTES_v1.5.md` documenting capabilities and limits; v1.5 is not presented as a complete native PKB compiler.
- Added the **Controlled Field Lab** with Near-Twin Finder, known-value A→B experiments, anchor-relative context signatures and a semantic PKB field catalog.
- Added manual semantic-field confirmation with required validation notes; controlled matches never auto-confirm undocumented PKB fields.
- Expanded the dedicated Effects Lab regression suite to **173 scenarios**.

## 1.4

- Refactored Effects Lab around the native `wc3.effects.project` model with CFX as an interoperability adapter and pluggable PKB backends.
- Added `.wc3fx` native project open/save with preserved authoring metadata, curves and PKB research state.
- Added a clean-room, read-only PKB Inspector with hashes, entropy, strings, dependency discovery and heuristic chunk candidates.
- Added PKB binary Round-trip Analyzer and CASC dependency export helpers.
- Added selected Model Lab CORN/`ParticleEmitterPopcorn` inspection routing to local/CASC resources.
- Added Math / Path Baker for Motion, Init Shape, procedural Color and Render Shape plus an editable curve canvas.
- Added Lua effect-test harness generation; automatic `.w3x/.w3m` test-map generation is not yet implemented.
- Expanded the dedicated Effects Lab regression suite to 136 tests and build verification for Inspector/Baker/native project persistence.


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

### v1.5 — Structural Layout research
- Added Structural Layout / Record Descriptor Decoder with relative field layouts, type-layout hypotheses, semantic ownership, array base/count/stride evidence and compact header candidates.
- Added manually gated transactional shadow relocation for standalone confirmed records while preserving original records and unknown bytes.
- Expanded Effects Lab regression coverage for structural layouts and relocation safety.

### Native PKB Write Plan / Graph Bridge
- Added explicit Renderer -> Sampler -> Curve graph-chain planning.
- Added automatic confirmed-template selection using scalar coverage and confirmed cross-record pointers.
- Added a template-safe Native Project -> multi-array PKB write plan with paired Renderer/Sampler/Curve insertion.
- Added preview/save UI and `.wc3fx` persistence for native write plans/results.
- Unknown template bytes remain losslessly preserved; incomplete graphs and unconfirmed domains are blocked.

### v1.5 — Graph Subtree / Incremental PKB Compiler
- Added Emitter fan-out subtree planning and multi-record batch insertion.
- Added confirmed-template selection across Renderer/Sampler/Curve branches.
- Added incremental compiler state, Graph change detection, auto-plan, bindings and safe changed-subtree blocking.
