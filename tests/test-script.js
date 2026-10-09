/* Tests for Code.gs, run in Node with the stand-in Google services in harness.js.   node tests/test-script.js */
'use strict';
var h = require('./harness');
var test = h.test, eq = h.eq, ok = h.ok;

/* ---------- helpers ---------- */
function reg(g) { return g.table_('Campus Register'); }
function regRow(g, campus, year) {
  var t = reg(g), r = g.findRow_(t, year || '2026-27', campus);
  if (!r) return null;
  var o = {}; t.headers.forEach(function (hd, j) { if (hd) o[hd] = t.values[r - 1][j]; });
  return o;
}
function logRows(g) { return g.__ss.getSheetByName('Submission Log').values().slice(1).filter(function (r) { return r.join('') !== ''; }); }
function sub(campus, extra) {
  return Object.assign({ timestamp: new Date(Date.UTC(2026, 9, 5, 15)), email: 'inbox@houstonisd.org', campus: campus, hasPto: '', orgType: '', orgName: '', notes: '', officer: false, uploads: [], unknown: [], other: [] }, extra || {});
}
function upload(g, key, name) { return { item: g.itemByKey_(key), ids: [g.__drive.upload(name || 'scan.pdf').getId()] }; }
/** A workbook with one C1 (Ms. Lee, for Anderson ES and Ashford ES) and one FACE staff member, both with passcodes. Returns tokens. */
function withPeople(g) {
  var c1 = g.__ss.getSheetByName('C1 Assignments');
  c1.getRange(2, 1, 2, 2).setValues([['Anderson ES', 'Ms. Lee'], ['Ashford ES', 'Ms. Lee']]);
  var si = g.__ss.getSheetByName('Dashboard Sign-ins');
  si.getRange(3, 1, 1, 2).setValues([['Pat Staff', 'Staff']]);
  var r = g.setUpSignIns_();
  var pass = {}; r.made.forEach(function (m) { pass[m.name] = m.pass; });
  var c1tok = g.signIn('Ms. Lee', pass['Ms. Lee']).token, stTok = g.signIn('Pat Staff', pass['Pat Staff']).token;
  return { c1: c1tok, staff: stTok, pass: pass };
}

/* ---------- baseline: what worked before stays working ---------- */
test('the template reads as 154 campuses', function () {
  var g = h.load();
  eq(g.getPayload_(null).rows.length, 154);
});

test('a form submission files the document, marks it Received and logs it', function () {
  var g = h.load();
  var r = g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws', 'bylaws.pdf')] }));
  eq(r.year, '2026-27');
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Received');
  var L = logRows(g);
  eq(L.length, 1);
  eq(L[0][3], 'Bylaws');
  eq(L[0][4], '2026-27 - Bylaws - Anderson ES.pdf');
});

test('a submission for a campus not on the register adds it', function () {
  var g = h.load();
  g.processSubmission_(sub('Brand New ES', { hasPto: 'Yes', uploads: [upload(g, 'Training Certificate')] }));
  var row = regRow(g, 'Brand New ES');
  ok(row, 'row added');
  eq(row['Training Certificate'], 'Received');
});

test('sign-in, then a C1 can review only their own campuses', function () {
  var g = h.load();
  var p = withPeople(g);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  g.processSubmission_(sub('Almeda ES', { uploads: [upload(g, 'Bylaws')] }));
  var res = g.reviewItem(p.c1, 'Anderson ES', '2026-27', 'Bylaws', 'Accepted', '');
  eq(res.ok, true);
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Accepted');
  var threw = false;
  try { g.reviewItem(p.c1, 'Almeda ES', '2026-27', 'Bylaws', 'Accepted', ''); } catch (e) { threw = /not on your list/.test(e.message); }
  ok(threw, 'C1 blocked from another campus');
});

test('a wrong passcode is refused, and five wrong tries lock the name', function () {
  var g = h.load();
  withPeople(g);
  for (var i = 0; i < 5; i++) eq(g.signIn('Ms. Lee', 'WRONG-PASS').ok, false);
  ok(/Too many wrong tries/.test(g.signIn('Ms. Lee', 'WRONG-PASS').message));
});

test('leadership gets no private detail; staff get officers and notes', function () {
  var g = h.load();
  var p = withPeople(g);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  var lead = g.getDashboard('');
  var d = lead.detail['Anderson ES||2026-27'];
  ok(d && d.a.length === 1 && d.a[0].length === 2, 'leadership gets date and document type only');
  var st = g.getDashboard(p.staff);
  eq(st.me.role, 'staff');
  eq(st.detail['Anderson ES||2026-27'].a[0].length, 6);
});

test('the officer import adds officers and marks Officer Information Received', function () {
  var g = h.load();
  var paste = g.__ss.getSheetByName('Officer Form Paste');
  var head = ['ID', 'Start time', 'Completion time', 'What school is your organization associated with?', 'What is the name of your organization?', 'What type of organization is it?',
    'Officer #1: Name', 'Officer #1: Position', 'Officer #1: Phone', 'Officer #1: Email', 'Your name', 'Your email address', 'Your phone number'];
  var row = ['7', new Date(Date.UTC(2026, 8, 1)), new Date(Date.UTC(2026, 8, 1)), 'Ashford ES', 'Ashford PTO', 'PTO', 'Ann Officer', 'President', '7135550101', 'ann@example.org', 'Ann Officer', 'ann@example.org', '7135550101'];
  paste.getRange(1, 1, 2, head.length).setValues([head, row]);
  var r = g.importOfficers_();
  eq(r.added, 1);
  eq(r.officers, 1);
  eq(regRow(g, 'Ashford ES')['Officer Information'], 'Received');
  eq(g.importOfficers_().already, 1, 'a second import adds nothing');
});

test('starting a new school year copies every campus', function () {
  var g = h.load();
  var r = g.startYear_('2027-28');
  eq(r.created, 154);
});

test('the dashboard check passes every step', function () {
  var g = h.load();
  g.diagnose().forEach(function (s) { ok(s[1], s[0] + ': ' + s[2]); });
});

module.exports = { regRow: regRow, logRows: logRows, sub: sub, upload: upload, withPeople: withPeople };
if (require.main === module) {
  try { require('./test-new'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !/test-new/.test(e.message)) throw e; }
  process.exit(h.report() ? 0 : 1);
}
