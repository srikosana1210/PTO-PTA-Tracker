/**
 * PTO/PTA Registration Tracker
 * Houston ISD Family and Community Engagement
 *
 * Lives in the tracker Google Sheet (Extensions > Apps Script) next to Dashboard.html.
 *
 * What it does
 *   1. Creates a Google Form for whoever works the ParentOrgDocs inbox.
 *   2. When the form is submitted, moves each uploaded file into that campus's Drive folder,
 *      renames it, marks the item Received in the Campus Register tab, and adds a row to the Submission Log tab.
 *   3. Imports the officer update form (paste its Excel export into the Officer Form Paste tab): one row per officer,
 *      campus taken from the form's school question, and Officer Information marked Received.
 *   4. Serves the dashboard as a web page that reads the tabs every time it is opened. Clicking a campus shows its
 *      checklist, what is pending, its activity, and (for staff only) its officers.
 *   5. Lets C1s and FACE staff go through each campus's checklist on the dashboard: each document is there, needs correction, is not
 *      there, or is not needed for that PTO/PTA, with a remark, plus overall remarks for the PTO/PTA (saveChecklist).
 *   6. Helps them email the PTO/PTA about what is still needed and what needs correction, with those remarks. The dashboard writes the
 *      email (to the officers, copying INBOX) and opens it in Outlook for the person to send; this script cannot send from Outlook, so it
 *      sends nothing. logResendRequest only writes a line in the Submission Log after the person says they sent it.
 *   7. Lists every campus of every Area Office from the Area Office Campuses tab (addAreaCampuses), marking the campuses the Texas PTA
 *      roster lists as PTAs.
 *
 * Do not rename the tabs or the column headers in the sheet: the script finds things by those names.
 */

var CFG = {
  TAB_REGISTER: 'Campus Register',
  TAB_LOG: 'Submission Log',
  TAB_SETTINGS: 'Settings',
  TAB_OFFICERS: 'Officers',
  TAB_PASTE: 'Officer Form Paste',
  TAB_C1: 'C1 Assignments',
  TAB_SIGNINS: 'Dashboard Sign-ins',
  TAB_PASS: 'New Passcodes',
  TAB_CAMPUSES: 'Area Office Campuses',
  FORM_TITLE: 'PTO/PTA Documents Received',
  ROOT_DOCS: 'Parent Org Documents',
  DASHBOARD_TITLE: 'PTO/PTA Registration',
  // The mailbox the PTO/PTAs send documents to. The "ask them to resend" email copies it, so a reply comes back to the people who work it.
  INBOX: 'ParentOrgDocs@houstonisd.org',
  // One entry per requirement. key = column header in Campus Register. title = form question title. label = the words FACE uses for it
  // everywhere (dashboard, emails, Start Here); the dashboard has the same labels in its DOCS list.
  // A file question is matched by the START of its title (or of any formAliases entry), so the wording after the key can be changed freely.
  // reg = counts toward Registered. optional = tracked, but not needed to be Legalized. Both are the defaults: the Settings tab
  // ("Counts toward Registered?" and "Needed to be Legalized?" rows) overrides them. Optional items stay last in the list.
  // Everything is filed in the campus's folder under Parent Org Documents.
  ITEMS: [
    { key: 'Bylaws',                    title: 'Bylaws',                                                                          upload: true,  reg: true,
      label: 'The organization\'s bylaws' },
    { key: 'Officer Information',       title: 'Officer Information form submitted',                                              upload: false, reg: true,
      label: 'The officer information form' },
    { key: 'Training Certificate',      title: 'Training Certificate',                                                            upload: true,  reg: true,
      label: 'Training certificate' },
    { key: 'Budget or Financial Report', title: 'Budget or Financial Report (annual budget report, or meeting minutes showing budget approval)', upload: true,
      label: 'Annual budget report or meeting minutes showing budget approval' },
    { key: 'Proof of 501c Status',      title: 'Proof of 501c Status',                                                            upload: true,
      label: 'Proof of 501(c) status' },
    // Called Bank and EIN Letter from 2026-10-02 to 2026-10-09; FACE no longer asks for the Tax ID (EIN) letter. The old names still work
    // (a column, a form question or a log line that uses one is read as this item), and updateOctober2026 renames the column.
    { key: 'Bank Verification Letter',  title: 'Bank Verification Letter (letter from the financial institution listing two authorized account signers)', upload: true,
      formAliases: ['Bank and EIN Letter', 'Bank Account Info', 'Tax ID EIN Letter'], headerAliases: ['Bank and EIN Letter', 'Bank Account Info'],
      label: 'Bank account verification letter from financial institution listing two authorized account signers' },
    // Not needed to be Legalized since 2026-10-09 (FACE's wording lists six documents). Still tracked when a PTO/PTA sends it.
    { key: 'Articles of Incorporation', title: 'Articles of Incorporation',                                                       upload: true,  optional: true,
      label: 'Articles of incorporation' },
    { key: 'Insurance',                 title: 'Insurance (liability and property). Optional',                                    upload: true,  optional: true,
      label: 'Liability and property insurance' }
  ],
  // A file question starting with this holds several documents in one file, or anything else. The file is filed in the campus folder
  // and logged, and changes no item: a reviewer opens it and checks off on the dashboard what it contains.
  Q_OTHER: 'Other documents',
  // Names the tracker used before 2026-10-02 (see updateDocumentList).
  OLD_BANK_HEADER: 'Bank Account Info',
  OLD_TAX_HEADER: 'Tax ID EIN Letter',
  PREV_BANK_HEADER: 'Bank and EIN Letter',
  RETIRED_TAX_HEADER: 'Tax ID EIN Letter (retired)',
  OLD_BANK_FOLDER_PROP: 'ROOT_BANK_ID',
  Q_CAMPUS: 'Campus',
  Q_HAS_PTO: 'Has PTO or PTA',
  Q_ORG_TYPE: 'Org Type',
  Q_ORG_NAME: 'Org Name',
  Q_NOTES: 'Notes',
  HAS_PTO: ['Yes', 'No', 'Not Yet Confirmed'],
  ORG_TYPES: ['PTA', 'PTO', 'SPO', 'PAC'],
  // Not Needed: a reviewer decided this PTO/PTA does not need the document (for example a PTA covered by Texas PTA). It counts as done.
  STATUS_CODE: { 'Accepted': 'A', 'Received': 'R', 'Needs Correction': 'C', 'Not Received': 'N', 'Not Needed': 'X' },
  ITEM_STATUSES: ['Not Received', 'Received', 'Accepted', 'Needs Correction', 'Not Needed'],
  LOG_HEADERS: ['Received', 'Submitted By', 'Campus', 'Document Type', 'File Name', 'File Link', 'School Year', 'Notes'],
  OFFICER_HEADERS: ['Response ID', 'Submitted', 'School Year', 'Campus', 'Match', 'Officer #', 'Name', 'Position', 'Email', 'Phone',
    'Organization', 'Org Type', 'Submitted By', 'Submitter Email', 'Submitter Phone', 'Additional Info', 'Added To Register', 'Notes']
};
var VERSION = 'Script version 2026-10-09b (checklist review with remarks, every campus listed, Legalized = six documents, no EIN letter)';
var M_OK = 'Matched', M_PICK = 'Pick a campus', M_NONE = 'School not on the roster', M_HAND = 'Picked by hand', M_BAD = 'Campus name not found';

/* ================================================================== menu */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('PTO/PTA Tracker')
    .addItem('1. Create the form (first time only)', 'createForm')
    .addItem('2. Check setup', 'checkSetup')
    .addItem('Update to the new document list (run once)', 'updateDocumentList')
    .addItem('Update the tracker: October 2026 changes (run once)', 'updateOctober2026')
    .addSeparator()
    .addItem('Add every campus from the Area Office Campuses tab', 'addAreaCampuses')
    .addItem('Import officers from the Officer Form Paste tab', 'importOfficers')
    .addSeparator()
    .addItem('Dashboard sign-ins: set up and make passcodes', 'setUpSignIns')
    .addItem('Dashboard sign-ins: new passcode for one person', 'newPasscode')
    .addItem('Dashboard: check that it works', 'checkDashboard')
    .addItem('Show form and dashboard links', 'showLinks')
    .addSeparator()
    .addItem('Refresh the campus list in the form', 'refreshCampusList')
    .addItem('Start a new school year', 'startNewYear')
    .addToUi();
}

/* ================================================================== form setup */

/** Creates the form, the two Drive root folders and the submit trigger. Run once. */
function createForm() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORM_ID')) {
    ui.alert('The form already exists', 'Use "Show form and dashboard links" to open it.', ui.ButtonSet.OK);
    return;
  }
  var campuses = campusNames_();
  if (!campuses.length) { ui.alert('The Campus Register tab has no campuses yet.'); return; }

  var form = FormApp.create(CFG.FORM_TITLE);
  form.setDescription('Use this form once for each PTO/PTA email received at ParentOrgDocs. ' +
    'Pick the campus, say whether it has a PTO or PTA, and attach whatever documents came in. ' +
    'Each file is filed in that campus\'s folder automatically. Leave a question empty if that document did not arrive.');
  form.setCollectEmail(true);
  form.setConfirmationMessage('Recorded. The files were filed in the campus folder and the tracker was updated.');
  form.addListItem().setTitle(CFG.Q_CAMPUS).setChoiceValues(campuses).setRequired(true);
  form.addMultipleChoiceItem().setTitle(CFG.Q_HAS_PTO).setChoiceValues(CFG.HAS_PTO).setRequired(true);
  form.addListItem().setTitle(CFG.Q_ORG_TYPE).setChoiceValues(CFG.ORG_TYPES).setRequired(false);
  form.addTextItem().setTitle(CFG.Q_ORG_NAME).setRequired(false);
  form.addCheckboxItem().setTitle(itemByKey_('Officer Information').title)
    .setChoiceValues(['Yes. Only for an officer form that arrived by email. Officers from the Microsoft form are imported separately.']).setRequired(false);
  form.addParagraphTextItem().setTitle(CFG.Q_NOTES).setRequired(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, SpreadsheetApp.getActive().getId());
  props.setProperty('FORM_ID', form.getId());

  installTrigger_(form);
  rootFolder_();

  var lines = ['The form, the Drive folder and the trigger are ready.', '',
    'One step is left that Google does not let a script do. Open the form editor and add a "File upload" question for each of these, in this order:', ''];
  CFG.ITEMS.forEach(function (it) { if (it.upload) lines.push('   ' + it.title); });
  lines.push('   ' + OTHER_TITLE);
  lines.push('', 'For each one: Question type = File upload, allow PDF, Document and Image, maximum 5 files, 100 MB, leave it not required.',
    'Then run "2. Check setup" from the menu.', '', 'Form editor: ' + form.getEditUrl());
  ui.alert('Form created', lines.join('\n'), ui.ButtonSet.OK);
}

function installTrigger_(form) {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
}

/** Shows what is wrong (if anything). Also puts back the submit trigger if it went missing. */
function checkSetup() {
  var ui = SpreadsheetApp.getUi();
  var r = checkSetup_();
  var msg = r.problems.concat(r.fixed).join('\n');
  if (r.problems.length) ui.alert('Setup needs attention', msg + '\n\n' + VERSION, ui.ButtonSet.OK);
  else ui.alert('Setup looks good', 'The form, trigger, folder and all ' + uploadItems_().length + ' file questions are in place.' + (r.fixed.length ? '\n\n' + r.fixed.join('\n') : '') + '\n\n' + VERSION, ui.ButtonSet.OK);
  return r;
}

function checkSetup_() {
  var problems = [], fixed = [];
  var props = PropertiesService.getScriptProperties();
  var formId = props.getProperty('FORM_ID');
  ['TAB_REGISTER', 'TAB_LOG', 'TAB_SETTINGS'].forEach(function (k) {
    if (!SpreadsheetApp.getActive().getSheetByName(CFG[k])) problems.push('The tab "' + CFG[k] + '" is missing.');
  });
  if (!problems.length) {
    var t = table_(CFG.TAB_REGISTER);
    ['School Year', 'Campus', 'Area Office', 'Has PTO or PTA', 'Org Type', 'Org Name'].concat(CFG.ITEMS.map(function (i) { return i.key; })).forEach(function (h) {
      if (t.col[h] === undefined) problems.push('Campus Register has no column headed "' + h + '".');
    });
  }
  var officersSheet = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_OFFICERS);
  if (officersSheet) {
    var oh = table_(CFG.TAB_OFFICERS);
    CFG.OFFICER_HEADERS.forEach(function (h) { if (oh.col[h] === undefined) problems.push('The Officers tab has no column headed "' + h + '".'); });
  }
  if (!formId) { problems.push('The form has not been created yet. Run "1. Create the form".'); return { problems: problems, fixed: fixed }; }
  var form;
  try { form = FormApp.openById(formId); } catch (err) { problems.push('The form could not be opened (was it deleted?): ' + err.message); return { problems: problems, fixed: fixed }; }
  var hasTrigger = ScriptApp.getProjectTriggers().some(function (tr) { return tr.getHandlerFunction() === 'onFormSubmit'; });
  if (!hasTrigger) { installTrigger_(form); fixed.push('The submit trigger was missing and has been put back.'); }
  var uploadTitles = form.getItems().filter(function (it) { return String(it.getType()) === 'FILE_UPLOAD'; })
    .map(function (it) { return it.getTitle(); });
  CFG.ITEMS.forEach(function (it) {
    if (!it.upload) return;
    var found = uploadTitles.some(function (ti) { return titleIsItem_(ti, it); });
    if (!found) problems.push('The form has no File upload question starting with "' + it.key + '".');
  });
  if (!uploadTitles.some(isOtherTitle_)) fixed.push('Tip: add a File upload question named "' + OTHER_TITLE + '" for an email whose documents are all in one file. Its files are filed in the campus folder, and a reviewer checks off on the dashboard what they contain.');
  uploadTitles.forEach(function (ti) {
    if (isOtherTitle_(ti)) return;
    if (!CFG.ITEMS.some(function (it) { return it.upload && titleIsItem_(ti, it); })) problems.push('The file question "' + ti + '" does not start with one of the item names, so its files will not be filed.');
  });
  // Older bank questions still file correctly (they all go to Bank Verification Letter). Say so, and say what to tidy.
  var oldOnes = uploadTitles.filter(function (ti) {
    var it = itemForTitle_(ti);
    return it && it.key === 'Bank Verification Letter' && !startsWith_(ti, it.key);
  });
  if (oldOnes.length) fixed.push('Tip: the form still has the old question' + (oldOnes.length === 1 ? '' : 's') + ' "' + oldOnes.join('", "') + '". ' + (oldOnes.length === 1 ? 'It still files correctly. ' : 'They still file correctly. ') + 'Rename ' + (oldOnes.length === 1 ? 'it' : 'one') + ' to "' + itemByKey_('Bank Verification Letter').title + '"' + (oldOnes.length === 1 ? '' : ' and delete the other') + ', so the form uses the new name and no longer mentions the EIN letter.');
  return { problems: problems, fixed: fixed };
}

function showLinks() {
  var ui = SpreadsheetApp.getUi();
  var formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  var lines = [];
  if (formId) {
    var form = FormApp.openById(formId);
    lines.push('Form (for the person on the inbox):', form.getPublishedUrl(), '', 'Form editor:', form.getEditUrl(), '');
  } else lines.push('The form has not been created yet.', '');
  var url = dashboardUrl_();
  lines.push('Dashboard (one address for everyone):', url || 'Not deployed yet. In the Apps Script editor choose Deploy > New deployment > Web app.');
  lines.push('', 'Leadership just opens it. C1s and FACE staff choose Sign in on the page and use their own passcode (see "Dashboard sign-ins: set up and make passcodes").');
  lines.push('', 'If it says "Sorry, unable to open the file", open it in a private window signed in to only your Houston ISD Google account. If it still fails, choose "Dashboard: check that it works".');
  ui.alert('Links', lines.join('\n'), ui.ButtonSet.OK);
}

function dashboardUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (err) { return ''; }
}

function makeKey_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); }

/** Re-reads the Campus Register and updates the form's Campus dropdown. Use after adding campuses. */
function refreshCampusList() {
  var ui = SpreadsheetApp.getUi();
  if (!PropertiesService.getScriptProperties().getProperty('FORM_ID')) { ui.alert('The form has not been created yet.'); return; }
  var n = syncFormCampuses_();
  ui.alert(n ? 'The form now lists ' + n + ' campuses.' : 'Could not find the Campus question in the form.');
}

/** Puts the Campus Register's campuses into the document form's Campus dropdown. Returns how many it listed, 0 if it could not, -1 when there is no form yet. */
function syncFormCampuses_() {
  var formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) return -1;
  var names = campusNames_(), done = false;
  FormApp.openById(formId).getItems().forEach(function (it) {
    if (!done && it.getTitle() === CFG.Q_CAMPUS && String(it.getType()) === 'LIST') { it.asListItem().setChoiceValues(names); done = true; }
  });
  return done ? names.length : 0;
}

/* ================================================================== submit handler */

/** Form submit trigger. */
function onFormSubmit(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var sub = parseResponse_(e.response);
    try {
      processSubmission_(sub);
    } catch (err) {
      appendLog_([[sub.timestamp, sub.email, sub.campus, '', '', '', '', 'ERROR, nothing was filed: ' + err.message]]);
      throw err;
    }
  } finally {
    lock.releaseLock();
  }
}

/** Turns a FormResponse into a plain object. */
function parseResponse_(response) {
  var sub = { timestamp: response.getTimestamp(), email: '', campus: '', hasPto: '', orgType: '', orgName: '', notes: '', officer: false, uploads: [], unknown: [], other: [] };
  try { sub.email = response.getRespondentEmail() || ''; } catch (err) { sub.email = ''; }
  response.getItemResponses().forEach(function (ir) {
    var item = ir.getItem(), title = String(item.getTitle()).trim(), type = String(item.getType()), val = ir.getResponse();
    if (type === 'FILE_UPLOAD') {
      var ids = Array.isArray(val) ? val : (val ? [val] : []);
      var it = itemForTitle_(title);
      if (isOtherTitle_(title)) { if (ids.length) sub.other.push({ ids: ids }); }
      else if (it && it.upload) sub.uploads.push({ item: it, ids: ids });
      else if (ids.length) sub.unknown.push({ title: title, ids: ids });
      return;
    }
    var s = Array.isArray(val) ? val.join(', ') : String(val == null ? '' : val).trim();
    if (title === CFG.Q_CAMPUS) sub.campus = s;
    else if (title === CFG.Q_HAS_PTO) sub.hasPto = s;
    else if (title === CFG.Q_ORG_TYPE) sub.orgType = s;
    else if (title === CFG.Q_ORG_NAME) sub.orgName = s;
    else if (title === CFG.Q_NOTES) sub.notes = s;
    else if (startsWith_(title, 'Officer Information')) sub.officer = Array.isArray(val) ? val.length > 0 : !!s;
  });
  return sub;
}

