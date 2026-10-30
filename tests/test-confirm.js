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

/* ---------- flagged organizations (2026-10-29) ---------- */
test('only FACE staff flag and unflag; a reason each time; everyone sees the flag and its reason', function () {
  var g = h.load(), p = withPeople(g);
  ok(/Only FACE staff/.test(threw(function () { g.flagCampus(p.c1, 'Anderson ES', '2026-27', true, 'x'); })), 'a C1 cannot');
  ok(/sign-in has ended/.test(threw(function () { g.flagCampus('', 'Anderson ES', '2026-27', true, 'x'); })), 'no sign-in');
  ok(/Say why/.test(threw(function () { g.flagCampus(p.staff, 'Anderson ES', '2026-27', true, ' '); })), 'a reason is needed');
  ok(/is not flagged/.test(threw(function () { g.flagCampus(p.staff, 'Anderson ES', '2026-27', false, 'ok'); })));
  var r = g.flagCampus(p.staff, 'Anderson ES', '2026-27', true, 'Fundraising complaint');
  eq(r.flag[1], 'Fundraising complaint');
  ok(/already flagged/.test(threw(function () { g.flagCampus(p.staff, 'Anderson ES', '2026-27', true, 'again'); })));
  var pub = g.getPayload_(null).rows.filter(function (x) { return x.campus === 'Anderson ES'; })[0];
  eq(pub.flag.length, 2, 'everyone: date and reason');
  eq(pub.flag[1], 'Fundraising complaint');
  var st = g.getPayload_({ staff: true, name: 'Pat Staff' }).rows.filter(function (x) { return x.campus === 'Anderson ES'; })[0];
  eq(st.flag[2], 'Pat Staff (FACE)', 'staff also see who flagged it');
  var c1 = g.getPayload_({ c1: { name: 'Ms. Lee', campuses: { 'anderson es': 'Anderson ES' } } }).rows.filter(function (x) { return x.campus === 'Anderson ES'; })[0];
  eq(c1.flag[2], 'Pat Staff (FACE)', 'and the campus\'s C1');
  g.flagCampus(p.staff, 'Anderson ES', '2026-27', false, 'Reviewed, OK');
  eq(g.getPayload_(null).rows.filter(function (x) { return x.campus === 'Anderson ES'; })[0].flag, null, 'unflagged');
  var tab = g.__ss.getSheetByName('Flagged Organizations').values().slice(1).filter(function (x) { return x.join('') !== ''; });
  eq(tab.map(function (x) { return x[3]; }).join(), 'Flagged,Unflagged', 'the history is kept');
  var acts = g.openDetail_(g.buildDetail_(true, 'America/Chicago'))['Anderson ES||2026-27'].a.map(function (e) { return e[4] || ''; });
  ok(acts.some(function (x) { return /^Flagged: operations paused while FACE reviews\. Reason: Fundraising complaint$/.test(x); }), acts.join(' / '));
});

/* ---------- Check setup: the C1 Assignments tab (2026-10-30) ---------- */
test('Check setup finds a misspelled C1, campuses not on the register, and campuses with no C1', function () {
  var g = h.load();
  var c1 = g.__ss.getSheetByName('C1 Assignments');
  c1.getRange(2, 1, 4, 2).setValues([['Anderson ES', 'Andreina Savelli'], ['Ashford ES', 'Andreina Savelli'], ['Askew ES', 'Andrienia Savelli'], ['Nowhere Academy', 'Eunice Vela']]);
  var out = g.c1Checks_();
  ok(out.some(function (x) { return /"Andreina Savelli" \(2 campuses\) and "Andrienia Savelli" \(1 campus\)\. Same person\?/.test(x); }), out.join('\n'));
  ok(out.some(function (x) { return /not on the Campus Register: Nowhere Academy \(Eunice Vela\)/.test(x); }), out.join('\n'));
  ok(out.some(function (x) { return /campuses have no C1 on C1 Assignments: Atherton ES/.test(x); }), out.join('\n'));
  ok(!out.some(function (x) { return /Eunice Vela" .*Same person/.test(x); }), 'different people are not flagged');
  ok(g.checkSetup_().problems.some(function (x) { return /Same person\?/.test(x); }), 'Check setup includes it');
  eq(g.editDistance_('andreinasavelli', 'andrieniasavelli'), 3);
});
