# PKB Structural Layout Decoder (v1.5 research)

The Structural Layout Decoder is the next research layer after the lossless reader, corpus scanner, controlled-field experiments, Semantic Record Decoder, and Record Hierarchy Decoder.

Its job is to turn isolated confirmed fields and record relationships into explicit layout hypotheses without pretending that an undocumented PKB structure is already known.

## Evidence model

All structural evidence uses the same conservative states as the rest of the Effects Lab research stack:

- `heuristic` — a plausible pattern was observed.
- `probable` — repeated/strong evidence supports the hypothesis.
- `confirmed` — a human explicitly promoted the evidence with a validation note.

No record descriptor, type layout, ownership edge, array layout, pointer table, count field, or header candidate becomes `confirmed` automatically.

## Record descriptors

For every semantic record, the decoder builds a descriptor containing:

- absolute record start/end and byte size;
- confirmed field offsets converted to offsets relative to the record start;
- field binary types and widths;
- unknown byte count/gaps that must remain copy-through;
- incoming and outgoing pointer evidence from the Record Hierarchy layer.

This allows the research UI to describe a layout such as:

```
Emitter @ 0x0020 size 0x10
  +0x00 Size             f32
  +0x04 Renderer pointer i32 relative
  +0x08 .. +0x0F         UNKNOWN
```

Unknown bytes are deliberately not regenerated or normalized.

## Type layouts

When several records of the same semantic type have compatible relative field locations, a type-layout candidate is produced. A repeated pattern may become `probable`, but manual evidence is still required before it is treated as confirmed structural knowledge.

Type-layout evidence is intended to eventually support reusable definitions such as Emitter, Renderer, Sampler, Curve, Event, and Layer layouts.

## Ownership hierarchy

Confirmed/probable pointer links are interpreted as ownership candidates only for supported semantic chains, for example:

- Emitter → Renderer
- Emitter → Sampler
- Emitter → Curve
- Renderer → Sampler
- Renderer → Curve
- Sampler → Curve

The resulting hierarchy paths are research evidence, not an assertion that every pointer represents ownership in the PopcornFX runtime.

## Arrays, pointer tables, count and stride

The decoder combines Record Hierarchy evidence into array descriptors that can retain:

- base record offset;
- base-pointer field offset;
- item count;
- count-field offset;
- stride for inline record arrays;
- member record IDs;
- pointer-table offsets for pointer arrays.

When a nearby pointer and count candidate form a compact pair, a header candidate is emitted. Even a perfect `pointer + count` pair remains `probable` until explicitly validated.

## Transactional shadow relocation

v1.5 includes an intentionally narrow experimental relocation primitive. It is **not** a general PKB writer.

A standalone record can be relocated only when:

1. the record descriptor is manually `confirmed`;
2. the record is not part of a detected inline array or pointer table;
3. every pointer field that must be interpreted for the transaction has one unambiguous confirmed interpretation;
4. the source PKB bytes still match the evidence used to build the plan.

The relocation strategy is shadow-copy based:

- the original record remains in place;
- an aligned copy is appended at end-of-file;
- confirmed incoming pointers are redirected to the appended copy;
- confirmed relative outgoing pointers inside the copied record are recalculated from the new source location;
- absolute outgoing pointers preserve their original target;
- bytes outside confirmed incoming pointer fields in the original source area must remain unchanged.

This avoids moving following data and therefore avoids a large class of unknown-pointer breakage while research is incomplete.

## Deliberate limitations

The v1.5 structural layout stage does **not** perform:

- arbitrary record insertion/removal;
- compaction;
- inline-array growth/shrink;
- pointer-table resize;
- count rewrite caused by resizing a collection;
- general relocation of unknown blocks;
- creation of an effect from an empty PKB;
- a complete native PKB compiler.

Those operations require stronger knowledge of pointer ownership, relocation domains, count/base/stride layouts, and any additional references not yet decoded.

## Research progression

The intended progression remains:

`lossless bytes → semantic hints → controlled fields → semantic records → record hierarchy → structural layouts → validated relocation domains → transactional structural writer → native PKB writer`

At every stage, unknown bytes stay preserved unless there is explicit evidence that they can be safely regenerated.
