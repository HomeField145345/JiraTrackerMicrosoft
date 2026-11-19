import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ExcelJS from 'exceljs/dist/exceljs.min.js';

function harness({ foreignWorkbook, sharepoint, fileName, folderPath, expectedLookup, omitMetadataDownloadUrl, omitItemDownloadUrl, commitStatus, cancelStatus = 204, setupFailure } = {}) {
  const transfer = 'https://storage.example.test';
  const folder = sharepoint ? '/drives/library/items/folder' : '/me/drive/root';
  const itemPath = sharepoint ? '/drives/library/items/file' : '/me/drive/items/file';
  const destinationPath = sharepoint ? '/drives/library/items/folder' : '/me/drive/items/folder';
  const lookup = expectedLookup ?? `${folder}:/${encodeURIComponent(fileName ?? 'ProjectHub.xlsx')}`;
  const item = { id: 'file', eTag: '"1"', file: {}, webUrl: `${transfer}/excel` };
  let bytes = foreignWorkbook;
  let pending;
  let commits = 0;
  let cancellations = 0;
  let uploadSessions = 0;
  let setupWrites = 0;
  let setupSessionOpen = false;
  let closedSetupSessions = 0;
  let interfere = false;
  let changeOnDownload = false;
  const json = (value, status = 200) => Response.json(value, { status });
  const graphFetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.origin === transfer) {
      assert.equal(init.headers?.Authorization, undefined);
      if (url.pathname === '/read') {
        if (changeOnDownload) item.eTag = '"external-change"';
        return new Response(bytes);
      }
      assert.equal(url.pathname, '/upload');
      if (init.method === 'DELETE') {
        cancellations++;
        if (cancelStatus === 204) pending = undefined;
        return new Response(null, { status: cancelStatus });
      }
      if (init.method === 'PUT') {
        pending = init.body;
        assert.equal(init.headers['Content-Range'], `bytes 0-${pending.byteLength - 1}/${pending.byteLength}`);
        if (interfere) item.eTag = '"external-change"';
        return json({}, 202);
      }
      assert.equal(init.method, 'POST');
      assert.equal(init.body, '', 'deferred commit must send zero-length content');
      if (commitStatus) return json({ error: { code: 'nameAlreadyExists' } }, commitStatus);
      bytes = pending;
      item.eTag = `"${++commits + 1}"`;
      return json(item);
    }
    assert.equal(url.origin, 'https://graph.microsoft.com');
    assert.equal(init.headers.Authorization, 'Bearer simulated');
    const path = url.pathname.replace('/v1.0', '');
    if (path.startsWith(`${itemPath}/workbook/`)) {
      const operation = decodeURIComponent(path.slice(`${itemPath}/workbook/`.length));
      if (operation === 'createSession') {
        assert.equal(init.method, 'POST');
        assert.equal(JSON.parse(init.body).persistChanges, true);
        assert.equal(setupSessionOpen, false);
        setupSessionOpen = true;
        return json({ id: 'setup-session' }, 201);
      }
      assert.equal(init.headers['workbook-session-id'], 'setup-session');
      assert.equal(setupSessionOpen, true);
      if (operation === 'closeSession') {
        assert.equal(init.method, 'POST');
        setupSessionOpen = false;
        closedSetupSessions++;
        return new Response(null, { status: 204 });
      }
      if (setupFailure === operation) {
        setupFailure = undefined;
        return json({}, 503);
      }
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      const body = JSON.parse(init.body);
      if (operation === 'worksheets/add') {
        assert.equal(init.method, 'POST');
        workbook.addWorksheet(body.name);
      } else {
        assert.equal(init.method, 'PATCH');
        const range = operation.match(/^worksheets\/([^/]+)\/range\(address='([^']+)'\)$/);
        if (range) {
          const sheet = workbook.getWorksheet(range[1]);
          assert.ok(sheet, 'header writes must target an existing worksheet');
          assert.equal(sheet.actualRowCount, 0, 'setup must not overwrite existing rows');
          assert.equal(range[2], body.values[0].length === 1 ? 'A1' : `A1:${sheet.getColumn(body.values[0].length).letter}1`);
          body.values[0].forEach((value, index) => {
            sheet.getCell(1, index + 1).value = value;
          });
        } else {
          assert.equal(operation, 'worksheets/_ProjectHub');
          assert.equal(body.visibility, 'VeryHidden');
          workbook.getWorksheet('_ProjectHub').state = 'veryHidden';
        }
      }
      bytes = await workbook.xlsx.writeBuffer();
      item.eTag = `"setup-${++setupWrites}"`;
      return json({});
    }
    if (path === lookup || path === itemPath) {
      if (!bytes) return json({}, 404);
      if (url.searchParams.get('select') === 'id,@microsoft.graph.downloadUrl') {
        assert.equal(path, itemPath, 'download URL lookup must use the resolved item ID');
        return json(omitItemDownloadUrl ? { id: item.id } : {
          id: item.id, '@microsoft.graph.downloadUrl': `${transfer}/read`
        });
      }
      return json(omitMetadataDownloadUrl ? item : { ...item, '@microsoft.graph.downloadUrl': `${transfer}/read` });
    }
    if (path === folder) return json({ id: 'folder', folder: {} });
    if (path === `${destinationPath}:/ProjectHub.xlsx:/createUploadSession`) {
      uploadSessions++;
      assert.equal(fileName, undefined, 'an explicitly selected workbook must never be created');
      assert.equal(JSON.parse(init.body).item['@microsoft.graph.conflictBehavior'], 'fail');
      assert.equal(JSON.parse(init.body).deferCommit, true);
      return bytes ? json({}, 409) : json({ uploadUrl: `${transfer}/upload` });
    }
    assert.equal(path, `${itemPath}/createUploadSession`);
    uploadSessions++;
    assert.equal(init.headers['If-Match'], item.eTag);
    return json({ uploadUrl: `${transfer}/upload` });
  };
  const context = vm.createContext({ ExcelJS, graphFetch, Date, TextDecoder, atob, URL, crypto, console });
  // Match browser workers, which reject fetch calls with the wrong receiver.
  vm.runInContext(`
    globalThis.fetch = function (input, init) {
      'use strict';
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return graphFetch(input, init);
    };
  `, context);
  context.self = context;
  context.importScripts = (...paths) => {
    for (const path of paths) {
      if (path.startsWith('../../vendor/')) continue;
      vm.runInContext(readFileSync(new URL(`../src/server/${path}`, import.meta.url), 'utf8'), context, { filename: path });
    }
  };
  context.importScripts('excel-worker.js');
  return {
    run: (action, itemId, payload, userObjectId, ownerObjectId, userEmail) => context.runExcelOperation({
      action, itemId, payload, accessToken: 'simulated',
      userObjectId, userEmail, ownerObjectId,
      target: { ...(sharepoint ? { driveId: 'library', folderId: 'folder' } : {}), fileName, folderPath }
    }),
    revision: () => commits,
    cancellations: () => cancellations,
    uploadSessions: () => uploadSessions,
    setupWrites: () => setupWrites,
    closedSetupSessions: () => closedSetupSessions,
    workbook: async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      return workbook;
    },
    replaceWorkbook: async updatedBytes => {
      bytes = updatedBytes;
      item.eTag = '"external-change"';
    },
    analyzeCapacity: (items, sprintName) => context.analyzeSprintCapacity(items, sprintName),
    interfere: () => { interfere = true; },
    changeOnDownload: () => { changeOnDownload = true; }
  };

  test('aggregates current-sprint story points by developer without double-counting multi-sprint issues', () => {
    const graph = harness();
    const capacity = graph.analyzeCapacity([
      { 'Issue Type': 'Story', 'Assigned Dev': 'Avery', 'Story Points': '3', sprint: 'Sprint 11, Sprint 12' },
      { 'Issue Type': 'Bug', Assignee: 'Avery', 'Story Points': 2, sprint: 'Sprint 12' },
      { 'Issue Type': 'Story', Assignee: 'Blair', 'Story Points': '5', sprint: 'Sprint 12' },
      { 'Issue Type': 'Epic', Assignee: 'Avery', 'Story Points': 8, sprint: 'Sprint 12' },
      { 'Issue Type': 'Story', Assignee: 'Casey', 'Story Points': 9, sprint: 'Sprint 11' },
      { 'Issue Type': 'Story', 'Story Points': '', sprint: 'Sprint 12' }
    ], 'Sprint 12');

    assert.deepEqual(JSON.parse(JSON.stringify(capacity)), {
      sprintName: 'Sprint 12',
      totalIssues: 4,
      totalStoryPoints: 10,
      developers: [
        { developer: 'Avery', issueCount: 2, storyPoints: 5 },
        { developer: 'Blair', issueCount: 1, storyPoints: 5 },
        { developer: 'Unassigned', issueCount: 1, storyPoints: 0 }
      ]
    });
    assert.deepEqual(JSON.parse(JSON.stringify(graph.analyzeCapacity([], 'None'))), {
      sprintName: 'None', totalIssues: 0, totalStoryPoints: 0, developers: []
    });
  });
}

