# WC3 Asset Studio

**WC3 Asset Studio** is an all-in-one visual workspace for Warcraft III artists, modelers and modders.

It brings texture editing, Warcraft III model previewing, UV inspection, button creation, asset validation and CASC-assisted asset loading into one application, so common art workflows do not require constantly switching between separate tools.

> Current version: **1.1**  
> Created by **DarkSir#1620**

## Features

### Texture Paint

- Open and edit Warcraft III textures and common image formats.
- Paint with brushes, eraser, clone, blur, smudge, fill and shape tools.
- Edit alpha independently without damaging the RGB channels.
- Work with layers and transform them with move/rotate controls.
- Zoom and navigate large textures with viewport scrolling.
- Paint directly against a loaded 3D model to understand where the texture lands.

### Model Editor / Model Lab

- Open **MDX** and **MDL** Warcraft III models.
- Preview model textures, materials, geosets, sequences, bones and other model data.
- Inspect UV mapping per texture/geoset, including tiled UV coordinates outside the 0–1 range.
- Preview animations and supported model effects.
- View team colors and Warcraft III model variants.
- Move, rotate and inspect the model with editor-style navigation.
- Use model cameras and capture a model view for icon artwork.
- Automatically search for textures referenced by imported MDX/MDL models and report anything that is still missing.

### Warcraft III CASC support

- Connect to a local Warcraft III installation and resolve supported stock assets through CASC.
- Prefer CASC assets when available instead of silently substituting them.
- Clearly warn when an effect being previewed is local, fallback or simulated rather than coming from CASC.
- Verify CASC by actually reading an asset, not only by detecting a folder or DLL.

### WC3 Buttons

- Create Warcraft III button sets from textures, images or Model Lab camera shots.
- Export normal, disabled, passive and autocast variants.
- Choose from multiple border styles and customize border colors.
- Adjust artwork fitting/bleed to avoid transparent gaps between the artwork and frame.
- Work with Classic/SD and Reforged-oriented icon workflows.

### Sanity Checker

- Check Warcraft III models, textures and ZIP packages for common asset problems before importing or publishing them.
- Batch-check multiple files and export a report.
- Validation behavior includes work derived from the open-source `mdx-m3-viewer` project. See the third-party notices for attribution and licenses.

## Supported formats

WC3 Asset Studio works with Warcraft III **MDX / MDL / BLP** assets and common image formats used during asset creation, including **TGA, DDS, PNG, JPEG and WebP** where applicable.

## Running from source

Recommended environment:

- Windows 10/11 x64
- Node.js 20+ (Node.js 22 recommended)
- npm

Install dependencies:

```bash
npm install
```

Run WC3 Asset Studio:

```bash
npm start
```

## Building the Windows portable EXE

```bash
npm run dist:win
```

The result is written to `dist/`.

The repository intentionally does **not** contain `node_modules`, generated EXEs, build output, runtime logs, Warcraft III game files or a bundled `CascLib.dll`.

## CASC notes

CASC support is optional. When enabled, WC3 Asset Studio can locate a Warcraft III installation and obtain the pinned CascLib helper used by the application. The helper is verified before use.

No Warcraft III game files are distributed with this repository.

## Credits

**WC3 Asset Studio** — DarkSir#1620

Third-party projects/components used or adapted by the application are documented in [`app/THIRD_PARTY_LICENSES.md`](app/THIRD_PARTY_LICENSES.md), including:

- [`mdx-m3-viewer`](https://github.com/flowtsohg/mdx-m3-viewer) by Chananya Freiman and contributors — Warcraft III model-format behavior and Sanity Checker references.
- [`W3ModelViewer`](https://github.com/Darithos/W3ModelViewer) — reference/integration source for the optional CascLib helper.
- JPEG decoder work with pdf.js/notmasteryet lineage — see the included Apache-2.0 notice.

## Reporting bugs

For model/texture rendering issues, include the WC3 Asset Studio version, the affected format, what you expected, what happened instead and the relevant in-app **Log** output. If you can legally share a small reproducible asset, that is extremely helpful.

## Disclaimer

WC3 Asset Studio is an independent community tool and is not affiliated with or endorsed by Blizzard Entertainment. Warcraft, Warcraft III and related names/assets are trademarks and property of their respective owners.

## License

The original **WC3 Asset Studio** source code is licensed under the **MIT License**, unless explicitly stated otherwise in an individual file.
Third-party libraries, components, tools, and other external resources remain subject to their respective original licenses, as detailed in the included **Third-Party Notices**.
