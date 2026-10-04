# Effects Lab — PKB research, native projects and curve baking

WC3 Asset Studio keeps its authoring state in the native `wc3.effects.project` schema. The optional `.wc3fx` file stores that native project as JSON, including authoring metadata, preserved CFX adapter data, baked curves and PKB inspection reports.

## PKB Inspector

The PKB Inspector is a clean-room, read-only binary research tool. It does **not** claim to fully parse the proprietary PopcornFX/Warcraft PKB format. It currently reports file size, FNV-1a hash, entropy, printable ASCII/UTF-16 strings, embedded Warcraft-style dependency paths, zero runs, byte histogram summaries and heuristic FourCC/length candidates. Heuristic chunk candidates are clearly marked and are never treated as writable structure.

The inspector can read a local PKB, read the PKB referenced by a selected Model Lab `ParticleEmitterPopcorn`/CORN node when that resource is available locally or through CASC, and prepare discovered dependencies for the existing CASC export workflow.


## Structured PKB Reader — lossless foundation

This revision adds the first **structured** reader layer on top of the original Inspector. It still does not claim to decode the proprietary PopcornFX bake format completely. Instead, it creates a 100%-coverage lossless segment map: heuristic candidate blocks are isolated when a plausible FourCC/size record is found, every gap remains an explicit raw span, and rebuilding from those spans must reproduce the source byte-for-byte.

The reader also records aligned 32-bit offset cross-references to interesting strings, conservative length-field candidates and semantic string evidence for `Game.*` attributes, `_pksi_*` simulation interfaces, renderer names and sampler/graph vocabulary. These are **research hints**, not promoted to decoded runtime records until validated across real Warcraft III PKBs.

`Verify lossless RT` runs an exact copy-through reconstruction and compares its hash/bytes with the source. The structured diff maps changed regions back to raw or candidate spans. A same-length patch primitive exists for controlled research experiments while guaranteeing that bytes outside the patch remain untouched.

The `.wc3fx` project persists the JSON-safe structure map and structured-diff metadata, but intentionally does not embed the full PKB source bytes. Re-open the original PKB before performing a new exact rebuild/patch operation.

Public research was cross-checked against the MIT-licensed W3ModelViewer project, which independently reports a Warcraft PopcornFX VM together with layer graph, spawners, event payloads, curves, shapes and spatial layers. WC3 Asset Studio does not treat those categories as decoded merely because a matching string is present; this stage remains evidence-first and copy-through-safe.

## Round-trip Analyzer

The Round-trip Analyzer compares two PKB binaries. It reports exact equality, hashes, size delta, first/last differing byte, changed-byte count, sampled similarity and dependency additions/removals. It is a binary comparison tool; it does not automatically prove semantic equivalence between two differently encoded PKBs.

## Math / Path Baker and Curve Editor

Effects Lab can bake supported Motion, Init Shape, procedural Color and Render Shape functions into sampled native curve channels. The baker supports configurable sample count and simplification tolerance. Bakes are stored in the native `.wc3fx` project and can be exported as JSON.

The curve canvas is editable: points in the selected reduced channel can be dragged while preserving endpoint/order constraints. These native curves are authoring data today. A future PKB backend or CFX translation layer may convert compatible curves into real Warcraft runtime structures.

## Model Lab CORN integration

When a Model Lab node of type `ParticleEmitterPopcorn` is selected, Effects Lab can inspect its referenced resource without requiring the model to be rewritten. Local resources are read directly; Warcraft virtual resources are resolved through the existing CASC bridge when possible.

## Test Lua

`Test Lua` writes a small Warcraft Lua harness that calls `AddSpecialEffect` with the inspected effect path. It is intentionally only a script harness. This version does **not** generate or patch a `.w3x/.w3m` test map automatically.

## Compatibility and current limits

Actual Warcraft output is still a valid `.pkb` produced by a configured PKB backend. The native project, `.wc3fx`, CFX adapter, Inspector and curve data are editor-side formats/tools and are not read directly by Warcraft III.

There is no native PKB writer in this revision. PKB generation/decompilation continues to use the pluggable external backend interface when a compatible backend is configured. The Inspector is deliberately read-only until enough format behavior has been independently validated for safe round-trip writing.

