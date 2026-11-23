import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

await mkdir('dist/vendor', { recursive: true });
await Promise.all([
  cp('index.html', 'dist/index.html'),
  cp('excel.html', 'dist/excel.html'),
  cp('excel-auth.html', 'dist/excel-auth.html'),
  cp('src/server', 'dist/src/server', { recursive: true }),
  cp('src/client', 'dist/src/client', { recursive: true, filter: source => !source.endsWith('.mjs') }),
  cp('assets', 'dist/assets', { recursive: true }),
  cp('node_modules/exceljs/dist/exceljs.min.js', 'dist/vendor/exceljs.min.js'),
  cp('node_modules/exceljs/LICENSE', 'dist/vendor/exceljs.LICENSE')
]);
await cp('excel-config.json', 'dist/excel-config.json').catch(async error => {
  if (error.code !== 'ENOENT') throw error;
  await writeFile('dist/excel-config.json', '{}\n');
});
await build({
  entryPoints: { 'excel-tracker': 'src/client/excel-tracker.mjs', 'excel-auth': 'src/client/excel-auth.mjs' },
  bundle: true,
  outdir: 'dist',
  format: 'esm'
});
// The dashboard loads its scripts as classic <script> tags, so the bridge is built as an IIFE.
await build({
  entryPoints: { 'dashboard-excel': 'src/client/dashboard-excel.mjs' },
  bundle: true,
  outdir: 'dist',
  format: 'iife'
});

// Stamp a content hash on local script/style references in dist/index.html and dist/src/client/dashboard-init.js
// so GitHub Pages browsers never serve stale cached JS/CSS after a deploy.
const hash = createHash('sha256');
for (const file of ['dist/dashboard-excel.js', 'dist/src/client/ui.js', 'dist/src/client/Config.js', 'dist/src/client/dashboard-init.js']) {
  hash.update(await readFile(file));
}
const version = hash.digest('hex').slice(0, 10);
const indexHtml = (await readFile('dist/index.html', 'utf8')).replace(/\?v=[A-Za-z0-9_-]+/g, `?v=${version}`);
await writeFile('dist/index.html', indexHtml);
const initJs = (await readFile('dist/src/client/dashboard-init.js', 'utf8')).replace(/\?v=[A-Za-z0-9_-]+/g, `?v=${version}`);
await writeFile('dist/src/client/dashboard-init.js', initJs);
