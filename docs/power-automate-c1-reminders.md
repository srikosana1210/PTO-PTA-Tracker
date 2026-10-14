# C1 reminders by Power Automate: setup guide

_October 2026. For the PTO/PTA tracker, script version 2026-10-14b or later._

The tracker can't send email itself, because its Google account has no Gmail. So the job is split:

1. **The tracker** updates the **C1 Reminders** tab every morning, between 6 and 7 AM. Each C1 gets one row. **Send** says **Yes** when that C1 has documents waiting for review and their email is known. The row also holds the finished email.
2. **A Power Automate flow** runs at 8 AM. It reads the list and sends each **Yes** row from Outlook, from the ParentOrgDocs mailbox.

Power Automate doesn't read the tracker itself. It reads a **small separate Google Sheet**, *PTO-PTA C1 Reminders (read by Power Automate)*, which holds only the reminder list; the tracker copies the list into it each time. That keeps Power Automate under Google's request limit (a big workbook triggers "429 Too many requests"), and it means the flow never sees officer contact details.

C1s with nothing waiting get no email. Once you set it up, nobody has to click anything.

Setup takes about 15 minutes. Do part A in the tracker sheet, then part B in Power Automate.

---

## A. In the tracker sheet (5 minutes)

1. **Install the new script.** Paste the new `Code.gs` and `Dashboard.html` into Apps Script and save. Then choose **Deploy > Manage deployments > Edit > New version > Deploy**. The dashboard footer should then read **2026-10-14b**.
2. **Add each C1's email.** Open the **Dashboard Sign-ins** tab. Type each C1's email in the **Email** column. If the column isn't there, run **PTO/PTA Tracker > Dashboard sign-ins: set up and make passcodes** once and it gets added.
3. **Make the small reminders sheet.** Reload the tracker, then choose **PTO/PTA Tracker > C1 reminders: make the small sheet for Power Automate**. Google asks you to approve access again, because the script now creates a second spreadsheet; choose your account, then **Allow**. The message shows the new sheet's link, and the sheet is in your Google Drive as *PTO-PTA C1 Reminders (read by Power Automate)*. Don't type in it: the tracker rewrites it.
4. **Turn on the morning update.** Choose **PTO/PTA Tracker > C1 reminders: update the list every morning (turn on)**.
5. **Check the list.** Open the **C1 Reminders** tab (in the tracker or in the small sheet; they're the same). You'll see one row per C1:

   | Column | What it holds |
   |---|---|
   | **Send** | **Yes** = this C1 gets an email at the next run. **No** = nothing waiting, or no email on file (the **Note** column says which) |
   | **C1**, **Email** | Who it goes to |
   | **Campuses**, **Waiting** | Their campuses with documents waiting, and how many documents |
   | **Subject**, **Message HTML** | The email the flow sends |
   | **Message** | The same email as plain text (not used by the flow) |
   | **Updated** | When the tracker last refreshed the row |

   Don't rename this tab or its column headings. The flow finds them by name.

To refresh the list right away, for example while testing, choose **PTO/PTA Tracker > C1 reminders: update the list now**.

---

## B. In Power Automate (10 minutes)

Go to **make.powerautomate.com** and sign in with your Houston ISD Microsoft account.

### 1. Create the flow and set when it runs
1. Choose **+ Create**, then **Scheduled cloud flow**.
2. **Flow name:** `PTO/PTA C1 reminders`.
3. **Starting:** tomorrow's date, at **8:00 AM**.
4. **Repeat every:** `1` **Week**. Under **On these days**, tick **Monday to Friday**. For a weekly reminder, tick only **Monday**.
5. Choose **Create**.
6. Open the **Recurrence** step. Set **Time zone** to **(UTC-06:00) Central Time (US & Canada)**. Set **At these hours** to `8` and **At these minutes** to `0`.

### 2. Read the C1 Reminders tab
1. Choose **+ New step** (or **+**, then **Add an action**). Search **Google Sheets**, then choose **Get rows**.
2. When asked, choose **Sign in**. Use the **Houston ISD Google account that owns the tracker sheet**.
3. **File:** browse to **PTO-PTA C1 Reminders (read by Power Automate)**. Use the small sheet, **not** the tracker. **Worksheet:** **C1 Reminders**.

> If saving the flow fails with **"429" / "Too many requests sent to the Google Sheets API"**, Google is briefly limiting requests. Check that **Get rows** points at the small sheet, not the tracker. Then leave the flow alone for 5–10 minutes and click **Save** once. Every time you open a step, Power Automate asks Google again, so clicking around makes it worse.

> If Power Automate says the Google Sheets connection is **blocked by a data policy**, HISD IT has turned it off. Ask IT to allow the Google Sheets connector for your account. Until then, FACE staff can use the **Remind C1s** buttons on the dashboard's Review tab.

> The first time the flow runs, Google Sheets adds a column named `__PowerAppsId__` to the tab. That's normal; leave it.

### 3. For each row, send the email if Send is Yes
1. **+ New step**, search **Apply to each**, and choose it. In **Select an output from previous steps**, choose **value** from **Get rows**.
2. Inside **Apply to each**, choose **Add an action**, search **Condition**, and choose it.
   - Left box: choose **Send** from the dynamic content (under **Get rows**).
   - Middle: **is equal to**.
   - Right box: type `Yes`.
3. Under **If yes**, choose **Add an action**. Search **Office 365 Outlook**, then choose **Send an email from a shared mailbox (V2)**.
   - **Original Mailbox Address:** `ParentOrgDocs@houstonisd.org`
   - **To:** choose **Email** from the dynamic content.
   - **Subject:** choose **Subject**.
   - **Body:** first select the **</>** (code view) button on the body box. Then choose **Message HTML**. Code view makes the list and the dashboard link show properly. Without it, the email can show raw `<p>` and `<li>` tags.
4. Leave **If no** empty.
5. Choose **Save**.

### 4. Test it
1. In the sheet, choose **PTO/PTA Tracker > C1 reminders: update the list now**. Check that at least one row says **Yes**. For a safe first test, put **your own email** in that C1's Email column, update the list again, and change it back afterwards.
2. In Power Automate, choose **Test**, then **Manually**, then **Run flow**.
3. Check your inbox. The email should come from ParentOrgDocs and list the campuses and documents, with an **Open the PTO/PTA dashboard** link.

### If sending from ParentOrgDocs is refused
The test may fail with **"You are not authorized to send mail on behalf of the specified sending account."** That means your account doesn't have **Send As** permission on the ParentOrgDocs mailbox.
- **Fix:** ask HISD IT to give your account **Send As** permission on `ParentOrgDocs@houstonisd.org`.
- **In the meantime:** delete the shared-mailbox step and add **Office 365 Outlook > Send an email (V2)** in its place, with the same To, Subject and Body. The reminders then come from your own email. When IT has granted Send As, switch back.

---

## Day to day

- **Turn reminders off for a while:** in Power Automate, open the flow and choose **Turn off**.
- **Stop them completely:** in the sheet, choose **PTO/PTA Tracker > C1 reminders: stop updating the list (turn off)**. It also empties the tab, so the flow sends nothing.
- **Change daily to weekly:** change **On these days** in the flow's **Recurrence** step.
- **A C1 isn't getting reminders:** look at their row on the **C1 Reminders** tab. **Note** says *Nothing waiting* or *No email on the Dashboard Sign-ins tab*.
- **The Review tab on the dashboard** says whether automatic reminders are on. Its **Remind C1s** buttons still work for sending one sooner.
- **Check that it ran:** in Power Automate, open the flow. **28-day run history** lists every run and whether it succeeded.
