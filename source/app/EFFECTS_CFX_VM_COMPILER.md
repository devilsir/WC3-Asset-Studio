# Native CFX → PopcornFX VM Compiler

This module is the text-to-bytecode stage between editable CFX layer programs and Warcraft III's native `CCompilerBlobCache` records.

## Current pipeline

`CFX init/evolve source → lexer/parser → typed AST → native symbol resolution → register/constant allocation → PopcornFX VM instructions → CCompilerBlobCache → native PKB serializer → native decoder verification`

The compiler is conservative. It only links external fields and callable functions for which the currently opened bake already contains a native definition/prototype. Missing symbols are rejected rather than guessed.

## Supported source forms

- `init { ... }`, `evolve { ... }`, and `program { ... }`
- `needs { "Name" : Type; }`
- `let name : Type = expression;`
- stores to external fields
- numeric and boolean literals
- typed vector literals such as `#f32x3(1, 0, 0)`
- arithmetic and comparison operators
- scalar-to-vector broadcast
- swizzle reads
- numeric casts and bit casts
- `select`, `lerp`, `sqrt`, `rsqrt`, `exp`, `rcp`, `abs`, `sign`, `frac`, `saturate`, `normalize`, `any`, `nonzero`, `pow`, `min`, `max`, `dot`, and `cross`
- native free calls whose prototype exists in the bake
- native method calls on sampler/event externals whose prototype exists in the bake
- automatic reinsertion of native implicit contexts such as `ParticleContextI`, `ParticleContextS`, and `RandContext` when a proven call prototype requires them

## Native safety rules

- Unknown externals are blocked.
- Unknown call prototypes are blocked.
- Function overloads are selected by native argument kinds, not by name alone.
- Operators whose native opcode has not been confirmed are blocked.
- The output bake is decoded again after serialization.
- Save/adopt is enabled only when the native graph/container signature remains valid and the decoder reports no structural failure.

## Current boundary

This stage recompiles an existing `CCompilerBlobCache` record and can relink it to existing native external/function definition records found elsewhere in the same bake. It does not yet synthesize an entirely new layer, event graph, external-definition class, or function-definition class when no native prototype exists. Template/library expansion (`extends`, `using`, stdlib macros) is also not yet part of this stage.

Those remaining pieces are the next steps toward a complete native equivalent of the CornSyrup build path.

## Native blob header register counts

Controlled correlation against the real CornSyrup `simple_effect_2.pkb` confirms that the final three 32-bit words in the 36-byte `CCompilerBlobCache` VM header are the Reg1, Reg2, and Reg3 slot counts. The compiler recomputes these values from the generated program on every assembly instead of inheriting counts from the template script.

## Verification gate

A source compile is saveable only when the rebuilt PKB preserves the native structural signature and decodes back with zero field-walk failures and zero decoder warnings. Unknown external or function prototypes remain compile errors rather than guessed definitions.

## Standalone bundle compiler

The template-backed VM compiler described above is preserved for round-trip editing. Effects Lab also includes `effects-cfx-bundle-compiler.js`, a separate clean-slate pipeline that consumes all five CFX bundle files and synthesizes a new PKB without reading or cloning a source bake. See `EFFECTS_CFX_FULL_BUNDLE_COMPILER.md`.
