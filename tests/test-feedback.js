/* Tests for the changes from Eric's tester feedback (2026-10-20). Run through test-script.js (node tests/test-script.js). */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow, sub = base.sub, upload = base.upload, withPeople = base.withPeople;

test('a review note is read back as a decision on one document', function () {
  var g = h.load();
  eq(JSON.stringify(g.reviewOf_('Accepted: Bylaws')), '{"key":"Bylaws","s":"Accepted"}');
  eq(g.reviewOf_('Needs correction, Training Certificate: wrong year').s, 'Sent back');
  eq(g.reviewOf_('Remark, Bylaws: thanks'), null, 'a remark is not a decision');
  eq(g.byName_('Ms. Lee (C1)'), 'Ms. Lee');
});

test('who decided each document and when: dates for everyone, names only after sign-in', function () {
  var g = h.load(), p = withPeople(g);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws'), upload(g, 'Training Certificate')] }));
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }, { key: 'Training Certificate', status: 'Needs Correction', remark: 'last year' }], null);
  var staff = g.getDashboard(p.staff).detail['Anderson ES||2026-27'].rv;
  eq(staff['Bylaws'][0], 'Accepted'); eq(staff['Bylaws'][2], 'Ms. Lee');
  eq(staff['Training Certificate'][0], 'Sent back');
  var pub = g.getDashboard('').detail['Anderson ES||2026-27'].rv;
  eq(pub['Bylaws'].length, 2, 'the date, not the name');
});

test('documents sent back are counted by type, and review turnaround by reviewer (staff only)', function () {
  var g = h.load(), p = withPeople(g);
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  g.processSubmission_(sub('Ashford ES', { uploads: [upload(g, 'Bylaws')] }));
  g.saveChecklist(p.c1, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Needs Correction', remark: 'unsigned' }], null);
  g.saveChecklist(p.c1, 'Ashford ES', '2026-27', [{ key: 'Bylaws', status: 'Needs Correction', remark: 'unsigned' }], null);
  var d = g.getDashboard(p.staff);
  eq(d.sentBack['2026-27']['Bylaws'], 2);
  var t = d.turn['2026-27']['Ms. Lee'];
  eq(t.n, 2); ok(t.days >= 0);
  eq(g.getDashboard('').turn, null, 'turnaround is for FACE staff');
});

test('progress by month: a snapshot per month, saved again in the same month replaces it', function () {
  var g = h.load();
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  var a = g.saveSnapshot_(new Date(Date.UTC(2026, 9, 1, 12)));
  eq(a.month, '2026-10');
  g.saveSnapshot_(new Date(Date.UTC(2026, 9, 15, 12)));
  g.saveSnapshot_(new Date(Date.UTC(2026, 10, 1, 12)));
  var rows = g.historyRows_('2026-27');
  eq(rows.map(function (x) { return x.m; }).join(), '2026-10,2026-11');
  ok(rows[0].yes >= 1 && rows[0].docs >= 1, JSON.stringify(rows[0]));
  eq(g.getDashboard('').hist.length, 2);
  g.turnOnSnapshots();
  ok(g.__triggers.some(function (tr) { return tr.fn === 'saveMonthlySnapshot' && tr.monthDay === 1; }), 'monthly trigger');
});

test('the page cache: fast repeat loads, cleared by any change made through the tracker', function () {
  var g = h.load();
  var a = g.getDashboard('');
  ok(g.__cache.pp, 'cached');
  g.processSubmission_(sub('Anderson ES', { uploads: [upload(g, 'Bylaws')] }));
  ok(!g.__cache.pp, 'a submission clears it');
  var b = g.getDashboard('');
  ok(b.rows.filter(function (r) { return r.campus === 'Anderson ES'; })[0].d.indexOf('R') >= 0, 'the new document shows');
  // a change typed straight into the sheet shows after five minutes, or at once with Refresh
  var t = g.table_('Campus Register'), r = g.findRow_(t, '2026-27', 'Anderson ES');
  t.sh.getRange(r, t.col['Org Name'] + 1).setValue('Typed By Hand PTO');
  eq(g.getDashboard('').rows.filter(function (x) { return x.campus === 'Anderson ES'; })[0].on === 'Typed By Hand PTO', false, 'cached copy');
  eq(g.getDashboard('', true).rows.filter(function (x) { return x.campus === 'Anderson ES'; })[0].on, 'Typed By Hand PTO', 'Refresh');
});

test('a campus with no Area Office says so plainly', function () {
  var g = h.load();
  var t = g.table_('Campus Register'), r = g.findRow_(t, '2026-27', 'Anderson ES');
  t.sh.getRange(r, t.col['Area Office'] + 1).setValue('');
  eq(g.getDashboard('', true).rows.filter(function (x) { return x.campus === 'Anderson ES'; })[0].area, 'Area Office not set');
});

/* ---------- FACE's list of campuses with no PTO or PTA (2026-10-25) ---------- */
var helpers = require('./test-new-helpers');
function withNoList(g) {
  var rows = helpers.csvRows(require('path').join(__dirname, '..', 'sheet', 'No PTO-PTA Campuses.csv'));
  var sh = g.__ss.getSheetByName('No PTO-PTA List') || g.__ss.insertSheet('No PTO-PTA List');
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length - 1;
}
test('the No PTO/PTA list: campuses are marked No, matched through their other spellings, safe to run twice', function () {
  var g = h.load(); helpers.withAreaTab(g); g.applyOctober2026_({ reset: false });
  ok(g.importNoPto_().empty, 'an empty tab says what to do');
  withNoList(g);
  g.processSubmission_(sub('Almeda ES', { uploads: [upload(g, 'Bylaws')] }));    // on the list, but it sent something
  var r = g.importNoPto_();
  ok(/^PTO-PTA Tracker backup/.test(r.backup));
  eq(regRow(g, 'Benavidez ES')['Has PTO or PTA'], 'No');
  eq(regRow(g, 'Cage ES')['Has PTO or PTA'], 'No');
  eq(regRow(g, 'Energized MS')['Has PTO or PTA'], 'No', '*Energized MS on the list');
  eq(regRow(g, 'McReynolds MS')['Has PTO or PTA'], 'No', 'Fleming MS on the list finds the old McReynolds MS row');
  ok(r.kept.indexOf('Almeda ES') >= 0, 'a campus that sent something is not changed');
  eq(regRow(g, 'Almeda ES')['Has PTO or PTA'], 'Yes');
  eq(r.unmatched.join(), '', 'every name on the list is found');
  ok(r.marked > 100, String(r.marked));
  var st = g.__ss.getSheetByName('No PTO-PTA List').values()[0].map(function (x) { return String(x).trim(); });
  ok(st.indexOf('Name in the register') >= 0 && st.indexOf('Status') >= 0, 'columns for fixing names and saying what happened');
  // a name fixed by hand is kept
  var sh = g.__ss.getSheetByName('No PTO-PTA List'), last = sh.getLastRow();
  sh.getRange(last + 1, 1).setValue('Westbury High'); sh.getRange(last + 1, 4).setValue('No');
  ok(g.importNoPto_().unmatched.indexOf('Westbury High') >= 0, 'an unknown name is reported');
  sh.getRange(last + 1, st.indexOf('Name in the register') + 1).setValue('Westbury HS');
  eq(g.importNoPto_().marked, 1, 'only the fixed name is new');
  eq(regRow(g, 'Westbury HS')['Has PTO or PTA'], 'No');
});

