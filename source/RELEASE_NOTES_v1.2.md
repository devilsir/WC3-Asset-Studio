# WC3 Asset Studio v1.2

## Simple Action Editor

Version 1.2 adds a lightweight animation workflow for editing Warcraft III MDX/MDL models without requiring a full keyframe editor.

- Duplicate an existing action/sequence, for example **Stand → Stand Swim**.
- The duplicate keeps the source action's animated movement and keys.
- Rename actions directly in Model Lab.
- Apply root position, rotation and scale offsets to only the selected action.
- Save the resulting sequence and animation tracks back to MDX or MDL.
- Undo/redo animation duplication, renaming and transforms as part of the unified 75-step history.

This workflow is intended for simple variants such as swim/alternate stands, repositioned actions, scaled variants and other edits that should retain the original motion.

## Windows file types and history

- WC3 Asset Studio now registers BLP, TGA, MDL and MDX as supported Windows file types.
- The **More → Default File Types** command registers/repairs the current executable and opens Windows Default Apps so the user can choose WC3 Asset Studio, similar to choosing a default browser.
- Double-click/open-with launches the file directly in Texture Paint or Model Lab.
- Undo/Redo history is now capped at **75 states** in both Texture Paint and the unified Model Lab history.
