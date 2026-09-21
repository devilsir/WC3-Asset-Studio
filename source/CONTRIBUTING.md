# Contributing

Thanks for helping improve WC3 Asset Studio.

## Bug reports

Please include:

- WC3 Asset Studio version.
- The asset format involved (MDX, MDL, BLP, etc.).
- Expected behavior.
- Actual behavior.
- Relevant entries from the in-app Log.
- A small reproducible asset/package when you have permission to share it.

## Pull requests

Keep changes focused and do not commit generated files such as `node_modules`, `dist`, portable EXEs, runtime logs or Warcraft III game files.

Before submitting a change, run:

```bash
npm run verify
```

If dependencies are installed, also run `npm start` and test the affected workspace.

Third-party code must retain all required license and attribution notices.
