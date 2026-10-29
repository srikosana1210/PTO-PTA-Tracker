/* Tests for the officer form fed by Power Automate (2026-10-29b). Run through test-script.js (node tests/test-script.js). */
'use strict';
var h = require('./harness');
var test = h.test, eq = h.eq, ok = h.ok;

function feedRow(g, vals) {
  var sh = g.__ss.getSheetByName('Officer Form Feed'), heads = g.feedHeaders_(), row = heads.map(function (hd) { return vals[hd] || ''; });
  var at = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(at, 1, 1, row.length).setValues([row]);
}
function anderson(id) {
  return { 'ID': id, 'Completion time': new Date(Date.UTC(2026, 9, 28, 15)), 'What school is your organization associated with?': 'Anderson ES',
    'What is the name of your organization?': 'Anderson PTO', 'What type of organization is it?': 'PTO',
    'Officer #1: Name': 'Ann Officer', 'Officer #1: Position': 'President', 'Officer #1: Email': 'ann@example.org', 'Officer #1: Phone': '7135550100',
    'Officer #2: Name': 'Sam Secretary', 'Officer #2: Position': 'Secretary', 'Officer #2: Email': 'sam@example.org',
    'Your name': 'Ann Officer', 'Your email address': 'ann@example.org' };
}
function officers(g) { return g.__ss.getSheetByName('Officers').values().slice(1).filter(function (r) { return r.join('') !== ''; }); }

test('turning it on adds the feed tab with the form\'s column titles and an hourly import; safe to run twice', function () {
  var g = h.load();
  var r = g.officerFeedOn_();
  ok(r.made);
  var sh = g.__ss.getSheetByName('Officer Form Feed');
  eq(sh.values()[0].slice(0, 6).join('|'), 'ID|Completion time|What school is your organization associated with?|What is the name of your organization?|What type of organization is it?|Officer #1: Name');
  eq(g.__triggers.filter(function (t) { return t.fn === 'autoImportOfficers' || t.handler === 'autoImportOfficers'; }).length, 1);
  g.officerFeedOn_();
  eq(g.__triggers.filter(function (t) { return t.fn === 'autoImportOfficers' || t.handler === 'autoImportOfficers'; }).length, 1, 'still one trigger');
  eq(g.officerFeedOn_().made, false, 'the titles are kept');
});

test('the hourly import adds a new response once, and marks Officer Information', function () {
  var g = h.load();
  g.officerFeedOn_();
  g.autoImportOfficers();
  ok(/Nothing new/.test(g.__props.FEED_LAST), g.__props.FEED_LAST);
  feedRow(g, anderson('501'));
  g.autoImportOfficers();
  ok(/1 new form response, 2 officers added/.test(g.__props.FEED_LAST), g.__props.FEED_LAST);
  var o = officers(g);
  eq(o.length, 2);
  var t = g.table_('Campus Register'), v = t.values[g.findRow_(t, '2026-27', 'Anderson ES') - 1];
  eq(v[t.col['Officer Information']], 'Accepted');
  g.autoImportOfficers();
  eq(officers(g).length, 2, 'nothing is imported twice');
  ok(/Nothing new/.test(g.__props.FEED_LAST));
});

test('the menu import reads the paste tab and the feed together, without doubles', function () {
  var g = h.load();
  g.officerFeedOn_();
  feedRow(g, anderson('601'));
  var r = g.importOfficers_();
  eq(r.added, 1, 'from the feed, with an empty paste tab');
  var paste = g.__ss.getSheetByName('Officer Form Paste'), heads = g.feedHeaders_();
  var a = anderson('601');
  paste.getRange(1, 1, 2, heads.length).setValues([heads, heads.map(function (hd) { return a[hd] || ''; })]);
  r = g.importOfficers_();
  eq(r.added, 0); eq(r.already, 2, 'the same response in both tabs counts once');
  eq(officers(g).length, 2);
});
