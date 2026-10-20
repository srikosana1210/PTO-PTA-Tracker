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