/** Files, register and log for one submission. */
function processSubmission_(sub) {
  if (!sub.campus) throw new Error('The submission has no campus.');
  var settings = readSettings_();
  var year = schoolYearFor_(sub.timestamp, settings.startMonth);
  var dateStr = Utilities.formatDate(sub.timestamp, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var t = table_(CFG.TAB_REGISTER);
  var rowNum = ensureRegisterRow_(t, year, sub.campus);
  t = table_(CFG.TAB_REGISTER);
  var logRows = [];

  // Has PTO or PTA, org type and name. A "Not Yet Confirmed" answer never overwrites a Yes or a No. A campus that sends documents has a
  // PTO/PTA: when the answer is Not Yet Confirmed (or blank) and something was attached, it becomes Yes, unless the register says No.
  var cur = String(t.values[rowNum - 1][t.col['Has PTO or PTA']] || '').trim();
  var sent = sub.officer || sub.other.length > 0 || sub.uploads.some(function (u) { return u.ids.length > 0; });
  var pto = sub.hasPto;
  if ((!pto || pto === 'Not Yet Confirmed') && sent && cur !== 'No') pto = 'Yes';
  if (pto && (pto !== 'Not Yet Confirmed' || (cur !== 'Yes' && cur !== 'No'))) setCell_(t, rowNum, 'Has PTO or PTA', pto);
  if (sub.orgType) setCell_(t, rowNum, 'Org Type', sub.orgType);
  if (sub.orgName) setCell_(t, rowNum, 'Org Name', sub.orgName);
  var anything = false;

  sub.uploads.forEach(function (u) {
    var used = {};
    u.ids.forEach(function (id) {
      anything = true;
      var f = fileIntoCampus_(id, sub.campus, year, u.item.key, dateStr);
      logRows.push([sub.timestamp, sub.email, sub.campus, u.item.key, f.name, f.link, year, f.note]);
    });
    if (u.ids.length) setCell_(t, rowNum, u.item.key, 'Received');   // a new file always goes back to review
  });

  sub.other.forEach(function (u) {
    u.ids.forEach(function (id) {
      anything = true;
      var f = fileIntoCampus_(id, sub.campus, year, OTHER_TITLE, dateStr);
      logRows.push([sub.timestamp, sub.email, sub.campus, OTHER_TITLE, f.name, f.link, year, f.note || 'Check what this file contains and check off each document on the dashboard.']);
    });
  });

  sub.unknown.forEach(function (u) {
    anything = true;
    u.ids.forEach(function (id) {
      var link = '', nm = '';
      try { var f = DriveApp.getFileById(id); link = f.getUrl(); nm = f.getName(); } catch (err) { /* ignore */ }
      logRows.push([sub.timestamp, sub.email, sub.campus, '', nm, link, year, 'Not filed: the form question "' + u.title + '" does not match a requirement. Rename the question or move the file by hand.']);
    });
  });

  if (sub.officer) {
    anything = true;
    setCell_(t, rowNum, 'Officer Information', 'Received');
    logRows.push([sub.timestamp, sub.email, sub.campus, 'Officer Information', '(officer information form)', '', year, sub.notes || '']);
  }

  if (!anything || sub.notes) {
    var bits = [];
    if (!anything && sub.hasPto) bits.push('Has PTO or PTA: ' + sub.hasPto);
    if (sub.notes && !sub.officer) bits.push(sub.notes);
    if (bits.length) logRows.push([sub.timestamp, sub.email, sub.campus, '', '', '', year, bits.join('. ')]);
  }
  if (logRows.length) appendLog_(logRows);
  return { year: year, row: rowNum, logged: logRows.length };
}

/** Renames one uploaded file "year - what - campus" and moves it into the campus folder. Returns { name, link, note }; note says why not. */
function fileIntoCampus_(id, campus, year, what, dateStr) {
  var out = { name: '', link: '', note: '' };
  try {
    var file = DriveApp.getFileById(id);
    var folder = campusFolder_(rootFolder_(), campus);
    var name = uniqueName_(folder, year + ' - ' + what + ' - ' + safeName_(campus), extensionOf_(file.getName()), dateStr);
    file.setName(name);
    file.moveTo(folder);
    out.name = name; out.link = file.getUrl();
  } catch (err) {
    out.note = 'Could not file this document (' + err.message + '). It is still in the form\'s upload folder in Drive.';
    try { out.link = DriveApp.getFileById(id).getUrl(); out.name = DriveApp.getFileById(id).getName(); } catch (err2) { /* leave blank */ }
  }
  return out;
}

var OTHER_TITLE = CFG.Q_OTHER;
function isOtherTitle_(title) { return startsWith_(title, CFG.Q_OTHER); }

/** Finds the campus row for the school year, or creates one (from last year's row when there is one). */
function ensureRegisterRow_(t, year, campus) {
  var found = findRow_(t, year, campus);
  if (found) return found;
  var row = firstEmptyRow_(t);
  writeInputRows_(t, row, [newRegisterObj_(t, year, campus, carrySettings_())]);
  return row;
}

/** A new Campus Register row: nothing received, Has PTO or PTA Not Yet Confirmed, or carried over from the campus's latest earlier year. */
function newRegisterObj_(t, year, campus, carry) {
  var prev = latestRowFor_(t, campus, year);
  var obj = { 'School Year': year, 'Campus': campus, 'Area Office': '', 'Has PTO or PTA': 'Not Yet Confirmed', 'Org Type': '', 'Org Name': '' };
  CFG.ITEMS.forEach(function (it) { obj[it.key] = 'Not Received'; });
  if (prev) {
    ['Area Office', 'Has PTO or PTA', 'Org Type', 'Org Name'].forEach(function (h) { obj[h] = prev[h]; });
    CFG.ITEMS.forEach(function (it) { if (carry[it.key] === 'One-time') obj[it.key] = prev[it.key] || 'Not Received'; });
  }
  return obj;
}

/* ================================================================== officer import */

/**
 * Menu: reads the Officer Form Paste tab (the Excel export of the "HISD Parent Organization Officer Update Form" pasted in
 * at A1), adds every response that is not already in the Officers tab (one row per officer, up to five per response),
 * takes the campus from the form's school question, and marks Officer Information Received for that campus.
 * Safe to run again and again: responses already imported are skipped.
 */
function importOfficers() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = importOfficers_();
    ui.alert('Officers imported', officerSummary_(r), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Nothing was imported', err.message, ui.ButtonSet.OK);
  }
}

function plural_(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

function officerSummary_(r) {
  var L = [];
  L.push('Read ' + plural_(r.read, 'form response', 'form responses') + ': ' + r.added + ' new, ' + r.already + ' already imported.');
  if (r.added) L.push(plural_(r.officers, 'officer was', 'officers were') + ' added to the Officers tab.');
  if (r.registerSet) L.push('Officer Information was marked Received for ' + plural_(r.registerSet, 'campus', 'campuses') + '.');
  if (r.newCampuses && r.newCampuses.length) {
    L.push('', plural_(r.newCampuses.length, 'campus was', 'campuses were') + ' not on the Campus Register, so ' + (r.newCampuses.length === 1 ? 'it was' : 'they were') + ' added: ' + r.newCampuses.join(', ') + '. Area Office is blank for ' + (r.newCampuses.length === 1 ? 'it' : 'them') + '; fill it in on the Campus Register.');
    if (r.formSynced > 0) L.push('The document form\'s campus list was updated.');
    else if (r.formSynced === 0) L.push('The document form\'s campus list could not be updated. Use "Refresh the campus list in the form" from the menu.');
  }
  if (r.pick) L.push('', plural_(r.pick, 'form needs', 'forms need') + ' a campus picked. On the Officers tab, filter the Match column for "' + M_NONE + '" or "' + M_PICK + '", type the campus in the Campus column, then run this import again.');
  if (r.bad) L.push('', plural_(r.bad, 'Campus entry was', 'Campus entries were') + ' not recognized. Use a name from the Campus Register. A campus the register does not have is added only when it is typed exactly as the form spelled it (the Notes column shows that spelling), or when its Campus cell is cleared.');
  if (r.noPto) L.push('', plural_(r.noPto, 'form is', 'forms are') + ' from a campus marked No for PTO/PTA in the register. Check the Notes column.');
  if (r.madeYes) L.push('', plural_(r.madeYes, 'campus is', 'campuses are') + ' now marked as having a PTO/PTA (Has PTO or PTA = Yes), because an officer form arrived for ' + (r.madeYes === 1 ? 'it' : 'them') + '.');
  if (r.empty) L.push('', plural_(r.empty, 'response listed', 'responses listed') + ' no officers and ' + (r.empty === 1 ? 'was' : 'were') + ' skipped.');
  if (r.booster) L.push('', plural_(r.booster, 'response is', 'responses are') + ' from a booster club and ' + (r.booster === 1 ? 'was' : 'were') + ' left out. Booster clubs are not tracked, so nothing was added to the Officers tab or the Campus Register for ' + (r.booster === 1 ? 'it' : 'them') + '.');
  return L.join('\n');
}

/** The work of the import, separated from the dialog so it can be tested. */
function importOfficers_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { return importOfficersLocked_(); } finally { lock.releaseLock(); }
}

function importOfficersLocked_() {
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone();
  var settings = readSettings_();
  var res = { read: 0, added: 0, officers: 0, already: 0, registerSet: 0, pick: 0, bad: 0, noPto: 0, madeYes: 0, empty: 0, booster: 0, newCampuses: [], formSynced: -1 };

  var paste = ss.getSheetByName(CFG.TAB_PASTE);
  if (!paste) { ensureTab_(CFG.TAB_PASTE, null); throw new Error('The tab "' + CFG.TAB_PASTE + '" was missing, so it has been added. Paste the Excel export of the officer update form into it, starting at cell A1 with the column titles, then run the import again.'); }
  var recs = parsePaste_(paste.getDataRange().getValues());
  res.read = recs.length;

  ensureTab_(CFG.TAB_OFFICERS, CFG.OFFICER_HEADERS);
  var ot = table_(CFG.TAB_OFFICERS);
  CFG.OFFICER_HEADERS.forEach(function (h) { if (ot.col[h] === undefined) throw new Error('The Officers tab has no column headed "' + h + '".'); });

  // responses already imported
  var seen = {};
  for (var i = 1; i < ot.values.length; i++) {
    var rv = ot.values[i];
    var id0 = cellText_(rv[ot.col['Response ID']]);
    var em0 = cellText_(rv[ot.col['Submitter Email']]).toLowerCase();
    if (!id0 && !em0) continue;
    seen[responseKey_(id0, em0, rv[ot.col['Submitted']], tz)] = true;
  }

  var map = campusMap_();
  var fresh = [];
  recs.forEach(function (rec) {
    var when = rec.done || rec.start || null;
    var key = responseKey_(rec.id, rec.byEmail.toLowerCase(), when, tz);
    if (seen[key]) { res.already++; return; }
    if (boosterClub_(rec.orgName, rec.orgType)) { res.booster++; return; }   // not recorded: nothing is added to the Officers tab, the register or the log
    if (!rec.officers.length) { res.empty++; return; }
    seen[key] = true;
    var year = schoolYearFor_(when || new Date(), settings.startMonth);
    var unlisted = unlistedSchool_(rec.school, map);
    if (unlisted) { addCampus_(unlisted, year, rec.orgName, rec.orgType, map, res); rec.addedCampus = unlisted; }
    res.added++;
    officerRows_(rec, map, year, when).forEach(function (o) { fresh.push(o); });
  });
  res.officers = fresh.length;
  if (fresh.length) {
    var start = ot.sh.getLastRow() + 1;
    if (start < 2) start = 2;
    var need = start + fresh.length - 1;
    if (need > ot.sh.getMaxRows()) ot.sh.insertRowsAfter(ot.sh.getMaxRows(), need - ot.sh.getMaxRows());
    ['Response ID', 'School Year', 'Phone', 'Submitter Phone'].forEach(function (h) { ot.sh.getRange(start, ot.col[h] + 1, fresh.length, 1).setNumberFormat('@'); });
    var block = fresh.map(function (o) { return CFG.OFFICER_HEADERS.map(function (h) { return o[h] == null ? '' : o[h]; }); });
    ot.sh.getRange(start, 1, fresh.length, CFG.OFFICER_HEADERS.length).setValues(block);
    ot.sh.getRange(start, ot.col['Submitted'] + 1, fresh.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  }

  // second pass over every row: resolve hand-typed campuses, update the register
  ot = table_(CFG.TAB_OFFICERS);
  var rt = table_(CFG.TAB_REGISTER);
  var oc = ot.col, today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var rowKey = function (v) { return responseKey_(cellText_(v[oc['Response ID']]), cellText_(v[oc['Submitter Email']]).toLowerCase(), v[oc['Submitted']], tz); };
  var isBlank = function (v) { return !cellText_(v[oc['Response ID']]) && !cellText_(v[oc['Name']]) && !cellText_(v[oc['Submitter Email']]); };

  // a campus typed on one row of a response is used for the response's other blank rows
  var typed = {};
  for (var a = 1; a < ot.values.length; a++) {
    var va = ot.values[a]; if (isBlank(va)) continue;
    var ca = cellText_(va[oc['Campus']]);
    if (ca && !typed[rowKey(va)]) typed[rowKey(va)] = ca;
  }

  var flagged = {}, applied = {}, warned = {}, setCampuses = {};
  for (var r = 1; r < ot.values.length; r++) {
    var v = ot.values[r], rowNum = r + 1;
    if (isBlank(v)) continue;
    var key = rowKey(v);
    // a booster club imported by an earlier version stays out of the register
    if (!cellText_(v[oc['Added To Register']]) && boosterClub_(v[oc['Organization']], v[oc['Org Type']])) {
      if (!flagged['boo|' + key]) { flagged['boo|' + key] = true; res.booster++; setCell_(ot, rowNum, 'Notes', addNote_(v[oc['Notes']], 'Booster club: not added to the register.')); }
      continue;
    }
    var campus = cellText_(v[oc['Campus']]), match = cellText_(v[oc['Match']]);
    if (!campus && typed[key]) { campus = typed[key]; setCell_(ot, rowNum, 'Campus', campus); v[oc['Campus']] = campus; match = ''; }
    if (!campus && (match === M_NONE || match === M_BAD)) {
      // an earlier import left this school for a person; it is added to the register now (or matched, if the register has it by now)
      var sch = unlistedFromNote_(v[oc['Notes']]);
      var found = sch ? adoptSchool_(sch, v, oc, map, res, settings) : '';
      if (found) {
        rt = table_(CFG.TAB_REGISTER);
        campus = found; match = M_NONE;   // counts as stuck below, so it is reported and tidied
        setCell_(ot, rowNum, 'Campus', found); v[oc['Campus']] = found;
      }
    }
    if (campus) {
      var canon = lookup_(map, campus);
      if (!canon) {
        // the name typed in the Campus column is the school the form itself named (and the register lacked), so it is that campus, not a typo
        var formSchool = unlistedFromNote_(v[oc['Notes']]);
        if (formSchool && looseKey_(formSchool) === looseKey_(campus)) {
          canon = adoptSchool_(formSchool, v, oc, map, res, settings);
          if (canon) rt = table_(CFG.TAB_REGISTER);
        }
      }
      if (!canon) {
        if (match !== M_BAD) { setCell_(ot, rowNum, 'Match', M_BAD); setCell_(ot, rowNum, 'Notes', addNote_(v[oc['Notes']], '"' + campus + '" is not a campus in the Campus Register. Check the spelling.')); }
        if (!flagged['bad|' + key]) { flagged['bad|' + key] = true; res.bad++; }
        continue;
      }
      if (canon !== campus) setCell_(ot, rowNum, 'Campus', canon);
      campus = canon;
      var stuck = match !== M_OK && match !== M_HAND, addedNow = stuck && res.newCampuses.indexOf(canon) >= 0;
      if (stuck) { match = addedNow ? M_OK : M_HAND; setCell_(ot, rowNum, 'Match', match); v[oc['Match']] = match; }
      // the "type the campus" / "check the spelling" notes no longer apply; say when the campus was added
      var tidy = tidyNote_(v[oc['Notes']], addedNow);
      if (tidy !== cellText_(v[oc['Notes']])) { setCell_(ot, rowNum, 'Notes', tidy); v[oc['Notes']] = tidy; }
    } else {
      if (!flagged['pick|' + key]) { flagged['pick|' + key] = true; res.pick++; }
      continue;
    }
    if (cellText_(v[oc['Added To Register']])) continue;

    var year = cellText_(v[oc['School Year']]) || schoolYearFor_(new Date(), settings.startMonth);
    var regRow = findRow_(rt, year, campus);
    if (!regRow) { regRow = ensureRegisterRow_(rt, year, campus); rt = table_(CFG.TAB_REGISTER); }
    var reg = rt.values[regRow - 1];
    var col = rt.col['Officer Information'], cur = cellText_(reg[col]);
    if (cur === '' || cur === 'Not Received' || cur === 'Needs Correction') {
      setCell_(rt, regRow, 'Officer Information', 'Received');
      reg[col] = 'Received';
      setCampuses[year + '||' + campus] = true;
    }
    // fill in organization name and type when the register has none; never overwrite
    var orgName = cellText_(v[oc['Organization']]), orgType = orgTypeFrom_(v[oc['Org Type']]);
    if (orgName && !cellText_(reg[rt.col['Org Name']])) { setCell_(rt, regRow, 'Org Name', orgName); reg[rt.col['Org Name']] = orgName; }
    if (orgType && !cellText_(reg[rt.col['Org Type']])) { setCell_(rt, regRow, 'Org Type', orgType); reg[rt.col['Org Type']] = orgType; }

    var wk = key + '||' + campus;
    var pto = cellText_(reg[rt.col['Has PTO or PTA']]);
    if (pto === 'No') {
      if (!warned[wk]) { warned[wk] = true; res.noPto++; }
      setCell_(ot, rowNum, 'Notes', addNote_(v[oc['Notes']], 'The register says this campus has no PTO/PTA.'));
    } else if (pto !== 'Yes') {
      // an officer form means the campus has a parent organization
      setCell_(rt, regRow, 'Has PTO or PTA', 'Yes'); reg[rt.col['Has PTO or PTA']] = 'Yes';
      if (!warned[wk]) { warned[wk] = true; res.madeYes++; }
    }
    if (!applied[wk]) {          // one log row per form response, not per officer
      applied[wk] = true;
      var n = 0; for (var q = 1; q < ot.values.length; q++) if (!isBlank(ot.values[q]) && rowKey(ot.values[q]) === key) n++;
      var when = isDate_(v[oc['Submitted']]) ? v[oc['Submitted']] : new Date();
      appendLog_([[when, cellText_(v[oc['Submitter Email']]), campus, 'Officer Information',
        'Officer form: ' + (orgName || 'organization') + ' (' + plural_(n, 'officer', 'officers') + ')', '', year, '']]);
    }
    setCell_(ot, rowNum, 'Added To Register', today);
  }
  res.registerSet = Object.keys(setCampuses).length;
  if (res.newCampuses.length) {
    try { res.formSynced = syncFormCampuses_(); } catch (err) { res.formSynced = 0; }
  }
  return res;
}

/* ---- schools the register does not have yet ---- */
var NOTE_ADDED = 'This campus was not on the Campus Register, so it was added. Fill in its Area Office.';
var NOTE_NONE_RE = /Not on the roster: .+?\. If this is a campus you track, type its name in the Campus column\./;
var NOTE_BAD_RE = /"[^"]*" is not a campus in the Campus Register\. Check the spelling\./g;

