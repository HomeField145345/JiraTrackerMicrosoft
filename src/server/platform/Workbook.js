/**
 * @file Workbook.js
 * @description In-memory workbook model with the worksheet/range API used by the server modules.
 * Replaces SpreadsheetApp. Workbooks are plain data ({ id, name, sheets: [{ name, rows }] }) so a
 * storage adapter (IndexedDB today, Excel through Microsoft Graph later) can load and save them.
 */

var PRIMARY_WORKBOOK_ID = 'primary';

var WorkbookService = (function () {
  var workbooks = {};
  var dirtyIds = {};

  var MIN_MAX_ROWS = 1000;
  var MIN_MAX_COLUMNS = 26;

  function markDirty_(workbookData) {
    dirtyIds[workbookData.id] = true;
  }

  function cloneValue_(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return new Date(value.getTime());
    return value;
  }

  function isEmpty_(value) {
    return value === '' || value === null || value === undefined;
  }

  function columnLettersToNumber_(letters) {
    var result = 0;
    for (var i = 0; i < letters.length; i++) {
      result = result * 26 + (letters.charCodeAt(i) - 64);
    }
    return result;
  }

  function assertPositiveInteger_(value, label) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error('Invalid ' + label + ': ' + value + '. Values must be whole numbers starting at 1.');
    }
  }

  function displayValue_(value) {
    if (isEmpty_(value)) return '';
    if (value instanceof Date) return Platform.formatDate(value, Platform.timeZone(), 'MM/dd/yyyy HH:mm:ss');
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  // ---------------------------------------------------------------------------
  // Range
  // ---------------------------------------------------------------------------

  function Range(sheet, row, column, numRows, numColumns) {
    this._sheet = sheet;
    this._row = row;
    this._column = column;
    this._numRows = numRows;
    this._numColumns = numColumns;
  }

  Range.prototype.getRow = function () { return this._row; };
  Range.prototype.getColumn = function () { return this._column; };
  Range.prototype.getNumRows = function () { return this._numRows; };
  Range.prototype.getNumColumns = function () { return this._numColumns; };
  Range.prototype.getLastRow = function () { return this._row + this._numRows - 1; };
  Range.prototype.getLastColumn = function () { return this._column + this._numColumns - 1; };

  Range.prototype.getValues = function () {
    var result = [];
    for (var r = 0; r < this._numRows; r++) {
      var row = [];
      for (var c = 0; c < this._numColumns; c++) {
        row.push(cloneValue_(this._sheet._getCell(this._row + r, this._column + c)));
      }
      result.push(row);
    }
    return result;
  };

  Range.prototype.getDisplayValues = function () {
    return this.getValues().map(function (row) { return row.map(displayValue_); });
  };

  Range.prototype.getValue = function () {
    return cloneValue_(this._sheet._getCell(this._row, this._column));
  };

  Range.prototype.getDisplayValue = function () {
    return displayValue_(this.getValue());
  };

  Range.prototype.setValues = function (values) {
    if (!Array.isArray(values) || values.length !== this._numRows) {
      throw new Error('The number of rows in the data does not match the number of rows in the range. The data has ' +
        (Array.isArray(values) ? values.length : 0) + ' but the range has ' + this._numRows + '.');
    }
    for (var r = 0; r < values.length; r++) {
      if (!Array.isArray(values[r]) || values[r].length !== this._numColumns) {
        throw new Error('The number of columns in the data does not match the number of columns in the range. The data has ' +
          (Array.isArray(values[r]) ? values[r].length : 0) + ' but the range has ' + this._numColumns + '.');
      }
    }
    for (var i = 0; i < values.length; i++) {
      for (var j = 0; j < values[i].length; j++) {
        this._sheet._setCell(this._row + i, this._column + j, values[i][j]);
      }
    }
    return this;
  };

  Range.prototype.setValue = function (value) {
    for (var r = 0; r < this._numRows; r++) {
      for (var c = 0; c < this._numColumns; c++) {
        this._sheet._setCell(this._row + r, this._column + c, value);
      }
    }
    return this;
  };

  Range.prototype.clearContent = function () {
    return this.setValue('');
  };

  Range.prototype.clear = Range.prototype.clearContent;

  // Formatting is presentation-only in the browser store; keep the chainable API.
  ['setFontWeight', 'setNumberFormat', 'setBackground', 'setFontColor', 'setHorizontalAlignment', 'setWrap']
    .forEach(function (method) {
      Range.prototype[method] = function () { return this; };
    });

  // ---------------------------------------------------------------------------
  // Worksheet
  // ---------------------------------------------------------------------------

  function Worksheet(workbook, data) {
    this._workbook = workbook;
    this._data = data;
  }

  Worksheet.prototype._rows = function () {
    return this._data.rows;
  };

  Worksheet.prototype._getCell = function (row, column) {
    var rowData = this._data.rows[row - 1];
    if (!rowData) return '';
    var value = rowData[column - 1];
    return isEmpty_(value) ? '' : value;
  };

  Worksheet.prototype._setCell = function (row, column, value) {
    var rows = this._data.rows;
    while (rows.length < row) rows.push([]);
    var rowData = rows[row - 1];
    while (rowData.length < column) rowData.push('');
    rowData[column - 1] = cloneValue_(value);
    markDirty_(this._workbook._data);
  };

  Worksheet.prototype.getName = function () { return this._data.name; };

  Worksheet.prototype.setName = function (name) {
    var existing = this._workbook.getSheetByName(name);
    if (existing && existing._data !== this._data) {
      throw new Error('A sheet with the name "' + name + '" already exists. Please enter another name.');
    }
    this._data.name = String(name);
    markDirty_(this._workbook._data);
    return this;
  };

  Worksheet.prototype.getParent = function () { return this._workbook; };

  Worksheet.prototype.getLastRow = function () {
    var rows = this._data.rows;
    for (var r = rows.length - 1; r >= 0; r--) {
      var row = rows[r] || [];
      for (var c = 0; c < row.length; c++) {
        if (!isEmpty_(row[c])) return r + 1;
      }
    }
    return 0;
  };

  Worksheet.prototype.getLastColumn = function () {
    var last = 0;
    this._data.rows.forEach(function (row) {
      for (var c = (row || []).length - 1; c >= last; c--) {
        if (!isEmpty_(row[c])) {
          last = c + 1;
          break;
        }
      }
    });
    return last;
  };

  Worksheet.prototype.getMaxRows = function () {
    return Math.max(MIN_MAX_ROWS, this._data.rows.length);
  };

  Worksheet.prototype.getMaxColumns = function () {
    var widest = this._data.rows.reduce(function (max, row) { return Math.max(max, (row || []).length); }, 0);
    return Math.max(MIN_MAX_COLUMNS, widest);
  };

  Worksheet.prototype.getDataRange = function () {
    return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  };

  /**
   * getRange(row, column, [numRows], [numColumns]) or getRange('A1') / getRange('A2:M100').
   */
  Worksheet.prototype.getRange = function (rowOrA1, column, numRows, numColumns) {
    if (typeof rowOrA1 === 'string') {
      var match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(rowOrA1.trim().toUpperCase());
      if (!match) throw new Error('Range not found: ' + rowOrA1);
      var startColumn = columnLettersToNumber_(match[1]);
      var startRow = Number(match[2]);
      var endColumn = match[3] ? columnLettersToNumber_(match[3]) : startColumn;
      var endRow = match[4] ? Number(match[4]) : startRow;
      return new Range(this, Math.min(startRow, endRow), Math.min(startColumn, endColumn),
        Math.abs(endRow - startRow) + 1, Math.abs(endColumn - startColumn) + 1);
    }

    var rows = numRows === undefined ? 1 : numRows;
    var columns = numColumns === undefined ? 1 : numColumns;
    assertPositiveInteger_(rowOrA1, 'row');
    assertPositiveInteger_(column, 'column');
    assertPositiveInteger_(rows, 'number of rows');
    assertPositiveInteger_(columns, 'number of columns');
    return new Range(this, rowOrA1, column, rows, columns);
  };

  Worksheet.prototype.appendRow = function (rowContents) {
    var targetRow = this.getLastRow() + 1;
    var values = Array.isArray(rowContents) ? rowContents : [];
    this._data.rows.length = Math.min(this._data.rows.length, targetRow - 1);
    this._data.rows.push(values.map(cloneValue_));
    markDirty_(this._workbook._data);
    return this;
  };

  Worksheet.prototype.deleteRow = function (rowPosition) {
    return this.deleteRows(rowPosition, 1);
  };

  Worksheet.prototype.deleteRows = function (rowPosition, howMany) {
    assertPositiveInteger_(rowPosition, 'row');
    assertPositiveInteger_(howMany, 'number of rows');
    this._data.rows.splice(rowPosition - 1, howMany);
    markDirty_(this._workbook._data);
    return this;
  };

  Worksheet.prototype.insertColumnAfter = function (afterPosition) {
    assertPositiveInteger_(afterPosition, 'column');
    this._data.rows.forEach(function (row) {
      if (row.length > afterPosition) row.splice(afterPosition, 0, '');
    });
    markDirty_(this._workbook._data);
    return this;
  };

  Worksheet.prototype.setFrozenRows = function () { return this; };

  Worksheet.prototype.clear = function () {
    this._data.rows = [];
    markDirty_(this._workbook._data);
    return this;
  };

  Worksheet.prototype.clearContents = Worksheet.prototype.clear;

  Worksheet.prototype.copyTo = function (destinationWorkbook) {
    var baseName = 'Copy of ' + this._data.name;
    var name = baseName;
    var suffix = 2;
    while (destinationWorkbook.getSheetByName(name)) {
      name = baseName + ' ' + suffix++;
    }
    var copy = destinationWorkbook.insertSheet(name);
    copy._data.rows = this._data.rows.map(function (row) { return (row || []).map(cloneValue_); });
    markDirty_(destinationWorkbook._data);
    return copy;
  };

  // ---------------------------------------------------------------------------
  // Workbook
  // ---------------------------------------------------------------------------

  function Workbook(data) {
    this._data = data;
  }

  Workbook.prototype.getId = function () { return this._data.id; };
  Workbook.prototype.getName = function () { return this._data.name; };

  // Browser-stored workbooks have no shareable URL; an Excel adapter can supply one later.
  Workbook.prototype.getUrl = function () { return this._data.url || ''; };

  Workbook.prototype.getSheets = function () {
    var self = this;
    return this._data.sheets.map(function (sheetData) { return new Worksheet(self, sheetData); });
  };

  Workbook.prototype.getSheetByName = function (name) {
    for (var i = 0; i < this._data.sheets.length; i++) {
      if (this._data.sheets[i].name === name) return new Worksheet(this, this._data.sheets[i]);
    }
    return null;
  };

  Workbook.prototype.insertSheet = function (name) {
    var sheetName = name || ('Sheet' + (this._data.sheets.length + 1));
    if (this.getSheetByName(sheetName)) {
      throw new Error('A sheet with the name "' + sheetName + '" already exists. Please enter another name.');
    }
    var sheetData = { name: String(sheetName), rows: [] };
    this._data.sheets.push(sheetData);
    markDirty_(this._data);
    return new Worksheet(this, sheetData);
  };

  Workbook.prototype.deleteSheet = function (sheet) {
    var index = this._data.sheets.indexOf(sheet && sheet._data);
    if (index === -1) throw new Error('Sheet not found in workbook "' + this._data.name + '".');
    this._data.sheets.splice(index, 1);
    markDirty_(this._data);
  };

  // ---------------------------------------------------------------------------
  // Service
  // ---------------------------------------------------------------------------

  function createWorkbookData_(id, name, withDefaultSheet) {
    return {
      id: id,
      name: name,
      sheets: withDefaultSheet ? [{ name: 'Sheet1', rows: [] }] : []
    };
  }

  function getActiveWorkbook() {
    if (!workbooks[PRIMARY_WORKBOOK_ID]) {
      workbooks[PRIMARY_WORKBOOK_ID] = createWorkbookData_(PRIMARY_WORKBOOK_ID, 'ProjectHub workbook', false);
      markDirty_(workbooks[PRIMARY_WORKBOOK_ID]);
    }
    return new Workbook(workbooks[PRIMARY_WORKBOOK_ID]);
  }

  function openById(id) {
    var key = String(id || '').trim();
    if (!key || !workbooks[key]) {
      throw new Error('Workbook not found: ' + key);
    }
    return new Workbook(workbooks[key]);
  }

  function create(name) {
    var id = 'wb-' + Platform.uuid();
    workbooks[id] = createWorkbookData_(id, String(name || 'Untitled workbook'), true);
    markDirty_(workbooks[id]);
    return new Workbook(workbooks[id]);
  }

  function hasWorkbook(id) {
    return Object.prototype.hasOwnProperty.call(workbooks, id);
  }

  /** Replaces all in-memory workbooks with a storage snapshot and clears pending changes. */
  function replaceAll(snapshot) {
    workbooks = {};
    dirtyIds = {};
    (snapshot || []).forEach(function (data) {
      if (data && data.id) workbooks[data.id] = data;
    });
  }

  /** Returns pending changes for the storage adapter and clears them. */
  function takeChanges() {
    var upserts = Object.keys(dirtyIds)
      .filter(function (id) { return workbooks[id]; })
      .map(function (id) { return workbooks[id]; });
    dirtyIds = {};
    return upserts.length ? { upserts: upserts } : null;
  }

  return {
    getActiveWorkbook: getActiveWorkbook,
    openById: openById,
    create: create,
    hasWorkbook: hasWorkbook,
    replaceAll: replaceAll,
    takeChanges: takeChanges
  };
}());
