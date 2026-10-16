/* Tests for the October 2026 changes in Code.gs. Run through test-script.js (node tests/test-script.js). */
'use strict';
var fs = require('fs');
var path = require('path');
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow, logRows = base.logRows, sub = base.sub, upload = base.upload, withPeople = base.withPeople;

var withAreaTab = require('./test-new-helpers').withAreaTab;
function campuses(g, year) { var t = g.table_('Campus Register'); return t.values.slice(1).filter(function (v) { return String(v[t.col['Campus']]).trim() && String(v[t.col['School Year']]) === (year || '2026-27'); }); }
function col(g, name) { return g.table_('Campus Register').col[name]; }

/* ---------- R4: every campus of every Area Office, and the Texas PTA roster ---------- */
test('the Area Office list adds every missing campus once, and matches the 152 the register has', function () {
  var g = h.load();
  eq(withAreaTab(g), 264);
  var r = g.addAreaCampuses_();
  eq(r.listed, 264);
  eq(r.added, 112, 'added');
  var rows = campuses(g);
  eq(rows.length, 266, 'register rows: 154 + 112');
  var names = {}; rows.forEach(function (v) { var n = v[col(g, 'Campus')]; ok(!names[n], 'duplicate ' + n); names[n] = 1; });
  ok(names['Highland Heights ES'] && !names['Highland Height ES'], 'the register spelling is kept for a campus the two lists spell differently');
  var again = g.addAreaCampuses_();
  eq(again.added, 0, 'running it again adds nothing');
});

test('new campuses have nothing received, the right Area Office, and formulas', function () {
  var g = h.load();
  withAreaTab(g); g.addAreaCampuses_();
  var row = regRow(g, 'Codwell ES');
  eq(row['Area Office'], 'NES Elementary');
  eq(row['Has PTO or PTA'], 'Not Yet Confirmed');
  eq(row['Bylaws'], 'Not Received');
  var t = g.table_('Campus Register'), r = g.findRow_(t, '2026-27', 'Codwell ES');
  ok(/Not Needed/.test(t.sh.getRange(r, t.col['Registration Items Accepted'] + 1).getFormulas()[0][0]), 'formula counts Not Needed');
});

test('Texas PTA campuses are marked as having a PTO/PTA, with Org Type PTA; withdrawn charters are not', function () {
  var g = h.load();
  withAreaTab(g);
  var r = g.addAreaCampuses_();
  eq(regRow(g, 'Travis ES')['Has PTO or PTA'], 'Yes');
  eq(regRow(g, 'Travis ES')['Org Type'], 'PTA');
  eq(regRow(g, 'Codwell ES')['Org Type'], '');
  var bon = regRow(g, 'Bonham ES');
  ok(bon && bon['Org Type'] !== 'PTA', 'Bonham (charter withdrawn) is not marked PTA');
  eq(r.ptaType, 11);
});

/* ---------- the October update on an existing sheet ---------- */
test('the October update: Articles no longer needed, Not Needed added, Email column, every campus', function () {
  var g = h.load();
  withAreaTab(g);
  var res = g.applyOctober2026_({ reset: false });
  ok(res.ok, res.lines.join(' / '));
  eq(g.itemFlags_().req, [true, true, true, true, true, true, false, false]);
  var st = g.__ss.getSheetByName('Settings').values();
  ok(st.some(function (r) { return r.indexOf('Not Needed') >= 0; }), 'Not Needed in the Item Status list');
  var si = g.__ss.getSheetByName('Dashboard Sign-ins').values()[0];
  ok(si.indexOf('Email') >= 0, 'Email column');
  eq(campuses(g).length, 266);
  var t = g.table_('Campus Register');
  ok(t.sh.validation[t.col['Bylaws']].rule.values.indexOf('Not Needed') >= 0, 'dropdown offers Not Needed');
  var start = g.__ss.getSheetByName('Start Here').values().map(function (r) { return r[0]; });
  var leg = start.filter(function (x) { return String(x).indexOf('Legalized:') === 0; })[0];
  ok(/bank account verification letter from financial institution listing two authorized account signers/.test(leg), leg);
  ok(!/articles of incorporation,/.test(leg.split('.')[0]), 'Articles is not in the Legalized list');
  var again = g.applyOctober2026_({ reset: false });
  ok(again.ok, 'safe to run again');
  eq(campuses(g).length, 266);
});

