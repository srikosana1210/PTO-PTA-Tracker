# PTO/PTA Registration Tracker

Houston ISD Family and Community Engagement (FACE). This tracker follows each campus PTO/PTA through annual registration. It shows which documents arrived, which ones C1 Coordinators accepted, and which campuses are **Registered** or **Legalized**.

It runs on Google: one Google Sheet, one Google Form, and one Apps Script web-app dashboard. A Windows batch file backs up the filed documents to OneDrive.

## What's in this repo

| Path | What it is | Where it runs |
|---|---|---|
| [`apps-script/Code.gs`](apps-script/Code.gs) | All server logic: the sheet menu, the form-submit handler that files documents, the officer import, passcode sign-in, the review checklist and remarks, the dashboard data, the Area Office campus list, the one-time updates, and the new-school-year rollover | The tracker sheet: Extensions > Apps Script |
| [`apps-script/Dashboard.html`](apps-script/Dashboard.html) | The dashboard page: Overview (whole numbers only), Campuses, Review, the campus panel with the checklist, the "email the PTO/PTA" helper, and the C1 reminders. It must be named `Dashboard` in the Apps Script project | Same Apps Script project, deployed as a web app |
| [`sheet/PTO-PTA-Tracker-2026-27.xlsx`](sheet/PTO-PTA-Tracker-2026-27.xlsx) | The sheet template for a brand-new setup: every campus of the five Area Offices (266) for 2026-27, the 11 Texas PTA campuses marked as PTAs, the October 2026 changes already applied. No documents or officers yet. The **Start Here** tab is the full setup and user guide | Upload to Drive, then File > Save as Google Sheets |
| [`sheet/Area Office Campuses.csv`](sheet/Area%20Office%20Campuses.csv) | Every campus of the five Area Offices (26-27 SY Area Office Unit Assignments), with the register's spelling where it differs and the Texas PTA roster status. Import it into the live sheet as a tab named **Area Office Campuses** | Google Sheets: File > Import |
| [`tools/PTO-PTA-OneDrive-Copy.bat`](tools/PTO-PTA-OneDrive-Copy.bat) | Copies the `Parent Org Documents` Drive folder to a FACE OneDrive folder. It only adds and updates files, and can run every 3 hours | A FACE staff Windows PC with Google Drive for desktop |
| [`docs/onedrive-copy-setup-guide.md`](docs/onedrive-copy-setup-guide.md) | How to set up and troubleshoot the OneDrive copy | — |
| [`tests/`](tests) | Tests: `Code.gs` runs in Node against the template with stand-ins for the Google services (`harness.js`), and the real dashboard runs in Chromium (`test-dashboard.js`) | `node tests/test-script.js` and `node tests/test-dashboard.js` |
| [`docs/PLANNING.md`](docs/PLANNING.md) | How the system fits together, the rules it enforces, decisions made so far, and the backlog. **Start here before you change anything** | — |

Current script version: `2026-10-09b` (the `VERSION` constant in `Code.gs`).

## Setup in short

The **Start Here** tab in the sheet has the full steps:

1. Save the `.xlsx` as a Google Sheet. Paste `Code.gs`, and add an HTML file named `Dashboard` with `Dashboard.html` in it.
2. Use **PTO/PTA Tracker > 1. Create the form**. Then add the file-upload questions by hand (Google does not let a script add them): the seven documents (the bank one is **Bank Verification Letter**), plus **Other documents** for an email whose documents are all in one file. Then run **2. Check setup**.
3. Deploy as a web app: Execute as *Me*, access *Anyone within Houston ISD*.
4. Fill in **C1 Assignments**, then use **Dashboard sign-ins: set up and make passcodes**. Type each C1's email in the **Email** column of Dashboard Sign-ins (used for the review reminders).

## Updating the live tracker from this repo

The live copy is the Apps Script project inside the Google Sheet. Git does not deploy it. After you change a file here, paste it into the matching file in the Apps Script editor. Then use **Deploy > Manage deployments > Edit > New version** so the dashboard address serves the new code.

Every change that affects a live sheet comes with a one-time menu item that updates it safely (it saves a backup copy first): **Update to the new document list** (October 2, 2026) and **Update the tracker: October 2026 changes** (October 9, 2026).

## Tests

```
node tests/test-script.js      # Code.gs, in Node (needs python3 with openpyxl to read the template)
node tests/test-dashboard.js   # the dashboard in Chromium, talking to Code.gs (needs Playwright)
```
