/* Shared by test-new.js and test-dashboard.js. */
'use strict';
var fs = require('fs');
var path = require('path');

function csvRows(file) {
  return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(function (line) {
    var out = [], f = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(f); f = ''; } else f += c;
    }
    out.push(f); return out;
  });
}
function withAreaTab(g) {
  var rows = csvRows(path.join(__dirname, '..', 'sheet', 'Area Office Campuses.csv'));
  var sh = g.__ss.insertSheet('Area Office Campuses');
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length - 1;
}
module.exports = { csvRows: csvRows, withAreaTab: withAreaTab };
