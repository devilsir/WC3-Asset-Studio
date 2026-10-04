# PKB Multi-Array Transactions and Native Template Synthesis

WC3 Asset Studio v1.5 extends the append-only PKB research writer with transactions that can shadow-copy several confirmed contiguous arrays together. The goal is to preserve cross-array relationships while keeping every pre-existing byte outside explicitly confirmed metadata writes untouched.

## Multi-array transaction domains

A multi-array domain is built only from arrays already covered by a confirmed Relocation Domain. A domain needs at least two contiguous arrays and tracks their confirmed record descriptors, compact headers, ownership evidence, cross-array pointer links, external incoming links and external outgoing links.

Repeated or internally consistent evidence can make a domain `probable`. It never becomes `confirmed` automatically. Manual confirmation requires a validation note.

## Transaction model

A transaction shadow-copies every participating array, including arrays whose staged operation is `keep`. This is intentional: when Renderer, Sampler and Curve arrays refer to each other, rebuilding them together gives the writer one coherent old-to-new address map.

Supported staged operations are:

- `keep`: copy the array unchanged into the new transaction domain.
- `duplicate`: insert a byte-for-byte copy of an existing confirmed template member.
- `remove`: remove a member only when no confirmed surviving/external relationship would be left dangling.
- `insert-native`: clone a confirmed template stride and patch only confirmed scalar fields from a Native Effects Project object.

The original arrays remain in place. New arrays are appended with the requested alignment. Confirmed base pointers and count fields are updated atomically. Unknown bytes inside every stride are copied verbatim.

## Cross-array pointer remapping

Confirmed absolute and relative pointers are rewritten after all new array bases are known. Surviving records map to their corresponding relocated records. When paired template records are inserted in multiple arrays in the same transaction, confirmed links between those templates can map to the paired inserted clones instead of the surviving originals.

Any ambiguous confirmed interpretation, unsupported pointer kind, missing structural confirmation or unsafe removal blocks the transaction.

## Native template synthesis

`insert-native` is deliberately not a free-form PKB record compiler. It uses an existing confirmed record as a binary template and patches only scalar fields whose offsets, widths, types and semantic mappings are already confirmed.

Current bounded semantic extraction includes selected authoring values for Renderer and Emitter records, such as alpha/color and common scalar emitter properties when matching confirmed fields are available. Every unknown field, padding byte and unsupported value is inherited from the template byte-for-byte.

Pointer fields are not synthesized as arbitrary values. They remain under the structural pointer rewrite phase of the transaction planner.

## Safety limits

This feature does **not** claim to be a complete native PKB compiler. In v1.5:

- pointer-table layouts remain read-only;
- stride changes are not generated;
- old shadowed blocks are not compacted away;
- unknown/unconfirmed pointer interpretations block structural writes;
- native synthesis cannot invent an undocumented field or record layout;
- all structural confirmations require explicit validation evidence.

These limits are intentional so that the research writer can progress toward a native PKB backend without silently corrupting unknown runtime data.