test('provisions Excel once in SharePoint, then persists Jira imports and tasks', async () => {
  const graph = harness({ sharepoint: true });
  const connected = await graph.run('connect');
  assert.equal(connected.created, true);
  assert.equal((await graph.run('connect')).created, false);
  assert.equal(graph.revision(), 1);
  assert.equal(graph.cancellations(), 0);
  const workbook = await graph.workbook();
  for (const [sheet, header] of Object.entries({
    JiraData: 'Sync Status', ManualData: 'Jira #', OptionsList: 'ACT/PCT Options',
    IndependentTasks: 'ID', Users: 'ID', Sessions: 'Token', AdminConfigs: 'Username'
  })) {
    assert.equal(workbook.getWorksheet(sheet).getCell('A1').value, header);
    assert.equal(workbook.getWorksheet(sheet).rowCount, sheet === 'Users' ? 2 : 1);
  }
  const file = Buffer.from('Issue key,Summary,Status,Assignee\nTEST-1,Example issue,Open,Example\n');
  await graph.run('import', connected.itemId, { fileName: 'jira.csv', base64Data: file.toString('base64') });
  await graph.run('addTask', connected.itemId, '=Literal text');
  const reopened = await graph.run('connect');
  assert.equal(reopened.projects.projects[0]['Jira #'], 'TEST-1');
  assert.equal(reopened.projects.independentTasks[0].Title, '=Literal text');
  assert.equal((await graph.workbook()).getWorksheet('IndependentTasks').getCell('B2').type, ExcelJS.ValueType.String);
});

