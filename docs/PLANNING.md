# Planning: PTO/PTA Registration Tracker

This doc lets someone (a person or Claude) pick up the project without re-reading all the code. It covers what the tracker does today, the rules it enforces, why things are the way they are, and what is left to build.

Source of truth for current behaviour: `apps-script/Code.gs` (version `2026-10-20a`) and the **Start Here** tab of the sheet. If this doc disagrees with them, they win. Fix this doc.

---

## 1. Who uses it

| Person | What they do | How they get in |
|---|---|---|
| **Inbox person** (works `ParentOrgDocs@houstonisd.org`) | Submits the Google Form once per PTO/PTA email: picks the campus, says whether it has a PTO/PTA, attaches the documents | The Google Form, signed in to Google, because file-upload forms require it |
| **C1 Coordinators** | Check off each document for *their* campuses (it's there / needs correction / not there / not needed, with a remark), write overall remarks, and email the PTO/PTA from Outlook | Dashboard > Sign in with name + passcode |
| **FACE staff** | Everything a C1 can do, for every campus. Remind C1s (Outlook). Also run the sheet menu (officer import, passcodes, campus list, new school year) | Dashboard sign-in, plus edit access to the sheet |
| **Leadership** | Look at status: counts, stages, Area Offices, the per-campus checklist | Dashboard address with no sign-in. They never receive officer details or file links |

## 2. How it fits together

```
PTO/PTA email ──> inbox person ──> Google Form ──onFormSubmit──> Code.gs
                                                                  ├─ moves file (keeping its name) into Drive: Parent Org Documents/<Campus>/
                                                                  ├─ Campus Register: item -> "Received"
                                                                  └─ Submission Log: one row per file

Microsoft "Officer Update Form" ──Excel export──> paste into "Officer Form Paste" ──menu: Import officers──>
                                                                  ├─ Officers tab: one row per officer
                                                                  └─ Campus Register: Officer Information -> "Received"

Dashboard (doGet + google.script.run)
   getDashboard(token)  -> status for everyone; details only for the campuses the session may see
   saveChecklist(...)   -> every checklist change of one campus at once (status + remark per document, overall remarks),
                           re-checked against the C1's campuses on the server; each change is a Submission Log line
   logResendRequest(...)-> logs that the person emailed the PTO/PTA (the page opens Outlook; the script sends nothing)
   reviewItem(...)      -> the older one-document review, kept so a page from before 2026-10-09 still works

"Area Office Campuses" tab ──menu: Add every campus──> Campus Register: missing campuses added, Texas PTA campuses marked

PTO-PTA-OneDrive-Copy.bat (Windows, scheduled) ── robocopy ──> OneDrive "FACE Coordinators - PTO - PTA Documents"
```

## 3. Data model (sheet tabs)

The script finds everything by tab name and column header. **Renaming either breaks it.**

| Tab | Key columns | Written by |
|---|---|---|
| Campus Register | School Year, Campus, Area Office, Has PTO or PTA, Org Type, Org Name, one column per document (8), then formula columns (Items Received, Registration/Legalization Items Accepted, Status, Items Awaiting Review, Items Needing Correction, Not Yet Accepted) | Form handler, officer import, dashboard review, staff by hand |
| Submission Log | Received, Submitted By, Campus, Document Type, File Name, File Link, School Year, Notes | Script only. A blank Document Type marks a review or a note, not a received document |
| Officers | Response ID … Added To Register, Notes (18 columns, `CFG.OFFICER_HEADERS`) | Officer import. Staff edit only the Campus column |
| Officer Form Paste | Raw Excel export, pasted at A1 | Staff |
| C1 Assignments | Campus, C1 Coordinator (one row per campus; a campus can have several C1s) | Staff |
| Dashboard Sign-ins | Name, Role (C1 / Staff), Passcode status, Email (a C1's email, for reminders) | Staff + script |
| C1 Reminders | Send, C1, Email, Campuses, Waiting, Subject, Body, Text, Note, Updated. Rewritten by the script each weekday morning before it posts the reminders to Power Automate | Script only |
| Leaders | SEDs, EDs, principals, APs: Email, Name, Role (Area Office or Principal), Area Office or Campus, Status. Pasted from the district list | Staff |
| Texas PTA Paste | Texas PTA's spreadsheet for Houston ISD, pasted in whole each week (headings included) | Staff (weekly) |
| Texas PTA | One row per PTA: Campus (editable, kept by Texas PTA ID), status, Good Standing date, the five SOA standards, members, goal. Charter withdrawals left out; no contact details | Script (`importTexasPta`) |
| Area Office Campuses | Campus, Area Office, Unit, Name in the register, Texas PTA, Texas PTA status (from `sheet/Area Office Campuses.csv`) | Staff (imported once a year) |
| New Passcodes | Shown once after passcodes are made; delete after sending | Script |
| Settings | Current school year, start month (7), the Registered and Legalized flags for each item, dropdown lists, Area Offices | Staff |
| Summary, Start Here, Roster Match Notes | Formulas and guidance | — |

**Documents** (`CFG.ITEMS`, in register column order; `label` is FACE's wording, shown everywhere): Bylaws, Officer Information, Training Certificate, Budget or Financial Report, Proof of 501c Status, Bank Verification Letter (called *Bank and EIN Letter* until 2026-10-09; the old name is still read everywhere), Articles of Incorporation and Insurance (*retired* 2026-10-15: columns kept and hidden, not shown, not counted, not emailed; `activeItems_()` is everything else). The dashboard shows them in FACE's order: training certificate first.

**FACE's wording (2026-10-09):**
- **Registration:** training certificate; the organization's bylaws; the officer information form.
- **Legalization:** those three, plus the annual budget report or meeting minutes showing budget approval; proof of 501(c) status; the bank account verification letter from financial institution listing two authorized account signers.

**Item status:** Not Received → Received (waiting for review) → Accepted | Needs Correction | Not Needed. A new upload always puts an item back to Received. The officer information form is the exception: it is set to **Accepted** as soon as it arrives (form checkbox or officer import), with no review (FACE, 2026-10-15). *Not Needed* means a reviewer decided this PTO/PTA does not need the document (with a reason); it counts like Accepted.

**Remarks** live in the Submission Log, not in the register: the newest note about a document is its remark (`itemNote_` reads them back), and the newest "Remarks for the PTO/PTA: …" line is the overall remark. They are sent only to signed-in reviewers.

**Has PTO or PTA:** Not Yet Confirmed (shown as *Nothing received yet*) until the campus sends documents, an officer form arrives, a reviewer checks a document off, or the Texas PTA roster lists it; then Yes. No is only ever set by a person.

**Campus status** (formula in the register):
- Has PTO or PTA = No → *No PTO/PTA*. Not Yes → *Not Yet Confirmed*.
- Every document needed for Legalized is Accepted or Not Needed → **Legalized**.
- The three registration documents are Accepted or Not Needed → **Registered**.
- Anything received → *In Progress*. Otherwise *Not Started*.

## 4. Security model

- Leadership (no sign-in) gets status only. Officer names, contacts, file names, links and notes are **never sent to the browser** without a session.
- Sign-in uses a passcode, not a Google identity. Google only tells a script who is looking when they are in the owner's organization. Passcodes are stored as salted SHA-256 hashes in Script Properties. A session is a random 40-hex token kept in the script cache for up to 6 hours. After 5 wrong tries, that name is locked for 15 minutes.
- A C1's campus list is enforced **on the server** in `saveChecklist` / `reviewItem` / `logResendRequest` / `getPayload_`, not in the page.
- The C1 email list (for reminders) goes to FACE staff sessions only.
- Drive sharing decides who can open the files. Bank letters sit in the campus folders, so share `Parent Org Documents` and the OneDrive copy only with people allowed to see them.
- The register and log never record EINs or bank account numbers.

## 5. Decisions already made

These come from the Start Here tab. Do not undo them without asking FACE.

1. Only Articles of Incorporation is one-time and carries into the next year. Everything else resets each July.
2. The school year starts in July (Settings, start month = 7).
3. ~~The starting roster is the 154 campuses marked Yes or Unsure in the TB PTO/PTA Tracker.~~ Since 2026-10-09: every campus of the five Area Offices (264 in the 26-27 assignments, plus 2 register campuses not in them = 266). Where the register spells a campus differently, the register's spelling is kept ("Name in the register" column; see Roster Match Notes).
4. Officers come from the Microsoft *HISD Parent Organization Officer Update Form*, through paste and import. A school not in the register is **added** as a new campus. A name typed by hand that is not in the register is **flagged**, never added.
5. C1 review uses passcode sign-in, for the reason given in section 4.
6. Registered = training + bylaws + officer info. Legalized = those + budget proof, 501(c) proof, bank verification letter (FACE's wording, 2026-10-09). Articles of Incorporation and insurance are no longer asked for (2026-10-15).
7. Booster clubs are not tracked. The import skips them, but a combined name such as "PTA and Booster Club" still counts.
8. Changed 2026-10-02: the bank letter and the EIN letter are one item (*Bank and EIN Letter*), insurance became optional, and the separate bank folder is gone. `updateDocumentList()` migrates older sheets.
9. Emails to PTO/PTAs go from the person's own Outlook. The tracker's Google account has no Gmail, so the script can't send mail; it only logs "I sent it". C1 reminders are sent by Power Automate from the ParentOrgDocs mailbox (FACE, 2026-10-14); the script posts them to the flow (a Teams-webhook trigger, so no Google connector).
10. No "either/or" rules are built in. Reviewers decide: they can mark any document *Not Needed* for a PTO/PTA, with a reason (2026-10-09).
11. The dashboard shows whole numbers only: no percentages, no progress bars (2026-10-09). The sheet's Summary tab still has percentage columns.
12. A campus counts as a PTO/PTA once it has sent something, or the Texas PTA roster lists it (charter not withdrawn). The October update can set campuses marked Yes that sent nothing back to Not Yet Confirmed; it asks first.
13. Texas PTA roster: the roster marks which campuses are PTAs. For a PTA (Org Type = PTA) FACE tracks only the training certificate and the officer information form (`CFG.PTA_ITEMS`, FACE 2026-10-15). With both done a PTA is **Registered**; it is never Legalized. Its other uploads are filed and logged, but don't change its checklist. 11 are marked: Hamilton MS, Hogg MS, South EC HS ("South Early Community" on the roster, confirmed by FACE), and Browning, Durham, Harvard, Helms, Ketelsen, Oak Forest, Tijerina and Travis ES. Bonham ES, Northside HS and Wainwright ES are *Charter Withdrawn* and are not marked.
14. An email with all documents in one file goes under the form's **Other documents** question. It is filed and logged but changes no item; the reviewer checks off what it contains.
15. No Tax ID (EIN) letter (FACE, 2026-10-09). *Bank and EIN Letter* is renamed *Bank Verification Letter*; `updateOctober2026` renames the column, the Settings column and the Summary row. Old form questions, log lines and pages that use the old name still work (`headerAliases`, `formAliases`, `itemByKey_`, `itemNote_`).
16. Programs/Charters stays on the campus list, all 19 entries, including programs that are not schools (FACE, 2026-10-09).
17. Uploaded files keep the name they were sent with; they are still moved into the campus folder (FACE, 2026-10-15: the renamed files confused people).
18. Leadership needs no sign-in (FACE, 2026-10-15). **Since 2026-10-19a** everyone who opens the dashboard (Area Offices, principals, anyone in Houston ISD with the link) sees each PTO/PTA's officers (name, position, email, phone) and its document links, view only (`openDetail_`, Script Property `OPEN_DETAILS`, menu *Officers and documents: show to everyone / only after sign-in*). Notes, remarks, submitter and reviewer stay private. FACE will check with IT before anything finer (per-person access by Google account: the *Leaders* tab code from 16d is kept but off the menu; it only matters when `OPEN_DETAILS` is off). To open files people need view access to the Drive folder.
19. Colors: option A (FACE, 2026-10-15): dark green header, dark green buttons, teal accents, light green for accepted documents. The mockup with the three options is `mock/pto-pta-mock.html`.
20. Texas PTA spreadsheet (FACE, 2026-10-16): pasted weekly; PTAs with *Charter Withdrawal* are not shown. Names are matched to the register (aliases in `CFG.TXPTA_ALIASES`, then dropping leading words, flagged for checking); a Campus typed by hand on the Texas PTA tab wins. A listed campus with a blank Org Type becomes PTA. Texas PTA's contact columns are never read. A campus whose charter is withdrawn loses Org Type PTA on import, and goes back to Not Yet Confirmed if it has sent nothing (2026-10-16b). Menu **PTO/PTA count: set campuses that have sent nothing to Not Yet Confirmed** (`resetUnstarted`) does the same for the old tracker's Yes campuses, keeping senders and Texas PTAs; it asks first and saves a backup.
21. The email to a PTO/PTA goes to two officers: the president and the secretary. When one is missing, the next in line fills the place: vice president, then treasurer, then any other officer with an email; with no officer email, the newest form's submitter (FACE, 2026-10-19; one officer from 2026-10-16).

## 6. Known gaps and risks

- **Not tested on a real Google account yet.** Start Here says so. First check: open the dashboard in a private window and confirm no officer details appear. Then sign in as a C1 and as staff.
- File-upload form questions must be added by hand. `checkSetup` catches mistakes.
- Nobody has confirmed that the officer form's school list uses the register's spellings. After each import, check for near-duplicate campuses.
- Deployment is copy-paste: nothing syncs this repo to the Apps Script project.
- Tests run on stand-ins for Google (`tests/harness.js`), not the real services. Formulas are not calculated there; they were checked with LibreOffice when the template was rebuilt.
- The dashboard's Outlook links (`mailto:`) can be long; very long emails are shortened, with "Copy email text" for the full message.
- `tools/PTO-PTA-OneDrive-Copy.bat` has one person's OneDrive path in `DOCS_DEST`. Anyone else must edit that line.

## 7. Backlog

Nothing below is committed to. Add items and order them with FACE.

- [ ] Run the end-to-end test from Start Here (steps 10–11) on the real account and write down what happened
- [ ] Optional: set up `clasp` (an `appsscript.json` plus `.clasp.json`) so `clasp push` deploys from this repo instead of copy-paste
- [x] Tests for `Code.gs` (Node) and the dashboard (Chromium): `tests/`

### Requested by FACE, 2026-10-09 (built in version 2026-10-09a)

- [x] **R5. Whole numbers only.** Tiles: PTO/PTAs, Registered, Legalized, Waiting for review. Area Offices and documents are number tables.
- [x] **R6. One set of words** for Registration and Legalization, from `CFG.ITEMS[].label` (dashboard, emails, Settings, Start Here).
- [x] **R4. Every campus of every Area Office** (`Area Office Campuses` tab + menu). Nothing received yet → Yes when something arrives.
- [x] **R2. Checklist review** in three groups (Registration, Legalization, Other documents), with It's there / Needs correction / Not there / Not needed and a remark per document. No hard-coded either/or rules (decision 10).
- [x] **R1. The email** covers still-needed documents, corrections with remarks, and the overall remarks.
- [x] **R3. Remind C1s automatically (2026-10-15).** Every weekday at 8 AM the script rewrites the **C1 Reminders** tab and POSTs the Send = Yes rows to a Power Automate flow that starts with *When a Teams webhook request is received* (Script Property `REMINDER_HOOK`); the flow emails each from the ParentOrgDocs shared mailbox. The first design (flow reads the sheet with the Google Sheets connector, then a small separate sheet, `REMINDER_SHEET_ID`) failed: Google kept answering 429 Too many requests. Setup: [`power-automate-c1-reminders.md`](power-automate-c1-reminders.md). The Review tab's Outlook buttons stay as a manual fallback only while automatic reminders are off; when they are on, the tab shows one status line instead (2026-10-15b).
- [x] **Campus list filters and Org type column (2026-10-15b).** FACE's chip order: All campuses, All PTO/PTAs, PTOs, PTAs, Not started, In progress, Legalized, Registered, Waiting for review, Sent back for correction, Nothing received yet. PTOs and PTAs go by the register's Org Type. The No PTO/PTA chip is gone; those campuses show under All campuses.
- [x] **Officer form, PTAs, documents, leadership views (2026-10-15c).** Officer form needs no review; PTAs track two documents; Articles and Insurance retired; files keep their names; option A colors; *Waiting on* column; *My campus* tab; Area Office links. One-time menu step: **Update the tracker: officer form, PTAs and documents** (`updateOctober15`).
- [x] **R7. Texas PTA spreadsheet, weekly (2026-10-16a).** Paste into **Texas PTA Paste**, then **Import the Texas PTA spreadsheet**. Charter withdrawals are left out (FACE). The Overview's *Texas PTA standing* table is hidden since 2026-10-20 (FACE; `SHOW_TX_OVERVIEW` in Dashboard.html brings it back); My campus and the campus panel show it for each PTA. It does not change Registered: a PTA is still tracked on its training certificate and officer form.

## 8. Open questions


## 9. Notes from the "PTO Registration system" conversation

The code came from an earlier Claude conversation. Its excerpts are in [`conversation-pto-registration-system.md`](conversation-pto-registration-system.md). Points that aren't recorded anywhere else:

- **Original goal:** one system that serves the inbox person, a backing spreadsheet, a shareable dashboard for senior EDs, and campus folders in OneDrive.
- **Tests exist but aren't here.** That session ran about 400 script checks, 165 dashboard checks and 96 browser checks against simulated data. Those test files stayed in that session's sandbox and are not in this repo.
- **The standalone `PTO-PTA-Registration-Dashboard-2026-27.html` is retired.** It was `Dashboard.html` with a frozen data snapshot from 2026-09-29, taken before any documents arrived. It also predates the resend feature. The live web-app dashboard replaces it, so it's deliberately left out of this repo.
- **The OneDrive setup guide** is in [`onedrive-copy-setup-guide.md`](onedrive-copy-setup-guide.md).
- **Open offer:** add a "sender's email" question to the inbox form. Then the resend email goes to the person who actually sent the documents, not just the officers on the newest officer form. A campus with no officer form currently gets a draft with an empty To line.
- **Live sheet vs. template:** the `.xlsx` is for a brand-new setup only. Importing it over the live sheet would lose the officer imports and sign-ins.
- **The live sheet was migrated** with "Update to the new document list". The old Tax ID column is hidden, not deleted.