/** The school an earlier import could not place: matched if the register has it now, otherwise added to the register. Returns the campus name, or ''. */
function adoptSchool_(sch, v, oc, map, res, settings) {
  var found = lookup_(map, sch);
  if (found) return found;
  if (!plausibleSchool_(sch)) return '';
  addCampus_(sch, cellText_(v[oc['School Year']]) || schoolYearFor_(new Date(), settings.startMonth), cellText_(v[oc['Organization']]), cellText_(v[oc['Org Type']]), map, res);
  return sch;
}

/** Drops the "type the campus" and "check the spelling" sentences that no longer apply; says the campus was added when it was. */
function tidyNote_(note, added) {
  var n = cellText_(note).replace(NOTE_NONE_RE, '').replace(NOTE_BAD_RE, '').replace(/\s+/g, ' ').trim();
  return added ? addNote_(n, NOTE_ADDED) : n;
}

/** The one school a form response names that the register does not have, or '' (several schools, a school the register has, or nothing usable). */
function unlistedSchool_(schoolText, map) {
  var hits = 0, miss = [];
  splitSchools_(schoolText).forEach(function (s) {
    if (lookup_(map, s)) hits++; else if (miss.indexOf(s) < 0) miss.push(s);
  });
  return hits === 0 && miss.length === 1 && plausibleSchool_(miss[0]) ? miss[0] : '';
}

function plausibleSchool_(s) { s = cellText_(s); return s.length >= 3 && s.length <= 80 && /[A-Za-z]/.test(s); }

/** The school named in a "Not on the roster: X. If this is a campus you track..." note left by an earlier import; '' when it names several. */
function unlistedFromNote_(note) {
  var m = /Not on the roster: (.+?)\. If this is a campus you track, type its name in the Campus column\./.exec(cellText_(note));
  return m && m[1].indexOf(';') < 0 ? m[1].trim() : '';
}

/** Does the organization look like a parent organization? Then the campus has a PTO/PTA. */
/** A booster club (band, athletic and similar) is not a PTO/PTA, so the officer import leaves it out of the tracker. A combined name such as "PTA and Booster Club" still counts as a parent organization. */
function boosterClub_(name, type) {
  var s = String(name == null ? '' : name) + ' ' + String(type == null ? '' : type);
  return /booster/i.test(s) && !parentOrgLike_(name, type);
}
function parentOrgLike_(name, type) {
  var s = ' ' + (String(name == null ? '' : name) + ' ' + String(type == null ? '' : type)).toLowerCase().replace(/[^a-z]+/g, ' ') + ' ';
  return / (pta|ptsa|pto|ptso|spo|pac|pa) /.test(s) || /parent teacher|parent organization|parent association|parent advisory|parent group|home and school/.test(s);
}

/** Adds the campus to the Campus Register for that school year, logs it, and teaches the lookup map about it. */
function addCampus_(name, year, orgName, orgType, map, res) {
  var t = table_(CFG.TAB_REGISTER);
  var row = ensureRegisterRow_(t, year, name);
  t = table_(CFG.TAB_REGISTER);
  if (parentOrgLike_(orgName, orgType)) setCell_(t, row, 'Has PTO or PTA', 'Yes');
  addToMap_(map, name);
  if (res.newCampuses.indexOf(name) < 0) {
    res.newCampuses.push(name);
    appendLog_([[new Date(), '', name, '', '', '', year, 'Campus added to the Campus Register from the officer update form' + (orgName ? ' (' + orgName + ')' : '') + '. Area Office is blank.']]);
  }
}

function cellText_(v) { return v == null ? '' : String(v).trim(); }

function addNote_(existing, text) {
  var e = cellText_(existing);
  return e.indexOf(text) >= 0 ? e : (e ? e + ' ' : '') + text;
}

/** PTA, PTO, SPO or PAC when the typed organization type clearly says one of them; otherwise blank. */
function orgTypeFrom_(text) {
  var s = ' ' + String(text == null ? '' : text).toLowerCase().replace(/[^a-z]+/g, ' ') + ' ';
  var found = [];
  if (/ pta | parent teacher association /.test(s)) found.push('PTA');
  if (/ pto | parent teacher organization /.test(s)) found.push('PTO');
  if (/ spo | school parent organization /.test(s)) found.push('SPO');
  if (/ pac | parent advisory council | parent advisory committee /.test(s)) found.push('PAC');
  return found.length === 1 ? found[0] : '';
}

/** Stable key for one form response, so pasting the same export twice adds nothing. */
function responseKey_(id, email, when, tz) {
  var d = isDate_(when) ? Utilities.formatDate(when, tz, 'yyyy-MM-dd HH:mm:ss') : String(when == null ? '' : when).trim();
  return (id ? 'id:' + id : 'em:' + email) + '|' + d;
}

function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

function toDate_(v) {
  if (isDate_(v)) return v;
  var s = String(v == null ? '' : v).trim();
  if (!s) return null;
  var d = new Date(s);
  return isDate_(d) ? d : null;
}

/** The Officers-tab rows (objects keyed by header) for one form response: one per officer. */
function officerRows_(rec, map, year, when) {
  var schools = splitSchools_(rec.school), hits = [], miss = [];
  schools.forEach(function (s) {
    var c = lookup_(map, s);
    if (c) { if (hits.indexOf(c) < 0) hits.push(c); } else miss.push(s);
  });
  var campus = '', match = '', note = '';
  if (hits.length === 1) {
    campus = hits[0]; match = M_OK;
    if (miss.length) note = 'Also listed (not on the roster): ' + miss.join('; ') + '.';
    if (rec.addedCampus && hits[0] === rec.addedCampus) note = NOTE_ADDED;
  } else if (hits.length > 1) {
    match = M_PICK; note = 'Lists several roster campuses: ' + hits.join('; ') + '. Type the right one in the Campus column.';
  } else {
    match = M_NONE; note = schools.length ? 'Not on the roster: ' + miss.join('; ') + '. If this is a campus you track, type its name in the Campus column.' : 'No school was chosen. Type the campus in the Campus column.';
  }
  return rec.officers.map(function (o, k) {
    return {
      'Response ID': rec.id, 'Submitted': when || '', 'School Year': year, 'Campus': campus, 'Match': match, 'Officer #': o.slot,
      'Name': o.name, 'Position': o.position, 'Email': o.email, 'Phone': o.phone, 'Organization': rec.orgName, 'Org Type': rec.orgType,
      'Submitted By': rec.by, 'Submitter Email': rec.byEmail, 'Submitter Phone': rec.byPhone,
      'Additional Info': k === 0 ? rec.extra : '', 'Added To Register': '', 'Notes': note
    };
  });
}

function splitSchools_(s) {
  return String(s == null ? '' : s).split(/[;\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

/** A leading or trailing * and spacing do not matter when comparing campus names. */
function campusKey_(s) { return String(s == null ? '' : s).replace(/^\s*\*+|\*+\s*$/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

/** A looser key: ignores case, punctuation and spaces, and reads "High School", "Middle School" and "Elementary" as HS, MS and ES. */
function looseKey_(s) {
  return campusKey_(s).replace(/&/g, ' and ').replace(/\bhigh school\b/g, 'hs').replace(/\bmiddle school\b/g, 'ms')
    .replace(/\belementary school\b/g, 'es').replace(/\belementary\b/g, 'es').replace(/\bearly childhood center\b/g, 'ecc').replace(/[^a-z0-9]+/g, '');
}

/** Campus names by key. An exact key (case, spacing and * ignored) wins; the looser key is used only when it points at one campus. */
function campusMap_() {
  var m = { exact: {}, loose: {} };
  campusNames_().forEach(function (n) { addToMap_(m, n); });
  return m;
}
function addToMap_(m, name) {
  m.exact[campusKey_(name)] = name;
  var lk = looseKey_(name);
  if (!lk) return;
  if (m.loose[lk] && m.loose[lk] !== name) m.loose[lk] = null;   // two campuses read the same: never guess between them
  else if (m.loose[lk] === undefined) m.loose[lk] = name;
}
function lookup_(m, s) { return m.exact[campusKey_(s)] || m.loose[looseKey_(s)] || ''; }

// How to recognize each column of the Microsoft Forms export. Titles are matched by their start, case-insensitively,
// so small wording changes do not matter. The five "Do you have additional officers" questions are not needed.
var PASTE_FIELDS = [
  ['id', [/^id$/]],
  ['start', [/^start time$/]],
  ['done', [/^completion time$/]],
  ['school', [/^what school is your organization/, /^what school/]],
  ['orgName', [/^what is the name of your organization/, /^the name of your organization/]],
  ['orgType', [/^what type of organization/]],
  ['extra', [/^if you need to submit additional officer/]],
  ['by', [/^your name/]],
  ['byEmail', [/^your email address/]],
  ['byPhone', [/^your phone number/]]
];
var PASTE_SLOTS = 5;

/** Turns the pasted export (array of rows) into one record per form response. Throws a readable error if it is not the officer update form. */
function parsePaste_(values) {
  var hdrRow = -1, idx = null;
  function find(heads, used, patterns) {
    for (var p = 0; p < patterns.length; p++) {
      for (var c = 0; c < heads.length; c++) if (!used[c] && heads[c] && patterns[p].test(heads[c])) { used[c] = true; return c; }
    }
    return undefined;
  }
  for (var r = 0; r < Math.min(values.length, 10) && hdrRow < 0; r++) {
    var heads = values[r].map(function (h) { return norm_(h); }), used = {}, found = { slots: [] };
    PASTE_FIELDS.forEach(function (f) { found[f[0]] = find(heads, used, f[1]); });
    for (var n = 1; n <= PASTE_SLOTS; n++) {
      var pre = '^officer\\s*#?\\s*' + n + '\\s*:?\\s*';
      found.slots.push({
        name: find(heads, used, [new RegExp(pre + 'name')]), position: find(heads, used, [new RegExp(pre + 'position')]),
        phone: find(heads, used, [new RegExp(pre + 'phone')]), email: find(heads, used, [new RegExp(pre + 'email')])
      });
    }
    if (found.school !== undefined && found.slots[0].name !== undefined) { hdrRow = r; idx = found; }
  }
  if (hdrRow < 0) {
    var any = values.some(function (row) { return row.some(function (c) { return String(c).trim() !== ''; }); });
    throw new Error(any ? 'I could not find the column titles of the officer update form ("What school is your organization associated with?", "Officer #1: Name" and so on) in the first rows of the "' + CFG.TAB_PASTE + '" tab. Paste the whole Excel export starting at cell A1, including its first row of titles.'
                        : 'The "' + CFG.TAB_PASTE + '" tab is empty. Paste the Excel export of the officer update form into it, starting at cell A1 with the column titles, then run the import again.');
  }
  var get = function (row, c) { return c === undefined ? '' : row[c]; };
  var txt = function (row, c) { return cellText_(get(row, c)); };
  var phone = function (row, c) {
    var v = get(row, c);
    if (typeof v === 'number') return String(Math.round(v));
    return cellText_(v);
  };
  var out = [];
  for (var i = hdrRow + 1; i < values.length; i++) {
    var row = values[i];
    var rec = {
      id: txt(row, idx.id), start: toDate_(get(row, idx.start)), done: toDate_(get(row, idx.done)),
      school: txt(row, idx.school), orgName: txt(row, idx.orgName), orgType: txt(row, idx.orgType), extra: txt(row, idx.extra),
      by: txt(row, idx.by), byEmail: txt(row, idx.byEmail), byPhone: phone(row, idx.byPhone), officers: []
    };
    if (!rec.school && !rec.orgName && !rec.by && !rec.byEmail && !rec.id) continue;
    idx.slots.forEach(function (s, k) {
      var o = { slot: k + 1, name: txt(row, s.name), position: txt(row, s.position).replace(/\s*\(.*$/, '').trim(), phone: phone(row, s.phone), email: txt(row, s.email) };
      if (o.name || o.email || o.phone) rec.officers.push(o);
    });
    out.push(rec);
  }
  return out;
}

function ensureTab_(name, headers) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

/* ================================================================== sign-in and review */

/*
 * Everybody opens the same web address. Leadership sees campus status. A C1 or a FACE staff member chooses Sign in on the page and types
 * a passcode; the page then asks for more through google.script.run, and every one of those calls re-checks the session here.
 * Passcodes are never stored: only a salted SHA-256 hash is kept, in Script Properties. A session is a random token held in the script
 * cache for up to six hours. Who may sign in, and as what, comes from two tabs: Dashboard Sign-ins (Name, Role) and C1 Assignments.
 */
var SESSION_SECONDS = 21600;                 // 6 hours: the longest a script cache entry can live
var MAX_TRIES = 5, LOCK_SECONDS = 900;       // 5 wrong passcodes for one name, then 15 minutes of waiting
var PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0, O, 1 or I
var MIN_CUSTOM_PASS = 8;

/** The C1 Assignments tab: which campuses each C1 reviews. One row per campus; a campus may have more than one C1. */
function c1Assignments_() {
  var out = { names: {}, order: [], unknown: [] };    // names: normalised C1 name -> { name, campuses: { normalised campus: register spelling } }
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_C1);
  if (!sh) return out;
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return norm_(h); });
  var ci = head.indexOf('campus'), ni = head.indexOf('c1 coordinator');
  if (ci < 0 || ni < 0) throw new Error('The tab "' + CFG.TAB_C1 + '" needs the headings Campus and C1 Coordinator in row 1.');
  var map = campusMap_();
  for (var i = 1; i < vals.length; i++) {
    var camp = cellText_(vals[i][ci]), nm = cellText_(vals[i][ni]);
    if (!camp || !nm) continue;
    var canon = lookup_(map, camp);
    if (!canon) { out.unknown.push(camp + ' (' + nm + ')'); continue; }
    var k = norm_(nm), rec = out.names[k];
    if (!rec) { rec = out.names[k] = { name: nm, campuses: {} }; out.order.push(k); }
    rec.campuses[norm_(canon)] = canon;
  }
  return out;
}

/** The Dashboard Sign-ins tab: one row per person, with Name and Role (C1 or Staff). Returns { byKey: { normName: { name, role } }, order }. */
function signInRows_() {
  var out = { byKey: {}, order: [], sh: null, status: -1 };
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_SIGNINS);
  if (!sh) return out;
  out.sh = sh;
  var vals = sh.getDataRange().getValues(), head = vals[0].map(function (h) { return norm_(h); });
  var ni = head.indexOf('name'), ri = head.indexOf('role');
  if (ni < 0 || ri < 0) throw new Error('The tab "' + CFG.TAB_SIGNINS + '" needs the headings Name and Role in row 1.');
  out.status = head.indexOf('passcode status');
  var ei = head.indexOf('email');
  out.rows = [];
  for (var i = 1; i < vals.length; i++) {
    var nm = cellText_(vals[i][ni]), r = norm_(vals[i][ri]);
    out.rows.push({ row: i + 1, key: norm_(nm) });
    if (!nm) continue;
    var role = (r === 'c1' || r === 'c1 coordinator') ? 'c1' : (r === 'staff' || r === 'face staff' || r === 'admin') ? 'staff' : '';
    var k = norm_(nm);
    if (!role || out.byKey[k]) continue;              // an unknown role means no access; the first row for a name wins
    out.byKey[k] = { name: nm, role: role, email: ei >= 0 ? cellText_(vals[i][ei]) : '' };
    out.order.push(k);
  }
  return out;
}

function accessMap_() {
  try { var m = JSON.parse(PropertiesService.getScriptProperties().getProperty('ACCESS') || '{}'); return m && typeof m === 'object' ? m : {}; } catch (err) { return {}; }
}
function saveAccess_(m) { PropertiesService.getScriptProperties().setProperty('ACCESS', JSON.stringify(m)); }

function normPass_(p) { return String(p == null ? '' : p).replace(/[\s-]+/g, '').toUpperCase(); }
function hashPass_(salt, pass) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + normPass_(pass), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function makePasscode_() {
  var hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''), s = '';
  for (var i = 0; i < 8; i++) s += PASS_ALPHABET.charAt(parseInt(hex.substr(i * 2, 2), 16) % PASS_ALPHABET.length);   // 256 is a multiple of 32, so every letter is equally likely
  return s.slice(0, 4) + '-' + s.slice(4);
}
function setPass_(map, key, pass) {
  var old = map[key], salt = makeKey_();
  map[key] = { salt: salt, hash: hashPass_(salt, pass), gen: old && old.gen ? old.gen + 1 : 1, set: Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'MMM d, yyyy') };
}

/** Who a person is right now, or null if they may not sign in: on the tab with a known role, a passcode set and, for a C1, at least one campus. */
function personFor_(key) {
  var row = signInRows_().byKey[key], acc = accessMap_()[key];
  if (!row || !acc || !acc.hash) return null;
  if (row.role === 'staff') return { key: key, name: row.name, role: 'staff', campuses: null, gen: acc.gen };
  var rec = c1Assignments_().names[key];
  if (!rec || !Object.keys(rec.campuses).length) return null;
  return { key: key, name: row.name, role: 'c1', campuses: rec.campuses, gen: acc.gen };
}

/** Names offered on the sign-in form: people who could sign in right now. Names only, no roles or campuses. */
function signInNames_() {
  var out = [];
  try { signInRows_().order.forEach(function (k) { var p = personFor_(k); if (p) out.push(p.name); }); } catch (err) { /* the page still opens */ }
  return out;
}

function sessionFrom_(token) {
  token = String(token == null ? '' : token);
  if (!/^[0-9a-f]{40}$/.test(token)) return null;
  var raw = CacheService.getScriptCache().get('s:' + token), s = null;
  if (!raw) return null;
  try { s = JSON.parse(raw); } catch (err) { return null; }
  var who = personFor_(s.k);
  return who && who.gen === s.g ? who : null;      // a new passcode, or a removed person, ends their sessions at once
}

/**
 * Called from the page's Sign in form. Returns { ok: true, token, role, name } or { ok: false, message }.
 * Wrong name and wrong passcode give the same answer, and five wrong tries for one name lock it for 15 minutes.
 */
function signIn(name, passcode) {
  var key = norm_(name), cache = CacheService.getScriptCache(), fk = 'f:' + key;
  if (!key || !normPass_(passcode)) return { ok: false, message: 'Choose your name and type your passcode.' };
  var fails = Number(cache.get(fk) || 0);
  if (fails >= MAX_TRIES) return { ok: false, message: 'Too many wrong tries for this name. Wait 15 minutes, or ask FACE for a new passcode.' };
  var who = null;
  try {
    var p = personFor_(key), acc = accessMap_()[key];
    if (p && acc && hashPass_(acc.salt, passcode) === acc.hash) who = p;
  } catch (err) { who = null; }
  if (!who) {
    cache.put(fk, String(fails + 1), LOCK_SECONDS);
    var left = MAX_TRIES - fails - 1;
    return { ok: false, message: 'That name and passcode do not match.' + (left > 0 ? ' ' + plural_(left, 'try', 'tries') + ' left.' : ' This name is now locked for 15 minutes.') };
  }
  cache.remove(fk);
  var token = makeKey_();
  cache.put('s:' + token, JSON.stringify({ k: who.key, g: who.gen }), SESSION_SECONDS);
  return { ok: true, token: token, role: who.role, name: who.name };
}