test('persists dashboard edits and reopens workbooks with extended task columns', async () => {
  const graph = harness();
  const ownerObjectId = '33333333-3333-3333-3333-333333333333';
  const memberObjectId = '44444444-4444-4444-4444-444444444444';
  const connected = await graph.run('connect', undefined, undefined, ownerObjectId, ownerObjectId);
  const { itemId } = connected;
  assert.equal(connected.user.role, 'admin');
  assert.equal(connected.user.microsoftObjectId, ownerObjectId);

  const workbook = await graph.workbook();
  workbook.getWorksheet('Users').addRow([
    'user-2', 'pm', 'pm@example.com', 'Project Manager', 'project_manager', true,
    '', new Date(), '', '', memberObjectId
  ]);
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const member = await graph.run('connect', itemId, undefined, memberObjectId, ownerObjectId);
  assert.equal(member.user.role, 'project_manager');
  await assert.rejects(graph.run('mutate', itemId, {
    method: 'saveConfiguration', args: [{}]
  }, memberObjectId, ownerObjectId), /Admin rights required/);

  const fieldUpdate = await graph.run('mutate', itemId, {
    method: 'saveManualData',
    args: ['TEST-1', 'Artifacts', '[{"name":"spec"}]']
  }, ownerObjectId, ownerObjectId);
  assert.equal(fieldUpdate.response.status, 'success');

  const taskCreate = await graph.run('mutate', itemId, {
    method: 'createTaskAndSync',
    args: [{ Title: 'Workbook task', Status: 'Open' }]
  }, ownerObjectId, ownerObjectId);
  assert.equal(taskCreate.response.status, 'success');

  const reopened = await graph.run('connect', itemId, undefined, ownerObjectId, ownerObjectId);
  assert.equal(reopened.projects.independentTasks[0].Title, 'Workbook task');
  const savedWorkbook = await graph.workbook();
  assert.equal(savedWorkbook.getWorksheet('ManualData').getCell('J1').value, 'Artifacts');
  assert.equal(savedWorkbook.getWorksheet('ManualData').getCell('J2').value, '[{"name":"spec"}]');
  assert.equal(savedWorkbook.getWorksheet('IndependentTasks').getCell('K1').value, 'Recurrence');
  assert.equal(savedWorkbook.getWorksheet('Users').getCell('K1').value, 'Microsoft Object ID');
});