test('the October update can set campuses that sent nothing back to Not Yet Confirmed, keeping ones that sent something', function () {
  var g = h.load();
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  var before = g.unstartedYes_('2026-27', false).length;
  ok(before > 100, 'many template campuses are Yes with nothing sent: ' + before);
  withAreaTab(g);
  g.applyOctober2026_({ reset: true });
  eq(regRow(g, 'Anderson ES')['Has PTO or PTA'], 'Yes', 'sent something: stays Yes');
  eq(regRow(g, 'Ashford ES')['Has PTO or PTA'], 'Not Yet Confirmed');
  eq(regRow(g, 'Travis ES')['Has PTO or PTA'], 'Yes', 'Texas PTA roster: Yes');
  var yes = campuses(g).filter(function (v) { return v[col(g, 'Has PTO or PTA')] === 'Yes'; }).length;
  eq(yes, 12, 'Anderson + the 11 Texas PTAs');
});

/* ---------- documents arriving make a campus a PTO/PTA ---------- */
test('a submission with documents marks a Not Yet Confirmed campus Yes, but never overrides No', function () {
  var g = h.load();
  withAreaTab(g); g.addAreaCampuses_();
  g.processSubmission_(sub('Codwell ES', { hasPto: 'Not Yet Confirmed', uploads: [upload(g, 'Bylaws')] }));
  eq(regRow(g, 'Codwell ES')['Has PTO or PTA'], 'Yes');
  var t = g.table_('Campus Register');
  g.setCell_(t, g.findRow_(t, '2026-27', 'Frost ES'), 'Has PTO or PTA', 'No');
  g.processSubmission_(sub('Frost ES', { uploads: [upload(g, 'Bylaws')] }));
  eq(regRow(g, 'Frost ES')['Has PTO or PTA'], 'No');
  g.setCell_(t, g.findRow_(t, '2026-27', 'Mitchell ES'), 'Has PTO or PTA', 'Not Yet Confirmed');
  g.processSubmission_(sub('Mitchell ES', { hasPto: 'Not Yet Confirmed' }));
  eq(regRow(g, 'Mitchell ES')['Has PTO or PTA'], 'Not Yet Confirmed', 'nothing attached: unchanged');
});

test('"Other documents" files are filed and logged without changing any item', function () {
  var g = h.load();
  g.processSubmission_(sub('Anderson ES', { other: [{ ids: [g.__drive.upload('packet.pdf').getId()] }] }));
  var row = regRow(g, 'Anderson ES');
  ok(['Bylaws', 'Training Certificate', 'Officer Information'].every(function (k) { return row[k] === 'Not Received'; }), 'no item changed');
  var L = logRows(g);
  eq(L[0][3], 'Other documents');
  eq(L[0][4], 'packet.pdf');
});

test('an officer form for a Not Yet Confirmed campus marks it Yes', function () {
  var g = h.load();
  var t = g.table_('Campus Register');
  g.setCell_(t, g.findRow_(t, '2026-27', 'Ashford ES'), 'Has PTO or PTA', 'Not Yet Confirmed');
  var paste = g.__ss.getSheetByName('Officer Form Paste');
  paste.getRange(1, 1, 2, 7).setValues([['ID', 'Completion time', 'What school is your organization associated with?', 'What is the name of your organization?', 'Officer #1: Name', 'Officer #1: Email', 'Your email address'],
    ['9', new Date(Date.UTC(2026, 8, 1)), 'Ashford ES', 'Ashford PTO', 'Ann', 'ann@example.org', 'ann@example.org']]);
  var r = g.importOfficers_();
  eq(r.madeYes, 1);
  eq(regRow(g, 'Ashford ES')['Has PTO or PTA'], 'Yes');
});