function signOut(token) {
  token = String(token == null ? '' : token);
  if (/^[0-9a-f]{40}$/.test(token)) CacheService.getScriptCache().remove('s:' + token);
  return true;
}

/** What the page shows. No token (or a dead one) gets the leadership view. */
function getDashboard(token) {
  var who = token ? sessionFrom_(token) : null;
  var p = getPayload_(who ? (who.role === 'staff' ? { staff: true, name: who.name } : { c1: { name: who.name, campuses: who.campuses } }) : null);
  if (token && !who) p.sessionEnded = true;
  p.people = signInNames_();
  p.version = VERSION;
  return p;
}

var REVIEW_STATUSES = ['Accepted', 'Needs Correction', 'Received'];

/**
 * Called from the page by a signed-in C1 or FACE staff member. The session says who they are, so the campus is checked against a C1's
 * own list here, not in the browser. Changes one item of one campus and school year to Accepted, Needs Correction (with a reason), or
 * back to Received, and logs who did it. Returns the new state for the page to show.
 */
function reviewItem(token, campus, year, itemKey, status, reason) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var who = sessionFrom_(token);
    if (!who) throw new Error('Your sign-in has ended. Sign in again.');
    campus = cellText_(campus); year = cellText_(year); status = cellText_(status);
    if (who.role === 'c1' && !who.campuses[norm_(campus)]) throw new Error(campus + ' is not on your list of campuses.');
    var item = itemByKey_(cellText_(itemKey));
    if (!item) throw new Error('That document type is not recognized.');
    if (REVIEW_STATUSES.indexOf(status) < 0) throw new Error('That status cannot be set here.');
    reason = cellText_(reason).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (status === 'Needs Correction' && !reason) throw new Error('Say what needs to be corrected.');
    var t = table_(CFG.TAB_REGISTER);
    var row = findRow_(t, year, campus);
    if (!row) throw new Error('No register row was found for ' + campus + ' in ' + year + '.');
    var canon = cellText_(t.values[row - 1][t.col['Campus']]);
    var cur = cellText_(t.values[row - 1][t.col[item.key]]);
    if (cur === '' || cur === 'Not Received') throw new Error('Nothing has been received for ' + item.key + ' yet, so there is nothing to review.');
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), now = new Date();
    var note = status === 'Accepted' ? 'Accepted: ' + item.key
      : status === 'Needs Correction' ? 'Needs correction, ' + item.key + ': ' + reason
      : 'Put back to Received (waiting for review): ' + item.key;
    var by = who.name + (who.role === 'c1' ? ' (C1)' : ' (FACE)');
    var changed = cur !== status;
    if (changed) {
      setCell_(t, row, item.key, status);
      appendLog_([[now, by, canon, '', '', '', year, note]]);
    }
    return { ok: true, status: status, code: CFG.STATUS_CODE[status], itemKey: item.key, changed: changed, date: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
      note: changed ? note : '', by: by };
  } finally { lock.releaseLock(); }
}

/* ---------- the checklist: what a reviewer decides about each document, and the remarks ---------- */

// What a reviewer may choose for one document. Received (waiting for review) is not a choice: it is what arriving sets.
var CHECK_STATUSES = ['Accepted', 'Needs Correction', 'Not Received', 'Not Needed'];
var REMARK_MAX = 300, CAMPUS_REMARK_MAX = 1000;
var CAMPUS_REMARK = 'Remarks for the PTO/PTA';

function cleanText_(s, max) { return cellText_(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

/**
 * The log note for one document. Every note starts with words that say what happened and names the item, so itemNote_ can read the
 * newest remark back. The "Needs correction, <item>: <reason>" and "Accepted: <item>" forms are the ones the tracker always wrote.
 */
function checkNote_(status, key, remark, statusChanged) {
  if (!statusChanged) return remark ? 'Remark, ' + key + ': ' + remark : 'Remark cleared, ' + key;
  if (status === 'Accepted') return 'Accepted: ' + key + (remark ? '. Remark: ' + remark : '');
  if (status === 'Needs Correction') return 'Needs correction, ' + key + ': ' + remark;
  if (status === 'Not Needed') return 'Not needed, ' + key + ': ' + remark;
  if (status === 'Not Received') return 'Not there, ' + key + (remark ? ': ' + remark : '');
  return 'Put back to Received (waiting for review): ' + key;
}

/** Reads a log note back: { key, remark } for a note about one document, { campus: remark } for overall remarks, or null. */
function itemNote_(note) {
  var n = cellText_(note);
  if (!n) return null;
  if (n.indexOf(CAMPUS_REMARK + ': ') === 0) return { campus: n.slice(CAMPUS_REMARK.length + 2) };
  if (n === CAMPUS_REMARK + ' cleared.') return { campus: '' };
  var forms = [['Needs correction, ', ': '], ['Not needed, ', ': '], ['Not there, ', ': '], ['Remark, ', ': '], ['Remark cleared, ', ''], ['Accepted: ', '. Remark: '],
    ['Put back to Received (waiting for review): ', '']];
  for (var f = 0; f < forms.length; f++) {
    var pre = forms[f][0], sep = forms[f][1];
    if (n.indexOf(pre) !== 0) continue;
    var rest = n.slice(pre.length);
    for (var i = 0; i < CFG.ITEMS.length; i++) {
      var names = [CFG.ITEMS[i].key].concat(CFG.ITEMS[i].headerAliases || []);      // a note written under an older name still counts
      for (var j = 0; j < names.length; j++) {
        var k = names[j];
        if (rest === k) return { key: CFG.ITEMS[i].key, remark: '' };
        if (sep && rest.indexOf(k + sep) === 0) return { key: CFG.ITEMS[i].key, remark: rest.slice(k.length + sep.length) };
      }
    }
  }
  return null;
}

/**
 * Called from the page's checklist by a signed-in C1 or FACE staff member. Saves, for one campus and school year, any number of
 * documents ({ key, status, remark }; status '' keeps the status and changes only the remark) and, when campusRemark is not null,
 * the overall remarks for the PTO/PTA. Every change is one line in the Submission Log with the person's name. Checking a document off
 * for a campus that is not marked as having a PTO/PTA marks it Yes (unless the register says No). Returns what the page needs to redraw.
 */
function saveChecklist(token, campus, year, changes, campusRemark) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var who = sessionFrom_(token);
    if (!who) throw new Error('Your sign-in has ended. Sign in again.');
    campus = cellText_(campus); year = cellText_(year);
    if (who.role === 'c1' && !who.campuses[norm_(campus)]) throw new Error(campus + ' is not on your list of campuses.');
    var t = table_(CFG.TAB_REGISTER);
    var row = findRow_(t, year, campus);
    if (!row) throw new Error('No register row was found for ' + campus + ' in ' + year + '.');
    var canon = cellText_(t.values[row - 1][t.col['Campus']]);
    var known = remarksFor_(canon, year);
    var list = Array.isArray(changes) ? changes : [];
    var plan = [], seen = {};
    list.forEach(function (c) {
      var item = itemByKey_(cellText_(c && c.key));
      if (!item) throw new Error('That document type is not recognized.');
      if (seen[item.key]) throw new Error(item.key + ' is listed twice.');
      seen[item.key] = 1;
      var status = cellText_(c.status), remark = cleanText_(c.remark, REMARK_MAX);
      if (status && CHECK_STATUSES.indexOf(status) < 0) throw new Error('That status cannot be set here.');
      var cur = cellText_(t.values[row - 1][t.col[item.key]]) || 'Not Received';
      var next = status || cur;
      if (next === 'Needs Correction' && !remark) throw new Error('Say what needs to be corrected in ' + item.key + '.');
      if (next === 'Not Needed' && !remark) throw new Error('Say why ' + item.key + ' is not needed.');
      var statusChanged = next !== cur, remarkChanged = remark !== (known.items[item.key] || '');
      if (statusChanged || remarkChanged) plan.push({ item: item, status: next, remark: remark, statusChanged: statusChanged });
    });
    var cr = campusRemark == null ? null : cleanText_(campusRemark, CAMPUS_REMARK_MAX);
    var crChanged = cr !== null && cr !== known.campus;
    if (!plan.length && !crChanged) return { ok: true, changed: false, d: codesOf_(t, row), remarks: known };

    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), now = new Date();
    var by = who.name + (who.role === 'c1' ? ' (C1)' : ' (FACE)'), logs = [], notes = [];
    plan.forEach(function (p) {
      if (p.statusChanged) { setCell_(t, row, p.item.key, p.status); t.values[row - 1][t.col[p.item.key]] = p.status; }
      var note = checkNote_(p.status, p.item.key, p.remark, p.statusChanged);
      logs.push([now, by, canon, '', '', '', year, note]); notes.push(note);
      known.items[p.item.key] = p.remark;
    });
    if (crChanged) {
      var cn = cr ? CAMPUS_REMARK + ': ' + cr : CAMPUS_REMARK + ' cleared.';
      logs.push([now, by, canon, '', '', '', year, cn]); notes.push(cn);
      known.campus = cr;
    }
    var madeYes = false;
    var pto = cellText_(t.values[row - 1][t.col['Has PTO or PTA']]);
    if (pto !== 'Yes' && pto !== 'No' && plan.some(function (p) { return p.statusChanged && p.status !== 'Not Received'; })) {
      setCell_(t, row, 'Has PTO or PTA', 'Yes'); madeYes = true;
      var yn = 'Marked as having a PTO/PTA (Has PTO or PTA = Yes) because documents were checked off.';
      logs.push([now, by, canon, '', '', '', year, yn]); notes.push(yn);
    }
    appendLog_(logs);
    return { ok: true, changed: true, d: codesOf_(t, row), pto: madeYes ? 'Yes' : '', notes: notes, by: by, date: Utilities.formatDate(now, tz, 'yyyy-MM-dd'), remarks: known };
  } finally { lock.releaseLock(); }
}

/** The status letters of one register row, in CFG.ITEMS order (the dashboard's "d" string). */
function codesOf_(t, row) {
  return CFG.ITEMS.map(function (it) { return CFG.STATUS_CODE[cellText_(t.values[row - 1][t.col[it.key]])] || 'N'; }).join('');
}

/** The newest remark for each document of one campus and school year, and the overall remarks: { items: { key: text }, campus: text }. */
function remarksFor_(campus, year) {
  var all = remarksByCampus_({}), k = norm_(campus) + '||' + year;
  return all[k] || { items: {}, campus: '' };
}

/** Every campus's remarks from the Submission Log, keyed by normalised campus || year. only (optional) limits it to some campuses. */
function remarksByCampus_(only) {
  var out = {}, sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_LOG);
  if (!sh) return out;
  var lt = table_(CFG.TAB_LOG), c = lt.col;
  for (var i = lt.values.length - 1; i >= 1; i--) {         // newest first: the first note found for an item is its current remark
    var v = lt.values[i], campus = cellText_(v[c['Campus']]), year = cellText_(v[c['School Year']]);
    if (!campus || !year || cellText_(v[c['Document Type']])) continue;
    if (only && Object.keys(only).length && !only[norm_(campus)]) continue;
    var n = itemNote_(v[c['Notes']]);
    if (!n) continue;
    var k = norm_(campus) + '||' + year, rec = out[k] || (out[k] = { items: {}, campus: '', seen: {} });
    if (n.campus !== undefined) { if (!rec.seen['@campus']) { rec.seen['@campus'] = 1; rec.campus = n.campus; } }
    else if (!rec.seen[n.key]) { rec.seen[n.key] = 1; rec.items[n.key] = n.remark; }
  }
  Object.keys(out).forEach(function (k) { delete out[k].seen; });
  return out;
}

/**
 * Called from the page after a signed-in C1 or FACE staff member has written the "please resend" email in Outlook and sent it.
 * The script sends nothing itself (it can only send from Google, not Outlook). This writes one line in the Submission Log, naming what the
 * email asked for at that moment (required documents still not there, documents needing correction, the overall remarks), so the
 * dashboard can show that the campus was emailed, when, and by whom.
 * sentTo is the list of addresses the person emailed; it is only recorded.
 */
function logResendRequest(token, campus, year, sentTo) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var who = sessionFrom_(token);
    if (!who) throw new Error('Your sign-in has ended. Sign in again.');
    campus = cellText_(campus); year = cellText_(year);
    if (who.role === 'c1' && !who.campuses[norm_(campus)]) throw new Error(campus + ' is not on your list of campuses.');
    var t = table_(CFG.TAB_REGISTER);
    var row = findRow_(t, year, campus);
    if (!row) throw new Error('No register row was found for ' + campus + ' in ' + year + '.');
    var canon = cellText_(t.values[row - 1][t.col['Campus']]);
    var ask = emailAsks_(t, row, canon, year);
    if (!ask.parts.length) throw new Error('Nothing is missing or needs correction for ' + canon + ' now, and there are no remarks, so there is nothing to email about.');
    var to = cleanText_(sentTo, 200);
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(), now = new Date();
    var note = 'Emailed the PTO/PTA about ' + ask.parts.join('; ') + (to ? '. To: ' + to : '');
    var by = who.name + (who.role === 'c1' ? ' (C1)' : ' (FACE)');
    appendLog_([[now, by, canon, '', '', '', year, note]]);
    return { ok: true, date: Utilities.formatDate(now, tz, 'yyyy-MM-dd'), note: note, by: by };
  } finally { lock.releaseLock(); }
}

/** What an email to the PTO/PTA would ask for now: { parts: ['still needed: A, B', 'needs correction: C', 'remarks'] }. */
function emailAsks_(t, row, campus, year) {
  var flags = itemFlags_(), need = [], fix = [], parts = [];
  CFG.ITEMS.forEach(function (it, i) {
    var st = cellText_(t.values[row - 1][t.col[it.key]]) || 'Not Received';
    if (st === 'Needs Correction') fix.push(it.key);
    else if (st === 'Not Received' && flags.req[i]) need.push(it.key);
  });
  if (need.length) parts.push('still needed: ' + need.join(', '));
  if (fix.length) parts.push('needs correction: ' + fix.join(', '));
  if (remarksFor_(campus, year).campus) parts.push('remarks');
  return { parts: parts };
}

/* ---------- passcodes (menu) ---------- */

/**
 * Menu: makes sure everyone who should be able to sign in is on the Dashboard Sign-ins tab and has a passcode.
 * C1s come from the C1 Assignments tab; FACE staff are rows you add by hand with the Role Staff. New passcodes are written to the
 * New Passcodes tab, once, so they can be sent out. Safe to run again: people who already have a passcode keep it.
 */
function setUpSignIns() {
  var ui = SpreadsheetApp.getUi(), r;
  try { r = setUpSignIns_(); } catch (err) { ui.alert('Sign-ins were not set up', err.message, ui.ButtonSet.OK); return; }
  var L = [];
  if (r.createdTab) L.push('The ' + CFG.TAB_SIGNINS + ' tab was missing, so it has been added with one row, FACE Staff.');
  if (r.createdC1Tab) L.push('The ' + CFG.TAB_C1 + ' tab was missing, so it has been added. Put each campus in column A and its C1 Coordinator in column B (one row per campus), then run this again to give each C1 a passcode.');
  L.push(plural_(r.people, 'person can', 'people can') + ' sign in (' + plural_(r.c1Total, 'C1', 'C1s') + ' and ' + plural_(r.staffTotal, 'FACE staff member', 'FACE staff members') + ').');
  if (r.made.length) L.push('', plural_(r.made.length, 'new passcode was', 'new passcodes were') + ' made. They are on the ' + CFG.TAB_PASS + ' tab. Send each person only their own, then delete that tab. The passcodes are not stored anywhere else and cannot be shown again; use "new passcode for one person" if one is lost.');
  else L.push('', 'Nobody needed a new passcode.');
  if (r.noCampus.length) L.push('', plural_(r.noCampus.length, 'person is', 'people are') + ' on the ' + CFG.TAB_SIGNINS + ' tab as a C1 but ' + (r.noCampus.length === 1 ? 'has' : 'have') + ' no campuses on the ' + CFG.TAB_C1 + ' tab, so they cannot sign in yet: ' + r.noCampus.slice(0, 6).join(', ') + (r.noCampus.length > 6 ? ', and ' + (r.noCampus.length - 6) + ' more' : '') + '.');
  if (r.unknown.length) L.push('', plural_(r.unknown.length, 'campus on the ' + CFG.TAB_C1 + ' tab is', 'campuses on the ' + CFG.TAB_C1 + ' tab are') + ' not in the Campus Register and ' + (r.unknown.length === 1 ? 'was' : 'were') + ' skipped: ' + r.unknown.slice(0, 6).join(', ') + (r.unknown.length > 6 ? ', and ' + (r.unknown.length - 6) + ' more' : '') + '.');
  if (!dashboardUrl_()) L.push('', 'The dashboard is not deployed yet. Deploy it (Deploy > New deployment > Web app) so there is an address to sign in on.');
  ui.alert('Dashboard sign-ins', L.join('\n'), ui.ButtonSet.OK);
}

function setUpSignIns_() {
  var ss = SpreadsheetApp.getActive(), res = { createdTab: false, createdC1Tab: false, made: [], people: 0, c1Total: 0, staffTotal: 0, noCampus: [], unknown: [] };
  var sh = ss.getSheetByName(CFG.TAB_SIGNINS);
  if (!sh) { sh = ensureTab_(CFG.TAB_SIGNINS, ['Name', 'Role', 'Passcode status']); sh.getRange(2, 1, 1, 2).setValues([['FACE Staff', 'Staff']]); res.createdTab = true; }
  if (!ss.getSheetByName(CFG.TAB_C1)) { ensureTab_(CFG.TAB_C1, ['Campus', 'C1 Coordinator']); res.createdC1Tab = true; }
  var a = c1Assignments_(); res.unknown = a.unknown;
  var rows = signInRows_();
  // forget the passcode of anyone whose row was deleted from the tab, so that adding them back starts with a new one
  var map = accessMap_();
  Object.keys(map).forEach(function (k) { if (!rows.byKey[k]) delete map[k]; });
  // every C1 on the assignments tab gets a row if they do not have one
  var add = [];
  a.order.forEach(function (k) { if (!rows.byKey[k] && !add.some(function (x) { return norm_(x[0]) === k; })) add.push([a.names[k].name, 'C1']); });
  if (add.length) {
    var start = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(start, 1, add.length, 2).setValues(add);
    rows = signInRows_();
  }
  var statusCol = rows.status;
  if (statusCol < 0) { var lc = Math.max(sh.getLastColumn(), 1) + 1; sh.getRange(1, lc).setValue('Passcode status'); statusCol = lc - 1; }
  ensureEmailColumn_(sh);
  var made = [];
  rows.order.forEach(function (k) {
    var p = rows.byKey[k];
    var eligible = p.role === 'staff' || (a.names[k] && Object.keys(a.names[k].campuses).length > 0);
    if (!eligible) { res.noCampus.push(p.name); return; }
    if (!map[k] || !map[k].hash) { var pass = makePasscode_(); setPass_(map, k, pass); made.push({ name: p.name, role: p.role === 'staff' ? 'FACE staff' : 'C1', pass: pass }); }
  });
  saveAccess_(map);
  // status column
  var statusById = {};
  rows.order.forEach(function (k) {
    var p = rows.byKey[k], acc = map[k];
    var eligible = p.role === 'staff' || (a.names[k] && Object.keys(a.names[k].campuses).length > 0);
    statusById[k] = !eligible ? 'Cannot sign in: no campuses on ' + CFG.TAB_C1 : (acc && acc.hash ? 'Passcode set ' + acc.set : '');
    if (eligible) { res.people++; if (p.role === 'staff') res.staffTotal++; else res.c1Total++; }
  });
  rows.rows.forEach(function (r) {
    var txt = r.key && statusById[r.key] !== undefined ? statusById[r.key] : (r.key ? 'Not used: check the Role (C1 or Staff)' : '');
    sh.getRange(r.row, statusCol + 1).setValue(txt);
  });
  if (made.length) writePasscodeTab_(made);
  res.made = made;
  return res;
}

