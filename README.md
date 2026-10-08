# PTO/PTA Registration Tracker

Houston ISD Family and Community Engagement (FACE). This tracker follows each campus PTO/PTA through annual registration. It shows which documents arrived, which ones C1 Coordinators accepted, and which campuses are **Registered** or **Legalized**.

It runs on Google: one Google Sheet, one Google Form, and one Apps Script web-app dashboard. A Windows batch file backs up the filed documents to OneDrive.

## What's in this repo

| Path | What it is | Where it runs |
|---|---|---|
| [`apps-script/Code.gs`](apps-script/Code.gs) | All server logic: the sheet menu, the form-submit handler that files documents, the officer import, passcode sign-in, C1 review, the dashboard data, and the new-school-year rollover | The tracker sheet: Extensions > Apps Script |
| [`apps-script/Dashboard.html`](apps-script/Dashboard.html) | The dashboard page: Overview, Campuses, Review, the campus detail panel, and the "ask to resend" email helper. It must be named `Dashboard` in the Apps Script project | Same Apps Script project, deployed as a web app |
| [`sheet/PTO-PTA-Tracker-2026-27.xlsx`](sheet/PTO-PTA-Tracker-2026-27.xlsx) | The sheet template with the 154-campus starting roster for 2026-27. No documents or officers yet. The **Start Here** tab is the full setup and user guide | Upload to Drive, then File > Save as Google Sheets |
| [`tools/PTO-PTA-OneDrive-Copy.bat`](tools/PTO-PTA-OneDrive-Copy.bat) | Copies the `Parent Org Documents` Drive folder to a FACE OneDrive folder. It only adds and updates files, and can run every 3 hours | A FACE staff Windows PC with Google Drive for desktop |
| [`docs/PLANNING.md`](docs/PLANNING.md) | How the system fits together, the rules it enforces, decisions made so far, and the backlog. **Start here before you change anything** | — |

Current script version: `2026-10-05a` (the `VERSION` constant in `Code.gs`).

## Setup in short

The **Start Here** tab in the sheet has the full steps:

1. Save the `.xlsx` as a Google Sheet. Paste `Code.gs`, and add an HTML file named `Dashboard` with `Dashboard.html` in it.
2. Use **PTO/PTA Tracker > 1. Create the form**. Then add the seven file-upload questions by hand (Google does not let a script add them). Then run **2. Check setup**.
3. Deploy as a web app: Execute as *Me*, access *Anyone within Houston ISD*.
4. Fill in **C1 Assignments**, then use **Dashboard sign-ins: set up and make passcodes**.

## Updating the live tracker from this repo

The live copy is the Apps Script project inside the Google Sheet. Git does not deploy it. After you change a file here, paste it into the matching file in the Apps Script editor. Then use **Deploy > Manage deployments > Edit > New version** so the dashboard address serves the new code.
