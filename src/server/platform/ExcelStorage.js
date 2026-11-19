const EXCEL_FILE_NAME = 'ProjectHub.xlsx';
const EXCEL_SCHEMA_SHEET = '_ProjectHub';
const EXCEL_SCHEMA_VERSION = 'ProjectHub/1';
const EXCEL_MAX_BYTES = 20 * 1024 * 1024;
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

class ExcelStorage {
  constructor(accessToken, target = {}, request = globalThis.fetch.bind(globalThis)) {
    this.accessToken = accessToken;
    this.request = request;
    if (Boolean(target.driveId) !== Boolean(target.folderId)) {
      throw new Error('Provide both the SharePoint drive ID and folder ID.');
    }
    this.drive = target.driveId ? `/drives/${encodeURIComponent(target.driveId)}` : '/me/drive';
    this.folder = target.folderId ? `/items/${encodeURIComponent(target.folderId)}` : '/root';
    this.fileName = target.fileName;
    this.folderSegments = target.folderPath?.split('/') ?? [];
  }

  async graph(path, init = {}) {
    const response = await this.request(`${GRAPH_ROOT}${this.drive}${path}`, {
      ...init,
      redirect: 'error',
      headers: { ...init.headers, Authorization: `Bearer ${this.accessToken}` }
    });
    return response;
  }

  itemPath(id) {
    return `/items/${encodeURIComponent(id)}`;
  }

  async open(action, itemId) {
    const workbookPath = [...this.folderSegments, this.fileName ?? EXCEL_FILE_NAME].map(encodeURIComponent).join('/');
    const path = itemId ? this.itemPath(itemId) : `${this.folder}:/${workbookPath}`;
    const response = await this.graph(`${path}?$select=id,eTag,file,size,webUrl,@microsoft.graph.downloadUrl`, { cache: 'no-store' });
    if (response.status === 404 && action === 'connect' && !itemId && this.fileName === undefined) {
      WorkbookService.replaceAll([]);
      setupSheets(WorkbookService.getActiveWorkbook());
      const { upserts: [data] } = WorkbookService.takeChanges();
      const folder = await this.graph(`${this.folder}?$select=id,folder`);
      this.check(folder, 'open the destination folder');
      const destination = await folder.json();
      if (!destination.id || !destination.folder) throw new Error('The configured destination is not a folder.');
      const item = await this.upload(data, `${this.itemPath(destination.id)}:/${EXCEL_FILE_NAME}:`);
      return { item, data, created: true };
    }
    if (response.status === 404 && this.fileName !== undefined && !itemId) {
      throw new Error('Could not find the configured workbook (Microsoft HTTP 404). Check the filename and folder in excel-config.json.');
    }
    this.check(response, 'open the workbook');
    const item = await response.json();
    if (!item.id || !item.file || !item.eTag) throw new Error('The destination is not a valid Excel file.');
    if (item.size > EXCEL_MAX_BYTES) throw new Error('The workbook exceeds the 20 MiB tracker limit.');
    let downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (downloadUrl == null || downloadUrl === '') {
      // Use Graph's direct item lookup when the metadata response omits the download annotation.
      const lookup = await this.graph(`${this.itemPath(item.id)}?select=id,@microsoft.graph.downloadUrl`, { cache: 'no-store' });
      this.check(lookup, 'get a workbook download URL');
      downloadUrl = (await lookup.json())['@microsoft.graph.downloadUrl'];
    }
    const url = this.httpsUrl(downloadUrl, 'download');
    const download = await this.request(url, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    this.check(download, 'download the workbook');
    const bytes = await download.arrayBuffer();
    if (bytes.byteLength > EXCEL_MAX_BYTES) throw new Error('The workbook exceeds the 20 MiB tracker limit.');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const marker = workbook.getWorksheet(EXCEL_SCHEMA_SHEET);
    const needsSetup = this.fileName !== undefined && (!marker || marker.actualRowCount === 0);
    if (needsSetup && !['connect', 'refresh', 'configure'].includes(action)) {
      throw new Error('Set up the workbook before saving tracker data.');
    }
    const data = this.decode(workbook, needsSetup);
    return { item, data, workbook, needsSetup, created: false };
  }

  async configure(workbook, item) {
    const path = this.itemPath(item.id);
    const current = await this.graph(`${path}?$select=eTag`, { cache: 'no-store' });
    this.check(current, 'check the workbook revision before setup');
    if ((await current.json()).eTag !== item.eTag) this.conflict();

    const session = await this.graph(`${path}/workbook/createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persistChanges: true })
    });
    this.check(session, 'start workbook setup');
    const { id } = await session.json();
    if (typeof id !== 'string' || !id) throw new Error('Microsoft did not return a workbook setup session. Refresh before retrying.');
    const update = async (suffix, method, body) => {
      const response = await this.graph(`${path}/workbook/${suffix}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'workbook-session-id': id },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      this.check(response, 'update the workbook setup');
    };

    let failure;
    try {
      for (const [name, headers] of Object.entries(trackerSheetSchema())) {
        let sheet = workbook.getWorksheet(name);
        if (!sheet) {
          await update('worksheets/add', 'POST', { name });
          sheet = workbook.addWorksheet(name);
        }
        if (sheet.actualRowCount === 0) {
          const address = `A1:${sheet.getColumn(headers.length).letter}1`;
          await update(`worksheets/${encodeURIComponent(name)}/range(address='${address}')`, 'PATCH', { values: [headers] });
        }
      }
      if (!workbook.getWorksheet(EXCEL_SCHEMA_SHEET)) {
        await update('worksheets/add', 'POST', { name: EXCEL_SCHEMA_SHEET });
      }
      await update(`worksheets/${EXCEL_SCHEMA_SHEET}`, 'PATCH', { visibility: 'VeryHidden' });
      // Mark setup complete only after every tracker sheet and header exists.
      await update(`worksheets/${EXCEL_SCHEMA_SHEET}/range(address='A1')`, 'PATCH', { values: [[EXCEL_SCHEMA_VERSION]] });
    } catch (error) {
      failure = error;
    }
    try {
      await update('closeSession', 'POST');
    } catch (error) {
      throw new Error(`${failure ? `${failure.message} ` : ''}Could not close the workbook setup session. Refresh before retrying.`, { cause: error });
    }
    if (failure) {
      throw new Error(`${failure.message} Setup may be incomplete; refresh and retry Set up workbook.`, { cause: failure });
    }
  }

