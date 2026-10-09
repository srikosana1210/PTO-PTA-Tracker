/*
 * A small stand-in for the Google services Code.gs uses, so the script can run in Node against a copy of the tracker workbook.
 * It is not a full emulator: formulas are stored as text and never calculated (formula cells read back as ''), the UI records
 * alerts instead of showing them, and Drive is an in-memory tree. That is enough to test what the script reads and writes.
 *
 *   var h = require('./harness'); var g = h.load({ fixture: 'template' }); g.someFunction_();
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache');

/** The workbook as JSON, built from the .xlsx the first time (needs python3 with openpyxl). */
function fixture(name) {
  // live: the tracker as FACE's live sheet looks before the 2026-10-09 update (154 campuses); template: today's template for a new setup
  var src = { template: path.join(ROOT, 'sheet', 'PTO-PTA-Tracker-2026-27.xlsx'), live: path.join(__dirname, 'fixtures', 'live-before-2026-10-09.xlsx') }[name];
  if (!src) throw new Error('Unknown fixture ' + name);
  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE);
  var out = path.join(CACHE, name + '.json');
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) {
    cp.execFileSync('python3', ['-I', path.join(__dirname, 'build_fixture.py'), src, out], { stdio: 'pipe' });
  }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

function fromCell(v) { return v && typeof v === 'object' && v.d ? new Date(v.d) : v; }

/* ------------------------------------------------------------------ sheets */
function Sheet(ss, name, rows) {
  this.ss = ss; this.name = name;
  this.cells = [];                  // cells[r][c] = { v, f, fmt }
  this.maxRows = Math.max(rows.length, 1);
  this.hiddenRows = {}; this.hiddenCols = {}; this.validation = {}; this.notes = {};
  var self = this;
  rows.forEach(function (row, r) {
    row.forEach(function (v, c) {
      if (v === null || v === undefined) return;
      if (typeof v === 'string' && v.charAt(0) === '=') self.cell(r, c).f = v; else self.cell(r, c).v = fromCell(v);
    });
  });
}
Sheet.prototype.cell = function (r, c) { var row = this.cells[r] || (this.cells[r] = []); return row[c] || (row[c] = { v: '' }); };
Sheet.prototype.peek = function (r, c) { var row = this.cells[r]; return row && row[c] ? row[c] : null; };
Sheet.prototype.getName = function () { return this.name; };
Sheet.prototype.getLastRow = function () {
  for (var r = this.cells.length - 1; r >= 0; r--) { var row = this.cells[r] || []; for (var c = 0; c < row.length; c++) if (row[c] && (row[c].f || (row[c].v !== '' && row[c].v != null))) return r + 1; }
  return 0;
};
Sheet.prototype.getLastColumn = function () {
  var m = 0; this.cells.forEach(function (row) { (row || []).forEach(function (x, c) { if (x && (x.f || (x.v !== '' && x.v != null))) m = Math.max(m, c + 1); }); });
  return m;
};
Sheet.prototype.getMaxRows = function () { return Math.max(this.maxRows, this.getLastRow()); };
Sheet.prototype.insertRowsAfter = function (after, n) { this.maxRows = Math.max(this.getMaxRows(), after) + n; };
Sheet.prototype.hideColumns = function (c) { this.hiddenCols[c] = true; };
Sheet.prototype.hideRows = function (r) { this.hiddenRows[r] = true; };
Sheet.prototype.setColumnWidth = function () {};
Sheet.prototype.clearContents = function () { this.cells.forEach(function (row) { (row || []).forEach(function (x) { if (x) { x.v = ''; delete x.f; } }); }); };
Sheet.prototype.getRange = function (r, c, nr, nc) {
  if (typeof r === 'string') { var m = /^([A-Z]+)(\d+)$/.exec(r); c = m[1].split('').reduce(function (a, ch) { return a * 26 + ch.charCodeAt(0) - 64; }, 0); r = Number(m[2]); }
  return new Range(this, r - 1, c - 1, nr || 1, nc || 1);
};
Sheet.prototype.getDataRange = function () { return new Range(this, 0, 0, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); };
/** Plain values, for test assertions. */
Sheet.prototype.values = function () { return this.getDataRange().getValues(); };

