/* Tests for officer updates approved before they replace the officers (2026-11-03). Run through test-script.js. */
'use strict';
var h = require('./harness');
var base = require('./test-script');
var test = h.test, eq = h.eq, ok = h.ok;
var withPeople = base.withPeople;

var HEAD = ['ID', 'Completion time', 'What school is your organization associated with?', 'What is the name of your organization?', 'Officer #1: Name', 'Officer #1: Position', 'Officer #1: Email',
  'Officer #2: Name', 'Officer #2: Position', 'Officer #2: Email', 'Officer #3: Name', 'Officer #3: Position', 'Officer #3: Email', 'Your email address'];
function form(g, id, when, officers) {
  var paste = g.__ss.getSheetByName('Officer Form Paste'), vals = paste.values().filter(function (r) { return r.join('') !== ''; });
  if (!vals.length) vals = [HEAD];
  var row = [id, when, 'Anderson ES', 'Anderson PTO'];
  for (var i = 0; i < 3; i++) { var o = officers[i] || ['', '', '']; row.push(o[0], o[1], o[2]); }
  row.push('ann@example.org');
  vals.push(row);
  paste.getRange(1, 1, vals.length, HEAD.length).setValues(vals);
  return g.importOfficers_();
}
function cur(g) { var t = g.table_('Officers'); return t.values.slice(1).filter(function (v) { return v[t.col['Officer Status']] === 'Current'; }).map(function (v) { return v[t.col['Name']] + ' (' + v[t.col['Position']] + ')'; }).sort().join(', '); }
function key(g) { var d = g.buildDetail_(true, 'America/Chicago')['Anderson ES||2026-27']; return d.o.filter(function (sb) { return sb.off.some(function (o) { return o.st === 'W'; }); })[0].k; }
var FIRST = [['Ann Officer', 'President', 'ann@example.org'], ['Lisa Lee', 'Secretary', 'lisa@example.org'], ['Tom Treasurer', 'Treasurer', 'tom@example.org']];
var SEP = new Date(Date.UTC(2026, 8, 1)), NOV = new Date(Date.UTC(2026, 10, 2));

function ready() {
  var g = h.load(), p = withPeople(g);
  var r = g.applyOfficerApproval_();
  ok(/added the Officer Status, Reviewed By, Reviewed On columns/.test(r.lines.join('\n')), r.lines.join('\n'));
  form(g, '11', SEP, FIRST);
  return { g: g, p: p };
}

test('the first officer form counts at once; a later one waits for approval and changes nothing yet', function () {
  var w = ready(), g = w.g;
  eq(cur(g), 'Ann Officer (President), Lisa Lee (Secretary), Tom Treasurer (Treasurer)');
  var r = form(g, '12', NOV, [['Sam Smith', 'Secretary', 'sam@example.org']]);
  eq(r.waiting, 1);
  ok(/1 form is an update for a campus that already has officers/.test(g.officerSummary_(r)), g.officerSummary_(r));
  eq(cur(g), 'Ann Officer (President), Lisa Lee (Secretary), Tom Treasurer (Treasurer)', 'the officers do not change yet');
  ok(g.waitingByCampus_('2026-27')[g.norm_('Anderson ES')].officers, 'the C1 reminder mentions it');
  // everyone else sees only the approved officers, and no sign of the waiting update
  var pub = g.openDetail_(g.buildDetail_(true, 'America/Chicago'))['Anderson ES||2026-27'];
  ok(JSON.stringify(pub).indexOf('Sam Smith') < 0, 'a waiting update is not public');
  ok(!pub.a.some(function (e) { return /Officer update/.test(e[4] || ''); }), 'nor its log line');
});