test('links the configured owner to the Admin row in a workbook with the legacy Users schema', async () => {
  const graph = harness();
  const initial = await graph.run('connect');
  const workbook = await graph.workbook();
  workbook.getWorksheet('Users').spliceColumns(11, 1);
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const ownerObjectId = '33333333-3333-3333-3333-333333333333';
  const connected = await graph.run('connect', initial.itemId, undefined, ownerObjectId, ownerObjectId);
  assert.equal(connected.user.role, 'admin');
  assert.equal(connected.user.microsoftObjectId, ownerObjectId);
  const migrated = await graph.workbook();
  assert.equal(migrated.getWorksheet('Users').getCell('K1').value, 'Microsoft Object ID');
  assert.equal(migrated.getWorksheet('Users').getCell('K2').value, ownerObjectId);
});

test('matches the configured owner email when multiple unassigned Admin rows exist', async () => {
  const graph = harness();
  const initial = await graph.run('connect');
  const workbook = await graph.workbook();
  workbook.getWorksheet('Users').addRow([
    'user-2', 'owner', 'owner@example.com', 'Workbook Owner', 'admin', true,
    '', new Date(), '', '', ''
  ]);
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const ownerObjectId = '33333333-3333-3333-3333-333333333333';
  const connected = await graph.run('connect', initial.itemId, undefined, ownerObjectId, ownerObjectId, 'owner@example.com');
  assert.equal(connected.user.username, 'owner');
  assert.equal(connected.user.microsoftObjectId, ownerObjectId);
  const migrated = await graph.workbook();
  assert.equal(migrated.getWorksheet('Users').getCell('K2').value, null);
  assert.equal(migrated.getWorksheet('Users').getCell('K3').value, ownerObjectId);
});

test('reads Microsoft Object ID in column K when legacy Users data lacks Data Sheet ID in column J', async () => {
  const graph = harness();
  const initial = await graph.run('connect');
  const workbook = await graph.workbook();
  const users = workbook.getWorksheet('Users');
  users.spliceColumns(10, 2);
  users.getCell('K1').value = 'Microsoft Object ID';
  const ownerObjectId = '33333333-3333-3333-3333-333333333333';
  users.getCell('K2').value = ownerObjectId;
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const connected = await graph.run('connect', initial.itemId, undefined, ownerObjectId, ownerObjectId, 'admin@example.com');
  assert.equal(connected.user.role, 'admin');
  assert.equal(connected.user.microsoftObjectId, ownerObjectId);
});

