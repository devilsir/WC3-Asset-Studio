# Effects Lab backend and license audit

## Architecture after the native-project refactor

WC3 Asset Studio's Effects Lab owns its editor UI, native project model, EPF support, preview, mathematical authoring, validation, examples and Learn workflow. CFX is treated as an interoperability adapter. PKB compilation/decompilation is delegated through a pluggable backend interface.

The packaged application intentionally does **not** include an Effects PKB compiler/decompiler, `cfxlib`, or the legacy Effect Designer binary. Users may point Effects Lab to an external CFX/PKB command-line tool when PKB import/build is required. The editor, CFX import/export, EPF workflow and preview remain available without a PKB backend.

## Local files found during the audit

The source/development tree that was reviewed contained the following pre-existing files:

- `tools/effects-lab/effects-runtime.exe`
- `tools/effects-lab/cfxlib/`
- `tools/effects-lab/effect-designer/Effect Designer.exe` and support files

These files are **not covered by the WC3 Asset Studio MIT license merely because they are located in the same folder**.

### `effects-runtime.exe`

Static string inspection identifies the executable as `effectsrt` and includes a build path containing `C:\Projects\BlizzPartRE\effectsrt`. It implements a CFX/PKB build/decompile contract. No license grant or reliable copyright/provenance notice was found inside the local binary during this audit.

Status: **provenance/license unverified — excluded from packaged builds**.

Development behavior: a source checkout may still detect this local executable as a development-only backend so existing developer workflows do not break. It is explicitly labeled unverified and is never copied into release resources by `package.json`.

### `cfxlib/`

The local text library contains CFX helper modules and comments that reference `Mill`, `CFX_GUIDE`, Warcraft PKB reconstruction and a CFX authoring workflow. No license header granting redistribution rights was found in the inspected module headers.

Status: **provenance/license unverified — excluded from packaged builds**.

### Legacy `Effect Designer.exe`

No license grant was established from the local files during this audit.

Status: **provenance/license unverified — excluded from packaged builds**. Effects Lab's own EPF editor remains integrated and does not require this executable.

## External CornSyrup compatibility

Effects Lab may be configured to call a user-provided CFX/PKB CLI. This is intentionally an external-process boundary: WC3 Asset Studio does not copy the external program into its package, does not claim that program under the WC3 Asset Studio MIT license, and communicates through files/command-line arguments.

The backend adapter supports the `decompile <input.pkb> <output.cfxb>` / `build <input.cfxb> <output.pkb>` contract used by the current development backend, and includes a CornSyrup compatibility fallback for direct input/output conversion. Backend behavior remains the responsibility of the selected external tool.

## Clean source releases

Before publishing the WC3 Asset Studio source tree itself, remove or separately license any unverified third-party files. `REMOVE_UNVERIFIED_EFFECTS_TOOLS.ps1` is provided at the source root as an explicit cleanup helper. Release packaging already excludes them.

This document is an engineering audit, not legal advice.
