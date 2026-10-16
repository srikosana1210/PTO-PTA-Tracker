/* Tests for the weekly Texas PTA spreadsheet import (2026-10-16). Run through test-script.js (node tests/test-script.js). */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var regRow = base.regRow;
var roster = require('./fixtures/texas-pta-2026-10-15');
var withAreaTab = require('./test-new-helpers').withAreaTab;

function paste(g, rows) {
  var sh = g.__ss.getSheetByName('Texas PTA Paste') || g.__ss.insertSheet('Texas PTA Paste');
  sh.clearContents();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}
function txRows(g) {
  var sh = g.__ss.getSheetByName('Texas PTA'), v = sh.values(), hd = v[0];
  return v.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) { var o = {}; hd.forEach(function (k, j) { o[k] = r[j]; }); return o; });
}
function setCell(g, campus, header, value) {
  var t = g.table_('Campus Register'), r = g.findRow_(t, g.currentYear_(), campus);
  t.sh.getRange(r, t.col[header] + 1).setValue(value);
}
/** The tracker after the October update, with every Area Office campus (so all the roster's schools are on the register). */
function tracker() { var g = h.load(); withAreaTab(g); g.applyOctober2026_({ reset: false }); return g; }

test('an empty paste tab: the tab is made, and the import says what to do', function () {
  var g = tracker();
  var r = g.importTexasPta_();
  ok(r.empty);
  ok(g.__ss.getSheetByName('Texas PTA Paste'), 'paste tab created');
});

test('the Texas PTA spreadsheet: every PTA matched to its campus, charter withdrawals left out', function () {
  var g = tracker();
  paste(g, roster.rows());
  var r = g.importTexasPta_();
  eq(r.listed, 11);
  eq(r.withdrawn.join(', '), 'Bonham Elementary, Northside High School, Wainwright Elementary');
  eq(r.unmatched.length, 0, r.unmatched.join());
  eq(r.asOf, 'THU, October 15, 2026 at 8:48 AM');
  var rows = txRows(g), by = {};
  rows.forEach(function (x) { by[x['Texas PTA Name']] = x; });
  eq(by['Alexander Hamilton Middle School'].Campus, 'Hamilton MS');
  eq(by['William B. Travis Elementary'].Campus, 'Travis ES');
  eq(by['Ketelsen'].Campus, 'Ketelsen ES');
  eq(by['South Early Community'].Campus, 'South EC HS');
  ok(!by['Bonham Elementary'], 'no withdrawn PTA on the tab');
  eq(by['Browning Elementary']['SOA Membership'], 'No');
  eq(by['Durham Elementary']['SOA 990'], 'Yes');
  eq(by['Durham Elementary']['Good Standing Date'], '10/14/2026');
  eq(String(by['Oak Forest Elementary']['Current Members']), '689');
  ok(r.shorter.some(function (s) { return /Travis ES/.test(s); }), 'a match by a shorter name is reported');
  ok(JSON.stringify(g.__ss.getSheetByName('Texas PTA').values()).indexOf('@') < 0, 'no contact details are copied');
});

test('a campus typed by hand on the Texas PTA tab is kept next week', function () {
  var g = tracker();
  paste(g, roster.rows());
  g.importTexasPta_();
  var sh = g.__ss.getSheetByName('Texas PTA'), v = sh.values();
  var row = v.map(function (x) { return x[1]; }).indexOf('Ketelsen');
  sh.getRange(row + 1, 1).setValue('Kashmere HS');
  g.importTexasPta_();
  var k = txRows(g).filter(function (x) { return x['Texas PTA Name'] === 'Ketelsen'; })[0];
  eq(k.Campus, 'Kashmere HS');
});

test('a campus on the roster becomes a PTA; a different org type is reported, not changed', function () {
  var g = tracker();
  setCell(g, 'Durham ES', 'Org Type', '');
  setCell(g, 'Durham ES', 'Has PTO or PTA', 'Not Yet Confirmed');
  setCell(g, 'Harvard ES', 'Org Type', 'PTO');
  paste(g, roster.rows());
  var r = g.importTexasPta_();
  eq(regRow(g, 'Durham ES')['Org Type'], 'PTA');
  eq(regRow(g, 'Durham ES')['Has PTO or PTA'], 'Yes');
  ok(r.madePta.indexOf('Durham ES') >= 0);
  eq(regRow(g, 'Harvard ES')['Org Type'], 'PTO');
  ok(r.otherType.some(function (s) { return /^Harvard ES/.test(s); }), r.otherType.join());
});

