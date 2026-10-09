# Planning: PTO/PTA Registration Tracker

This doc lets someone (a person or Claude) pick up the project without re-reading all the code. It covers what the tracker does today, the rules it enforces, why things are the way they are, and what is left to build.

Source of truth for current behaviour: `apps-script/Code.gs` (version `2026-10-05a`) and the **Start Here** tab of the sheet. If this doc disagrees with them, they win. Fix this doc.

---

## 1. Who uses it

| Person | What they do | How they get in |
|---|---|---|
| **Inbox person** (works `ParentOrgDocs@houstonisd.org`) | Submits the Google Form once per PTO/PTA email: picks the campus, says whether it has a PTO/PTA, attaches the documents | The Google Form, signed in to Google, because file-upload forms require it |
| **C1 Coordinators** | Review documents for *their* campuses: Accept, or mark Needs Correction with a reason. Ask a PTO/PTA to resend | Dashboard > Sign in with name + passcode |
| **FACE staff** | Everything a C1 can do, for every campus. Also run the sheet menu (officer import, passcodes, new school year) | Dashboard sign-in, plus edit access to the sheet |
| **Leadership** | Look at status: counts, stages, Area Offices, the per-campus checklist | Dashboard address with no sign-in. They never receive officer details or file links |

## 2. How it fits together