function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
Range.prototype.each = function (fn) { for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++) fn(this.sh.cell(this.r + i, this.c + j), i, j); };
Range.prototype.grid = function (fn) { var out = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) { var x = this.sh.peek(this.r + i, this.c + j); row.push(fn(x)); } out.push(row); } return out; };
Range.prototype.getValues = function () { return this.grid(function (x) { return !x || x.f ? '' : (x.v == null ? '' : x.v); }); };
Range.prototype.getDisplayValues = function () { return this.grid(function (x) { return !x || x.f ? '' : String(x.v == null ? '' : x.v); }); };
Range.prototype.getFormulas = function () { return this.grid(function (x) { return x && x.f ? x.f : ''; }); };
Range.prototype.getValue = function () { return this.getValues()[0][0]; };
Range.prototype.setValue = function (v) { this.each(function (x) { delete x.f; if (typeof v === 'string' && v.charAt(0) === '=') x.f = v; else x.v = v; }); this.grow(); return this; };
Range.prototype.setValues = function (vals) {
  if (vals.length !== this.nr || vals.some(function (row) { return row.length !== this.nc; }, this)) throw new Error('setValues: data does not match the range (' + vals.length + 'x' + (vals[0] || []).length + ' into ' + this.nr + 'x' + this.nc + ')');
  this.each(function (x, i, j) { delete x.f; x.v = vals[i][j]; }); this.grow(); return this;
};
Range.prototype.setFormula = function (f) { this.each(function (x) { x.f = f; x.v = ''; }); this.grow(); return this; };
Range.prototype.setFormulas = function (fs2) { this.each(function (x, i, j) { if (fs2[i][j]) { x.f = fs2[i][j]; x.v = ''; } else { delete x.f; x.v = ''; } }); this.grow(); return this; };
Range.prototype.grow = function () { this.sh.maxRows = Math.max(this.sh.maxRows, this.r + this.nr); };
Range.prototype.setNumberFormat = function (f) { this.each(function (x) { x.fmt = f; }); return this; };
Range.prototype.setNote = function (n) { this.sh.notes[this.r + ',' + this.c] = n; return this; };
Range.prototype.setFontWeight = function () { return this; };
Range.prototype.setFontFamily = function () { return this; };
Range.prototype.setWrap = function () { return this; };
Range.prototype.setDataValidation = function (rule) { for (var j = 0; j < this.nc; j++) this.sh.validation[this.c + j] = { rule: rule, from: this.r, rows: this.nr }; return this; };
Range.prototype.getRow = function () { return this.r + 1; };
Range.prototype.getNumRows = function () { return this.nr; };

/* ------------------------------------------------------------------ drive */
var nextId = 1, REG = {};
function DFile(name, folder) { this.id = 'file' + (nextId++); this.name = name; this.parent = folder; REG[this.id] = this; }
DFile.prototype.getName = function () { return this.name; };
DFile.prototype.setName = function (n) { this.name = n; return this; };
DFile.prototype.getId = function () { return this.id; };
DFile.prototype.getUrl = function () { return 'https://drive.google.com/file/d/' + this.id + '/view'; };
DFile.prototype.moveTo = function (f) { if (this.parent) this.parent.files.splice(this.parent.files.indexOf(this), 1); this.parent = f; f.files.push(this); return this; };
DFile.prototype.makeCopy = function (name) { return new DFile(name, null); };
function iter(list) { var i = 0; return { hasNext: function () { return i < list.length; }, next: function () { return list[i++]; } }; }
function DFolder(name) { this.id = 'folder' + (nextId++); this.name = name; this.files = []; this.folders = []; REG[this.id] = this; }
DFolder.prototype.getId = function () { return this.id; };
DFolder.prototype.getName = function () { return this.name; };
DFolder.prototype.getFoldersByName = function (n) { return iter(this.folders.filter(function (f) { return f.name === n; })); };
DFolder.prototype.getFilesByName = function (n) { return iter(this.files.filter(function (f) { return f.name === n; })); };
DFolder.prototype.getFiles = function () { return iter(this.files.slice()); };
DFolder.prototype.getFolders = function () { return iter(this.folders.slice()); };
DFolder.prototype.createFolder = function (n) { var f = new DFolder(n); this.folders.push(f); return f; };

