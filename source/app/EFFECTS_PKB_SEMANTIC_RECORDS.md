# PKB Semantic Record Decoder v1

WC3 Asset Studio v1.5 groups **confirmed scalar fields** from the Controlled Field Lab into larger research records such as Emitter, Renderer, Sampler and Curve.

## Safety model

- A scalar field enters the decoder only when its semantic field-catalog status is `confirmed`.
- Record grouping starts as `probable` unless the record boundary/grouping is manually validated.
- Promoting a record to `confirmed` requires a validation note.
- Unknown bytes between confirmed fields remain raw copy-through data and are never interpreted automatically.
- Record writes use the Structured Reader patch-plan API. Only fixed-width confirmed fields are changed; overlapping operations, hash mismatches and unexpected source values are rejected.

## Classification

The decoder first looks for nearby structured anchors already exposed by the lossless reader. Renderer names such as Billboard/Ribbon/Mesh/Light favor Renderer records; Curve favors Curve; other sampler hints favor Sampler; layer/spawn/emitter/event hints favor Emitter. A semantic-property fallback is used only when no useful anchor exists, and that grouping remains evidence rather than proof.

## Current scope

This is not a complete native PKB compiler. It is an incremental, lossless editor for records whose member fields have already been validated. The goal is to grow the confirmed record map without reinterpreting undocumented bytes.