```
PTO/PTA email ──> inbox person ──> Google Form ──onFormSubmit──> Code.gs
                                                                  ├─ renames + moves file into Drive: Parent Org Documents/<Campus>/
                                                                  ├─ Campus Register: item -> "Received"
                                                                  └─ Submission Log: one row per file

Microsoft "Officer Update Form" ──Excel export──> paste into "Officer Form Paste" ──menu: Import officers──>
                                                                  ├─ Officers tab: one row per officer
                                                                  └─ Campus Register: Officer Information -> "Received"

Dashboard (doGet + google.script.run)
   getDashboard(token)  -> status for everyone; details only for the campuses the session may see
   reviewItem(...)      -> Accepted / Needs Correction / Received, re-checked against the C1's campuses on the server
   logResendRequest(...)-> logs that the C1 sent a resend email (the page opens Outlook; the script sends nothing)

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
| Dashboard Sign-ins | Name, Role (C1 / Staff), Passcode status | Staff + script |
| New Passcodes | Shown once after passcodes are made; delete after sending | Script |
| Settings | Current school year, start month (7), the Registered and Legalized flags for each item, dropdown lists, Area Offices | Staff |
| Summary, Start Here, Roster Match Notes | Formulas and guidance | — |

**Documents** (`CFG.ITEMS`, in order): Bylaws, Officer Information, Training Certificate, Budget or Financial Report, Proof of 501c Status, Bank and EIN Letter, Articles of Incorporation, Insurance (optional).

**Item status:** Not Received → Received (waiting for review) → Accepted | Needs Correction. A new upload always puts an item back to Received.

**Campus status** (formula in the register):
- Has PTO or PTA = No → *No PTO/PTA*. Not Yes → *Not Yet Confirmed*.
- All items needed for Legalized are Accepted → **Legalized**.
- Bylaws, Officer Information and Training Certificate are Accepted → **Registered**.
- Anything received → *In Progress*. Otherwise *Not Started*.

## 4. Security model

- Leadership (no sign-in) gets status only. Officer names, contacts, file names, links and notes are **never sent to the browser** without a session.
- Sign-in uses a passcode, not a Google identity. Google only tells a script who is looking when they are in the owner's organization. Passcodes are stored as salted SHA-256 hashes in Script Properties. A session is a random 40-hex token kept in the script cache for up to 6 hours. After 5 wrong tries, that name is locked for 15 minutes.
- A C1's campus list is enforced **on the server** in `reviewItem` / `logResendRequest` / `getPayload_`, not in the page.
- Drive sharing decides who can open the files. Bank letters sit in the campus folders, so share `Parent Org Documents` and the OneDrive copy only with people allowed to see them.
- The register and log never record EINs or bank account numbers.

## 5. Decisions already made

These come from the Start Here tab. Do not undo them without asking FACE.

1. Only Articles of Incorporation is one-time and carries into the next year. Everything else resets each July.
2. The school year starts in July (Settings, start month = 7).
3. The starting roster is the 154 campuses marked Yes (122) or Unsure (32) in the TB PTO/PTA Tracker. Area Office comes from the 26-27 Area Office assignments. 23 campus names are spelled differently there (see Roster Match Notes), and 2 campuses have no Area Office yet.
4. Officers come from the Microsoft *HISD Parent Organization Officer Update Form*, through paste and import. A school not in the register is **added** as a new campus. A name typed by hand that is not in the register is **flagged**, never added.
5. C1 review uses passcode sign-in, for the reason given in section 4.
6. Registered = training + bylaws + officer info. The budget proof, 501(c) proof, bank/EIN letter and Articles count toward Legalized only. Insurance is optional and counts toward neither.
7. Booster clubs are not tracked. The import skips them, but a combined name such as "PTA and Booster Club" still counts.
8. Changed 2026-10-02: the bank letter and the EIN letter are one item (*Bank and EIN Letter*), insurance became optional, and the separate bank folder is gone. `updateDocumentList()` migrates older sheets.
9. The resend email goes from the person's own Outlook, copying the inbox. The script only logs that it was sent.

## 6. Known gaps and risks

- **Not tested on a real Google account yet.** Start Here says so. First check: open the dashboard in a private window and confirm no officer details appear. Then sign in as a C1 and as staff.
- File-upload form questions must be added by hand. `checkSetup` catches mistakes.
- Nobody has confirmed that the officer form's school list uses the register's spellings. After each import, check for near-duplicate campuses.
- Deployment is copy-paste: nothing syncs this repo to the Apps Script project.
- There are no automated tests. The pure helpers (`campusKey_`, `looseKey_`, `orgTypeFrom_`, `parsePaste_`, `boosterClub_`, `schoolYearFor_`) could be tested without Google.
- `tools/PTO-PTA-OneDrive-Copy.bat` has one person's OneDrive path in `DOCS_DEST`. Anyone else must edit that line.

## 7. Backlog

Nothing below is committed to. Add items and order them with FACE.

- [ ] Run the end-to-end test from Start Here (steps 10–11) on the real account and write down what happened
- [ ] Optional: set up `clasp` (an `appsscript.json` plus `.clasp.json`) so `clasp push` deploys from this repo instead of copy-paste
- [ ] Optional: Node unit tests for the pure helpers listed in section 6
- [ ] _Add new features here_

## 8. Open questions

- _Add here._

## 9. Notes from the "PTO Registration system" conversation

The code came from an earlier Claude conversation. Its excerpts are in [`conversation-pto-registration-system.md`](conversation-pto-registration-system.md). Points that aren't recorded anywhere else:

- **Original goal:** one system that serves the inbox person, a backing spreadsheet, a shareable dashboard for senior EDs, and campus folders in OneDrive.
- **Tests exist but aren't here.** That session ran about 400 script checks, 165 dashboard checks and 96 browser checks against simulated data. Those test files stayed in that session's sandbox and are not in this repo.
- **The standalone `PTO-PTA-Registration-Dashboard-2026-27.html` is retired.** It was `Dashboard.html` with a frozen data snapshot from 2026-09-29, taken before any documents arrived. It also predates the resend feature. The live web-app dashboard replaces it, so it's deliberately left out of this repo.
- **The OneDrive setup guide** is in [`onedrive-copy-setup-guide.md`](onedrive-copy-setup-guide.md).
- **Open offer:** add a "sender's email" question to the inbox form. Then the resend email goes to the person who actually sent the documents, not just the officers on the newest officer form. A campus with no officer form currently gets a draft with an empty To line.
- **Live sheet vs. template:** the `.xlsx` is for a brand-new setup only. Importing it over the live sheet would lose the officer imports and sign-ins.
- **The live sheet was migrated** with "Update to the new document list". The old Tax ID column is hidden, not deleted.