## Native Graph / Layers authoring foundation

The Graph tab now has a native node graph stored under the `.wc3fx` project extensions. It supports Layer, Spawn, Event, Renderer, Sampler, Math, Condition, Delay and Death Event nodes, native edges, drag positioning and automatic layout. Existing CFX graph information can seed this graph, but native node edits are **not yet a full node-to-CFX/PKB compiler**. The graph is an independent authoring foundation for that future compiler.

## CORN Manager and real model serialization

The CORN Manager edits actual Model Lab `ParticleEmitterPopcorn` nodes rather than storing editor-only shadow metadata. Create, update, duplicate, delete, select/focus and visibility operations update the active model. WC3 Asset Studio now serializes the Reforged CORN fixed fields (`LifeSpan`, `EmissionRate`, `Speed`, `Color`, `Alpha`, `ReplaceableId`, `Path`, `AnimVisibilityGuide`) and animation tracks (`KPPL`, `KPPE`, `KPPS`, `KPPC`, `KPPA`, `KPPV`) back to both MDX and MDL.

Visibility toggling is represented through the real `KPPV` track. MDL and MDX serializer/parser round-trip smoke tests are used during development to ensure the edited fields are readable again by the Studio parser.

## Warcraft preflight and performance profiler

The Warcraft Preflight panel is intentionally conservative. It combines CFX validation, renderer/resource checks, editor-native curve/math warnings and inspected dependency information. `WC3 PREFLIGHT OK` means the editor found no known problem; it is **not** a guarantee that an arbitrary backend output is accepted by every Warcraft build.

The preview profiler estimates live particles, spawn rate, renderer groups, decoded texture memory and approximate overdraw against four authoring budgets: Low, Medium, High and Boss. These are Studio authoring budgets, not Blizzard performance specifications.

## Warcraft Runtime Inputs preview

The Designer can simulate a focused set of `Game.*`-style inputs: TeamColor, ColorMultiplier, Scale, SpeedMultiplier, EmissionRateMultiplier, LifespanMultiplier and TargetPosition. They affect the Studio live preview and persist in `.wc3fx`. Their preview semantics are approximations for authoring and should be validated against a real Warcraft effect when exact parity matters.

## Atlas Editor

The Renderers tab includes a basic atlas editor with subdivision, frame count, FPS, playback mode (loop, ping-pong, random, once), padding and animated frame preview. Atlas subdivision is written through the existing renderer CFX adapter. FPS/playback/padding are currently native `.wc3fx` authoring settings until a selected PKB backend explicitly translates them.

## Dependency Packager

The Inspector can request export of discovered dependencies through the existing CASC exporter and write a `wc3.effects.dependencies` JSON manifest containing the source effect, referenced assets and the most recent preflight report. This is a packaging step, **not yet direct `.w3x/.w3m` injection**.

## Cookbook, component presets and IDE navigation

Effects Lab now includes an English Effect Cookbook covering fire, smoke, aura, lightning, portal, blood, trail, explosion, snow, rain, magic circle, weapon glow and boss aura foundations, plus smaller reusable color/motion/spawn/shape/renderer presets.

The CFX code view also adds reference search, symbol rename and Ctrl+Click declaration navigation. Full language-server features such as semantic autocomplete, folding, minimap and structural quick-fixes remain future work.

## Plugin SDK foundation

`WC3_EFFECTS_PLUGIN_SDK` is an in-process registry for importer, exporter, validator, preset, backend and panel plugins. It provides a stable extension boundary without dynamically loading arbitrary executable code. External PKB tooling remains behind the separate PKB backend interface and retains its own licensing/provenance.

## Still planned

The following roadmap items are deliberately not claimed as complete in this revision: full semantic decoding of PKB layer/renderer/sampler/curve/VM records, a native PKB writer/compiler, automatic node-graph compilation, WebGL replacement of the Canvas preview, a full mesh-sampler editor, direct `.w3m/.w3x` injection, and automatic test-map generation. The current structured reader is a lossless research foundation, not the final semantic decoder. Those should build on the Inspector, Round-trip Analyzer, native graph, curve baker and backend abstraction rather than bypassing them.
