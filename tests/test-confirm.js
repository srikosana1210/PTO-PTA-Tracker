/* Tests for principals confirming their PTO/PTA details (2026-10-26f). Run through test-script.js (node tests/test-script.js). */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var withPeople = base.withPeople;

function threw(f) { try { f(); return ''; } catch (e) { return e.message; } }
function rows(g) { return g.__ss.getSheetByName('Campus Confirmations').values().slice(1).filter(function (r) { return r.join('') !== ''; }); }
function addOfficerForm(g, campus, when) {
  var t = g.table_('Officers'), at = Math.max(t.values.length, 1) + 1, v = [];
  t.headers.forEach(function (hd) { v.push({ 'School Year': '2026-27', 'Campus': campus, 'Name': 'New President', 'Position': 'President', 'Submitted': when, 'Response ID': 'x' + at }[hd] || ''); });
  t.sh.getRange(at, 1, 1, v.length).setValues([v]);
}

test('while FACE tests it: only signed-in FACE staff see it and may answer', function () {
  var g = h.load(), p = withPeople(g);
  eq(g.getPayload_(null).conf, null, 'nothing for leadership');
  eq(g.getPayload_({ c1: { name: 'Ms. Lee', campuses: { 'anderson es': 'Anderson ES' } } }).conf, null, 'nothing for a C1');
  ok(/FACE is still testing this/.test(threw(function () { g.confirmCampus('', 'Anderson ES', 'ok', ''); })), 'no sign-in');
  ok(/FACE is still testing this/.test(threw(function () { g.confirmCampus(p.c1, 'Anderson ES', 'ok', ''); })), 'a C1');
  g.__user.email = 'pat.staff@houstonisd.org';
  var r = g.confirmCampus(p.staff, 'Anderson ES', 'ok', '');
  ok(r.ok);
  eq(r.c.slice(0, 4).join('|'), ['ok', g.getPayload_({ staff: true }).today, '', 'pat.staff@houstonisd.org'].join('|'));
  var row = rows(g)[0];
  eq([row[1], row[2], row[3], row[5], row[6]].join('|'), '2026-27|Anderson ES|Correct|pat.staff@houstonisd.org|Pat Staff (FACE)');
  var conf = g.getPayload_({ staff: true, name: 'Pat Staff' }).conf;
  eq(conf.open, false);
  eq(conf.by['Anderson ES'][0], 'ok');
});

test('something is wrong needs a note; the note and who answered stay with FACE and the campus\'s C1', function () {
  var g = h.load(), p = withPeople(g);
  g.__props.CONFIRM_OPEN = '1';
  ok(/Say what is wrong/.test(threw(function () { g.confirmCampus('', 'Anderson ES', 'wrong', '  '); })));
  ok(/not recognized/.test(threw(function () { g.confirmCampus('', 'Anderson ES', 'maybe', ''); })));
  ok(/not on the Campus Register/.test(threw(function () { g.confirmCampus('', 'Nowhere ES', 'ok', ''); })));
  g.__user.email = 'principal@houstonisd.org';
  g.confirmCampus('', 'Anderson ES', 'wrong', 'Our president is now Ana Ruiz');
  g.confirmCampus('', 'Askew ES', 'has', 'Askew PTO, Ana');
  var pub = g.getPayload_(null).conf;
  eq(pub.open, true);
  eq(pub.by['Anderson ES'].length, 3, 'everyone sees only the answer, the date and whether it is due');
  ok(JSON.stringify(pub).indexOf('Ruiz') < 0 && JSON.stringify(pub).indexOf('principal@') < 0, 'no note or email for everyone');
  var mine = g.getPayload_({ c1: { name: 'Ms. Lee', campuses: { 'anderson es': 'Anderson ES' } } }).conf;
  eq(mine.by['Anderson ES'][4], 'Our president is now Ana Ruiz', 'the C1 sees the note for their campus');
  eq(mine.by['Askew ES'].length, 3, 'but not for another campus');
  eq(rows(g).length, 2, 'every answer is a new row');
});

test('a newer officer form, or a new round, makes an answer due again', function () {
  var g = h.load();
  g.__props.CONFIRM_OPEN = '1';
  g.confirmCampus('', 'Anderson ES', 'ok', '');
  g.confirmCampus('', 'Ashford ES', 'ok', '');
  var c = g.confirmations_('2026-27');
  eq(c[g.norm_('Anderson ES')].due, '');
  addOfficerForm(g, 'Anderson ES', new Date(Date.now() + 2 * 86400000));
  c = g.confirmations_('2026-27');
  eq(c[g.norm_('Anderson ES')].due, 'officers');
  eq(c[g.norm_('Ashford ES')].due, '');
  g.__props.CONFIRM_ROUND = '2099-01-01';
  eq(g.confirmations_('2026-27')[g.norm_('Ashford ES')].due, 'round');
});

test('the menu: show to everyone, back to testing, and ask again', function () {
  var g = h.load();
  g.confirmOpenOn();
  eq(g.__props.CONFIRM_OPEN, '1');
  g.confirmOpenOff();
  eq(g.__props.CONFIRM_OPEN, '0');
  g.confirmNewRound();
  ok(/^\d{4}-\d{2}-\d{2}$/.test(g.__props.CONFIRM_ROUND), g.__props.CONFIRM_ROUND);
});
