/* Builds the two one-page PDFs (and PNG previews) from the HTML guides: node docs/guides/make-pdf.js
   Each guide is measured at the printable width of a Letter page and scaled down just enough to fit on one page. */
'use strict';
var path = require('path');
var pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
var W = Math.round((8.5 - 0.76) * 96), H = Math.round((11 - 0.76) * 96);   // the page inside 0.38in margins, in CSS pixels
(async function () {
  var browser = await pw.chromium.launch();
  for (var name of ['c1-quick-guide', 'principal-ed-quick-guide']) {
    var page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await page.goto('file://' + path.join(__dirname, name + '.html'));
    await page.emulateMedia({ media: 'print' });
    var h = await page.evaluate(function () { return document.documentElement.scrollHeight; });
    var z = Math.min(1, (H - 20) / h);
    console.log(name, 'height', h, 'page', H, 'scale', z.toFixed(3));
    // shrink a little at a time until it is one page (the printer lays the page out again at each scale)
    for (var tries = 0; tries < 12; tries++) {
      var buf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.38in', bottom: '0.38in', left: '0.38in', right: '0.38in' }, scale: z });
      var pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      if (pages <= 1) { require('fs').writeFileSync(path.join(__dirname, name + '.pdf'), buf); break; }
      z -= 0.02;
    }
    console.log('  printed at scale', z.toFixed(2));
    
    await page.close();
  }
  await browser.close();
})();
