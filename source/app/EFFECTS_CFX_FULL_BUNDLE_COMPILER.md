# CFX Bundle → PKB Full Build

The Effects Lab now has two native CFX compilation paths.

## Template-backed VM / round-trip path

The existing CFX VM Compiler remains available for surgical edits of an already decoded Warcraft III PopcornFX bake. It reuses the source bake topology and is the preferred path when exact preservation of unknown records matters.

## Standalone Full Build path

`effects-cfx-bundle-compiler.js` builds a new PKB from the five CFX bundle files only:

- `effect.cfx`
- `code.cfx`
- `samplers.cfx`
- `renderers.cfx`
- `events.cfx`

No PKB template is read or cloned by this path.

Pipeline:

`CFX bundle → using/template preprocessing → parsed bundle/AST → symbol registry → VM lowering → definition synthesis → layer/sampler/renderer/event synthesis → graph synthesis → clean PKB serialization → native decoder verification`

### Implemented standalone synthesis

- Warcraft PopcornFX container/class/string/record construction from an empty bake.
- `CCompilerBlobCacheExternal`, function definitions and function arguments generated when required by compiled code.
- Script blobs assembled with fresh external/function reference tables.
- Layer fields, constants, samplers, renderers, events and scripts.
- Graph layer slots, event slots, entries, spawn roots and `CParticleEffect` root.
- Curve, Shape, Turbulence and EventStream sampler-data records.
- Renderer properties and particle-input bindings.
- File-level `using "library";` expansion when a library map is supplied.
- `template layer|renderer|sampler|event` declarations.
- `extends Template(args)` and declaration-level `using Template(args)` expansion with defaults and `$name` / `{{name}}` substitution.
- Static Warcraft/Popcorn runtime symbol registry for standalone VM compilation instead of learning every symbol from a source bake.

### Verification gate

Every Full Build is decoded again with `effects-pkb-native-popcorn.js`. The UI only enables **Use built PKB** and **Save PKB** when the generated container completes the native field walk with zero decoder warnings.

This verifies the internal PKB structure understood by the Asset Studio decoder. It does **not** by itself prove byte-for-byte CornSyrup equivalence or runtime compatibility for every PopcornFX feature in Warcraft III. Corpus comparison and in-game validation remain separate compatibility gates, especially for undocumented engine functions/material features.

### Acceptance target

The standalone compiler is intentionally architected around this invariant:

`folder/bundle.cfxb → Build bundle → PKB`

A `.pkb` input is not part of that operation.
