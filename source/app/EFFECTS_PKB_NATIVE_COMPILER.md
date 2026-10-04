# Native PKB Compiler

The Native PKB Compiler is the write-side companion to the Native PKB Decoder.

Its first safety rule is lossless re-emission: a decoded bake with no semantic edits must serialize byte-for-byte identically. The serializer rebuilds the Popcorn bake header, class table, variable-sized records, one-byte-length string table, and 1-based record references without changing unknown record bodies.

The VM assembler writes all twelve instruction shapes exposed by the decoder: Load, Store, CastA, CastB, Vector, Swizzle, Binary, Unary, Binary2, Ternary, Select, and Call. Existing `CCompilerBlobCache` headers and unknown words are preserved while constant and code section lengths are recomputed. The constant pool keeps the 32-byte eight-wide SIMD broadcast layout used by Warcraft effect bakes.

The current semantic compiler writes decoded VM blobs, Curve sampler dimensions/times/values/tangents, existing Shape fields, renderer material paths, and renderer properties explicitly marked as edited. Unknown fields are copied through unchanged. Fields absent because they are at defaults are not materialized unless the compiler has a known encoding and a non-default semantic value requires them.

`Compile + verify` decodes the generated binary again and requires structural semantic parity before the compiled result can be saved. A no-edit compile is expected to report `Byte-identical: YES`.

The constant editor is deliberately narrow. It edits one existing VM constant and recompiles the selected script without inventing external slots, function definitions, classes, or graph records. Creating new scripts and compiling higher-level CFX expressions into fresh VM register allocation remains a later compiler stage.

The native container/VM understanding is based on the MIT-licensed W3ModelViewer decoder by Darithos. The compiler and serializer in WC3 Asset Studio are new implementation work; no PopcornFX or CornSyrup compiler binary is embedded by this module.