/* ------------------------------------------------------------------ load */
function load(opts) {
  opts = opts || {};
  var data = opts.sheets || fixture(opts.fixture || 'live');
  var ss = { sheets: [], id: 'SPREADSHEET', tz: 'America/Chicago' };
  data.forEach(function (s) { ss.sheets.push(new Sheet(ss, s.name, s.rows)); });
  ss.getSheetByName = function (n) { return this.sheets.filter(function (s) { return s.name === n; })[0] || null; };
  ss.insertSheet = function (n) { var s = new Sheet(ss, n, []); this.sheets.push(s); return s; };
  ss.getId = function () { return this.id; };
  ss.getSpreadsheetTimeZone = function () { return this.tz; };

  var alerts = [], prompts = (opts.prompts || []).slice(), log = [];
  var ui = {
    alert: function (a, b) { alerts.push(b === undefined || typeof b === 'object' ? String(a) : String(a) + '\n' + String(b)); return ui.Button.OK; },
    prompt: function () { var t = prompts.length ? prompts.shift() : ''; return { getSelectedButton: function () { return ui.Button.OK; }, getResponseText: function () { return t; } }; },
    Button: { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO' },
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
    createMenu: function () { var m = { addItem: function () { return m; }, addSeparator: function () { return m; }, addToUi: function () { return m; } }; return m; }
  };
  var props = Object.assign({}, opts.props || {});
  var cache = {};
  var root = new DFolder('My Drive');
  var sheetFile = new DFile('PTO/PTA Tracker', root); root.files.push(sheetFile);
  REG[ss.id] = sheetFile; sheetFile.id = ss.id;
  var DriveApp = {
    root: root,
    createFolder: function (n) { return root.createFolder(n); },
    getFolderById: function (id) { var f = REG[id]; if (!f) throw new Error('No folder ' + id); return f; },
    getFileById: function (id) { var f = REG[id]; if (!f) throw new Error('No file ' + id); return f; },
    /** test helper: a file sitting in the form's upload folder */
    upload: function (name) { var f = new DFile(name, root); root.files.push(f); return f; }
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var Utilities = {
    formatDate: function (d, tz, fmt) {
      // formats in UTC, which is what the tests use for dates; enough for yyyy, MM, M, dd, d, HH, mm, ss, MMM, h, a
      var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate(), H = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
      return fmt.replace(/yyyy|MMM|MM|M|dd|d|HH|h|mm|ss|a/g, function (t) {
        return { yyyy: y, MMM: M[mo], MM: pad(mo + 1), M: mo + 1, dd: pad(da), d: da, HH: pad(H), h: (H % 12) || 12, mm: pad(mi), ss: pad(s), a: H < 12 ? 'AM' : 'PM' }[t];
      });
    },
    getUuid: function () { return crypto.randomUUID(); },
    computeDigest: function (alg, s) { return Array.prototype.slice.call(crypto.createHash('sha256').update(s, 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; }); },
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }
  };
  function Rule() { this.values = null; }
  Rule.prototype.requireValueInList = function (v) { this.values = v; return this; };
  Rule.prototype.setAllowInvalid = function (b) { this.allowInvalid = b; return this; };
  Rule.prototype.setHelpText = function (t) { this.help = t; return this; };
  Rule.prototype.build = function () { return this; };

  var sandbox = {
    console: console,
    SpreadsheetApp: { getActive: function () { return ss; }, getUi: function () { return ui; }, flush: function () {}, newDataValidation: function () { return new Rule(); } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] === undefined ? null : props[k]; }, setProperty: function (k, v) { props[k] = String(v); }, deleteProperty: function (k) { delete props[k]; } }; } },
    CacheService: { getScriptCache: function () { return { get: function (k) { return cache[k] === undefined ? null : cache[k]; }, put: function (k, v) { cache[k] = String(v); }, remove: function (k) { delete cache[k]; } }; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    Utilities: Utilities,
    DriveApp: DriveApp,
    ScriptApp: { getService: function () { return { getUrl: function () { return opts.url === undefined ? 'https://script.google.com/a/macros/houstonisd.org/s/TEST/exec' : opts.url; } }; }, getProjectTriggers: function () { return []; } },
    HtmlService: { createHtmlOutputFromFile: function () { var h = fs.readFileSync(path.join(ROOT, 'apps-script', 'Dashboard.html'), 'utf8'); return { getContent: function () { return h; } }; } },
    FormApp: { openById: function () { throw new Error('No form in tests'); } },
    Logger: { log: function (m) { log.push(m); } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });
  sandbox.__ss = ss; sandbox.__alerts = alerts; sandbox.__props = props; sandbox.__cache = cache; sandbox.__drive = DriveApp; sandbox.__log = log;
  return sandbox;
}

/* ------------------------------------------------------------------ tiny test runner */
var results = { pass: 0, fail: 0, failures: [] };
function test(name, fn) {
  try { fn(); results.pass++; } catch (err) { results.fail++; results.failures.push(name + ': ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err)); }
}
function eq(a, b, msg) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg || 'not equal') + ': got ' + x + ', expected ' + y); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected true'); }
function report() {
  results.failures.forEach(function (f) { console.log('FAIL ' + f); });
  console.log(results.pass + ' passed, ' + results.fail + ' failed');
  return results.fail === 0;
}

module.exports = { load: load, fixture: fixture, test: test, eq: eq, ok: ok, report: report };