/** Adds an Email heading to the Dashboard Sign-ins tab if it has none. A C1's email there is used for the review reminder emails. */
function ensureEmailColumn_(sh) {
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (h) { return norm_(h); });
  if (head.indexOf('email') >= 0) return false;
  sh.getRange(1, head.length + 1).setValue('Email');
  return true;
}

/** Writes the New Passcodes tab (replacing whatever was there). It is the only place a passcode ever appears in plain text. */
function writePasscodeTab_(made) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(CFG.TAB_PASS) || ss.insertSheet(CFG.TAB_PASS);
  sh.clearContents();
  var rows = [['Name', 'Role', 'Passcode', 'Send each person only their own passcode, then delete this tab. It cannot be shown again.']];
  made.forEach(function (m) { rows.push([m.name, m.role, m.pass, '']); });
  sh.getRange(1, 1, rows.length, 4).setValues(rows);
  sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  sh.getRange(2, 3, Math.max(rows.length - 1, 1), 1).setFontFamily('Courier New').setFontWeight('bold');
  try { sh.setColumnWidth(1, 200); sh.setColumnWidth(3, 140); } catch (err) { /* cosmetic only */ }
}

/** Menu: a new passcode for one person (made for them, or one you type). Their open sessions end. */
function newPasscode() {
  var ui = SpreadsheetApp.getUi();
  var who = ui.prompt('New passcode', 'Type the person\'s name exactly as it is on the ' + CFG.TAB_SIGNINS + ' tab.', ui.ButtonSet.OK_CANCEL);
  if (who.getSelectedButton() !== ui.Button.OK) return;
  var custom = ui.prompt('New passcode', 'Type a passcode (at least ' + MIN_CUSTOM_PASS + ' letters or numbers), or leave this empty and one will be made for you.', ui.ButtonSet.OK_CANCEL);
  if (custom.getSelectedButton() !== ui.Button.OK) return;
  try {
    var r = newPasscode_(who.getResponseText(), custom.getResponseText());
    ui.alert('Passcode changed for ' + r.name, r.made ? 'The new passcode is on the ' + CFG.TAB_PASS + ' tab. Send it to ' + r.name + ' only, then delete that tab.\n\nTheir old passcode and any open sign-in no longer work.'
      : 'The passcode you typed is saved. Their old passcode and any open sign-in no longer work.', ui.ButtonSet.OK);
  } catch (err) { ui.alert('No passcode was changed', err.message, ui.ButtonSet.OK); }
}

function newPasscode_(name, custom) {
  var rows = signInRows_(), k = norm_(name), p = rows.byKey[k];
  if (!p) throw new Error('"' + cellText_(name) + '" is not on the ' + CFG.TAB_SIGNINS + ' tab with a role of C1 or Staff. Run "set up and make passcodes" first if they are new.');
  if (p.role === 'c1') { var rec = c1Assignments_().names[k]; if (!rec || !Object.keys(rec.campuses).length) throw new Error(p.name + ' has no campuses on the ' + CFG.TAB_C1 + ' tab.'); }
  custom = String(custom == null ? '' : custom);
  var pass = custom.trim() ? custom : makePasscode_();
  if (custom.trim() && normPass_(custom).length < MIN_CUSTOM_PASS) throw new Error('A passcode needs at least ' + MIN_CUSTOM_PASS + ' letters or numbers.');
  var map = accessMap_();
  setPass_(map, k, pass);
  saveAccess_(map);
  var made = !custom.trim();
  if (made) writePasscodeTab_([{ name: p.name, role: p.role === 'staff' ? 'FACE staff' : 'C1', pass: pass }]);
  if (rows.sh && rows.status >= 0) rows.rows.forEach(function (r) { if (r.key === k) rows.sh.getRange(r.row, rows.status + 1).setValue('Passcode set ' + map[k].set); });
  return { name: p.name, made: made };
}

/* ================================================================== new school year */

function startNewYear() {
  var ui = SpreadsheetApp.getUi();
  var t = table_(CFG.TAB_REGISTER);
  var latest = latestYear_(t);
  if (!latest) { ui.alert('The Campus Register has no rows to copy.'); return; }
  var res = ui.prompt('Start a new school year',
    'This copies every campus from ' + latest + ' into a new school year. Articles of Incorporation carries over; everything else starts at Not Received.\n\nNew school year (for example ' + nextYearLabel_(latest) + '):',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var label = String(res.getResponseText() || '').trim() || nextYearLabel_(latest);
  try {
    var r = startYear_(label);
    ui.alert('Done', r.created + ' campus rows were created for ' + label + ' from ' + r.from + '.\nCheck the Area Office column if campus assignments changed. The dashboard will show ' + label + ' automatically.', ui.ButtonSet.OK);
  } catch (err) { ui.alert('Not started', err.message, ui.ButtonSet.OK); }
}

/** Creates one register row per campus of the latest year for the new school year. */
function startYear_(label) {
  if (!/^\d{4}-\d{2}$/.test(label)) throw new Error('Write the school year like 2027-28.');
  var t = table_(CFG.TAB_REGISTER);
  var yc = t.col['School Year'];
  for (var i = 1; i < t.values.length; i++) if (String(t.values[i][yc]).trim() === label) throw new Error('The register already has rows for ' + label + '.');
  var from = latestYear_(t);
  if (!from) throw new Error('The Campus Register has no rows to copy.');
  var carry = carrySettings_(), rows = [];
  for (var r = 1; r < t.values.length; r++) {
    var v = t.values[r];
    if (String(v[yc]).trim() !== from || !String(v[t.col['Campus']]).trim()) continue;
    var obj = { 'School Year': label };
    ['Campus', 'Area Office', 'Has PTO or PTA', 'Org Type', 'Org Name'].forEach(function (h) { obj[h] = v[t.col[h]]; });
    CFG.ITEMS.forEach(function (it) { obj[it.key] = carry[it.key] === 'One-time' ? (v[t.col[it.key]] || 'Not Received') : 'Not Received'; });
    rows.push(obj);
  }
  writeInputRows_(t, firstEmptyRow_(t), rows);
  setCurrentYear_(label);
  return { created: rows.length, from: from };
}

/* ================================================================== dashboard */

/**
 * Web app entry point. It only hands out the page itself: no sheet is read here, so nothing in the tracker can stop the page from
 * opening. The page then asks for its numbers with google.script.run (getDashboard) and shows any problem in plain words.
 */
function doGet(e) {
  try {
    var html = HtmlService.createHtmlOutputFromFile('Dashboard').getContent().replace('__DATA__', function () { return '{"live":true,"boot":true}'; });
    return HtmlService.createHtmlOutput(html)
      .setTitle(CFG.DASHBOARD_TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<body style="font-family:Arial,sans-serif;max-width:40em;margin:2em auto;padding:0 1em;color:#24383c">' +
      '<h2>The dashboard could not open</h2><p>' + htmlEsc_(err && err.message ? err.message : String(err)) + '</p>' +
      '<p>Send this message to whoever runs the tracker. ' + htmlEsc_(VERSION) + '.</p></body>').setTitle(CFG.DASHBOARD_TITLE);
  }
}

function htmlEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** Menu: runs the same steps the page runs and says which worked. Counts and OK/FAILED only. */
function checkDashboard() {
  var ui = SpreadsheetApp.getUi(), rows = diagnose();
  var url = dashboardUrl_();
  var msg = rows.map(function (r) { return (r[1] ? 'OK      ' : 'FAILED  ') + r[0] + (r[2] ? ': ' + r[2] : ''); }).join('\n') +
    '\n\nDashboard address: ' + (url || 'not deployed yet') + '\n\nThe page runs these same steps when it opens. If everything here is OK but the page still says "Sorry, unable to open the file", the problem is the deployment or the Google account, not the tracker: open the address in a private window signed in to only your Houston ISD Google account, and check Deploy > Manage deployments (Execute as: Me; Who has access: Anyone within Houston ISD).';
  ui.alert(rows.some(function (r) { return !r[1]; }) ? 'Dashboard check: something failed' : 'Dashboard check: all OK', msg, ui.ButtonSet.OK);
}

/**
 * Each step of building the dashboard on its own, so a failure names the step. Also called from the page (Run a check).
 * Returns [[label, ok, detail]] with counts only: no names, addresses, links or passcodes.
 */
function diagnose() {
  var out = [];
  function step(label, fn) {
    try { var r = fn(); out.push([label, true, r === undefined ? '' : String(r)]); }
    catch (err) { out.push([label, false, err && err.message ? err.message : String(err)]); }
  }
  step('The script is reached', function () { return VERSION; });
  step('The spreadsheet opens', function () { return SpreadsheetApp.getActive().getId() ? 'yes' : 'no'; });
  step('The Campus Register is read (leadership view)', function () { var p = getPayload_(null); return plural_(p.rows.length, 'row', 'rows'); });
  step('The Campus Register is read (staff view)', function () { var p = getPayload_({ staff: true }); return Object.keys(p.detail).length + ' campus detail records'; });
  step('The Dashboard page file is found', function () { var h = HtmlService.createHtmlOutputFromFile('Dashboard').getContent(); return h.length + ' characters' + (h.indexOf('__DATA__') >= 0 ? '' : ' (but the data marker is missing)'); });
  step('Sign-in tabs are read', function () {
    var rows = signInRows_(), a = c1Assignments_(), n = 0;
    rows.order.forEach(function (k) { if (personFor_(k)) n++; });
    return plural_(n, 'person can', 'people can') + ' sign in; ' + plural_(a.order.length, 'C1 has', 'C1s have') + ' campuses assigned' + (rows.sh ? '' : ' (no ' + CFG.TAB_SIGNINS + ' tab yet)');
  });
  step('Sessions can be kept', function () {
    var c = CacheService.getScriptCache(); c.put('t:diag', '1', 30);
    if (c.get('t:diag') !== '1') throw new Error('The script cache did not hold a value');
    c.remove('t:diag'); return 'yes';
  });
  step('Passwords can be hashed', function () { return hashPass_('x', 'abc').length === 64 ? 'yes' : 'no'; });
  return out;
}

/** The Campus Register as the compact rows the dashboard reads, plus per-campus detail for the click-a-campus panel. */
function getPayload_(access) {
  var staff = !!(access && access.staff);
  var c1 = access && access.c1 ? access.c1 : null;      // a C1 sees details of, and may review, only the campuses on their list
  var t = table_(CFG.TAB_REGISTER);
  var rows = [];
  for (var i = 1; i < t.values.length; i++) {
    var v = t.values[i], campus = String(v[t.col['Campus']] || '').trim();
    if (!campus) continue;
    var p = String(v[t.col['Has PTO or PTA']] || '').trim().toLowerCase();
    rows.push({
      campus: campus,
      area: String(v[t.col['Area Office']] || '').trim() || 'No Area Office',
      year: String(v[t.col['School Year']] || '').trim(),
      pto: p === 'yes' ? 'Yes' : p === 'no' ? 'No' : 'NYC',
      ot: String(v[t.col['Org Type']] || '').trim(),
      on: String(v[t.col['Org Name']] || '').trim(),
      d: CFG.ITEMS.map(function (it) { return CFG.STATUS_CODE[String(v[t.col[it.key]] || '').trim()] || 'N'; }).join('')
    });
  }
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var flags = itemFlags_();
  // Every campus's status is in the page for everyone. Officer names, contact details, file links and notes are added only for
  // the campuses the signed-in person may see: all of them for FACE staff, a C1's own list for a C1, none for leadership.
  var detail = buildDetail_(false, tz, null);
  if (staff) detail = buildDetail_(true, tz, null);
  else if (c1) { var priv = buildDetail_(true, tz, c1.campuses); Object.keys(priv).forEach(function (k) { detail[k] = priv[k]; }); }
  return { sample: false, live: true, me: staff ? { role: 'staff', name: access.name || 'FACE staff' } : c1 ? { role: 'c1', name: c1.name } : null,
    mine: c1 ? Object.keys(c1.campuses).map(function (k) { return c1.campuses[k]; }) : null,
    itemKeys: CFG.ITEMS.map(function (it) { return it.key; }), labels: CFG.ITEMS.map(function (it) { return it.label || it.key; }),
    reg: flags.reg, req: flags.req, inbox: CFG.INBOX, source: 'the PTO/PTA tracker', url: dashboardUrl_(),
    c1s: staff ? c1Contacts_() : null,
    asOf: Utilities.formatDate(new Date(), tz, 'MMM d, yyyy h:mm a'), rows: rows, detail: detail };
}

/** For FACE staff: every C1 with their email (Dashboard Sign-ins tab) and campuses (C1 Assignments tab), for the review reminders. */
function c1Contacts_() {
  var out = [];
  try {
    var a = c1Assignments_(), rows = signInRows_();
    a.order.forEach(function (k) {
      var rec = a.names[k], p = rows.byKey[k];
      out.push({ n: rec.name, e: p && p.email ? p.email : '', c: Object.keys(rec.campuses).map(function (x) { return rec.campuses[x]; }) });
    });
  } catch (err) { /* the dashboard still opens without the reminder list */ }
  return out;
}

/**
 * Per campus and school year: recent activity from the Submission Log and, for staff only, the officers.
 * Everyone gets the date and document type of each activity. Staff also get file names, links, notes and who sent it.
 */
function buildDetail_(staff, tz, only) {
  var detail = {};
  function slot(campus, year) { var k = campus + '||' + year; return detail[k] || (detail[k] = { a: [], o: [] }); }
  function day(v) {
    if (isDate_(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    var s = String(v == null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }
  var ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(CFG.TAB_LOG)) {
    var lt = table_(CFG.TAB_LOG), c = lt.col, acts = [];
    for (var i = 1; i < lt.values.length; i++) {
      var v = lt.values[i], campus = String(v[c['Campus']] || '').trim(), year = String(v[c['School Year']] || '').trim();
      var doc = String(v[c['Document Type']] || '').trim();
      if (!campus || !year) continue;
      if (only && !only[norm_(campus)]) continue;
      if (!doc && !staff) continue;
      var entry = staff
        ? [day(v[c['Received']]), doc, String(v[c['File Name']] || ''), String(v[c['File Link']] || ''), String(v[c['Notes']] || ''), String(v[c['Submitted By']] || '')]
        : [day(v[c['Received']]), doc];
      acts.push({ k: campus + '||' + year, i: i, d: entry[0], e: entry, campus: campus, year: year });
    }
    acts.sort(function (x, y) { return x.d < y.d ? 1 : x.d > y.d ? -1 : y.i - x.i; });
    acts.forEach(function (a) { var s = slot(a.campus, a.year); if (s.a.length < 60) s.a.push(a.e); });
  }
  if (staff && ss.getSheetByName(CFG.TAB_OFFICERS)) {
    var ot = table_(CFG.TAB_OFFICERS), oc = ot.col;
    if (oc['Campus'] !== undefined && oc['Name'] !== undefined) {
      var rank = { 'president': 1, 'vice president': 2, 'vice-president': 2, 'secretary': 3, 'treasurer': 4 };
      var subs = {}, order = [];
      for (var r = 1; r < ot.values.length; r++) {
        var ov = ot.values[r], cp = cellText_(ov[oc['Campus']]);
        if (!cp) continue;
        if (only && !only[norm_(cp)]) continue;
        var yr = cellText_(ov[oc['School Year']]);
        var rk = cp + '||' + yr + '||' + cellText_(ov[oc['Response ID']]) + '|' + day(ov[oc['Submitted']]) + '|' + cellText_(ov[oc['Submitter Email']]).toLowerCase();
        var sub = subs[rk];
        if (!sub) {
          sub = subs[rk] = { c: cp, y: yr, d: day(ov[oc['Submitted']]), id: cellText_(ov[oc['Response ID']]), g: cellText_(ov[oc['Organization']]), ty: cellText_(ov[oc['Org Type']]),
            by: cellText_(ov[oc['Submitted By']]), be: cellText_(ov[oc['Submitter Email']]), bp: cellText_(ov[oc['Submitter Phone']]), note: '', off: [] };
          order.push(rk);
        }
        if (!sub.note) sub.note = cellText_(ov[oc['Additional Info']]);
        var pos = cellText_(ov[oc['Position']]);
        sub.off.push({ s: Number(ov[oc['Officer #']]) || 0, n: cellText_(ov[oc['Name']]), p: pos, e: cellText_(ov[oc['Email']]), t: cellText_(ov[oc['Phone']]), r: rank[pos.toLowerCase()] || 9 });
      }
      order.forEach(function (k) {
        var sb = subs[k], slotObj = slot(sb.c, sb.y);
        sb.off.sort(function (a, b) { return a.r - b.r || a.s - b.s; });
        slotObj.o.push({ d: sb.d, id: sb.id, g: sb.g, ty: sb.ty, by: sb.by, be: sb.be, bp: sb.bp, note: sb.note, off: sb.off });
      });
      Object.keys(detail).forEach(function (k) {
        detail[k].o.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : (Number(b.id) || 0) - (Number(a.id) || 0); });   // newest submission first
      });
    }
  }
  if (staff) {
    // the newest remark for each document and the overall remarks, for the checklist and the email (signed-in only, like the notes)
    var rm = remarksByCampus_(only || {});
    Object.keys(rm).forEach(function (k) {
      var parts = k.split('||'), found = null;
      Object.keys(detail).forEach(function (dk) { var p = dk.split('||'); if (!found && norm_(p[0]) === parts[0] && p[1] === parts[1]) found = dk; });
      if (found) detail[found].rm = rm[k];
    });
  }
  return detail;
}

/* ================================================================== sheet helpers */

function table_(tab) {
  var sh = SpreadsheetApp.getActive().getSheetByName(tab);
  if (!sh) throw new Error('The tab "' + tab + '" was not found.');
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var col = {};
  headers.forEach(function (h, i) { if (h && col[h] === undefined) col[h] = i; });
  // A register that still has the old column name (before "Update to the new document list") works as it is.
  CFG.ITEMS.forEach(function (it) {
    if (col[it.key] !== undefined) return;
    (it.headerAliases || []).forEach(function (a) { if (col[it.key] === undefined && col[a] !== undefined) col[it.key] = col[a]; });
  });
  return { sh: sh, values: values, headers: headers, col: col };
}

function norm_(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
function startsWith_(s, prefix) { return norm_(s).indexOf(norm_(prefix)) === 0; }

function findRow_(t, year, campus) {
  var yc = t.col['School Year'], cc = t.col['Campus'];
  for (var i = 1; i < t.values.length; i++) {
    if (String(t.values[i][yc]).trim() === year && norm_(t.values[i][cc]) === norm_(campus)) return i + 1;
  }
  return 0;
}

function latestRowFor_(t, campus, beforeYear) {
  var yc = t.col['School Year'], cc = t.col['Campus'], best = null, bestYear = '';
  for (var i = 1; i < t.values.length; i++) {
    var y = String(t.values[i][yc]).trim();
    if (norm_(t.values[i][cc]) === norm_(campus) && y < beforeYear && y > bestYear) { best = i; bestYear = y; }
  }
  if (best === null) return null;
  var obj = {};
  t.headers.forEach(function (h, j) { if (h) obj[h] = t.values[best][j]; });
  return obj;
}

function latestYear_(t) {
  var yc = t.col['School Year'], best = '';
  for (var i = 1; i < t.values.length; i++) {
    var y = String(t.values[i][yc]).trim();
    if (String(t.values[i][t.col['Campus']]).trim() && y > best) best = y;
  }
  return best;
}

/** First row with no campus and no school year (the formula rows the workbook leaves ready), else the row after the last. */
function firstEmptyRow_(t) {
  var yc = t.col['School Year'], cc = t.col['Campus'];
  for (var i = 1; i < t.values.length; i++) {
    if (!String(t.values[i][yc]).trim() && !String(t.values[i][cc]).trim()) return i + 1;
  }
  return t.values.length + 1;
}

function setCell_(t, rowNum, header, value) {
  if (t.col[header] === undefined) throw new Error('Campus Register has no column headed "' + header + '".');
  t.sh.getRange(rowNum, t.col[header] + 1).setValue(value);
}

/** Writes register input columns for a list of {header: value} objects starting at startRow. */
function writeInputRows_(t, startRow, objs) {
  if (!objs.length) return;
  var heads = ['School Year', 'Campus', 'Area Office', 'Has PTO or PTA', 'Org Type', 'Org Name'].concat(CFG.ITEMS.map(function (i) { return i.key; }));
  heads.forEach(function (h) { if (t.col[h] === undefined) throw new Error('Campus Register has no column headed "' + h + '".'); });
  var lastNeeded = startRow + objs.length - 1;
  if (lastNeeded > t.sh.getMaxRows()) t.sh.insertRowsAfter(t.sh.getMaxRows(), lastNeeded - t.sh.getMaxRows());
  var cols = heads.map(function (h) { return t.col[h]; });
  var min = Math.min.apply(null, cols), max = Math.max.apply(null, cols);
  var contiguous = (max - min + 1 === cols.length) && cols.every(function (c, i) { return i === 0 || c === cols[i - 1] + 1; });
  if (contiguous) {
    var block = objs.map(function (o) { return heads.map(function (h) { return o[h] == null ? '' : o[h]; }); });
    var rng = t.sh.getRange(startRow, min + 1, objs.length, heads.length);
    t.sh.getRange(startRow, t.col['School Year'] + 1, objs.length, 1).setNumberFormat('@');
    rng.setValues(block);
  } else {
    objs.forEach(function (o, k) { heads.forEach(function (h) { t.sh.getRange(startRow + k, t.col[h] + 1).setValue(o[h] == null ? '' : o[h]); }); });
  }
}

function appendLog_(rows) {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_LOG);
  if (!sh) throw new Error('The tab "' + CFG.TAB_LOG + '" was not found.');
  if (!rows.length) return;
  var width = CFG.LOG_HEADERS.length;
  var start = Math.max(sh.getLastRow(), 1) + 1, last = start + rows.length - 1;
  if (last > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), last - sh.getMaxRows());
  sh.getRange(start, 7, rows.length, 1).setNumberFormat('@');   // School Year, so 2026-27 is not turned into a date
  sh.getRange(start, 1, rows.length, width).setValues(rows.map(function (r) { var x = r.slice(0, width); while (x.length < width) x.push(''); return x; }));
}