test('accepts formatted blank columns beyond the Users schema', async () => {
  const graph = harness();
  const initial = await graph.run('connect');
  const workbook = await graph.workbook();
  workbook.getWorksheet('Users').getColumn(14).width = 18;
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const ownerObjectId = '33333333-3333-3333-3333-333333333333';
  const connected = await graph.run('connect', initial.itemId, undefined, ownerObjectId, ownerObjectId);
  assert.equal(connected.user.microsoftObjectId, ownerObjectId);
});

test('treats a textual TRUE value as an active user during owner bootstrap', async () => {
  const graph = harness();
  const initial = await graph.run('connect');
  const workbook = await graph.workbook();
  workbook.getWorksheet('Users').getCell('F2').value = 'TRUE';
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const ownerObjectId = '33333333-3333-3333-3333-333333333333';
  const connected = await graph.run('connect', initial.itemId, undefined, ownerObjectId, ownerObjectId);
  assert.equal(connected.user.role, 'admin');
  assert.equal(connected.user.microsoftObjectId, ownerObjectId);
});

test('resolves the reported Admin row by Microsoft Object ID', async () => {
  const graph = harness();
  const initial = await graph.run('connect');
  const workbook = await graph.workbook();
  workbook.getWorksheet('Users').getRow(2).values = [
    '1', 'ckrablin', 'ck0779@att.com', 'Chris', 'admin', 'TRUE', '123456', '', '', '',
    '757e8405-c7eb-4fc6-9add-dc3a4560fa1c'
  ];
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const objectId = '757e8405-c7eb-4fc6-9add-dc3a4560fa1c';
  const connected = await graph.run('connect', initial.itemId, undefined, objectId, objectId, 'ck0779@att.com');
  assert.equal(connected.user.username, 'ckrablin');
  assert.equal(connected.user.email, 'ck0779@att.com');
  assert.equal(connected.user.role, 'admin');
  assert.equal(connected.user.microsoftObjectId, objectId);
});

test('filters project data and capacity to the mapped non-admin workbook user', async () => {
  const graph = harness();
  await graph.run('connect');
  const workbook = await graph.workbook();
  const users = workbook.getWorksheet('Users');
  const issues = workbook.getWorksheet('JiraData');
  const headers = issues.getRow(1).values.slice(1);
  const addIssue = (jiraId, owner, developer, points) => {
    const row = Array(headers.length).fill('');
    const values = {
      'Jira #': jiraId,
      Summary: jiraId,
      'Issue Type': 'Story',
      Assignee: developer,
      'Assigned Dev': developer,
      Owner: owner,
      'Story Points': points,
      sprint: 'Sprint 12'
    };
    Object.entries(values).forEach(([header, value]) => { row[headers.indexOf(header)] = value; });
    issues.addRow(row);
  };
  addIssue('TEAM-1', 'pm', 'Avery', 3);
  addIssue('TEAM-2', 'someone-else', 'Blair', 8);
  const memberObjectId = '44444444-4444-4444-4444-444444444444';
  users.addRow([
    'user-2', 'pm', 'pm@example.com', 'Project Manager', 'project_manager', true,
    '', new Date(), '', '', memberObjectId
  ]);
  await graph.replaceWorkbook(await workbook.xlsx.writeBuffer());

  const memberData = await graph.run('connect', 'file', undefined, memberObjectId, '33333333-3333-3333-3333-333333333333');
  assert.deepEqual(JSON.parse(JSON.stringify(memberData.projects.projects.map(issue => issue['Jira #']))), ['TEAM-1']);
  assert.deepEqual(JSON.parse(JSON.stringify(memberData.projects.sprintCapacity.developers)), [
    { developer: 'Avery', issueCount: 1, storyPoints: 3 }
  ]);
});

test('does not replace an unrelated file at the OneDrive destination', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Another workbook').getCell('A1').value = 'Keep this';
  const graph = harness({ foreignWorkbook: await workbook.xlsx.writeBuffer() });
  await assert.rejects(graph.run('connect'), /not a compatible tracker workbook/);
  assert.equal(graph.revision(), 0);
});

