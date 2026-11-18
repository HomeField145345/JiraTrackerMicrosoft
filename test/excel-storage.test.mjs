import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ExcelJS from 'exceljs/dist/exceljs.min.js';

function harness({ foreignWorkbook, sharepoint } = {}) {
  const transfer = 'https://storage.example.test';
  const folder = sharepoint ? '/drives/library/items/folder' : '/me/drive/root';
  const itemPath = sharepoint ? '/drives/library/items/file' : '/me/drive/items/file';
  const folderPath = sharepoint ? '/drives/library/items/folder' : '/me/drive/items/folder';
  const item = { id: 'file', eTag: '"1"', file: {}, webUrl: `${transfer}/excel` };
  let bytes = foreignWorkbook;
  let pending;
  let commits = 0;
  let interfere = false;
  const json = (value, status = 200) => Response.json(value, { status });
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.origin === transfer) {
      assert.equal(init.headers?.Authorization, undefined);
      if (url.pathname === '/read') return new Response(bytes);
      assert.equal(url.pathname, '/upload');
      if (init.method === 'PUT') {
        pending = init.body;
        assert.equal(init.headers['Content-Range'], `bytes 0-${pending.byteLength - 1}/${pending.byteLength}`);
        if (interfere) item.eTag = '"external-change"';
        return json({}, 202);
      }
      assert.equal(init.method, 'POST');
      bytes = pending;
      item.eTag = `"${++commits + 1}"`;
      return json(item);
    }
    assert.equal(url.origin, 'https://graph.microsoft.com');
    assert.equal(init.headers.Authorization, 'Bearer simulated');
    const path = url.pathname.replace('/v1.0', '');
    if (path === `${folder}:/ProjectHub.xlsx` || path === itemPath) {
      return bytes ? json({ ...item, '@microsoft.graph.downloadUrl': `${transfer}/read` }) : json({}, 404);
    }
    if (path === folder) return json({ id: 'folder', folder: {} });
    if (path === `${folderPath}:/ProjectHub.xlsx:/createUploadSession`) {
      assert.equal(JSON.parse(init.body).item['@microsoft.graph.conflictBehavior'], 'fail');
      assert.equal(JSON.parse(init.body).deferCommit, true);
      return bytes ? json({}, 409) : json({ uploadUrl: `${transfer}/upload` });
    }
    assert.equal(path, `${itemPath}/createUploadSession`);
    assert.equal(init.headers['If-Match'], item.eTag);
    return json({ uploadUrl: `${transfer}/upload` });
  };
  const context = vm.createContext({ ExcelJS, fetch, Date, TextDecoder, atob, URL, crypto, console });
  context.self = context;
  context.importScripts = (...paths) => {
    for (const path of paths) {
      if (path.startsWith('../../vendor/')) continue;
      vm.runInContext(readFileSync(new URL(`../src/server/${path}`, import.meta.url), 'utf8'), context, { filename: path });
    }
  };
  context.importScripts('excel-worker.js');
  return {
    run: (action, itemId, payload) => context.runExcelOperation({
      action, itemId, payload, accessToken: 'simulated',
      target: sharepoint ? { driveId: 'library', folderId: 'folder' } : undefined
    }),
    revision: () => commits,
    workbook: async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      return workbook;
    },
    interfere: () => { interfere = true; }
  };
}

test('provisions Excel once in SharePoint, then persists Jira imports and tasks', async () => {
  const graph = harness({ sharepoint: true });
  const connected = await graph.run('connect');
  assert.equal(connected.created, true);
  assert.equal((await graph.run('connect')).created, false);
  assert.equal(graph.revision(), 1);
  const workbook = await graph.workbook();
  for (const [sheet, header] of Object.entries({
    JiraData: 'Sync Status', ManualData: 'Jira #', OptionsList: 'ACT/PCT Options',
    IndependentTasks: 'ID', Users: 'ID', Sessions: 'Token', AdminConfigs: 'Username'
  })) {
    assert.equal(workbook.getWorksheet(sheet).getCell('A1').value, header);
    assert.equal(workbook.getWorksheet(sheet).rowCount, 1);
  }
  const file = Buffer.from('Issue key,Summary,Status,Assignee\nTEST-1,Example issue,Open,Example\n');
  await graph.run('import', connected.itemId, { fileName: 'jira.csv', base64Data: file.toString('base64') });
  await graph.run('addTask', connected.itemId, '=Literal text');
  const reopened = await graph.run('connect');
  assert.equal(reopened.projects.projects[0]['Jira #'], 'TEST-1');
  assert.equal(reopened.projects.independentTasks[0].Title, '=Literal text');
  assert.equal((await graph.workbook()).getWorksheet('IndependentTasks').getCell('B2').type, ExcelJS.ValueType.String);
});

test('does not replace an unrelated file at the OneDrive destination', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Another workbook').getCell('A1').value = 'Keep this';
  const graph = harness({ foreignWorkbook: await workbook.xlsx.writeBuffer() });
  await assert.rejects(graph.run('connect'), /not a compatible tracker workbook/);
  assert.equal(graph.revision(), 0);
});

test('does not commit when the workbook changes during upload', async () => {
  const graph = harness();
  const { itemId } = await graph.run('connect');
  graph.interfere();
  await assert.rejects(graph.run('addTask', itemId, 'Conflicting task'), /file changed/);
  assert.equal(graph.revision(), 1);
  assert.equal((await graph.run('refresh', itemId)).projects.independentTasks.length, 0);
});
