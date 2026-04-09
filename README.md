# gdoc-suggestions

Programmatic Google Docs suggestions (tracked changes) via headless browser automation. Works on the original document, preserving comments, sharing, and version history.

## How It Works

Uses [Playwright](https://playwright.dev/) to drive a headless Chromium browser with your saved Google session. It opens the target doc, switches to Suggesting mode, and uses Find/Replace dialogs and keyboard shortcuts to create real suggestions -- the same ones you'd make by hand.

**Architecture:** CLI (`bin/gdoc-suggest.mjs`) -> core library (`lib/index.mjs`) -> browser executor (`lib/browser-executor.mjs`) for Playwright page interactions, with an anchor resolver (`lib/anchor-resolver.mjs`) to map text/indices to unique Find queries.

## Installation

```bash
npm install -g gdoc-suggestions
```

Requires Node.js 18+ and installs Playwright's Chromium automatically.

## One-Time Login

```bash
gdoc-suggest login
```

Opens a headed browser. Log into your Google account. Auth state is saved to `~/.google-docs-automation` and reused for headless operations.

## Usage

```bash
# Replace text (creates a suggestion)
gdoc-suggest replace <docId> "old text" "new text"

# Replace the 2nd occurrence
gdoc-suggest replace <docId> "old text" "new text" --match 2

# Insert text after an anchor
gdoc-suggest insert <docId> "text to find" "text to insert after it"

# Delete text
gdoc-suggest delete <docId> "text to delete"

# Format text
gdoc-suggest format <docId> "text to format" --bold --italic --underline

# Read document text
gdoc-suggest read <docId>
gdoc-suggest read <docId> --json

# Reject all pending suggestions (useful for cleanup)
gdoc-suggest reject-all <docId>
```

The `<docId>` is the long string from the Google Docs URL: `https://docs.google.com/document/d/<docId>/edit`

Always wrap text arguments in double quotes.

## Limitations

- **Table cells** are not supported. Only paragraph text, bullet lists, and headings can be targeted.
- **Auth expires** after roughly 24 hours. Re-run `gdoc-suggest login` when you see auth errors.
- If the find text appears multiple times, you **must** specify `--match N` to disambiguate.
- One operation per invocation (each command opens and closes a browser session).

## Security

- `~/.google-docs-automation` contains your live Google session cookies. **Treat this directory like a password.** Do not share, commit, or back up to cloud storage without encryption.
- Running `gdoc-suggest login` grants the tool persistent access to your Google account until you delete the directory or revoke sessions in [Google Security settings](https://myaccount.google.com/security).
- The tool uses `--disable-blink-features=AutomationControlled` to avoid bot detection. This is standard practice for browser automation tools.

## Note

Tested on macOS. Other platforms may work but are not actively tested.

## License

MIT
