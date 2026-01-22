# TabMagic

TabMagic is a personal Chrome extension intended for developer mode installs. It supports manual tab naming plus automatic rules-based renaming.

## Installation (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this project folder (`MA01.ChromeTabExtension`).
5. Confirm the extension appears as **TabMagic**.

## Notes

- Rules are entered one per line: `regex, tab name (optional), optional icon name`.
- Leave the tab name blank to only update the icon.
- Regex replacements like `$1` are supported in names and icon names.

## Icon Assets

- Icons live in `icons/` (PNG and ICO files, including `TabMagic.ico`).