  async save(data, item) {
    return this.upload(data, this.itemPath(item.id), item.eTag);
  }

  async upload(data, path, eTag) {
    const bytes = await this.encode(data);
    if (bytes.byteLength > EXCEL_MAX_BYTES) throw new Error('The workbook exceeds the 20 MiB tracker limit.');
    const session = await this.graph(`${path}/createUploadSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(eTag ? { 'If-Match': eTag } : {}) },
      body: JSON.stringify({
        deferCommit: true,
        item: { '@microsoft.graph.conflictBehavior': eTag ? 'replace' : 'fail' }
      })
    });
    this.check(session, 'start saving the workbook');
    const url = this.httpsUrl((await session.json()).uploadUrl, 'upload');
    const transfer = { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' };
    try {
      const fragment = await this.request(url, {
        ...transfer,
        method: 'PUT',
        headers: { 'Content-Range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}` },
        body: bytes
      });
      this.check(fragment, 'upload the workbook');
      // Recheck after sending bytes, before committing the replacement.
      if (eTag) {
        const current = await this.graph(`${path}?$select=eTag`, { cache: 'no-store' });
        this.check(current, 'check the workbook revision');
        if ((await current.json()).eTag !== eTag) this.conflict();
      }
      const commit = await this.request(url, { ...transfer, method: 'POST', body: '' });
      this.check(commit, 'commit the workbook');
      const item = await commit.json();
      if (!item.id) throw new Error('Microsoft did not confirm the workbook ID. Reconnect before retrying.');
      return item;
    } catch (error) {
      try {
        const cancelled = await this.request(url, { ...transfer, method: 'DELETE' });
        if (cancelled.status !== 404 && cancelled.status !== 410) {
          this.check(cancelled, 'cancel the unfinished upload');
        }
      } catch {
        throw new Error(`${error.message} The unfinished upload could not be cancelled. Wait for Microsoft to release it before retrying.`, { cause: error });
      }
      throw error;
    }
  }

  async encode(data) {
    const workbook = new ExcelJS.Workbook();
    for (const { name, rows } of data.sheets) {
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      rows.forEach((row, i) => {
        row.forEach((value, j) => {
          if (typeof value === 'string' && value.length > 32767) {
            throw new Error(`${name}, row ${i + 1}, column ${j + 1} exceeds Excel's cell length limit.`);
          }
          if (value !== '' && value != null) sheet.getCell(i + 1, j + 1).value = value;
        });
      });
      sheet.getRow(1).font = { bold: true };
    }
    workbook.addWorksheet(EXCEL_SCHEMA_SHEET, { state: 'veryHidden' }).getCell('A1').value = EXCEL_SCHEMA_VERSION;
    return workbook.xlsx.writeBuffer();
  }

  decode(workbook, needsSetup) {
    const marker = workbook.getWorksheet(EXCEL_SCHEMA_SHEET);
    if (!needsSetup && marker?.getCell('A1').value !== EXCEL_SCHEMA_VERSION) {
      throw new Error(`${this.fileName ?? EXCEL_FILE_NAME} already exists but is not a compatible tracker workbook. It was not changed.`);
    }
    const schema = trackerSheetSchema();
    const hasUnexpectedTab = workbook.worksheets.some(sheet =>
      !Object.hasOwn(schema, sheet.name) &&
      sheet !== marker && !(sheet.name === 'Sheet1' && sheet.actualRowCount === 0)
    );
    if (hasUnexpectedTab) {
      throw new Error('The tracker workbook has unexpected or missing tabs. It was not changed.');
    }
    const sheets = Object.entries(schema).map(([name, headers]) => {
      const sheet = workbook.getWorksheet(name);
      if (needsSetup && (!sheet || sheet.actualRowCount === 0)) return { name, rows: [headers] };
      let userColumnMap = null;
      if (name === USERS_SHEET && sheet) {
        const actualHeaders = Array.from({ length: sheet.columnCount }, (_, i) =>
          String(sheet.getCell(1, i + 1).value ?? '').trim()
        );
        const requiredHeadersMatch = headers.slice(0, 9).every((header, i) => actualHeaders[i] === header);
        const optionalHeaders = actualHeaders.slice(9).filter(Boolean);
        const allowedOptionalHeaders = new Set(headers.slice(9));
        const optionalHeadersValid = optionalHeaders.every(header => allowedOptionalHeaders.has(header)) &&
          new Set(optionalHeaders).size === optionalHeaders.length;
        if (!requiredHeadersMatch) {
          throw new Error(`Users columns A-I must be ${headers.slice(0, 9).join(' | ')}. Found: ${actualHeaders.slice(0, 9).join(' | ')}.`);
        }
        if (!optionalHeadersValid) {
          throw new Error('Users columns J onward may contain "Data Sheet ID" and "Microsoft Object ID" once each. Check the header names and duplicates.');
        }
        if (sheet.columnCount > headers.length && actualHeaders.slice(headers.length).some(Boolean)) {
          throw new Error(`The "${name}" worksheet does not match the tracker schema. It was not changed.`);
        }
        userColumnMap = actualHeaders.map((header, i) => {
          if (i < 9) return i;
          return header ? headers.indexOf(header) : -1;
        });
      }
      const lastHeaderColumn = sheet ? headers.reduce((last, header, i) =>
        sheet.getCell(1, i + 1).value !== '' && sheet.getCell(1, i + 1).value != null ? i + 1 : last, 0) : 0;
      const headerMismatch = Array.from({ length: lastHeaderColumn }, (_, i) =>
        (sheet?.getCell(1, i + 1).value ?? '') !== (headers[i] ?? '')
      ).some(Boolean);
      if (!sheet || (!userColumnMap && headerMismatch) || (!userColumnMap && sheet.columnCount > headers.length)) {
        throw new Error(`The "${name}" worksheet does not match the tracker schema. It was not changed.`);
      }
      const rows = [];
      sheet.eachRow((row, i) => {
        const values = Array(headers.length).fill('');
        row.eachCell((cell, j) => {
          const value = cell.value;
          if (typeof value === 'object' && !(value instanceof Date)) {
            throw new Error(`${name} contains a non-literal cell at ${cell.address}. The workbook was not changed.`);
          }
          const targetColumn = userColumnMap ? userColumnMap[j - 1] : j - 1;
          if (targetColumn === undefined || targetColumn < 0) {
            if (value !== '' && value != null) {
              throw new Error(`${name} contains data in an unrecognized column. The workbook was not changed.`);
            }
            return;
          }
          values[targetColumn] = value;
        });
        while (rows.length < i - 1) rows.push([]);
        rows.push(values);
      });
      rows[0] = headers.slice();
      return { name, rows };
    });
    return { id: PRIMARY_WORKBOOK_ID, name: this.fileName ?? EXCEL_FILE_NAME, sheets };
  }

  httpsUrl(value, operation) {
    if (typeof value !== 'string' || !value.startsWith('https://')) {
      throw new Error(`Microsoft did not return a secure workbook ${operation} URL.`);
    }
    return value;
  }

  check(response, action) {
    if (response.status === 423) {
      throw new Error(`Could not ${action} (Microsoft HTTP 423). The workbook is locked or another upload is pending. Close Excel and other tracker tabs, wait for the lock to clear, then refresh before retrying.`);
    }
    if (response.status === 409 || response.status === 412) this.conflict();
    if (!response.ok) throw new Error(`Could not ${action} (Microsoft HTTP ${response.status}).`);
  }

  conflict() {
    throw new Error('The Excel file changed or is locked. Close Excel, refresh, and try again.');
  }
}