test('approve, update only the people on it: a new secretary replaces the old one, the others stay', function () {
  var w = ready(), g = w.g;
  form(g, '12', NOV, [['Sam Smith', 'Secretary', 'sam@example.org'], ['Ann Officer', 'President', 'ann.new@example.org']]);
  var r = g.reviewOfficers(w.p.c1, 'Anderson ES', '2026-27', key(g), 'merge', '');
  ok(/2 people added or changed, 1 officer kept/.test(r.note), r.note);
  eq(cur(g), 'Ann Officer (President), Sam Smith (Secretary), Tom Treasurer (Treasurer)');
  var t = g.table_('Officers'), lisa = t.values.filter(function (v) { return v[t.col['Name']] === 'Lisa Lee'; })[0];
  eq(lisa[t.col['Officer Status']], 'Replaced', 'kept as history');
  eq(lisa[t.col['Reviewed By']], 'Ms. Lee (C1)');
  ok(/This officer update is no longer waiting/.test((function () { try { g.reviewOfficers(w.p.c1, 'Anderson ES', '2026-27', 'nope', 'merge', ''); } catch (e) { return e.message; } })()));
});

test('approve, replace all; and not approved needs a reason and changes nothing', function () {
  var w = ready(), g = w.g;
  form(g, '12', NOV, [['Sam Smith', 'Secretary', 'sam@example.org']]);
  var threw = '';
  try { g.reviewOfficers(w.p.c1, 'Anderson ES', '2026-27', key(g), 'reject', ' '); } catch (e) { threw = e.message; }
  ok(/Say why the update is not approved/.test(threw), threw);
  g.reviewOfficers(w.p.staff, 'Anderson ES', '2026-27', key(g), 'reject', 'Not signed by the principal');
  eq(cur(g), 'Ann Officer (President), Lisa Lee (Secretary), Tom Treasurer (Treasurer)');
  form(g, '13', new Date(Date.UTC(2026, 10, 3)), [['Sam Smith', 'Secretary', 'sam@example.org']]);
  g.reviewOfficers(w.p.staff, 'Anderson ES', '2026-27', key(g), 'replace', '');
  eq(cur(g), 'Sam Smith (Secretary)');
  var t = g.table_('Officers');
  eq(t.values.filter(function (v) { return v[t.col['Officer Status']] === 'Not approved'; }).length, 1, 'the refused update is kept');
});

test('who may approve: the campus\'s C1 and FACE staff, nobody else', function () {
  var w = ready(), g = w.g;
  form(g, '12', NOV, [['Sam Smith', 'Secretary', 'sam@example.org']]);
  var c1 = g.__ss.getSheetByName('C1 Assignments'); c1.getRange(2, 1, 1, 2).setValues([['Almeda ES', 'Ms. Lee']]);
  var threw = '';
  try { g.reviewOfficers('', 'Anderson ES', '2026-27', key(g), 'replace', ''); } catch (e) { threw = e.message; }
  ok(/sign-in has ended/.test(threw), threw);
});

test('the one-time update: the newest form of each campus is current, older ones replaced; safe to run twice', function () {
  var g = h.load(); withPeople(g);
  form(g, '11', SEP, FIRST);
  form(g, '12', NOV, [['Sam Smith', 'Secretary', 'sam@example.org']]);      // before the update: no approval yet
  var r = g.applyOfficerApproval_();
  ok(/3 officer rows are now Replaced|1 officer row is now Current/.test(r.lines.join('\n')), r.lines.join('\n'));
  eq(cur(g), 'Sam Smith (Secretary)');
  var again = g.applyOfficerApproval_();
  ok(/already there/.test(again.lines.join('\n')) && /Every officer row already had a status/.test(again.lines.join('\n')), again.lines.join('\n'));
});

test('a principal\'s "correct" is due again only after an officer update is approved', function () {
  var w = ready(), g = w.g;
  g.__props.CONFIRM_OPEN = '1';
  g.confirmCampus('', 'Anderson ES', 'ok', '');
  form(g, '12', new Date(Date.now() + 86400000), [['Sam Smith', 'Secretary', 'sam@example.org']]);
  eq(g.confirmations_('2026-27')[g.norm_('Anderson ES')].due, '', 'a waiting update does not count');
});