test('a PTA whose charter is withdrawn later drops off, and FACE is told', function () {
  var g = tracker();
  paste(g, roster.rows());
  g.importTexasPta_();
  var rows = roster.rows();
  rows.forEach(function (x) { if (x[1] === 'Durham Elementary') x[12] = 'Charter Withdrawal'; });
  paste(g, rows);
  var r = g.importTexasPta_();
  eq(r.listed, 10);
  ok(r.unPta.indexOf('Durham ES') >= 0, r.unPta.join());
  eq(regRow(g, 'Durham ES')['Org Type'], '');
  eq(regRow(g, 'Durham ES')['Has PTO or PTA'], 'Not Yet Confirmed', 'it has sent nothing, so it no longer counts');
  ok(/charter is withdrawn: Durham ES/.test(g.texasPtaSummary_(r)));
});

test('a campus still marked PTA from the old tracker but withdrawn on the roster is no longer a PTA', function () {
  var g = tracker();
  setCell(g, 'Bonham ES', 'Org Type', 'PTA'); setCell(g, 'Bonham ES', 'Has PTO or PTA', 'Yes');
  setCell(g, 'Wainwright ES', 'Org Type', 'PTA'); setCell(g, 'Wainwright ES', 'Has PTO or PTA', 'Yes');
  g.processSubmission_(base.sub('Wainwright ES', { uploads: [base.upload(g, 'Bylaws')] }));
  paste(g, roster.rows());
  var r = g.importTexasPta_();
  eq(regRow(g, 'Bonham ES')['Org Type'], '');
  eq(regRow(g, 'Bonham ES')['Has PTO or PTA'], 'Not Yet Confirmed');
  eq(regRow(g, 'Wainwright ES')['Org Type'], '');
  eq(regRow(g, 'Wainwright ES')['Has PTO or PTA'], 'Yes', 'it sent documents, so it still has a parent organization');
  var ptas = g.getPayload_(null).rows.filter(function (x) { return x.ot === 'PTA' && x.pto === 'Yes'; });
  eq(ptas.length, 11, ptas.map(function (x) { return x.campus; }).join());
});

test('the PTO/PTA count: campuses that sent nothing go back to Not Yet Confirmed, Texas PTAs and senders stay', function () {
  var g = tracker();
  paste(g, roster.rows());
  g.importTexasPta_();
  ['Anderson ES', 'Ashford ES', 'Codwell ES'].forEach(function (c) { setCell(g, c, 'Has PTO or PTA', 'Yes'); });
  g.processSubmission_(base.sub('Anderson ES', { uploads: [base.upload(g, 'Bylaws')] }));
  var list = g.unstartedYes_(g.currentYear_(), false);
  ok(list.indexOf('Ashford ES') >= 0 && list.indexOf('Codwell ES') >= 0, 'sent nothing: listed');
  ok(list.indexOf('Anderson ES') < 0 && list.indexOf('Durham ES') < 0, 'a sender and a Texas PTA are not listed');
  g.resetUnstarted();
  var yes = g.getPayload_(null).rows.filter(function (x) { return x.pto === 'Yes'; }).map(function (x) { return x.campus; });
  eq(yes.length, 12, 'Anderson ES and the 11 Texas PTAs: ' + yes.join());
  eq(regRow(g, 'Ashford ES')['Has PTO or PTA'], 'Not Yet Confirmed');
  eq(regRow(g, 'Anderson ES')['Has PTO or PTA'], 'Yes');
  eq(regRow(g, 'Durham ES')['Has PTO or PTA'], 'Yes', 'a Texas PTA stays');
  ok(/Backup saved/.test(g.__alerts.slice(-1)[0]), g.__alerts.slice(-1)[0]);
});

test('the dashboard gets each PTA\'s standing and the date, for everyone, with no contacts', function () {
  var g = tracker();
  paste(g, roster.rows());
  g.importTexasPta_();
  var p = g.getPayload_(null);
  eq(p.txAsOf, 'THU, October 15, 2026 at 8:48 AM');
  var by = {}; p.rows.forEach(function (r) { by[r.campus] = r; });
  eq(by['Durham ES'].tx.s, 'Good Standing');
  eq(by['Durham ES'].tx.a.join(''), '11111');
  eq(by['Browning ES'].tx.a.join(''), '10110');
  eq(by['Bonham ES'].tx, null);
  eq(by['Anderson ES'].tx, null);
  ok(JSON.stringify(p).indexOf('example.org') < 0);
});

