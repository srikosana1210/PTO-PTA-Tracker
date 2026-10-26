# C1 reminders by Power Automate: setup guide

_October 15, 2026. For the PTO/PTA tracker, script version 2026-10-15a or later._

**How it works**
- Every weekday at 8 AM, the tracker works out which C1s have documents waiting for review. It writes them on the **C1 Reminders** tab.
- It then sends those reminders straight to a Power Automate flow.
- The flow emails each C1 from **FACE@houstonisd.org** (ParentOrgDocs until 2026-10-26).

C1s with nothing waiting get no email. Once it's set up, nobody has to click anything.

> **Why it changed (October 15):** the first version had Power Automate read the Google Sheet. Google kept refusing those reads ("429 Too many requests"). Now Power Automate never reads Google; the tracker sends the reminders to it instead. If you built the earlier flow (Recurrence > Get rows > ...), **turn it off or delete it**. You build a new, simpler one below.

It takes about 15 minutes: part A in Power Automate, then part B in the tracker sheet.

---

## A. Build the flow in Power Automate (10 minutes)

Go to **make.powerautomate.com** and sign in with your Houston ISD Microsoft account.

### 1. Start the flow
1. Choose **+ Create**, then **Instant cloud flow** (or **Automated cloud flow**, or **Create from blank**; any of them works).
2. Name it `PTO/PTA C1 reminders`. If you're asked to choose a trigger, choose **Skip**.
3. Click the empty first step (or **Add a trigger**). Search **Teams webhook** and choose **When a Teams webhook request is received**. It's under **Microsoft Teams**.
4. In its settings, set **Who can trigger the flow** to **Anyone**. The tracker isn't a Microsoft account, so it needs "Anyone". The link stays private: only someone who has the full link can use it.

### 2. Go through each reminder
1. Click **+** under the first step, then **Add an action**. Search **Apply to each** and choose it (under **Control**).
2. Click in **Select an output from previous steps**. Click the **fx** button, paste this, and click **Add**:
   ```
   triggerBody()?['attachments']?[0]?['content']?['reminders']
   ```

### 3. Send each email
1. Inside **Apply to each**, click **+**, then **Add an action**. Search **shared mailbox** and choose **Send an email from a shared mailbox (V2)** (Office 365 Outlook).
2. Fill it in. For each formula: click in the box, click **fx**, paste the formula, and click **Add**.

   | Box | What to put |
   |---|---|
   | **Original Mailbox Address** | type `FACE@houstonisd.org` |
   | **To** | `items('Apply_to_each')?['to']` |
   | **Subject** | `items('Apply_to_each')?['subject']` |
   | **Body** | click the **`</>`** (code view) button on the body box **first**, then **fx**: `items('Apply_to_each')?['body']` |

   If your loop is named something else, such as "Apply to each 1", use that name with spaces replaced by underscores: `items('Apply_to_each_1')?['to']`.
3. Click **Save**.

### 4. Copy the flow's link
After saving, click the first step, **When a Teams webhook request is received**. It now shows an **HTTP URL**, a long link starting with `https://`. Click the **copy** icon next to it.

---

## B. In the tracker sheet (5 minutes)

1. **Install the new script.** Paste the new `Code.gs` and `Dashboard.html` into Apps Script and save. Then choose **Deploy > Manage deployments > Edit > New version > Deploy**. The dashboard footer should read **2026-10-15a**.
2. **Add each C1's email** in the **Email** column of the **Dashboard Sign-ins** tab, if you haven't already.
3. Reload the sheet. Choose **PTO/PTA Tracker > C1 reminders: connect to Power Automate**, paste the link from A4, and click **OK**. Google may ask you to approve access again, because the script now sends to a web address. Choose your account, then **Allow**.
4. **Test it.** For a safe test, put **your own email** in one C1's Email column. That C1 must have something waiting for review. Then choose **PTO/PTA Tracker > C1 reminders: send now (test)**. The email should arrive from FACE@houstonisd.org within a few minutes, listing the campuses and documents with an **Open the PTO/PTA dashboard** link. Then put the C1's real email back.
5. **Turn it on.** Choose **PTO/PTA Tracker > C1 reminders: send every weekday at 8 AM (turn on)**.

---

## The C1 Reminders tab

The tracker rewrites this tab every time it updates the list. Don't rename it or its column headings.

| Column | What it holds |
|---|---|
| **Send** | **Yes** = this C1 gets an email. **No** = nothing waiting, or no email on file (see **Note**) |
| **C1**, **Email** | Who it goes to |
| **Campuses**, **Waiting** | Their campuses with documents waiting, and how many documents |
| **Subject**, **Body** | The email (Body is in HTML, so the list and link look right) |
| **Text** | The same email as plain text, for reading |
| **Note** | Why a C1 gets no email, or "Sent to Power Automate" with the date and time |
| **Updated** | When the list was last updated |

To see the list without sending anything, choose **C1 reminders: update the list now (sends nothing)**.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| "Power Automate did not accept the reminders (it answered 4xx)" | Check that the flow is **turned on**, and that **Who can trigger the flow** is **Anyone**. If you made a new flow, connect the tracker to its new link (B3). |
| "Not a Power Automate link" | Copy the whole **HTTP URL** from the flow's first step again. It's only there after the flow is saved. |
| The email arrives with raw `<p>` and `<li>` text | In the email step, delete the Body formula, click **`</>`** first, then add the formula again. |
| "You are not authorized to send mail on behalf of…" (in the flow's run history) | Your account needs **Send As** permission on the FACE@houstonisd.org mailbox from IT. In the meantime, use **Send an email (V2)** with the same three formulas; it sends from your own email. |
| The flow shows a failed run at the **Apply to each** step | Open the run, click the first step, and look at **Outputs**. Send a screenshot of the body to whoever maintains the tracker. |
| A C1 got no email | Their row on **C1 Reminders**: **Note** says *Nothing waiting* or *No email on the Dashboard Sign-ins tab*. |

**Day to day**
- **Stop the reminders:** choose **C1 reminders: stop sending (turn off)**.
- **Pause just the emails:** turn the flow off in Power Automate.
- **See what was sent:** open the flow; **28-day run history** lists every run.
- **The dashboard's Review tab** shows one line, "C1 reminders · automatic", once the flow is connected and turned on. The **Remind C1s** email buttons only come back while automatic reminders are off.
- **No email on Saturday or Sunday:** reminders go out Monday to Friday only.
