import { cp, mkdir, writeFile } from 'node:fs/promises';
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