test('a paste without the headings is refused with a plain message', function () {
  var g = tracker();
  paste(g, [['some', 'thing'], ['else', 'here']]);
  var msg = '';
  try { g.importTexasPta_(); } catch (e) { msg = e.message; }
  ok(/no "Texas PTA ID" heading/.test(msg), msg);
});

/* ---------- view only: SEDs, EDs, principals and APs (2026-10-16c) ---------- */
function withViewers(g) {
  var p = base.withPeople(g);
  var si = g.__ss.getSheetByName('Dashboard Sign-ins');
  g.ensureCanSeeColumn_(si);
  var head = si.values()[0].map(function (x) { return String(x).trim(); }), last = si.getLastRow();
  var rows = [['Dr. Area', 'Viewer', 'NES Elementary'], ['Ms. Principal', 'Principal', 'Codwell ES'], ['Nobody Yet', 'Viewer', 'Atlantis ES']];
  rows.forEach(function (r, i) {
    si.getRange(last + 1 + i, head.indexOf('Name') + 1).setValue(r[0]);
    si.getRange(last + 1 + i, head.indexOf('Role') + 1).setValue(r[1]);
    si.getRange(last + 1 + i, head.indexOf('Can See') + 1).setValue(r[2]);
  });
  var res = g.setUpSignIns_(), pass = {};
  res.made.forEach(function (m) { pass[m.name] = m.pass; });
  p.area = g.signIn('Dr. Area', pass['Dr. Area']).token;
  p.principal = g.signIn('Ms. Principal', pass['Ms. Principal']).token;
  p.res = res;
  return p;
}

test('view only: an Area Office leader sees officers and files for their office, nothing else, and changes nothing', function () {
  var g = tracker();
  g.processSubmission_(base.sub('Anderson ES', { uploads: [base.upload(g, 'Bylaws', 'bylaws.pdf')] }));
  g.processSubmission_(base.sub('Durham ES', { uploads: [base.upload(g, 'Training Certificate', 'cert.pdf')] }));
  var p = withViewers(g);
  ok(p.area && p.principal, 'both can sign in');
  ok(p.res.noCampus.indexOf('Nobody Yet') >= 0, 'a viewer whose Can See matches nothing cannot sign in');
  var d = g.getDashboard(p.area);
  eq(d.me.role, 'viewer');
  var a = d.detail['Anderson ES||2026-27'];
  ok(a && a.a.some(function (x) { return x[2] === 'bylaws.pdf' && /^https:/.test(x[3]); }), 'the Anderson ES file link (NES Elementary)');
  var du = d.detail['Durham ES||2026-27'];
  ok(!du || du.a.every(function (x) { return x.length === 2; }), 'no file names or links for Durham ES (EAS Elementary)');
  eq(d.c1s, null, 'no C1 contact list');
  ['saveChecklist', 'reviewItem', 'logResendRequest'].forEach(function (fn) {
    var msg = '';
    try {
      if (fn === 'saveChecklist') g.saveChecklist(p.area, 'Anderson ES', '2026-27', [{ key: 'Bylaws', status: 'Accepted', remark: '' }], null);
      else if (fn === 'reviewItem') g.reviewItem(p.area, 'Anderson ES', '2026-27', 'Bylaws', 'Accepted', '');
      else g.logResendRequest(p.area, 'Anderson ES', '2026-27', 'x@example.org');
    } catch (e) { msg = e.message; }
    ok(/can see these campuses, but not change anything/.test(msg), fn + ': ' + msg);
  });
  eq(regRow(g, 'Anderson ES')['Bylaws'], 'Received', 'nothing changed');
});

test('view only: a principal sees just their campus', function () {
  var g = tracker();
  g.processSubmission_(base.sub('Codwell ES', { uploads: [base.upload(g, 'Bylaws', 'codwell.pdf')] }));
  g.processSubmission_(base.sub('Anderson ES', { uploads: [base.upload(g, 'Bylaws', 'anderson.pdf')] }));
  var p = withViewers(g);
  var d = g.getDashboard(p.principal);
  eq(d.mine.join(), 'Codwell ES');
  ok(d.detail['Codwell ES||2026-27'].a.some(function (x) { return x[2] === 'codwell.pdf'; }));
  ok(d.detail['Anderson ES||2026-27'].a.every(function (x) { return x.length === 2; }), 'Anderson ES: dates and document types only');
});