/* ---------- R2: the checklist ---------- */
test('the checklist saves several documents at once, with remarks, and logs each change', function () {
  var g = h.load();
  var p = withPeople(g);
  var res = g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [
    { key: 'Bylaws', status: 'Accepted', remark: '' },
    { key: 'Training Certificate', status: 'Needs Correction', remark: 'The certificate is for last year.' },
    { key: 'Proof of 501c Status', status: 'Not Needed', remark: 'They have 501(c) proof.' },
    { key: 'Budget or Financial Report', status: 'Not Received', remark: 'We need the approved budget, not the draft.' }
  ], 'Please send everything to ParentOrgDocs.');
  ok(res.ok && res.changed);
  eq(res.d, 'ANCNXN');
  var row = regRow(g, 'Anderson ES');
  eq(row['Proof of 501c Status'], 'Not Needed');
  var notes = logRows(g).map(function (r) { return r[7]; });
  ok(notes.indexOf('Accepted: Bylaws') >= 0, notes.join(' | '));
  ok(notes.indexOf('Needs correction, Training Certificate: The certificate is for last year.') >= 0);
  ok(notes.indexOf('Not needed, Proof of 501c Status: They have 501(c) proof.') >= 0);
  ok(notes.indexOf('Remark, Budget or Financial Report: We need the approved budget, not the draft.') >= 0, 'status unchanged: a remark line');
  ok(notes.indexOf('Remarks for the PTO/PTA: Please send everything to ParentOrgDocs.') >= 0);
  eq(logRows(g)[0][1], 'Ms. Lee (C1)');
});

test('remarks come back to the signed-in page, and not to leadership', function () {
  var g = h.load();
  var p = withPeople(g);
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Needs Correction', remark: 'Unsigned.' }], 'Overall note.');
  var d = g.getDashboard(p.c1).detail['Anderson ES||2026-27'];
  eq(d.rm.items['Bylaws'], 'Unsigned.');
  eq(d.rm.campus, 'Overall note.');
  var lead = g.getDashboard('').detail['Anderson ES||2026-27'];
  ok(!lead || !lead.rm, 'leadership gets no remarks');
  // a newer change replaces the remark; clearing works
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }], '');
  var d2 = g.getDashboard(p.c1).detail['Anderson ES||2026-27'];
  eq(d2.rm.items['Bylaws'], '');
  eq(d2.rm.campus, '');
});