test('opens a file in a OneDrive subfolder without writing, then sets it up in place on request', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1');
  workbook.addWorksheet('JiraData').getCell('A1').font = { bold: true, color: { argb: 'FF006FC1' } };
  const tasks = workbook.addWorksheet('IndependentTasks');
  tasks.addRow(['ID', 'Title', 'Assignee', 'Status', 'Priority', 'Due', 'Project', 'Tags', 'Description', 'Owner']);
  tasks.addRow(['existing', 'Keep this task', '', 'Not started']);
  tasks.getColumn(2).width = 45;
  tasks.getCell('B2').font = { italic: true };
  const graph = harness({
    foreignWorkbook: await workbook.xlsx.writeBuffer(),
    folderPath: 'Documents/Team #1',
    fileName: 'Tracker.xlsx',
    expectedLookup: '/me/drive/root:/Documents/Team%20%231/Tracker.xlsx',
    omitMetadataDownloadUrl: true
  });
  const { itemId, needsSetup, created } = await graph.run('connect');
  assert.equal(needsSetup, true);
  assert.equal(created, false);
  assert.equal((await graph.run('refresh', itemId)).needsSetup, true);
  await assert.rejects(graph.run('addTask', itemId, 'Not yet'), /Set up the workbook/);
  assert.equal(graph.revision(), 0);

  const configured = await graph.run('configure', itemId);
  assert.equal(configured.itemId, itemId);
  assert.equal(configured.projects.independentTasks[0].Title, 'Keep this task');
  const saved = await graph.workbook();
  assert.equal(saved.getWorksheet('JiraData').getCell('A1').value, 'Sync Status');
  assert.equal(saved.getWorksheet('ManualData').getCell('A1').value, 'Jira #');
  assert.ok(saved.getWorksheet('Sheet1'), 'setup must not delete existing worksheets');
  assert.equal(saved.getWorksheet('JiraData').getCell('A1').font.color.argb, 'FF006FC1');
  assert.equal(saved.getWorksheet('IndependentTasks').getColumn(2).width, 45);
  assert.equal(saved.getWorksheet('IndependentTasks').getCell('B2').font.italic, true);
  assert.equal(saved.getWorksheet('_ProjectHub').state, 'veryHidden');
  assert.equal(graph.uploadSessions(), 0, 'setup must never upload a replacement file');
  assert.equal(graph.closedSetupSessions(), 1);
  const setupWrites = graph.setupWrites();
  assert.equal((await graph.run('connect')).projects.independentTasks.length, 1);
  assert.equal((await graph.run('configure', itemId)).message, 'Workbook is already set up.');
  assert.equal(graph.setupWrites(), setupWrites);
  assert.equal(graph.revision(), 0);
});

test('sets up an existing SharePoint workbook without creating an upload session', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1');
  const graph = harness({
    sharepoint: true, fileName: 'Existing.xlsx',
    foreignWorkbook: await workbook.xlsx.writeBuffer()
  });
  const { itemId } = await graph.run('connect');
  await graph.run('configure', itemId);
  assert.equal(graph.uploadSessions(), 0);
  assert.equal(graph.closedSetupSessions(), 1);
  assert.equal((await graph.workbook()).getWorksheet('JiraData').getCell('B1').value, 'Jira #');
});

test('refuses setup if the workbook changed after it was read', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1');
  const graph = harness({ fileName: 'Existing.xlsx', foreignWorkbook: await workbook.xlsx.writeBuffer() });
  const { itemId } = await graph.run('connect');
  graph.changeOnDownload();
  await assert.rejects(graph.run('configure', itemId), /file changed/);
  assert.equal(graph.setupWrites(), 0);
  assert.equal(graph.uploadSessions(), 0);
  assert.equal(graph.closedSetupSessions(), 0);
});