function campusNames_() {
  var t = table_(CFG.TAB_REGISTER), seen = {}, out = [];
  for (var i = 1; i < t.values.length; i++) {
    var n = String(t.values[i][t.col['Campus']] || '').trim();
    if (n && !seen[n]) { seen[n] = 1; out.push(n); }
  }
  return out.sort(function (a, b) { return a.localeCompare(b); });
}

/** Settings tab: school-year start month and the Annual / One-time cycle of each requirement. */
function readSettings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_SETTINGS);
  var startMonth = 7;
  if (sh) {
    var vals = sh.getDataRange().getValues();
    for (var i = 0; i < vals.length; i++) {
      if (norm_(vals[i][0]).indexOf('school year starts in month') === 0) { var m = Number(vals[i][2]); if (m >= 1 && m <= 12) startMonth = m; }
    }
  }
  return { startMonth: startMonth };
}

function carrySettings_() {
  var out = {};
  CFG.ITEMS.forEach(function (it) { out[it.key] = it.key === 'Articles of Incorporation' ? 'One-time' : 'Annual'; });
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_SETTINGS);
  if (!sh) return out;
  var vals = sh.getDataRange().getValues(), names = null, cycles = null;
  vals.forEach(function (row) {
    var a = norm_(row[0]);
    if (a === 'requirement') names = row;
    if (a === 'cycle') cycles = row;
  });
  if (names && cycles) {
    for (var j = 2; j < names.length; j++) {
      var nm = String(names[j]).trim(), cy = String(cycles[j]).trim();
      if (nm && out[nm] !== undefined && (cy === 'One-time' || cy === 'Annual')) out[nm] = cy;
    }
  }
  return out;
}

/**
 * Which items count toward Registered (reg) and which are needed to be Legalized (req), one true/false per CFG.ITEMS entry.
 * Read from the Settings tab ("Counts toward Registered?" and "Needed to be Legalized?" rows, one column per requirement name),
 * so changing a Yes or No there changes the sheet and the dashboard together. Missing or unreadable cells fall back to CFG.
 * Anything needed to register is always needed to be Legalized too.
 */
function itemFlags_() {
  var reg = CFG.ITEMS.map(function (it) { return !!it.reg; });
  var req = CFG.ITEMS.map(function (it) { return !it.optional; });
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_SETTINGS);
  if (sh) {
    var vals = sh.getDataRange().getValues(), names = null, regRow = null, reqRow = null;
    vals.forEach(function (row) {
      var a = norm_(row[0]);
      if (a === 'requirement') names = row;
      if (a === 'counts toward registered?') regRow = row;
      if (a === 'needed to be legalized?') reqRow = row;
    });
    if (names) {
      CFG.ITEMS.forEach(function (it, i) {
        var j = -1;
        for (var k = 2; k < names.length && j < 0; k++) {
          var nm = String(names[k]).trim();
          if (nm === it.key || (it.headerAliases || []).indexOf(nm) >= 0) j = k;
        }
        if (j < 0) return;
        function yn(row) { var s = norm_(row ? row[j] : ''); return s === 'yes' ? true : s === 'no' ? false : null; }
        var r1 = yn(regRow), r2 = yn(reqRow);
        if (r1 !== null) reg[i] = r1;
        if (r2 !== null) req[i] = r2;
      });
    }
  }
  CFG.ITEMS.forEach(function (it, i) { if (reg[i]) req[i] = true; });
  return { reg: reg, req: req };
}

function setCurrentYear_(label) {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_SETTINGS);
  if (!sh) return;
  var vals = sh.getDataRange().getValues();
  for (var i = 0; i < vals.length; i++) {
    if (norm_(vals[i][0]) === 'current school year') { sh.getRange(i + 1, 3).setNumberFormat('@'); sh.getRange(i + 1, 3).setValue(label); return; }
  }
}

/* ================================================================== one-time update to the 2026-10-02 document list */

/**
 * Menu: brings a tracker that already has data up to the new document list. It
 *   - saves a backup copy of this spreadsheet in Drive first,
 *   - merges the "Bank Account Info" and "Tax ID EIN Letter" columns of Campus Register into one, "Bank and EIN Letter"
 *     (the old Tax ID column is emptied, renamed "(retired)" and hidden, so nothing else in the sheet has to move),
 *   - rewrites the calculated columns of Campus Register and the Settings counts so insurance is optional,
 *   - adds the "Needed to be Legalized?" row to Settings (change a Yes or No there and the sheet and the dashboard follow),
 *   - corrects the wording on Start Here and the Summary tab,
 *   - moves bank letters from Parent Org Bank Info into each campus's folder in Parent Org Documents.
 * Safe to run again: each step only changes what still needs changing.
 */
function updateDocumentList() {
  var ui = SpreadsheetApp.getUi();
  var go = ui.alert('Update to the new document list',
    'This brings this spreadsheet up to the new list of documents:\n\n' +
    '- The Tax ID (EIN) letter and the bank letter become one item, Bank and EIN Letter.\n' +
    '- Insurance stays on the list but is optional: a PTO/PTA does not need it to be Legalized.\n' +
    '- Bank letters already filed in Parent Org Bank Info move into each campus folder in Parent Org Documents.\n\n' +
    'A backup copy of this spreadsheet is saved in your Drive first. Running this again is safe.\n\nContinue?', ui.ButtonSet.OK_CANCEL);
  if (go !== ui.Button.OK) return;
  var res;
  try { res = applyDocumentUpdate_(); }
  catch (err) { ui.alert('Not updated', err.message, ui.ButtonSet.OK); return; }
  ui.alert(res.ok ? 'Updated' : 'Updated, but please check', res.lines.join('\n'), ui.ButtonSet.OK);
}

/** Old and new item statuses for the one merged item. Never accepts something that was not fully accepted. */
function mergeStatus_(a, b) {
  var x = String(a == null ? '' : a).trim() || 'Not Received', y = String(b == null ? '' : b).trim() || 'Not Received';
  if (x === 'Needs Correction' || y === 'Needs Correction') return 'Needs Correction';
  if (x === 'Accepted' && y === 'Accepted') return 'Accepted';
  if (x === 'Not Received' && y === 'Not Received') return 'Not Received';
  return 'Received';
}

function colLetter_(idx0) {
  var n = idx0 + 1, s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function applyDocumentUpdate_() {
  var ss = SpreadsheetApp.getActive(), lines = [], problems = [];
  var regSheet = ss.getSheetByName(CFG.TAB_REGISTER);
  if (!regSheet) throw new Error('The tab "' + CFG.TAB_REGISTER + '" was not found. Nothing was changed.');
  if (!ss.getSheetByName(CFG.TAB_SETTINGS)) throw new Error('The tab "' + CFG.TAB_SETTINGS + '" was not found. Nothing was changed.');
  var t = table_(CFG.TAB_REGISTER);
  var newBank = itemByKey_('Bank Verification Letter').key;
  var hasNew = t.headers.indexOf(newBank) >= 0 || t.headers.indexOf(CFG.PREV_BANK_HEADER) >= 0;
  var bankIdx = t.headers.indexOf(newBank) >= 0 ? t.headers.indexOf(newBank) : t.headers.indexOf(hasNew ? CFG.PREV_BANK_HEADER : CFG.OLD_BANK_HEADER);
  var taxIdx = t.headers.indexOf(CFG.OLD_TAX_HEADER);
  if (bankIdx < 0) throw new Error('Campus Register has no column headed "' + CFG.OLD_BANK_HEADER + '" or "' + newBank + '". Nothing was changed.');
  CFG.ITEMS.forEach(function (it) {
    if (it.key !== newBank && t.col[it.key] === undefined) throw new Error('Campus Register has no column headed "' + it.key + '". Nothing was changed.');
  });
  var settingsCheck = settingsLayout_();      // throws, before anything is changed, when the Settings tab is not laid out as expected

  // 1. backup
  var tz = ss.getSpreadsheetTimeZone();
  var copy = DriveApp.getFileById(ss.getId()).makeCopy('PTO-PTA Tracker backup before document update ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'));
  lines.push('Backup saved in your Drive: ' + copy.getName());

  // 2. Campus Register: one Bank and EIN Letter column
  var merged = 0, hadTax = 0;
  if (taxIdx >= 0 || !hasNew) {
    var n = t.values.length - 1;
    if (n > 0) {
      var bankVals = [], taxVals = [];
      for (var i = 1; i < t.values.length; i++) {
        var campus = String(t.values[i][t.col['Campus']] || '').trim();
        var b = t.values[i][bankIdx], x = taxIdx >= 0 ? t.values[i][taxIdx] : '';
        if (!campus) { bankVals.push([b]); taxVals.push([x]); continue; }
        var m = taxIdx >= 0 ? mergeStatus_(b, x) : (String(b == null ? '' : b).trim() || 'Not Received');
        var xs = String(x == null ? '' : x).trim();
        if (xs && xs !== 'Not Received') hadTax++;
        if (m !== (String(b == null ? '' : b).trim() || 'Not Received')) merged++;
        bankVals.push([m]); taxVals.push(['']);
      }
      regSheet.getRange(2, bankIdx + 1, n, 1).setValues(bankVals);
      if (taxIdx >= 0) regSheet.getRange(2, taxIdx + 1, n, 1).setValues(taxVals);
    }
    if (t.headers[bankIdx] !== CFG.PREV_BANK_HEADER) regSheet.getRange(1, bankIdx + 1).setValue(newBank);
    if (taxIdx >= 0) {
      regSheet.getRange(1, taxIdx + 1).setValue(CFG.RETIRED_TAX_HEADER);
      regSheet.hideColumns(taxIdx + 1);
    }
    lines.push('Campus Register: the bank letter and the Tax ID (EIN) letter are now one column, ' + (t.headers[bankIdx] === CFG.PREV_BANK_HEADER ? CFG.PREV_BANK_HEADER : newBank) + '.' +
      (hadTax ? ' ' + hadTax + (hadTax === 1 ? ' campus had' : ' campuses had') + ' a Tax ID letter on file; ' + (merged === 1 ? '1 campus is' : merged + ' campuses are') + ' set to Received so a reviewer can look at the merged item again. Nothing was accepted that was not fully accepted.' : ''));
  } else lines.push('Campus Register: already has one bank letter column.');

  // 3. Settings: names, cycles, flags, counts
  updateSettings_();
  lines.push('Settings: added the row "Needed to be Legalized?" (Insurance is No). Change any Yes or No there and the sheet and the dashboard follow.');

  // 4. calculated columns of Campus Register
  var nf = rewriteRegisterFormulas_();
  lines.push('Campus Register: recalculated the Status and count columns for ' + nf + ' rows.');

  // 5. wording
  var texts = updateWordingAfterDocs_();
  if (texts) lines.push('Updated the wording on Start Here and Summary (' + texts + ' places).');

  // 6. bank letters into campus folders
  var mv = moveBankFiles_();
  if (mv.moved) lines.push('Moved ' + mv.moved + (mv.moved === 1 ? ' file' : ' files') + ' from Parent Org Bank Info into the campus folders in Parent Org Documents. The Parent Org Bank Info folder is now empty and can be deleted in Drive.');
  else lines.push('No files needed to move out of Parent Org Bank Info.');

  // 7. look for errors the calculations might show
  SpreadsheetApp.flush();
  var bad = scanForErrors_();
  if (bad.length) {
    problems = bad;
    lines.push('', 'Please check: these cells show an error: ' + bad.slice(0, 6).join(', ') + (bad.length > 6 ? ' and ' + (bad.length - 6) + ' more' : '') + '.',
      'If anything looks wrong, the backup copy above has everything as it was.');
  }
  return { ok: !problems.length, lines: lines };
}

/** Finds the rows of the Settings tab the update works with. Throws a plain message when one is missing. */
function settingsLayout_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_SETTINGS);
  var vals = sh.getDataRange().getValues(), rows = {};
  vals.forEach(function (r, i) { var a = norm_(r[0]); if (a && rows[a] === undefined) rows[a] = i + 1; });
  ['requirement', 'cycle', 'counts toward registered?', 'items required to be registered', 'items required to be legalized'].forEach(function (k) {
    if (!rows[k]) throw new Error('The Settings tab has no row labelled "' + k + '" in column A. Nothing was changed.');
  });
  var names = vals[rows['requirement'] - 1], first = 2, last = 2;
  for (var j = 2; j < names.length; j++) if (String(names[j]).trim()) last = j;
  var legalRow = rows['needed to be legalized?'] || 15;
  if (!rows['needed to be legalized?'] && String(vals[legalRow - 1] ? vals[legalRow - 1][0] : '').trim()) {
    throw new Error('Settings row ' + legalRow + ' is not empty, so the "Needed to be Legalized?" row cannot be added there. Nothing was changed.');
  }
  return { sh: sh, vals: vals, rows: rows, first: first, last: last, legalRow: legalRow };
}

function updateSettings_() {
  var L = settingsLayout_(), sh = L.sh, names = L.vals[L.rows['requirement'] - 1];
  var newBank = itemByKey_('Bank Verification Letter').key, retiredCol = -1;
  for (var j = L.first; j <= L.last; j++) {
    var nm = String(names[j]).trim();
    if (nm === CFG.OLD_BANK_HEADER) { sh.getRange(L.rows['requirement'], j + 1).setValue(newBank); names[j] = newBank; }
    else if (nm === CFG.OLD_TAX_HEADER) { sh.getRange(L.rows['requirement'], j + 1).setValue(CFG.RETIRED_TAX_HEADER); names[j] = CFG.RETIRED_TAX_HEADER; retiredCol = j; }
    else if (nm === CFG.RETIRED_TAX_HEADER) retiredCol = j;
  }
  if (retiredCol >= 0) {
    sh.getRange(L.rows['cycle'], retiredCol + 1).setValue('Annual');
    sh.getRange(L.rows['counts toward registered?'], retiredCol + 1).setValue('No');
    sh.hideColumns(retiredCol + 1);
  }
  // the bank and EIN letter is renewed each year (the Tax ID letter used to carry forward)
  for (var k = L.first; k <= L.last; k++) if (String(names[k]).trim() === newBank) sh.getRange(L.rows['cycle'], k + 1).setValue('Annual');
  // "Needed to be Legalized?" row: only fill cells that are empty, so a Yes or No someone chose is kept
  var cur = L.vals[L.legalRow - 1] || [];
  sh.getRange(L.legalRow, 1).setValue('Needed to be Legalized?');
  var lastLetter = colLetter_(L.last), firstLetter = colLetter_(L.first);
  for (var c = L.first; c <= L.last; c++) {
    var nm2 = String(names[c]).trim();
    if (String(cur[c] == null ? '' : cur[c]).trim()) continue;
    var it = CFG.ITEMS.filter(function (x) { return x.key === nm2; })[0];
    sh.getRange(L.legalRow, c + 1).setValue(it && !it.optional ? 'Yes' : 'No');
  }
  sh.getRange(L.rows['items required to be legalized'], 3).setFormula('=COUNTIF(' + firstLetter + L.legalRow + ':' + lastLetter + L.legalRow + ',"Yes")');
  sh.getRange(L.rows['items required to be registered'], 3).setFormula('=COUNTIF(' + firstLetter + L.rows['counts toward registered?'] + ':' + lastLetter + L.rows['counts toward registered?'] + ',"Yes")');
  sh.getRange(L.rows['items required to be registered'], 4).setValue('Registered = training certificate, bylaws and officer information accepted.');
  sh.getRange(L.rows['items required to be legalized'], 4).setValue('Legalized = every item marked Yes in the row "Needed to be Legalized?" accepted: the three above plus four more. Insurance is optional (No).');
  sh.getRange(L.legalRow, 1).setFontWeight('bold');
}

