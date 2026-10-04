# Native Popcorn Decoder

WC3 Asset Studio includes a read-only PopcornFX bake decoder in `js/effects-pkb-native-popcorn.js`.

The container, field-schema, compiled-script, layer, sampler, renderer, event, and graph decoding logic is adapted from W3ModelViewer 1.11.0 by Darithos under the MIT License. The original implementation is in `Wc3ModelViewer.Core/Formats/Popcorn/PkBakeFile.cs`, `PkScript.cs`, and `PkEffectDef.cs`.

The decoder recognizes the `0xCA000B11` PopcornFX bake container used by Warcraft III effects. It reads the class table, object records, string table, one-based object references, known field encodings, Curve/Shape/EventStream/Turbulence samplers, renderer materials and inputs, layer graph/event slots, and `CCompilerBlobCache` VM instructions.

The WC3 Asset Studio port adds a conservative unordered-field fallback after the original ascending-field walker. This exists because a CornSyrup-generated sample supplied during development contained valid records whose field identifiers were serialized out of ascending order. Known field encodings and exact record-length closure are still required; no semantic field is promoted from this fallback by offset guessing.

This decoder is read-only. The existing safe writer, structural transaction tools, and Bake Oracle remain separate. A future native compiler should consume a semantic IR and emit `CCompilerBlobCache` plus typed records rather than writing guessed offsets.
