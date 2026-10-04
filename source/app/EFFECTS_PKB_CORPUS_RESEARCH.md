# Effects Lab — PKB Corpus / Structured Decoder v2

This module is a clean-room research layer for Warcraft III Reforged PopcornFX `.pkb` / `.particles` files. It does not claim undocumented binary layouts as established facts.

## Evidence levels

- `heuristic`: observed in one file or inferred from strings/offset patterns.
- `probable`: repeated evidence across multiple files in the active corpus. This status is assigned automatically only when the same evidence occurs in at least two files and covers at least 35% of the corpus.
- `confirmed`: never assigned automatically. A user/researcher must explicitly promote a registry entry and provide a validation note describing external/runtime evidence.

The registry status is research metadata. It is not a Blizzard specification.

## Corpus sources

The scanner accepts:

- up to 256 explicitly selected local PKB files, with a 512 MB aggregate safety cap;
- Warcraft CASC/CDN results, searched as `effects` and filtered to `.pkb` / `.particles`, read in batches through the existing safe CASC bridge.

CASC scans page search results so a broad query can discover PKBs even when models appear earlier in the result list.

## What is compared

Each file gets a semantic fingerprint composed of:

- `Game.*` attribute string evidence;
- PopcornFX/Warcraft simulation-interface strings (`_pksi_*`);
- renderer and sampler type string evidence;
- candidate FourCC/block tags from the lossless reader;
- segment-size buckets;
- length-field candidate buckets;
- aligned offset xref targets;
- dependency extension patterns.

Structured Diff v2 compares these fingerprints rather than pretending that raw byte offsets are stable between unrelated effects.

## Lossless editing gate

The Structured Reader v2 can perform a same-length string patch while preserving every byte outside the selected record. By default, this API requires the record to have `confirmed` registry evidence. This is an incremental writer foundation, not a general-purpose PKB compiler.

Unknown regions remain copy-through data. Size-changing edits, relocation-table updates, new records, graph rewrites, bytecode generation, and native curve serialization remain out of scope until their binary structures are validated.
