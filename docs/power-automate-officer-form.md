# Officer form by Power Automate: setup guide

_October 29, 2026. For the PTO/PTA tracker, script version 2026-10-29b or later._

**How it works**
- Someone fills in the **HISD Parent Organization Officer Update Form** (Microsoft Forms).
- A Power Automate flow adds that response as one new row on the tracker's **Officer Form Feed** tab.
- Every hour the tracker imports the new rows: the officers go on the Officers tab, and Officer Information is marked Accepted for the campus. This is the same as **Import officers** after a paste.

Nobody needs to copy and paste any more. A new form shows on the dashboard within about an hour.

Copy-paste still works. You can still paste the Excel export into **Officer Form Paste** and run **Import officers** at any time. A response that is in both places is imported once.

It takes about 20 minutes: part A in the tracker sheet, then part B in Power Automate.

---

## A. Turn it on in the tracker (2 minutes)

1. Open the tracker sheet. Choose **PTO/PTA Tracker > Officer form: import automatically every hour (turn on)**.
2. A new tab, **Officer Form Feed**, appears. Its first row holds one column title for each answer on the form: `ID`, `Completion time`, `What school is your organization associated with?`, and so on, up to `Officer #5: Phone`, then `Your name`, `Your email address` and `Your phone number`.
3. **Do not rename this tab or change its column titles.** Power Automate and the tracker both find the columns by these titles.

---

## B. Build the flow in Power Automate (15 minutes)

Go to **make.powerautomate.com** and sign in with the Houston ISD Microsoft account that can see the officer form's responses.

### 1. Start the flow
1. Choose **+ Create**, then **Automated cloud flow**.
2. Name it `PTO/PTA officer form to tracker`.
3. In **Choose your flow's trigger**, search **new response** and choose **When a new response is submitted** (Microsoft Forms). Click **Create**.
4. In the trigger, set **Form Id** to the officer update form.

### 2. Get the answers
1. Click **+** under the trigger, then **Add an action**. Search **Get response details** and choose it (Microsoft Forms).
2. **Form Id:** the same officer form.
3. **Response Id:** click in the box, then choose **Response Id** from the lightning-bolt list (dynamic content).

### 3. Add the row in the tracker
1. Click **+**, then **Add an action**. Search **Google Sheets** and choose **Insert row**.
2. The first time, it asks you to sign in to Google. **Sign in with the Google account that owns the tracker sheet** (the one you use to edit it). This is the only Google connection the flow needs.
3. **File:** pick the tracker spreadsheet. **Worksheet:** pick **Officer Form Feed**.
4. A box appears for each column title. Fill in each one from the lightning-bolt list (dynamic content) under **Get response details**:

   | Box (column title) | Choose from the list |
   |---|---|
   | ID | **Response Id** |
   | Completion time | **Submission time** |
   | What school is your organization associated with? | the form's school question |
   | What is the name of your organization? | the organization name question |
   | What type of organization is it? | the PTO / PTA / booster club question |
   | Officer #1: Name, Position, Email, Phone | the first officer's four questions |
   | Officer #2 … Officer #5 | the same, for each officer |
   | If you need to submit additional officer information, add it here | the "additional officer information" question, if the form has one |
   | Your name, Your email address, Your phone number | the submitter's questions; for the email, **Responders' Email** also works |

   - Your form's questions may be worded a little differently from the column titles. That is fine: match them by meaning.
   - Leave a box empty if the form has no such question.
5. Click **Save**.

### 4. Test it
1. Fill in the officer form once yourself, for a test campus.
2. In Power Automate, open the flow's **Run history**. The run should say **Succeeded**.
3. In the tracker, the **Officer Form Feed** tab now has a new row.
4. To import it straight away instead of waiting for the hour, choose **PTO/PTA Tracker > Import officers from the Officer Form Paste tab**. It reads the feed too. Check the Officers tab.
5. Delete the test officers from the Officers tab, and the test row from the feed, if you do not want them kept.

---

## Good to know

- **The feed keeps every row.** You never need to clear it. Rows that are already imported are skipped.
- **A form for a school the tracker does not know** is handled the same way as with a paste: it shows on the Officers tab for you to pick the campus.
- **To stop the automatic import:** choose **PTO/PTA Tracker > Officer form: stop the automatic import**. Turn the flow off in Power Automate too.
- **What happened on the last run:** the tracker keeps a one-line note, for example "Nothing new" or "1 new form response, 3 officers added", in the script's properties (Apps Script > Project Settings > Script Properties > `FEED_LAST`).

## If something goes wrong

| What you see | What to do |
|---|---|
| The flow's run says **429 Too many requests** (Google) | Power Automate tries again by itself. If a run still fails, open it and click **Resubmit**. If it keeps happening, paste the Excel export and run **Import officers** as before. Nothing is lost. |
| The row is on the feed, but no officers appear after an hour | Check that the automatic import is on (part A). Then choose **Import officers** to run it now; its message says what is wrong, for example a form with no campus. |
| **Insert row** does not show the column boxes | Choose the **Officer Form Feed** worksheet again. If the boxes are still missing, check that row 1 of that tab still has the column titles (run part A again: it puts them back on an empty tab). |
| Officers appear under the wrong campus | On the Officers tab, type the right campus in the Campus column, then run **Import officers**. |