/** Rewrites the seven calculated columns of Campus Register (only in rows that already hold formulas). Returns how many rows.
 *  Accepted and Not Needed both count toward Registered and Legalized. */
function rewriteRegisterFormulas_(fillMissing) {
  var L = settingsLayout_();
  var t = table_(CFG.TAB_REGISTER), sh = t.sh;
  var itemCols = [];
  CFG.ITEMS.forEach(function (it) { itemCols.push(t.col[it.key]); });
  var retired = t.headers.indexOf(CFG.RETIRED_TAX_HEADER);
  var all = itemCols.concat(retired >= 0 ? [retired] : []);
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  // the Settings columns must line up one for one with the register's item columns
  var names = L.vals[L.rows['requirement'] - 1];
  if (hi - lo !== L.last - L.first) throw new Error('The requirement columns on Settings (' + (L.last - L.first + 1) + ') and Campus Register (' + (hi - lo + 1) + ') do not match, so the formulas were not rewritten. Restore the backup and ask for help.');
  for (var p = 0; p <= hi - lo; p++) {
    var a = norm_(t.headers[lo + p]), b = norm_(names[L.first + p]);
    if (a !== b && !(a === norm_(CFG.OLD_BANK_HEADER) && b === norm_(CFG.OLD_BANK_HEADER))) throw new Error('Settings lists "' + names[L.first + p] + '" where Campus Register has "' + t.headers[lo + p] + '", so the formulas were not rewritten. Restore the backup and ask for help.');
  }
  var h = {};
  ['Campus', 'Has PTO or PTA', 'Items Received', 'Registration Items Accepted', 'Legalization Items Accepted', 'Status', 'Items Awaiting Review', 'Items Needing Correction', 'Not Yet Accepted'].forEach(function (k) {
    if (t.col[k] === undefined) throw new Error('Campus Register has no column headed "' + k + '". The formulas were not rewritten.');
    h[k] = colLetter_(t.col[k]);
  });
  var fl = colLetter_(lo), ll = colLetter_(hi);
  var sFirst = colLetter_(L.first), sLast = colLetter_(L.last);
  var flagsReg = 'Settings!$' + sFirst + '$' + L.rows['counts toward registered?'] + ':$' + sLast + '$' + L.rows['counts toward registered?'];
  var flagsReq = 'Settings!$' + sFirst + '$' + L.legalRow + ':$' + sLast + '$' + L.legalRow;
  var sReg = 'Settings!$C$' + L.rows['items required to be registered'], sLeg = 'Settings!$C$' + L.rows['items required to be legalized'];
  var statusCol = t.col['Status'];
  var nrows = t.values.length - 1;
  if (nrows < 1) return 0;
  var existing = sh.getRange(2, statusCol + 1, nrows, 1).getFormulas();
  var campusVals = sh.getRange(2, t.col['Campus'] + 1, nrows, 1).getValues();
  function build(r) {
    var g = fl + r + ':' + ll + r, camp = '$' + h['Campus'] + r, pto = '$' + h['Has PTO or PTA'] + r;
    var P = '$' + h['Items Received'] + r, Q = '$' + h['Registration Items Accepted'] + r, R = '$' + h['Legalization Items Accepted'] + r;
    var parts = CFG.ITEMS.map(function (it) {
      var cl = colLetter_(t.col[it.key]);
      var sc = colLetter_(L.first + (t.col[it.key] - lo));
      return 'IF(AND(' + cl + r + '<>"Accepted",' + cl + r + '<>"Not Needed",Settings!$' + sc + '$' + L.legalRow + '="Yes"),", "&' + cl + '$1,"")';
    }).join('&');
    var f = {};
    f['Items Received'] = '=IF(' + camp + '="","",COUNTIF(' + g + ',"Accepted")+COUNTIF(' + g + ',"Received")+COUNTIF(' + g + ',"Needs Correction"))';
    // Not Needed (a reviewer decided this PTO/PTA does not need the document) counts the same as Accepted
    f['Registration Items Accepted'] = '=IF(' + camp + '="","",SUMPRODUCT(((' + g + '="Accepted")+(' + g + '="Not Needed"))*(' + flagsReg + '="Yes")))';
    f['Legalization Items Accepted'] = '=IF(' + camp + '="","",SUMPRODUCT(((' + g + '="Accepted")+(' + g + '="Not Needed"))*(' + flagsReq + '="Yes")))';
    f['Status'] = '=IF(' + camp + '="","",IF(' + pto + '="No","No PTO/PTA",IF(' + pto + '<>"Yes","Not Yet Confirmed",IF(' + R + '>=' + sLeg + ',"Legalized",IF(' + Q + '>=' + sReg + ',"Registered",IF(' + P + '>0,"In Progress","Not Started"))))))';
    f['Items Awaiting Review'] = '=IF(' + camp + '="","",COUNTIF(' + g + ',"Received"))';
    f['Items Needing Correction'] = '=IF(' + camp + '="","",COUNTIF(' + g + ',"Needs Correction"))';
    f['Not Yet Accepted'] = '=IF(' + camp + '="","",IF(' + pto + '<>"Yes","",IF(' + R + '>=' + sLeg + ',"None",MID(' + parts + ',3,400))))';
    return f;
  }
  var calc = ['Items Received', 'Registration Items Accepted', 'Legalization Items Accepted', 'Status', 'Items Awaiting Review', 'Items Needing Correction', 'Not Yet Accepted'];
  var cols = {}; calc.forEach(function (k) { cols[k] = []; });
  var count = 0;
  for (var i = 0; i < nrows; i++) {
    // fillMissing: also give formulas to campus rows that have none (rows added below the ones the workbook came with)
    var hasF = String(existing[i][0] || '').charAt(0) === '=' || (!!fillMissing && cellText_(campusVals[i][0]) !== '');
    var f2 = hasF ? build(i + 2) : null;
    if (hasF) count++;
    calc.forEach(function (k) { cols[k].push([hasF ? f2[k] : '']); });
  }
  calc.forEach(function (k) { sh.getRange(2, t.col[k] + 1, nrows, 1).setFormulas(cols[k]); });
  try { sh.getRange(1, t.col['Items Awaiting Review'] + 1).setNote('How many items are Received and waiting for a reviewer. Filter this column to greater than 0 for the review queue.'); } catch (e) { /* a note is a nicety */ }
  return count;
}

/** Corrects wording that still describes the old list. Returns how many cells were changed or hidden. */
function updateWordingAfterDocs_() {
  var ss = SpreadsheetApp.getActive(), changed = 0;
  var start = ss.getSheetByName('Start Here');
  if (start) {
    var pairs = [
      ['Legalized: all nine items are Accepted. That is the three above plus the annual budget report (or meeting minutes showing budget approval), proof of 501(c) status, a bank verification letter listing two authorized signers, Articles of Incorporation, Tax ID (EIN) letter, and liability and property insurance.',
       'Legalized: all seven required items are Accepted. That is the three above plus the annual budget report (or meeting minutes showing budget approval), proof of 501(c) status, the bank verification letter listing two authorized signers together with the Tax ID (EIN) letter, and Articles of Incorporation. Liability and property insurance is optional: it is tracked when a PTO/PTA sends it, but it is not needed to be Legalized. The Settings tab row "Needed to be Legalized?" controls this.'],
      ['Add a File upload question for each of the eight lines below', 'Add a File upload question for each of the seven lines below'],
      ['      Bank Account Info (bank verification letter listing two authorized signers)', '      ' + itemByKey_('Bank Verification Letter').title],
      ['      Insurance (liability and property)', '      ' + itemByKey_('Insurance').title],
      ['9. In Drive, find the two folders the script created: Parent Org Documents and Parent Org Bank Info. Share Parent Org Documents with the people who review documents. Leave Parent Org Bank Info private, or share it only with reviewers. Campus folders are created inside them the first time a campus sends something.',
       '9. In Drive, find the folder the script created: Parent Org Documents. Share it with the people who review documents. Campus folders are created inside it the first time a campus sends something. Every document, bank letters included, goes in the campus folder, so share the folder only with people who may see bank letters.'],
      [' Bank letters go to Parent Org Bank Info.', ''],
      ['Share Parent Org Bank Info only if C1s should review bank letters, and only with them.', 'Bank letters are in the campus folders too, so share the folder only with people who may see them.'],
      ['Bank Account Info (Legalized): A bank verification letter from the financial institution that lists two authorized account signers.',
       'Bank and EIN Letter (Legalized): A bank verification letter from the financial institution that lists two authorized account signers, together with the Tax ID (EIN) letter. One document or two files.'],
      ['Insurance (Legalized): Liability and property insurance is on file.', 'Insurance (Optional): Liability and property insurance is on file. Not needed to be Legalized.'],
      ['sees campus status, the nine-item checklist', 'sees campus status, the eight-item checklist'],
      ['keeps Articles of Incorporation and the Tax ID (EIN) letter, and resets the other seven items', 'keeps Articles of Incorporation, and resets the other seven items'],
      ['with bank letters in the separate Bank Info folder. ', 'with bank letters in the campus folders like every other document. '],
      ['and keep Parent Org Bank Info restricted.', 'and share the Parent Org Documents folder only with people who may see them.'],
      ['1. Articles and EIN letter are one-time and carry forward; everything else, including insurance, renews yearly.', '1. Only Articles of Incorporation is one-time and carries forward; everything else, including the bank and EIN letter and insurance, renews yearly.'],
      ['The budget proof, 501(c) proof and bank letter count toward Legalized only.', 'The budget proof, 501(c) proof, bank and EIN letter and Articles count toward Legalized only. Insurance is optional and counts toward neither.'],
      ['7. Booster clubs are not tracked: the officer import leaves their forms out entirely.', '7. Booster clubs are not tracked: the officer import leaves their forms out entirely.  8. Changed on October 2, 2026: the Tax ID (EIN) letter and the bank letter are one item (Bank and EIN Letter), liability and property insurance is optional, and every document, bank letters included, is filed in the campus folder (there is no separate bank folder).']
    ];
    var hideStarts = ['Tax ID EIN Letter (Legalized):'];
    var hideEquals = ['Tax ID EIN Letter'];
    var v = start.getDataRange().getValues();
    for (var i = 0; i < v.length; i++) {
      var cell = v[i][0];
      if (typeof cell !== 'string' || !cell) continue;
      var s = cell;
      pairs.forEach(function (p) {
        if (s.indexOf(p[0]) < 0) return;
        if (p[1].indexOf(p[0]) >= 0 && s.indexOf(p[1]) >= 0) return;      // the new wording starts with the old: already done, do not add it twice
        s = s.split(p[0]).join(p[1]);
      });
      if (s !== cell) { start.getRange(i + 1, 1).setValue(s); changed++; }
      var tr = cell.trim();
      if (hideEquals.indexOf(tr) >= 0 || hideStarts.some(function (x) { return tr.indexOf(x) === 0; })) { start.hideRows(i + 1); changed++; }
    }
  }
  var sum = ss.getSheetByName('Summary');
  if (sum) {
    var sv = sum.getDataRange().getValues();
    for (var r = 0; r < sv.length; r++) {
      var a = String(sv[r][0] == null ? '' : sv[r][0]).trim();
      if (a === CFG.OLD_BANK_HEADER) { sum.getRange(r + 1, 1).setValue(itemByKey_('Bank Verification Letter').key); changed++; }
      else if (a === CFG.OLD_TAX_HEADER) { sum.hideRows(r + 1); changed++; }
      else if (a === 'Insurance') { sum.getRange(r + 1, 1).setValue('Insurance (optional)'); changed++; }
    }
  }
  return changed;
}

/** Moves every file from Parent Org Bank Info (campus by campus) into the same campus folder under Parent Org Documents. */
function moveBankFiles_() {
  var out = { moved: 0 }, id = PropertiesService.getScriptProperties().getProperty(CFG.OLD_BANK_FOLDER_PROP);
  if (!id) return out;
  var bankRoot;
  try { bankRoot = DriveApp.getFolderById(id); } catch (err) { return out; }
  var docsRoot = rootFolder_();
  var dateStr = Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  function moveAll(from, to) {
    var files = [], it = from.getFiles();
    while (it.hasNext()) files.push(it.next());
    files.forEach(function (f) {
      var nm = f.getName();
      if (to.getFilesByName(nm).hasNext()) {
        var ext = extensionOf_(nm), base = ext ? nm.slice(0, nm.length - ext.length) : nm;
        f.setName(uniqueName_(to, base, ext, dateStr));
      }
      f.moveTo(to); out.moved++;
    });
  }
  var subs = [], si = bankRoot.getFolders();
  while (si.hasNext()) subs.push(si.next());
  subs.forEach(function (sub) { moveAll(sub, campusFolder_(docsRoot, sub.getName())); });
  moveAll(bankRoot, docsRoot);       // anything filed loose in the bank folder itself
  return out;
}

/** Cells in Campus Register and Summary that show a spreadsheet error. */
function scanForErrors_() {
  var ss = SpreadsheetApp.getActive(), bad = [];
  [[CFG.TAB_REGISTER, 80, 26], ['Summary', 60, 8]].forEach(function (x) {
    var sh = ss.getSheetByName(x[0]);
    if (!sh) return;
    var rows = Math.min(x[1], sh.getMaxRows()), cols = Math.min(x[2], sh.getLastColumn() || x[2]);
    if (rows < 1 || cols < 1) return;
    var v = sh.getRange(1, 1, rows, cols).getDisplayValues();
    for (var i = 0; i < v.length; i++) for (var j = 0; j < v[i].length; j++) {
      if (/^(#REF!|#VALUE!|#NAME\?|#N\/A|#DIV\/0!|#ERROR!|Err:)/.test(String(v[i][j]))) bad.push("'" + x[0] + "'!" + colLetter_(j) + (i + 1));
    }
  });
  return bad;
}

/* ================================================================== every campus of every Area Office */

/** Settings "Current school year", else the newest year in the register. */
function currentYear_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_SETTINGS);
  if (sh) {
    var vals = sh.getDataRange().getValues();
    for (var i = 0; i < vals.length; i++) {
      if (norm_(vals[i][0]) === 'current school year') { var y = cellText_(vals[i][2]); if (/^\d{4}-\d{2}$/.test(y)) return y; }
    }
  }
  return latestYear_(table_(CFG.TAB_REGISTER));
}

/** Menu: makes sure every campus on the Area Office Campuses tab is on the Campus Register for the current school year. */
function addAreaCampuses() {
  var ui = SpreadsheetApp.getUi();
  try { ui.alert('Campuses added', areaSummary_(addAreaCampuses_()).join('\n'), ui.ButtonSet.OK); }
  catch (err) { ui.alert('No campuses were added', err.message, ui.ButtonSet.OK); }
}

function areaSummary_(r) {
  var L = ['School year ' + r.year + ': the Area Office Campuses tab lists ' + plural_(r.listed, 'campus', 'campuses') + '.'];
  L.push(r.added ? plural_(r.added, 'campus was', 'campuses were') + ' added to the Campus Register, with nothing received yet.' : 'Every campus was already on the Campus Register.');
  if (r.areaFilled) L.push('Area Office was filled in for ' + plural_(r.areaFilled, 'campus', 'campuses') + ' that had none.');
  if (r.ptaYes || r.ptaType) L.push('Texas PTA roster: ' + plural_(r.ptaYes, 'campus is', 'campuses are') + ' now marked as having a PTO/PTA, and Org Type was set to PTA for ' + plural_(r.ptaType, 'campus', 'campuses') + '.');
  if (r.ptaNo.length) L.push('On the Texas PTA roster but marked No in the register, so left alone: ' + r.ptaNo.join(', ') + '.');
  if (r.formSynced > 0) L.push('The document form now lists ' + r.formSynced + ' campuses.');
  else if (r.added && r.formSynced === 0) L.push('Use "Refresh the campus list in the form" so the form lists the new campuses.');
  return L;
}

/**
 * Reads the Area Office Campuses tab (Campus, Area Office, and optionally Name in the register, Texas PTA, Texas PTA status) and, for the
 * current school year:
 *   - adds every campus the register does not have (nothing received, Has PTO or PTA Not Yet Confirmed: "nothing received yet"),
 *   - fills in Area Office where the register has none (it never changes one that is filled in),
 *   - for a campus with Yes in Texas PTA: Has PTO or PTA becomes Yes (unless it is No) and an empty Org Type becomes PTA.
 * "Name in the register" says which register row a campus is when the two lists spell it differently. Safe to run again.
 */
function addAreaCampuses_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(CFG.TAB_CAMPUSES);
    if (!sh) throw new Error('There is no "' + CFG.TAB_CAMPUSES + '" tab. Import the Area Office Campuses file as a new tab with that name (File > Import > Upload > Insert new sheet), then run this again.');
    var vals = sh.getDataRange().getValues(), head = vals[0].map(function (x) { return norm_(x); });
    var ci = head.indexOf('campus'), ai = head.indexOf('area office'), ri = head.indexOf('name in the register'), pi = head.indexOf('texas pta');
    if (ci < 0 || ai < 0) throw new Error('The "' + CFG.TAB_CAMPUSES + '" tab needs the headings Campus and Area Office in row 1.');
    var year = currentYear_();
    var t = table_(CFG.TAB_REGISTER), map = campusMap_(), carry = carrySettings_();
    var res = { year: year, listed: 0, added: 0, areaFilled: 0, ptaYes: 0, ptaType: 0, ptaNo: [], formSynced: -1 };
    var fresh = [], freshKeys = {};
    for (var i = 1; i < vals.length; i++) {
      var campus = cellText_(vals[i][ci]), area = cellText_(vals[i][ai]);
      if (!campus) continue;
      res.listed++;
      var name = (ri >= 0 ? cellText_(vals[i][ri]) : '') || campus;
      var pta = pi >= 0 && norm_(vals[i][pi]) === 'yes';
      var canon = lookup_(map, name) || lookup_(map, campus) || name;
      var row = findRow_(t, year, canon);
      if (!row) {
        if (freshKeys[norm_(canon)]) continue;
        freshKeys[norm_(canon)] = 1;
        var obj = newRegisterObj_(t, year, canon, carry);
        if (!cellText_(obj['Area Office'])) obj['Area Office'] = area;
        if (pta) {
          if (obj['Has PTO or PTA'] !== 'No') { obj['Has PTO or PTA'] = 'Yes'; res.ptaYes++; } else res.ptaNo.push(canon);
          if (!cellText_(obj['Org Type'])) { obj['Org Type'] = 'PTA'; res.ptaType++; }
        }
        fresh.push(obj); addToMap_(map, canon); res.added++;
        continue;
      }
      var v = t.values[row - 1];
      if (area && !cellText_(v[t.col['Area Office']])) { setCell_(t, row, 'Area Office', area); res.areaFilled++; }
      if (pta) {
        var has = cellText_(v[t.col['Has PTO or PTA']]);
        if (has === 'No') res.ptaNo.push(canon);
        else if (has !== 'Yes') { setCell_(t, row, 'Has PTO or PTA', 'Yes'); res.ptaYes++; }
        if (!cellText_(v[t.col['Org Type']])) { setCell_(t, row, 'Org Type', 'PTA'); res.ptaType++; }
      }
    }
    if (fresh.length) {
      fresh.sort(function (a, b) { return String(a['Campus']).localeCompare(String(b['Campus'])); });
      writeInputRows_(t, firstEmptyRow_(t), fresh);
      try { rewriteRegisterFormulas_(true); } catch (err) { /* the rows are added; the formulas follow the next time the update runs */ }
      try { res.formSynced = syncFormCampuses_(); } catch (err) { res.formSynced = 0; }
    }
    return res;
  } finally { lock.releaseLock(); }
}

