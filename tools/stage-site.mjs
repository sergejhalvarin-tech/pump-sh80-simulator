#!/usr/bin/env node
// Lays out the published site in _site/ from a build (npm run build): the light page as index.html with its models
// beside it, the whole simulator in one file for offline use, the strength viewer and the report when they exist.
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('teardown-out/dist');
const OUT = path.resolve('_site');
fs.rmSync(OUT, {recursive: true, force: true});
fs.mkdirSync(OUT, {recursive: true});

const copy = (from, to = path.basename(from)) => {
  fs.copyFileSync(from, path.join(OUT, to));
  console.log(`${to}  ${(fs.statSync(from).size / 1048576).toFixed(1)} MB`);
};
// each page with the models it fetches beside it
for (const [page, as] of [['pump-site', 'index.html'], ['strength', 'strength.html']]) {
  if (!fs.existsSync(path.join(DIST, `${page}.html`))) continue;
  copy(path.join(DIST, `${page}.html`), as);
  const list = path.join(DIST, `${page}.assets.json`);
  if (fs.existsSync(list)) for (const a of JSON.parse(fs.readFileSync(list, 'utf8'))) copy(path.join(DIST, a));
}
if (fs.existsSync(path.join(DIST, 'pump-live.html'))) copy(path.join(DIST, 'pump-live.html'), 'offline.html');
// the report, built by tools/report.mjs and kept in the repository
if (fs.existsSync('report/report.pdf')) copy('report/report.pdf', 'report.pdf');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
