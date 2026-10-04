# Effects Lab — Graph Subtree Writer and Incremental PKB Compiler

WC3 Asset Studio v1.5 extends the confirmed-template PKB writer from one `Renderer → Sampler → Curve` chain to an entire confirmed Graph subtree.

## Graph subtree

A complete subtree may have an `Emitter` (or authoring root) with more than one Renderer branch, for example:

- `Emitter → Renderer A → Sampler A → Curve A`
- `Emitter → Renderer B → Sampler B → Curve B`

All participating records are staged in one multi-array shadow transaction. The planner calculates every inserted record address before rewriting confirmed pointers, so a newly inserted Renderer can point to its newly inserted Sampler and each Sampler to its newly inserted Curve. A confirmed Emitter template can likewise bind several outgoing Renderer links to the new branches.

## Template safety

The writer is still template-based. Unknown bytes are copied from confirmed templates. Only confirmed scalar fields and confirmed pointer locations can be changed. Template selection follows confirmed PKB links instead of assuming matching array indexes.

A write plan is blocked when the subtree is incomplete, a required array/layout/domain is not confirmed, a pointer binding is ambiguous, or a native field overlaps a confirmed pointer.

## Incremental compiler v1

The incremental compiler records which Native Graph nodes were compiled and the exact inserted PKB record offsets/array indexes that back them. It classifies Graph subtrees as:

- `NEW` — complete and not yet compiled; can be planned/compiled.
- `BOUND` — already compiled and unchanged.
- `CHANGED` — previously compiled but Graph signature changed.
- `INCOMPLETE` — missing required Renderer/Sampler/Curve structure.

When Graph editing changes a complete NEW subtree, Effects Lab can automatically prepare a pending compile plan when Auto-plan is enabled. It never silently saves or overwrites a PKB.

## Current limitation

Incremental compiler v1 safely compiles **NEW** complete subtrees. A `CHANGED` already-bound subtree is detected but replacement is deliberately blocked. Replacing/removing previously compiled records requires a proven transaction that can remove or supersede the old bound subtree without leaving unknown references dangling.

This is therefore an incremental native writer built on confirmed PKB layouts, not yet a from-scratch PKB compiler.