test('closes a failed setup session and resumes partial setup without duplicating tabs', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1');
  const graph = harness({
    fileName: 'Existing.xlsx',
    foreignWorkbook: await workbook.xlsx.writeBuffer(),
    setupFailure: "worksheets/_ProjectHub/range(address='A1')"
  });
  const { itemId } = await graph.run('connect');
  await assert.rejects(graph.run('configure', itemId), /Microsoft HTTP 503.*Setup may be incomplete/);
  assert.equal(graph.closedSetupSessions(), 1);
  assert.equal((await graph.run('refresh', itemId)).needsSetup, true);
  const partial = await graph.workbook();
  assert.equal(partial.getWorksheet('_ProjectHub').getCell('A1').value, null);
  await graph.run('configure', itemId);
  assert.equal(graph.closedSetupSessions(), 2);
  assert.equal(graph.uploadSessions(), 0);
  const saved = await graph.workbook();
  assert.equal(saved.worksheets.length, partial.worksheets.length);
  assert.equal(saved.getWorksheet('_ProjectHub').getCell('A1').value, 'ProjectHub/1');
  assert.notEqual((await graph.run('refresh', itemId)).needsSetup, true);
});

test('does not create an explicitly selected workbook when it is missing', async () => {
  const graph = harness({ fileName: 'Missing.xlsx' });
  await assert.rejects(graph.run('connect'), /could not find the configured workbook/i);
  assert.equal(graph.revision(), 0);
});

test('reports when Graph does not provide a download URL and makes no workbook changes', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1');
  const graph = harness({
    fileName: 'Existing.xlsx',
    foreignWorkbook: await workbook.xlsx.writeBuffer(),
    omitMetadataDownloadUrl: true,
    omitItemDownloadUrl: true
  });
  await assert.rejects(graph.run('connect'), /did not return a secure workbook download URL/);
  assert.equal(graph.revision(), 0);
});

test('refuses to configure a workbook with an unrelated populated sheet', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Sheet1').getCell('A1').value = 'Keep this';
  const graph = harness({ fileName: 'Existing.xlsx', foreignWorkbook: await workbook.xlsx.writeBuffer() });
  await assert.rejects(graph.run('connect'), /unexpected or missing tabs/);
  await assert.rejects(graph.run('configure', 'file'), /unexpected or missing tabs/);
  assert.equal(graph.revision(), 0);
});

test('does not commit when the workbook changes during upload', async () => {
  const graph = harness();
  const { itemId } = await graph.run('connect');
  graph.interfere();
  await assert.rejects(graph.run('addTask', itemId, 'Conflicting task'), /file changed/);
  assert.equal(graph.revision(), 1);
  assert.equal(graph.cancellations(), 1);
  assert.equal((await graph.run('refresh', itemId)).projects.independentTasks.length, 0);
});

test('cancels a locked upload without replacing the workbook', async () => {
  const source = harness();
  await source.run('connect');
  const workbook = await source.workbook();
  const graph = harness({
    fileName: 'Existing.xlsx',
    foreignWorkbook: await workbook.xlsx.writeBuffer(),
    commitStatus: 423
  });
  const { itemId } = await graph.run('connect');
  await assert.rejects(graph.run('addTask', itemId, 'Not saved'), /Microsoft HTTP 423/);
  assert.equal(graph.cancellations(), 1);
  assert.equal(graph.revision(), 0);
  assert.equal((await graph.workbook()).getWorksheet('IndependentTasks').rowCount, 1);
});

test('reports cleanup failure along with the original commit failure', async () => {
  const graph = harness({ commitStatus: 423, cancelStatus: 503 });
  await assert.rejects(graph.run('connect'), error =>
    /Microsoft HTTP 423/.test(error.message) && /upload.*could not be cancelled/i.test(error.message));
  assert.equal(graph.cancellations(), 1);
  assert.equal(graph.revision(), 0);
});
