# PKB Record Hierarchy / Pointer & Array Decoder v1

WC3 Asset Studio v1.5 extends the Semantic Record Decoder by looking for structural relationships **between** already-decoded records.

## What it detects

- aligned absolute `u32` values that land on a semantic record range;
- aligned relative `i32` offsets whose target lands on a semantic record range;
- constant-stride runs of same-type records as record-array candidates;
- consecutive aligned pointers to same-type records as pointer-table candidates;
- small `u32` values near an array/table pointer that equal the candidate item count;
- a read-only parent/child tree derived from probable or confirmed pointer links.

## Evidence policy

The decoder never promotes structural layout to `confirmed` by itself.

- `heuristic`: a pointer/array/count pattern was observed;
- `probable`: stronger evidence, such as an exact record-start target or three confirmed records with constant stride;
- `confirmed`: manual validation with an explicit note.

A confirmed semantic field or record does **not** automatically confirm a pointer, array boundary, pointer table, or count field.

## Writer policy

Hierarchy v1 is intentionally read-only. The existing scalar/record writer can still edit confirmed fixed-width fields, but this decoder does not relocate records, rewrite pointers, resize arrays, insert/remove records, or modify count fields.

Unknown bytes continue to be copied through byte-for-byte. Structural writes will only be introduced after pointer/count/array layouts have independent evidence and safe relocation rules.
