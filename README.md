# TabMagic

TabMagic is a Chrome extension for custom tab names and rule-based icon/title updates.

## Project layout

- Root: markdown documentation.
- `Extension/`: extension source (`manifest.json`, service worker, icons).
- `Scripts/`: helper scripts (generated images in this folder are ignored; copy selected files to `Extension/icons/`).

## Install (Developer mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `Extension/` folder.

## Rules format

Use one rule per line:

```text
regex; tab name (optional); icon name (optional)
```

- Leave name blank to only change icon.
- `$1`, `$2`, ... replacements are supported.
