# Effects Lab — PKB Relocation Domains / Array Transactions

This stage extends the v1.5 PKB research stack from standalone record relocation to confirmed contiguous arrays.

## Evidence gate

A relocation domain is built only from Structural Layout evidence that is already connected by CONFIRMED ownership or collection relationships. A domain is never auto-confirmed. Confirmation requires a validation note.

Array mutation is enabled only when the selected contiguous array has all of the following:

- a CONFIRMED relocation domain;
- a CONFIRMED array descriptor;
- a CONFIRMED compact header tying base pointer and count;
- CONFIRMED record descriptors for every member;
- a CONFIRMED array-base pointer interpretation;
- complete constant-stride membership;
- no conflicting or unconfirmed pointer interpretation touching the array records.

Pointer-table collections remain read-only in this stage.

## Shadow-copy transaction

Insert/duplicate and remove do not move the original array in place. The writer:

1. preserves the original PKB bytes;
2. appends an aligned replacement array at EOF;
3. copies each surviving stride byte-for-byte, including unknown regions;
4. updates the confirmed base pointer;
5. updates the confirmed count field;
6. rewrites confirmed external references to surviving members;
7. recomputes confirmed internal absolute/relative pointers in the copied strides; and
8. verifies that no existing byte outside explicitly authorized metadata/pointer fields changed.

The array stride is preserved. This stage does not synthesize a new stride or reinterpret unknown bytes.

## Operations

- `duplicate`: inserts a byte-for-byte copy of an existing member at an index, remapping confirmed internal/external references.
- `remove`: removes one member from the replacement array. The operation is rejected if the removed member still has a confirmed external incoming reference or if a surviving confirmed internal pointer would target the removed member.

The original array remains in the file as dead/copy-through data. Compaction is intentionally deferred.

## Not a complete PKB compiler

This feature does not yet support arbitrary pointer-table resizing, stride changes, relocation of unknown ownership graphs, compaction, or from-scratch PKB construction. Those operations remain blocked until their pointer/count ownership is confirmed.