test('Needs Correction and Not Needed need a remark; a C1 cannot save another campus; nothing changed saves nothing', function () {
  var g = h.load();
  var p = withPeople(g);
  function err(fn) { try { fn(); return ''; } catch (e) { return e.message; } }
  ok(/Say what needs to be corrected/.test(err(function () { g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Needs Correction', remark: ' ' }], null); })));
  ok(/Say why/.test(err(function () { g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Not Needed', remark: '' }], null); })));
  ok(/not on your list/.test(err(function () { g.saveChecklist(p.c1, 'Askew ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }], null); })));
  ok(/sign-in has ended/.test(err(function () { g.saveChecklist('0'.repeat(40), 'Anderson ES', '2026-27', [], null); })));
  var r = g.saveChecklist(p.staff, 'Askew ES', '2026-27', [{ key: 'Bylaws', status: 'Not Received', remark: '' }], null);
  eq(r.changed, false);
  eq(logRows(g).length, 0);
});

test('checking a document off marks a Not Yet Confirmed campus Yes', function () {
  var g = h.load();
  var p = withPeople(g);
  var t = g.table_('Campus Register');
  g.setCell_(t, g.findRow_(t, '2026-27', 'Anderson ES'), 'Has PTO or PTA', 'Not Yet Confirmed');
  var r = g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Training Certificate', status: 'Accepted', remark: '' }], null);
  eq(r.pto, 'Yes');
  eq(regRow(g, 'Anderson ES')['Has PTO or PTA'], 'Yes');
});

test('the old reviewItem still works for a page that has not been updated', function () {
  var g = h.load();
  var p = withPeople(g);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  eq(g.reviewItem(p.c1, 'Anderson ES', '2026-27', 'Bylaws', 'Needs Correction', 'Wrong year').ok, true);
  eq(g.getDashboard(p.c1).detail['Anderson ES||2026-27'].rm.items['Bylaws'], 'Wrong year');
});

/* ---------- R1: the email ---------- */
test('"I sent it" records an email about missing documents, corrections and remarks', function () {
  var g = h.load();
  var p = withPeople(g);
  var r = g.logResendRequest(p.c1, 'Anderson ES', '2026-27', 'ann@example.org');
  ok(/^Emailed the PTO\/PTA about still needed: Bylaws, Officer Information, Training Certificate, Budget or Financial Report, Proof of 501c Status, Bank Verification Letter\. To: /.test(r.note), r.note);
  g.applyOctober2026_({ reset: false });
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Needs Correction', remark: 'Unsigned' }], 'Thanks!');
  var r2 = g.logResendRequest(p.c1, 'Anderson ES', '2026-27', '');
  ok(/still needed: Officer Information, Training Certificate, Budget or Financial Report, Proof of 501c Status, Bank Verification Letter; needs correction: Bylaws; remarks$/.test(r2.note), r2.note);
});

test('there is nothing to email about once every required document is done and there are no remarks', function () {
  var g = h.load();
  var p = withPeople(g);
  g.applyOctober2026_({ reset: false });
  var ch = ['Bylaws', 'Officer Information', 'Training Certificate', 'Budget or Financial Report', 'Proof of 501c Status', 'Bank Verification Letter'].map(function (k) { return { key: k, status: 'Accepted', remark: '' }; });
  g.saveChecklist(p.staff, 'Anderson ES', '2026-27', ch, null);
  var m = ''; try { g.logResendRequest(p.staff, 'Anderson ES', '2026-27', ''); } catch (e) { m = e.message; }
  ok(/nothing to email about/.test(m), m);
});

/* ---------- R3: C1 reminders ---------- */
test('staff get each C1 with their email and campuses; C1s and leadership do not', function () {
  var g = h.load();
  var p = withPeople(g);
  var si = g.__ss.getSheetByName('Dashboard Sign-ins'), head = si.values()[0], ec = head.indexOf('Email');
  ok(ec >= 0, 'setUpSignIns added the Email column');
  si.values().forEach(function (r, i) { if (r[0] === 'Ms. Lee') si.getRange(i + 1, ec + 1).setValue('lee@houstonisd.org'); });
  var st = g.getDashboard(p.staff);
  eq(st.c1s, [{ n: 'Ms. Lee', e: 'lee@houstonisd.org', c: ['Anderson ES', 'Ashford ES'] }]);
  eq(g.getDashboard(p.c1).c1s, null);
  eq(g.getDashboard('').c1s, null);
  ok(/^https:/.test(st.url));
});

test('the payload carries FACE\'s wording for each document', function () {
  var g = h.load();
  var p = g.getPayload_(null);
  eq(p.labels[5], 'Bank account verification letter from financial institution listing two authorized account signers');
  eq(p.labels[0], 'The organization\'s bylaws');
});

test('the Registered and Legalized lists read in FACE\'s order and wording', function () {
  var g = h.load();
  g.applyOctober2026_({ reset: false });
  eq(g.defsList_(true), 'training certificate, the organization\'s bylaws and the officer information form');
  eq(g.defsList_(false), 'training certificate, the organization\'s bylaws, the officer information form, annual budget report or meeting minutes showing budget approval, proof of 501(c) status and bank account verification letter from financial institution listing two authorized account signers');
});

/* ---------- the template for a new setup already has the October changes ---------- */
test('the template: 266 campuses, 11 PTAs, Legalized = six documents, Not Needed and Email ready', function () {
  var g = h.load({ fixture: 'template' });
  var rows = campuses(g);
  eq(rows.length, 266);
  eq(rows.filter(function (v) { return v[col(g, 'Has PTO or PTA')] === 'Yes'; }).length, 11);
  ok(g.table_('Campus Register').headers.indexOf('Bank Verification Letter') >= 0, 'renamed column');
  eq(g.itemFlags_().req, [true, true, true, true, true, true, false, false]);
  ok(g.__ss.getSheetByName('Dashboard Sign-ins').values()[0].indexOf('Email') >= 0);
  ok(g.__ss.getSheetByName('Area Office Campuses'), 'Area Office Campuses tab');
  var t = g.table_('Campus Register');
  ok(/Not Needed/.test(t.sh.getRange(2, t.col['Legalization Items Accepted'] + 1).getFormulas()[0][0]));
  var again = g.applyOctober2026_({ reset: false });
  ok(again.ok && again.lines.some(function (l) { return /already means the six/.test(l); }), again.lines.join(' / '));
  eq(campuses(g).length, 266, 'running the update on the template changes nothing');
  g.diagnose().forEach(function (st) { ok(st[1], st[0]); });
});

/* ---------- no EIN letter: Bank and EIN Letter becomes Bank Verification Letter ---------- */
test('the October update renames the bank column, its Settings column and Summary row', function () {
  var g = h.load();
  eq(g.table_('Campus Register').headers.indexOf('Bank and EIN Letter') >= 0, true, 'live sheet starts with the old name');
  var res = g.applyOctober2026_({ reset: false });
  ok(res.lines.some(function (l) { return /now called Bank Verification Letter/.test(l); }), res.lines.join(' / '));
  var t = g.table_('Campus Register');
  ok(t.headers.indexOf('Bank Verification Letter') >= 0 && t.headers.indexOf('Bank and EIN Letter') < 0);
  ok(g.__ss.getSheetByName('Settings').values().some(function (r) { return r.indexOf('Bank Verification Letter') >= 0; }), 'Settings renamed');
  ok(g.__ss.getSheetByName('Summary').values().some(function (r) { return r[0] === 'Bank Verification Letter'; }), 'Summary renamed');
  eq(g.itemFlags_().req[5], true, 'still needed to be Legalized');
  var f = t.sh.getRange(2, t.col['Not Yet Accepted'] + 1).getFormulas()[0][0];
  ok(/Not Needed/.test(f), f);
  var start = g.__ss.getSheetByName('Start Here').values().map(function (r) { return String(r[0]); }).join('\n');
  ok(!/Bank and EIN Letter \(Legalized\)/.test(start) && /Bank Verification Letter \(Legalized\)/.test(start), 'Start Here wording');
  ok(g.applyOctober2026_({ reset: false }).ok, 'safe to run again');
});

test('the old name still works: a sheet not yet updated, an old form question, an old page, old log lines', function () {
  var g = h.load();
  var p = withPeople(g);
  // the form question still called Bank and EIN Letter (...) files into the item; the column still has the old name
  eq(g.itemForTitle_('Bank and EIN Letter (bank verification letter listing two authorized signers, together with the Tax ID EIN letter)').key, 'Bank Verification Letter');
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bank Verification Letter', 'bank.pdf')] }));
  eq(regRow(g, 'Anderson ES')['Bank and EIN Letter'], 'Received');
  eq(logRows(g)[0][4], 'bank.pdf');
  // a page from before the rename sends the old key
  eq(g.reviewItem(p.c1, 'Anderson ES', '2026-27', 'Bank and EIN Letter', 'Needs Correction', 'Only one signer listed').ok, true);
  g.applyOctober2026_({ reset: false });
  eq(regRow(g, 'Anderson ES')['Bank Verification Letter'], 'Needs Correction', 'status kept through the rename');
  eq(g.getDashboard(p.c1).detail['Anderson ES||2026-27'].rm.items['Bank Verification Letter'], 'Only one signer listed', 'an old log line is still the remark');
});

test('South EC HS is marked as a PTA from the Texas PTA roster', function () {
  var g = h.load();
  withAreaTab(g); g.addAreaCampuses_();
  eq(regRow(g, 'South EC HS')['Has PTO or PTA'], 'Yes');
  eq(regRow(g, 'South EC HS')['Org Type'], 'PTA');
  ok(!regRow(g, 'South Early HS'), 'no second row under the other spelling');
});

/* ---------- R3: the C1 Reminders tab for Power Automate ---------- */
function setEmail(g, name, email) {
  var si = g.__ss.getSheetByName('Dashboard Sign-ins'), vals = si.values(), ec = vals[0].indexOf('Email');
  vals.forEach(function (r, i) { if (r[0] === name) si.getRange(i + 1, ec + 1).setValue(email); });
}
function reminderRows(g) {
  var v = g.__ss.getSheetByName('C1 Reminders').values(), head = v[0];
  return v.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) { var o = {}; head.forEach(function (hd, j) { o[hd] = r[j]; }); return o; });
}

test('the C1 Reminders tab: Send = Yes only for a C1 with something waiting and an email', function () {
  var g = h.load();
  withPeople(g);
  // a second C1 with nothing waiting
  var c1 = g.__ss.getSheetByName('C1 Assignments'); c1.getRange(4, 1, 1, 2).setValues([['Askew ES', 'Mr. Diaz']]);
  g.setUpSignIns_();
  setEmail(g, 'Ms. Lee', 'lee@houstonisd.org'); setEmail(g, 'Mr. Diaz', 'diaz@houstonisd.org');
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws'), upload(g, 'Training Certificate')] }));
  g.processSubmission_(sub('Ashford ES', { other: [{ ids: [g.__drive.upload('packet.pdf').getId()] }] }));
  var r = g.refreshC1Reminders_();
  eq(r.send, 1);
  var rows = reminderRows(g);
  eq(Object.keys(rows[0]), ['Send', 'C1', 'Email', 'Campuses', 'Waiting', 'Subject', 'Body', 'Text', 'Note', 'Updated']);
  Object.keys(rows[0]).forEach(function (hd) { ok(!/\s/.test(hd), 'one-word heading (Power Automate blanks columns with a space): ' + hd); });
  var lee = rows.filter(function (x) { return x.C1 === 'Ms. Lee'; })[0], diaz = rows.filter(function (x) { return x.C1 === 'Mr. Diaz'; })[0];
  eq(lee.Send, 'Yes'); eq(lee.Email, 'lee@houstonisd.org'); eq(lee.Campuses, 'Anderson ES, Ashford ES'); eq(lee.Waiting, 3);
  ok(/Anderson ES: The organization's bylaws; Training certificate/.test(lee.Text), lee.Text);
  ok(/Ashford ES: other files to check/.test(lee.Text), lee.Text);
  ok(/<li><b>Anderson ES<\/b>: The organization&#39;s bylaws|<li><b>Anderson ES<\/b>: The organization's bylaws/.test(lee.Body), lee.Body);
  ok(/https:\/\/script\.google\.com/.test(lee.Body), 'dashboard link');
  eq(diaz.Send, 'No'); eq(diaz.Note, 'Nothing waiting.');
});

test('a C1 with something waiting but no email is reported, not sent', function () {
  var g = h.load();
  withPeople(g);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  var r = g.refreshC1Reminders_();
  eq(r.send, 0); eq(r.noEmail, ['Ms. Lee']);
  eq(reminderRows(g)[0].Note, 'No email on the Dashboard Sign-ins tab.');
});

test('once a campus is checked off, its "other files" stop counting and it drops off the reminder', function () {
  var g = h.load();
  var p = withPeople(g);
  setEmail(g, 'Ms. Lee', 'lee@houstonisd.org');
  g.processSubmission_(sub('Ashford ES', { other: [{ ids: [g.__drive.upload('packet.pdf').getId()] }] }));
  g.refreshC1Reminders_();
  eq(reminderRows(g)[0].Send, 'Yes');
  g.saveChecklist(p.c1, 'Ashford ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }], null);
  g.refreshC1Reminders_();
  eq(reminderRows(g)[0].Send, 'No');
});

test('turning the weekday reminders on and off', function () {
  var g = h.load();
  withPeople(g);
  g.turnOnC1Reminders();
  eq(g.__triggers.filter(function (t) { return t.fn === 'runC1Reminders' && t.hour === 8; }).length, 1);
  g.turnOnC1Reminders();
  eq(g.__triggers.length, 1, 'turning it on twice makes one trigger');
  ok(g.getDashboard('').remindAuto === null, 'leadership is not told');
  g.turnOffC1Reminders();
  eq(g.__triggers.length, 0);
  eq(reminderRows(g).length, 0);
});

/* the tracker sends the reminders to Power Automate (a "When a Teams webhook request is received" flow) */
var HOOK = 'https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=XYZ';
function readyToRemind(g) {
  var p = withPeople(g);
  setEmail(g, 'Ms. Lee', 'lee@houstonisd.org');
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  g.setReminderHook_(HOOK);
  return p;
}

test('the Power Automate link must be a Power Automate link', function () {
  var g = h.load();
  function err(u) { try { g.setReminderHook_(u); return ''; } catch (e) { return e.message; } }
  ok(/not a link/.test(err('copy this')));
  ok(/not a Power Automate link/.test(err('https://example.com/hook')));
  eq(err(HOOK), '');
  eq(err('https://default1234.56.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/x/triggers/manual/paths/invoke?sig=1'), '');
  eq(g.__props.REMINDER_HOOK.indexOf('https://default1234'), 0);
});

test('"send now" posts one reminder per C1 with something waiting, shaped like a Teams message', function () {
  var g = h.load();
  readyToRemind(g);
  var r = g.runReminders_(true);
  ok(r.sent);
  eq(g.__fetched.length, 1);
  var f = g.__fetched[0];
  eq(f.url, HOOK); eq(f.opts.method, 'post'); eq(f.opts.contentType, 'application/json');
  var att = f.json.attachments[0];
  eq(f.json.type, 'message'); eq(att.contentType, 'application/vnd.microsoft.card.adaptive'); eq(att.content.type, 'AdaptiveCard');
  var rem = att.content.reminders;
  eq(rem.length, 1);
  eq(rem[0].to, 'lee@houstonisd.org'); eq(rem[0].c1, 'Ms. Lee');
  eq(rem[0].subject, 'PTO/PTA documents waiting for your review (2026-27)');
  ok(/<li><b>Anderson ES<\/b>: The organization/.test(rem[0].body), rem[0].body);
  ok(/^Sent to Power Automate /.test(reminderRows(g)[0].Note), reminderRows(g)[0].Note);
});

test('nothing is posted when nothing is waiting, when not connected, or (on the timer) at the weekend', function () {
  var g = h.load();
  withPeople(g);
  setEmail(g, 'Ms. Lee', 'lee@houstonisd.org');
  eq(g.runReminders_(true).skipped, 'not connected');
  g.setReminderHook_(HOOK);
  eq(g.runReminders_(true).skipped, 'nothing waiting');
  eq(g.__fetched.length, 0);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  var RealDate = Date, sat = new RealDate(Date.UTC(2026, 9, 17, 13));   // a Saturday
  g.Date = function () { return arguments.length ? new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))() : new RealDate(sat.getTime()); };
  eq(g.runReminders_(false).skipped, 'weekend');
  eq(g.runReminders_(true).sent, true, '"send now" sends whatever the day');
  g.Date = RealDate;
});

test('a refused post says what to check; the old morning trigger still works', function () {
  var g = h.load({ fetchCode: 404 });
  readyToRemind(g);
  var m = ''; try { g.runReminders_(true); } catch (e) { m = e.message; }
  ok(/did not accept the reminders \(it answered 404\)/.test(m), m);
  var g2 = h.load();
  readyToRemind(g2);
  g2.__triggers.push({ fn: 'refreshC1Reminders', getHandlerFunction: function () { return 'refreshC1Reminders'; } });
  ok(g2.reminderTrigger_(), 'the old trigger counts as on');
  var RealDate = Date, mon = new RealDate(Date.UTC(2026, 9, 19, 13));   // a Monday
  g2.Date = function () { return arguments.length ? new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))() : new RealDate(mon.getTime()); };
  g2.refreshC1Reminders();
  g2.Date = RealDate;
  eq(g2.__fetched.length, 1, 'the old trigger now sends too');
  g2.turnOnC1Reminders();
  eq(g2.__triggers.map(function (t) { return t.fn; }), ['runC1Reminders'], 'turning on replaces the old trigger');
});

test('the small reminders sheet: made once, gets the same rows, emptied when reminders are turned off', function () {
  var g = h.load();
  withPeople(g);
  setEmail(g, 'Ms. Lee', 'lee@houstonisd.org');
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  var r = g.makeReminderSheet_();
  ok(r.made && /^https:\/\/docs\.google\.com\/spreadsheets\//.test(r.url), r.url);
  var book = g.__books[g.__props.REMINDER_SHEET_ID], tab = book.getSheetByName('C1 Reminders');
  ok(tab, 'the tab is named C1 Reminders');
  eq(tab.values(), g.__ss.getSheetByName('C1 Reminders').values(), 'same rows as the tracker tab');
  eq(tab.values()[1][0], 'Yes');
  eq(g.makeReminderSheet_().made, false, 'made only once');
  eq(Object.keys(g.__books).length, 1);
  // only the reminder list is in it: no officer contacts, nothing else
  eq(book.getSheets().length, 1);
  g.turnOffC1Reminders();
  eq(tab.values().length, 1, 'only the header row is left');
});
