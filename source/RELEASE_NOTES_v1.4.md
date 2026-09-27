# WC3 Asset Studio v1.4

## Sanity Smart Auto Fix v4.1
- Safe mode keeps risky animation/rig repairs behind an explicit conservative option.
- Buried rest-pose/root-lift models can be normalized automatically only when the spatial proof confirms a single compatible root and animation-preserving compensation.
- Geometry and pivots are shifted once while the matching root translation is compensated; the repair is rejected when the invariance proof does not pass.
- Standalone MDX/MDL checks resolve nearby textures through the same local-texture lookup used by Model Lab.
- Sanity results include severity sub-tabs, a dedicated scrollable results area and detailed FIX/SKIP audit logs.
- Auto Fix uses one native save dialog, blocks re-entrant saves and is tested for no-op/idempotent behavior.

## Effects Lab
- Motion preview reflows after workspace changes, panel resizes and different device-pixel ratios.
- The packaged backend is exposed as **Effects Runtime** through the app and build configuration.
- Legacy Effects Runtime path injection was removed; the runtime resolves `./cfxlib` from its packaged working directory.

## Automatic tests
- The Model Lab aggregate suite covers parser/serializer, MDX/MDL, synthetic model-pack and SKIN4 fixtures, texture resolution, Sanity Auto Fix, spatial animation invariance, save guards, corrupted-input handling, Effects Lab and workspace regressions.
- Coverage audit detects both declared-but-unrun and run-but-undeclared tests.
- Effects Lab has its own dedicated regression suite including a live read-only runtime probe.

## Version
- Product/UI/build version: **1.4.0**.
