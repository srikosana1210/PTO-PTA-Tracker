# CLAUDE.md

Read `docs/PLANNING.md` first. It describes the system, the rules, and the decisions already made.

## Ground rules for changes

- **Tab names and column headers are the API.** `Code.gs` finds everything by name. Don't rename a tab, a header, or a form question title prefix (`CFG.ITEMS[].key`) unless you also migrate existing sheets, the way `updateDocumentList()` did.
- **Apps Script V8, written in ES5 style.** Match the code: `var`, `function`, a trailing `_` for private helpers, two-space indent, no build step. `Dashboard.html` is one file with inline CSS and JS. `doGet` replaces the `__DATA__` marker in it.
- **Users are not technical.** Every alert, error and log note is a plain sentence that says what happened and what to do next. Keep that tone.
- **Privacy.** Officer contacts, file links and notes go to the browser only for a signed-in session, and only for the campuses that session may see. Any new data in `getPayload_` / `buildDetail_` follows the same rule. Check access on the server, never only in the page.
- **Writes take the script lock** (`LockService`), as in `onFormSubmit` / `reviewItem`.
- **Bump `VERSION`** in `Code.gs` whenever behaviour changes. If a menu step or a rule changes, say so in the summary so FACE can update the sheet's Start Here tab.
- `tools/*.bat` must keep CRLF line endings (see `.gitattributes`).

## Deploying

There is no automatic deploy. After a change, paste `Code.gs` and `Dashboard.html` into the Apps Script project behind the tracker sheet. Then make a new version of the web-app deployment.