/* ================================================================== one-time update: the October 2026 changes */

/**
 * Menu: brings a tracker that already has data up to the October 9, 2026 changes. It
 *   - saves a backup copy of this spreadsheet in Drive first,
 *   - makes Legalized the six documents in FACE's wording (Articles of Incorporation is no longer needed; it is still tracked),
 *   - adds the Not Needed status (a reviewer decided a PTO/PTA does not need a document; it counts as done) to the sheet's lists and formulas,
 *   - adds an Email column to Dashboard Sign-ins, for reminding C1s,
 *   - optionally sets campuses marked Yes that have sent nothing back to Not Yet Confirmed (shown as "nothing received yet"),
 *   - adds every campus from the Area Office Campuses tab, if that tab is there,
 *   - updates the wording on Start Here.
 * Safe to run again: each step only changes what still needs changing.
 */
function updateOctober2026() {
  var ui = SpreadsheetApp.getUi();
  var go = ui.alert('Update the tracker: October 2026 changes',
    'This brings this spreadsheet up to the October 2026 changes:\n\n' +
    '- Legalized means the six documents in FACE\'s wording. Articles of Incorporation is still tracked but no longer needed.\n' +
    '- Bank and EIN Letter becomes Bank Verification Letter: the Tax ID (EIN) letter is no longer needed.\n' +
    '- Reviewers can mark a document Not Needed for a PTO/PTA. It counts as done.\n' +
    '- Dashboard Sign-ins gets an Email column, used to remind C1s.\n' +
    '- Every campus on the Area Office Campuses tab is added, if you have added that tab.\n' +
    '- The Start Here tab gets the new wording.\n\n' +
    'A backup copy of this spreadsheet is saved in your Drive first. Running this again is safe.\n\nContinue?', ui.ButtonSet.OK_CANCEL);
  if (go !== ui.Button.OK) return;
  var reset = false, n = 0;
  try { n = unstartedYes_(currentYear_(), false); } catch (err) { n = 0; }
  if (n) {
    reset = ui.alert('Campuses that have sent nothing',
      plural_(n, 'campus is', 'campuses are') + ' marked Yes for Has PTO or PTA but ' + (n === 1 ? 'has' : 'have') + ' sent nothing this school year (no documents, no officer form, nothing in the log).\n\n' +
      'Set ' + (n === 1 ? 'it' : 'them') + ' to Not Yet Confirmed, so the dashboard counts only campuses that have sent something (and the PTAs on the Texas PTA roster) as PTO/PTAs? ' +
      'A campus becomes Yes again by itself as soon as it sends something.\n\nYes = set them to Not Yet Confirmed. No = leave them as Yes.', ui.ButtonSet.YES_NO) === ui.Button.YES;
  }
  var res;
  try { res = applyOctober2026_({ reset: reset }); }
  catch (err) { ui.alert('Not updated', err.message, ui.ButtonSet.OK); return; }
  ui.alert(res.ok ? 'Updated' : 'Updated, but please check', res.lines.join('\n'), ui.ButtonSet.OK);
}

function applyOctober2026_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActive(), lines = [];
  if (!ss.getSheetByName(CFG.TAB_REGISTER)) throw new Error('The tab "' + CFG.TAB_REGISTER + '" was not found. Nothing was changed.');
  if (!ss.getSheetByName(CFG.TAB_SETTINGS)) throw new Error('The tab "' + CFG.TAB_SETTINGS + '" was not found. Nothing was changed.');
  var t = table_(CFG.TAB_REGISTER);
  CFG.ITEMS.forEach(function (it) { if (t.col[it.key] === undefined) throw new Error('Campus Register has no column headed "' + it.key + '". If it still has Bank Account Info and Tax ID EIN Letter, run "Update to the new document list" first. Nothing was changed.'); });
  if (t.headers.indexOf(CFG.OLD_TAX_HEADER) >= 0) throw new Error('Campus Register still has the "' + CFG.OLD_TAX_HEADER + '" column. Run "Update to the new document list" first. Nothing was changed.');
  var L = settingsLayout_();
  if (!L.rows['needed to be legalized?']) throw new Error('The Settings tab has no "Needed to be Legalized?" row. Run "Update to the new document list" first. Nothing was changed.');

  // 1. backup
  var tz = ss.getSpreadsheetTimeZone();
  var copy = DriveApp.getFileById(ss.getId()).makeCopy('PTO-PTA Tracker backup before the October 2026 update ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'));
  lines.push('Backup saved in your Drive: ' + copy.getName());

  // 1b. the bank letter item is called Bank Verification Letter (no EIN letter)
  if (renameBankItem_()) lines.push('Bank and EIN Letter is now called ' + itemByKey_('Bank Verification Letter').key + ' (Campus Register, Settings and Summary). The Tax ID (EIN) letter is no longer needed. Rename the form question too (see "2. Check setup").');

  // 2. Settings: Legalized = six documents; Not Needed in the status list; the wording next to the counts
  var s = settingsOctober_();
  lines.push(s.articles ? 'Settings: Articles of Incorporation is no longer needed to be Legalized (row "Needed to be Legalized?" is now No). Legalized means the six documents in FACE\'s wording.'
    : 'Settings: Legalized already means the six documents.');
  if (s.listAdded) lines.push('Settings: Not Needed was added to the Item Status list.');

  // 3. Campus Register: formulas count Not Needed as done; the document dropdowns offer it
  var nf = rewriteRegisterFormulas_(true);
  setItemValidation_();
  lines.push('Campus Register: recalculated the Status and count columns for ' + nf + ' rows (Not Needed counts like Accepted), and the document dropdowns now offer Not Needed.');

  // 4. sign-ins: an Email column
  var si = ss.getSheetByName(CFG.TAB_SIGNINS);
  if (si && ensureEmailColumn_(si)) lines.push('Dashboard Sign-ins: added an Email column. Type each C1\'s email there; the Review tab uses it to remind C1s.');

  // 5. campuses marked Yes that have sent nothing
  if (opts.reset) {
    var nr = unstartedYes_(currentYear_(), true);
    lines.push(nr ? plural_(nr, 'campus that had sent nothing was', 'campuses that had sent nothing were') + ' set to Not Yet Confirmed (the dashboard shows "Nothing received yet").' : 'No campus needed to be set to Not Yet Confirmed.');
  }

  // 6. every campus of every Area Office
  if (ss.getSheetByName(CFG.TAB_CAMPUSES)) {
    var ar = addAreaCampuses_();
    lines = lines.concat(areaSummary_(ar));
  } else lines.push('The Area Office Campuses tab is not here yet. Import it (File > Import > Upload > Insert new sheet, named "' + CFG.TAB_CAMPUSES + '"), then choose PTO/PTA Tracker > Add every campus from the Area Office Campuses tab.');

  // 7. wording
  var w = updateWordingOctober_();
  if (w) lines.push('Updated the wording on Start Here (' + w + ' places).');

  SpreadsheetApp.flush();
  var bad = scanForErrors_();
  if (bad.length) lines.push('', 'Please check: these cells show an error: ' + bad.slice(0, 6).join(', ') + (bad.length > 6 ? ' and ' + (bad.length - 6) + ' more' : '') + '.', 'If anything looks wrong, the backup copy above has everything as it was.');
  return { ok: !bad.length, lines: lines };
}

/** Renames the Bank and EIN Letter column of Campus Register, its Settings column and its Summary row to Bank Verification Letter.
 *  Returns true when something was renamed. Files and log lines keep the old name; they are still read as this item. */
function renameBankItem_() {
  var ss = SpreadsheetApp.getActive(), key = itemByKey_('Bank Verification Letter').key, done = false;
  function inRow(sh, row) {
    if (!sh) return;
    var v = sh.getRange(row, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    v.forEach(function (x, j) { if (cellText_(x) === CFG.PREV_BANK_HEADER) { sh.getRange(row, j + 1).setValue(key); done = true; } });
  }
  inRow(ss.getSheetByName(CFG.TAB_REGISTER), 1);
  var L = settingsLayout_();
  inRow(L.sh, L.rows['requirement']);
  var sum = ss.getSheetByName('Summary');
  if (sum) {
    var sv = sum.getDataRange().getValues();
    for (var r = 0; r < sv.length; r++) if (cellText_(sv[r][0]) === CFG.PREV_BANK_HEADER) { sum.getRange(r + 1, 1).setValue(key); done = true; }
  }
  return done;
}

/** Settings for October 2026. Returns { articles: true when Articles was changed to No, listAdded: true when Not Needed was added }. */
function settingsOctober_() {
  var L = settingsLayout_(), sh = L.sh, out = { articles: false, listAdded: false };
  var names = L.vals[L.rows['requirement'] - 1], legal = L.vals[L.legalRow - 1] || [];
  for (var j = L.first; j <= L.last; j++) {
    var it = itemByKey_(cellText_(names[j]));
    if (it && it.optional && norm_(legal[j]) === 'yes') { sh.getRange(L.legalRow, j + 1).setValue('No'); if (it.key === 'Articles of Incorporation') out.articles = true; }
  }
  sh.getRange(L.rows['items required to be registered'], 4).setValue('Registered = ' + defsList_(true) + '.');
  sh.getRange(L.rows['items required to be legalized'], 4).setValue('Legalized = ' + defsList_(false) + '. Not Needed counts like Accepted.');
  // "Item Status" list at the bottom: add Not Needed below the last value
  for (var r = 0; r < L.vals.length; r++) {
    for (var c = 0; c < L.vals[r].length; c++) {
      if (norm_(L.vals[r][c]) !== 'item status') continue;
      var last = r, has = false;
      for (var k = r + 1; k < L.vals.length && cellText_(L.vals[k][c]); k++) { last = k; if (cellText_(L.vals[k][c]) === 'Not Needed') has = true; }
      if (!has) { sh.getRange(last + 2, c + 1).setValue('Not Needed'); out.listAdded = true; }
      return out;
    }
  }
  return out;
}

/** FACE's wording: the Registered list (reg = true) or the Legalized list, from the items and their flags in Settings. */
function defsList_(reg) {
  var f = itemFlags_(), list = [];
  [2, 0, 1, 3, 4, 5, 6, 7].forEach(function (i) {   // FACE lists the training certificate first
    var it = CFG.ITEMS[i];
    if (it && (reg ? f.reg[i] : f.req[i])) list.push(it.label.charAt(0).toLowerCase() + it.label.slice(1));
  });
  return list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list.join('');
}

/** The document columns of Campus Register get a dropdown with every status, Not Needed included. */
function setItemValidation_() {
  var t = table_(CFG.TAB_REGISTER), n = Math.max(t.sh.getMaxRows() - 1, 1);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(CFG.ITEM_STATUSES, true).setAllowInvalid(false)
    .setHelpText('Not Received, Received, Accepted, Needs Correction, or Not Needed (a reviewer decided this PTO/PTA does not need it).').build();
  CFG.ITEMS.forEach(function (it) { t.sh.getRange(2, t.col[it.key] + 1, n, 1).setDataValidation(rule); });
}

/**
 * Campuses of the school year marked Yes that have sent nothing: every document Not Received, no officer form on the Officers tab and no
 * line in the Submission Log. apply = true sets them to Not Yet Confirmed. Returns how many.
 */
function unstartedYes_(year, apply) {
  var ss = SpreadsheetApp.getActive(), t = table_(CFG.TAB_REGISTER), active = {};
  if (ss.getSheetByName(CFG.TAB_LOG)) {
    var lt = table_(CFG.TAB_LOG);
    for (var i = 1; i < lt.values.length; i++) if (cellText_(lt.values[i][lt.col['School Year']]) === year) active[norm_(lt.values[i][lt.col['Campus']])] = 1;
  }
  if (ss.getSheetByName(CFG.TAB_OFFICERS)) {
    var ot = table_(CFG.TAB_OFFICERS);
    for (var o = 1; o < ot.values.length; o++) if (cellText_(ot.values[o][ot.col['School Year']]) === year) active[norm_(ot.values[o][ot.col['Campus']])] = 1;
  }
  var n = 0;
  for (var r = 1; r < t.values.length; r++) {
    var v = t.values[r], campus = cellText_(v[t.col['Campus']]);
    if (!campus || cellText_(v[t.col['School Year']]) !== year || cellText_(v[t.col['Has PTO or PTA']]) !== 'Yes' || active[norm_(campus)]) continue;
    if (CFG.ITEMS.some(function (it) { var x = cellText_(v[t.col[it.key]]); return x && x !== 'Not Received'; })) continue;
    n++;
    if (apply) setCell_(t, r + 1, 'Has PTO or PTA', 'Not Yet Confirmed');
  }
  return n;
}

/** The Start Here tab in FACE's wording (October 2026). Returns how many cells changed. */
function updateWordingOctober_() {
  var start = SpreadsheetApp.getActive().getSheetByName('Start Here');
  if (!start) return 0;
  var byStart = [
    ['Registered:', 'Registered: these three are accepted for the school year: ' + defsList_(true) + '.'],
    ['Legalized:', 'Legalized: these are all accepted: ' + defsList_(false) + '. Articles of incorporation and liability and property insurance are tracked when a PTO/PTA sends them, but are not needed. A reviewer can mark any document Not Needed for a PTO/PTA (for example a PTA that Texas PTA covers); it then counts as done.'],
    ['Item status:', 'Item status: Not Received, Received (waiting for review), Accepted, Needs Correction, or Not Needed. Accepted and Not Needed count. The form sets Received; a reviewer checks each document off on the dashboard (or in the Campus Register tab).'],
    ['Has PTO or PTA:', 'Has PTO or PTA: Yes, No, or Not Yet Confirmed (the default; the dashboard shows it as "Nothing received yet"). A campus becomes Yes by itself when it sends documents or an officer form, when a reviewer checks a document off, or when the Texas PTA roster lists it. A form answer of Not Yet Confirmed never overwrites a Yes or a No.'],
    ['Articles of Incorporation (Legalized):', 'Articles of Incorporation (not needed): Filed Articles of Incorporation are on file. Tracked when a PTO/PTA sends them; not needed to be Registered or Legalized. One-time: carried into next year.'],
    ['Bank and EIN Letter (Legalized):', 'Bank Verification Letter (Legalized): ' + itemByKey_('Bank Verification Letter').label + '. The Tax ID (EIN) letter is no longer needed.'],
    ['Bank Verification Letter (Legalized):', 'Bank Verification Letter (Legalized): ' + itemByKey_('Bank Verification Letter').label + '. The Tax ID (EIN) letter is no longer needed.']
  ];
  var oldTitle = '      Bank and EIN Letter (bank verification letter listing two authorized signers, together with the Tax ID EIN letter)';
  var v = start.getDataRange().getValues(), changed = 0;
  for (var i = 0; i < v.length; i++) {
    var cell = v[i][0];
    if (typeof cell !== 'string' || !cell) continue;
    var s = cell;
    byStart.forEach(function (p) { if (cell.indexOf(p[0]) === 0) s = p[1]; });
    if (s.indexOf(oldTitle) >= 0) s = s.split(oldTitle).join('      ' + itemByKey_('Bank Verification Letter').title);
    if (cell.indexOf('1. Only Articles of Incorporation is one-time') === 0 && cell.indexOf('9. Changed on October 9, 2026') < 0) {
      s = cell + '  9. Changed on October 9, 2026: Registered and Legalized use FACE\'s wording, and Legalized means six documents (Articles of Incorporation is no longer needed). ' +
        'Reviewers check each document off on the dashboard (there, needs correction, not there, or not needed) with remarks that go into the email to the PTO/PTA. ' +
        'Every campus of every Area Office is listed; a campus counts as having a PTO/PTA once it sends something or is on the Texas PTA roster.';
    }
    if (s !== cell) { start.getRange(i + 1, 1).setValue(s); changed++; }
  }
  return changed;
}

/* ================================================================== year and file helpers */

function schoolYearFor_(date, startMonth) {
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var y = Number(Utilities.formatDate(date, tz, 'yyyy')), m = Number(Utilities.formatDate(date, tz, 'M'));
  var start = m >= (startMonth || 7) ? y : y - 1;
  return start + '-' + String(start + 1).slice(-2);
}

function nextYearLabel_(label) {
  var y = parseInt(label, 10);
  return (y + 1) + '-' + String(y + 2).slice(-2);
}

/** The item with this key, or with this as an older name (headerAliases), so a page or a log line from before a rename still works. */
function itemByKey_(key) {
  return CFG.ITEMS.filter(function (i) { return i.key === key; })[0] || CFG.ITEMS.filter(function (i) { return (i.headerAliases || []).indexOf(key) >= 0; })[0];
}
function uploadItems_() { return CFG.ITEMS.filter(function (i) { return i.upload; }); }
/** Words a form question may start with to mean this item: its key, and the names the form used before the items were combined. */
function itemNames_(it) { return [it.key].concat(it.formAliases || []); }
function titleIsItem_(title, it) { return itemNames_(it).some(function (n) { return startsWith_(title, n); }); }
function itemForTitle_(title) {
  var hit = null, hitLen = 0;
  CFG.ITEMS.forEach(function (it) {
    itemNames_(it).forEach(function (n) { if (startsWith_(title, n) && n.length > hitLen) { hit = it; hitLen = n.length; } });
  });
  return hit;
}

/** SharePoint- and Drive-friendly folder name. A leading or trailing * is dropped; other refused characters become a hyphen. */
function safeName_(name) {
  var s = String(name).trim().replace(/^\*+|\*+$/g, '').trim();
  s = s.replace(/["*:<>?\/\\|]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/, '');
  return s || 'Unnamed campus';
}

function extensionOf_(fileName) {
  var m = String(fileName).match(/\.[A-Za-z0-9]{1,6}$/);
  return m ? m[0] : '';
}

/** base.ext, else base - date.ext, else base - date (2).ext ... so nothing is ever overwritten. */
function uniqueName_(folder, base, ext, dateStr) {
  var name = base + ext;
  if (!folder.getFilesByName(name).hasNext()) return name;
  name = base + ' - ' + dateStr + ext;
  if (!folder.getFilesByName(name).hasNext()) return name;
  for (var n = 2; n < 500; n++) {
    name = base + ' - ' + dateStr + ' (' + n + ')' + ext;
    if (!folder.getFilesByName(name).hasNext()) return name;
  }
  throw new Error('Too many files with the same name.');
}

/** The one folder every document is filed under (a subfolder per campus). */
function rootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ROOT_DOCS_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* deleted: make a new one */ } }
  var f = DriveApp.createFolder(CFG.ROOT_DOCS);
  props.setProperty('ROOT_DOCS_ID', f.getId());
  return f;
}

function campusFolder_(root, campus) {
  var name = safeName_(campus);
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}
