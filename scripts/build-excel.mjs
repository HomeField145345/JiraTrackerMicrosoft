import { cp, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist/vendor', { recursive: true });
await Promise.all([
  cp('index.html', 'dist/index.html'),
  cp('excel.html', 'dist/excel.html'),
  cp('excel-auth.html', 'dist/excel-auth.html'),
  cp('src/server', 'dist/src/server', { recursive: true }),
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
