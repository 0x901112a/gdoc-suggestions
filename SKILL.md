# gdoc-suggest — Google Docs Suggestions CLI

Make suggestions (tracked changes) on Google Docs programmatically. Works on the original document — preserves comments, sharing, and version history.

## Prerequisites

- One-time login: `gdoc-suggest login` (opens a browser, log into Google, auth saves to `~/.google-docs-automation`)
- Auth lasts ~24 hours, then re-run login

## Commands

### Replace text
```bash
gdoc-suggest replace <docId> "<find text>" "<replacement text>"
gdoc-suggest replace <docId> "<find text>" "<replacement text>" --match 2  # target 2nd occurrence
```

### Insert text
```bash
gdoc-suggest insert <docId> "<text after which to insert>" "<text to insert>"
```

### Delete text
```bash
gdoc-suggest delete <docId> "<text to delete>"
gdoc-suggest delete <docId> "<text to delete>" --match 3  # target 3rd occurrence
```

### Format text
```bash
gdoc-suggest format <docId> "<text to format>" --bold
gdoc-suggest format <docId> "<text to format>" --italic
gdoc-suggest format <docId> "<text to format>" --bold --underline
```

### Read document text
```bash
gdoc-suggest read <docId>
gdoc-suggest read <docId> --json
```

### Reject all suggestions (cleanup)
```bash
gdoc-suggest reject-all <docId>
```

## Important Rules

1. **Unique text required.** If the find text appears multiple times, you MUST specify `--match N` to target a specific occurrence. The command will error if text is ambiguous.

2. **Quote arguments.** Always wrap find/replace text in double quotes: `"lazy dog"` not `lazy dog`.

3. **One operation at a time.** Each command opens a headless browser, performs the operation, and closes. Don't try to batch multiple commands — run them sequentially.

4. **Verify with read.** After making suggestions, use `gdoc-suggest read <docId>` to check the document text. Note: this shows committed text, not pending suggestions.

5. **Table cells not supported.** Text inside table cells is not visible to the tool. Only paragraph text, bullet lists, and headings can be targeted.

6. **DocId format.** The docId is the long string from the Google Docs URL: `https://docs.google.com/document/d/<THIS_PART>/edit`

## Examples

```bash
# Replace "lazy dog" with "sleepy cat"
gdoc-suggest replace 1EoJPXsk319JiWupQrlAZGqj0kpDzinUumLm7gLl1E3g "lazy dog" "sleepy cat"

# Insert a translation after a Spanish sentence
gdoc-suggest insert 1A3OgxZL3SZR8e97ipX4BRMwkfvEzy0ZRCaL4ewN1e1g "quedamos al pendiente." " (Thank you, we remain at your service.)"

# Delete the 2nd occurrence of "reported steady progress"
gdoc-suggest delete 1EoJPXsk319JiWupQrlAZGqj0kpDzinUumLm7gLl1E3g "reported steady progress on the backend refactor." --match 2

# Bold a sentence
gdoc-suggest format 1EoJPXsk319JiWupQrlAZGqj0kpDzinUumLm7gLl1E3g "should be bolded" --bold

# Clean up after testing
gdoc-suggest reject-all 1EoJPXsk319JiWupQrlAZGqj0kpDzinUumLm7gLl1E3g
```
