# Native PKB Write Plan — v1.5 research milestone

The Native PKB Write Plan connects the WC3 Asset Studio Native Effects Project / Node Graph to the confirmed PKB structural research pipeline.

## Required chain

A writable plan requires an explicit Native Graph chain:

`Renderer -> Sampler -> Curve`

The planner does not infer missing semantic edges. Incomplete chains are blocked.

## Required PKB evidence

A plan also requires a CONFIRMED multi-array domain containing contiguous `Renderer`, `Sampler`, and `Curve` arrays. Record descriptors, headers, base/count fields, and pointer interpretations used by the transaction must already be confirmed by the earlier research stages.

## Template selection

The planner scores existing confirmed Renderer records as template roots. It prefers roots with:

- confirmed scalar-field coverage for values present in the Native Project;
- a confirmed pointer to a Sampler template;
- a confirmed pointer from that Sampler to a Curve template.

When a confirmed relationship exists, the linked record index is selected rather than simply assuming matching array indices.

## Write strategy

For each node in the Graph chain the writer:

1. copies the selected confirmed template stride;
2. patches only confirmed scalar fields that have a Native Project value;
3. preserves all unknown bytes from the template;
4. stages the Renderer, Sampler, and Curve as paired `insert-native` operations;
5. delegates the binary transaction to the Multi-Array Transaction writer;
6. remaps confirmed pointers so the inserted Renderer points to the inserted Sampler and the inserted Sampler points to the inserted Curve.

Existing PKB blocks remain in place. New arrays are append-only shadow copies, and only confirmed metadata/pointer fields in the original binary are rewritten.

## Safety gates

The write plan is rejected when:

- the graph chain is incomplete;
- the selected multi-array domain is not CONFIRMED;
- one of the three required confirmed arrays is missing;
- a required template record is not confirmed;
- the underlying Multi-Array Transaction eligibility checks fail;
- a scalar Native write would overlap a confirmed pointer field.

## Current limitation

This is an incremental native writer, not a clean-slate PKB compiler. Unknown record bytes still come from confirmed templates. A future milestone can replace individual template regions only after their binary layout is fully documented.
