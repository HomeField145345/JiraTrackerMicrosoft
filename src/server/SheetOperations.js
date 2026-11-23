/**
 * @file SheetOperations.js
 * @description Handles creation and management of user-specific data spreadsheets (Hub & Spoke).
 */

/**
 * Creates a new dedicated Data Spreadsheet for a specific user.
 * This creates a new FILE (Spreadsheet) and copies the structure.
 * 
 * @param {Object} user - The user object {username, email, ...}
 * @returns {string} The ID of the created spreadsheet
 */
function createUserDataSpreadsheet(user) {
  const ss = WorkbookService.getActiveWorkbook();
  const newSSName = `Jira Tracker Data - ${user.username}`;
  
  // Create new Spreadsheet
  const newSS = WorkbookService.create(newSSName);
  const newSSId = newSS.getId();
  
  // NOTE: We do NOT share the sheet with the user.
  // The application runs as the script owner ("Execute as Me"), 
  // so the script has access to the file it created.
  // The user interacts with the data solely through the Web App UI.
  
  // Copy Sheets
  const sheetsToCopy = [JIRA_DATA_SHEET, MANUAL_DATA_SHEET, INDEPENDENT_TASKS_SHEET];
  
  sheetsToCopy.forEach(sheetName => {
    const sourceSheet = ss.getSheetByName(sheetName);
    if (sourceSheet) {
      const newSheet = sourceSheet.copyTo(newSS);
      newSheet.setName(sheetName);
      
      // Clear Data (keep headers)
      // For JiraData, we might want to keep it empty initially
      // For ManualData, definitely empty
      const lastRow = newSheet.getLastRow();
      if (lastRow > 1) {
        newSheet.getRange(2, 1, lastRow - 1, newSheet.getLastColumn()).clearContent();
      }
    } else {
      // If source doesn't exist, create blank with headers?
      // For now, assume source exists as this is the template
      console.warn(`Source sheet ${sheetName} not found in template.`);
    }
  });
  
  // Delete default "Sheet1"
  const defaultSheet = newSS.getSheetByName('Sheet1');
  if (defaultSheet) newSS.deleteSheet(defaultSheet);
  
  return newSSId;
}

/**
 * Helper to get a sheet or throw error if missing
 */
function getSheetOrThrow(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in spreadsheet "${ss.getName()}"`);
  return sheet;
}

function getTimestampDisplayColumns_(sheet, headers, rowCount) {
  if (!sheet || !headers || rowCount <= 0) return {};

  var timestampFieldSet = {
    'Updated': true,
    'Created': true,
    'Last Checked': true
  };
  var displayColumns = {};

  for (var headerIndex = 0; headerIndex < headers.length; headerIndex++) {
    var header = headers[headerIndex];
    if (!timestampFieldSet[header]) continue;

    displayColumns[header] = sheet.getRange(2, headerIndex + 1, rowCount, 1)
      .getDisplayValues()
      .map(function(row) { return row[0] || ''; });
  }

  return displayColumns;
}

function normalizeSheetCellValue_(value, header) {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    return normalizeValue_(value);
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  var stringValue = String(value);
  if (!stringValue) return '';

  var looksDateLike = header && /date|target|due|start|end/i.test(header);
  if (looksDateLike) {
    return normalizeValue_(stringValue);
  }

  if (stringValue.indexOf('&') !== -1 && /&(?:#\d+|#x[0-9a-fA-F]+|apos|quot|lt|gt|amp);/.test(stringValue)) {
    stringValue = decodeHtmlEntities_(stringValue);
  }

  if (/^[\s\u00A0\u200B-\u200D\uFEFF]|[\s\u00A0\u200B-\u200D\uFEFF]$|\u00A0|[\u200B-\u200D\uFEFF]|\s{2,}/.test(stringValue)) {
    stringValue = stringValue
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (stringValue.length > 1 && stringValue.charAt(0) === '"' && stringValue.charAt(stringValue.length - 1) === '"') {
    stringValue = stringValue.slice(1, -1).trim();
  }

  return stringValue;
}

/**
 * Reads Jira data from the sheet and returns an array of objects.
 * @param {Sheet} sheet
 * @returns {Array<Object>}
 */
function readJiraData(sheet) {
  if (!sheet) return [];
  const range = sheet.getDataRange();
  const data = range.getValues();
  if (data.length < 2) return [];
  
  const headers = data[0].map(h => (h ? String(h).trim() : ''));
  const rows = data.slice(1);
  const timestampDisplayColumns = getTimestampDisplayColumns_(sheet, headers, rows.length);
  
  // Timestamp fields to preserve as display values
  const timestampFields = ['Updated', 'Created', 'Last Checked'];
  
  return rows.map((row, rowIdx) => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        // For timestamp fields, use display value to prevent timezone conversion
        if (timestampFields.indexOf(header) !== -1) {
          const displayVal = timestampDisplayColumns[header] ? timestampDisplayColumns[header][rowIdx] : '';
          obj[header] = displayVal || '';
        } else {
          obj[header] = normalizeSheetCellValue_(row[index], header);
        }
      }
    });
    return obj;
  });
}

/**
 * Reads Manual Data overrides and returns a map keyed by Jira ID.
 * @param {Sheet} sheet
 * @returns {Object} Map of JiraID -> Object
 */
function readManualData(sheet) {
  if (!sheet) return {};
  const range = sheet.getDataRange();
  const data = range.getValues();
  if (data.length < 2) return {};
  
  const headers = data[0];
  const rows = data.slice(1);
  const timestampDisplayColumns = getTimestampDisplayColumns_(sheet, headers, rows.length);
  const map = {};
  var manualLogCount = 0;
  
  // Find "Jira #" column index
  const idIndex = headers.indexOf("Jira #");
  if (idIndex === -1) return {};
  
  rows.forEach((row, rowIdx) => {
    const jiraId = row[idIndex];
    if (jiraId) {
      const obj = {};
      headers.forEach((header, index) => {
        if (header && index !== idIndex) {
           // For all timestamp fields, use display value to prevent any conversion
           const timestampFields = ['Updated', 'Created', 'Last Checked'];
           if (timestampFields.indexOf(header) !== -1) {
             var rawVal = row[index];
             var displayVal = timestampDisplayColumns[header] ? timestampDisplayColumns[header][rowIdx] : '';
             var assignedVal = displayVal || '';
             obj[header] = assignedVal;

             if (header === 'Last Checked' && manualLogCount < 5) {
               logTimestampOperation('ManualData Last Checked (read)', {
                 jiraId: jiraId,
                 rawType: rawVal === null ? 'null' : typeof rawVal,
                 rawValue: rawVal instanceof Date ? rawVal.toString() : rawVal,
                 displayValue: displayVal,
                 assignedValue: assignedVal
               });
               manualLogCount++;
             }
           } else {
             obj[header] = normalizeSheetCellValue_(row[index], header);
           }
         }
      });
      map[jiraId] = obj;
    }
  });
  
  return map;
}

function normalizeDeveloperSprintOverrides_(raw) {
  if (!raw) return {};
  let parsed = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const result = {};
  Object.keys(parsed).forEach(sprintKey => {
    const sprintName = String(sprintKey || '').trim();
    if (!sprintName) return;
    const item = parsed[sprintKey];
    if (!item || typeof item !== 'object') return;
    const rawPto = item.ptoDays;
    const ptoText = rawPto == null ? '' : String(rawPto).trim();
    const ptoDays = ptoText === '' ? 0 : Number(ptoText);
    if (!Number.isFinite(ptoDays) || ptoDays < 0) {
      throw new Error(`PTO days for ${sprintName} must be a non-negative number.`);
    }
    const rawOverride = item.capacityOverride;
    const overrideText = rawOverride == null ? '' : String(rawOverride).trim();
    const capacityOverride = overrideText === '' ? null : Number(overrideText);
    if (capacityOverride !== null && (!Number.isFinite(capacityOverride) || capacityOverride < 0)) {
      throw new Error(`Capacity override for ${sprintName} must be a non-negative number or blank.`);
    }
    const notes = item.notes == null ? '' : String(item.notes).trim();
    if (ptoDays > 0 || capacityOverride !== null || notes) {
      result[sprintName] = { ptoDays, capacityOverride, notes };
    }
  });
  return result;
}

function normalizeDeveloperCapacitySettings_(raw) {
  const defaults = { sprintWorkdays: 10, companyHolidays: [] };
  if (!raw) return defaults;
  let parsed = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return defaults;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return defaults;
    }
  }
  if (!parsed || typeof parsed !== 'object') return defaults;
  const rawDays = parsed.sprintWorkdays;
  const daysText = rawDays == null ? '' : String(rawDays).trim();
  const sprintWorkdays = daysText === '' ? 10 : Number(daysText);
  if (!Number.isFinite(sprintWorkdays) || sprintWorkdays <= 0) {
    throw new Error('Standard sprint workdays must be a positive number.');
  }
  const companyHolidays = [];
  if (Array.isArray(parsed.companyHolidays)) {
    parsed.companyHolidays.forEach(h => {
      if (!h || typeof h !== 'object') return;
      const name = String(h.name == null ? '' : h.name).trim();
      const sprint = String(h.sprint == null ? '' : h.sprint).trim();
      const rawHolDays = h.days;
      const holText = rawHolDays == null ? '' : String(rawHolDays).trim();
      const days = holText === '' ? 1 : Number(holText);
      if (!Number.isFinite(days) || days < 0) {
        throw new Error('Company holiday days must be a non-negative number.');
      }
      if ((name || sprint) && days > 0) {
        companyHolidays.push({ name: name || 'Company Holiday', sprint, days });
      }
    });
  }
  return { sprintWorkdays, companyHolidays };
}

function readDeveloperCapacitySettings(sheet) {
  const defaults = { sprintWorkdays: 10, companyHolidays: [] };
  if (!sheet) return defaults;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return defaults;
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (key === '__CAPACITY_SETTINGS__') {
      try {
        return normalizeDeveloperCapacitySettings_(data[i][1]);
      } catch (e) {
        return defaults;
      }
    }
  }
  return defaults;
}

/**
 * Reads developer capacity settings from the DeveloperCapacity sheet.
 * @param {Sheet|null} sheet - The DeveloperCapacity sheet (may be missing in older workbooks)
 * @returns {Array<{developer: string, capacity: number|null, notes: string}>}
 */
function readDeveloperCapacity(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => (h ? String(h).trim() : ''));
  const nameIndex = headers.indexOf('Developer');
  const capacityIndex = headers.indexOf('Capacity');
  const notesIndex = headers.indexOf('Notes');
  const managerIndex = headers.indexOf('Manager');
  const sprintOverridesIndex = headers.indexOf('SprintOverrides');
  if (nameIndex === -1 || capacityIndex === -1) throw new Error('DeveloperCapacity headers are invalid.');

  const entries = [];
  const seen = new Set();
  data.slice(1).forEach(row => {
    const developer = String(row[nameIndex] == null ? '' : row[nameIndex]).trim();
    if (!developer) return;
    const key = developer.toLowerCase();
    if (seen.has(key)) throw new Error('DeveloperCapacity contains duplicate developer names.');
    seen.add(key);
    const rawCapacity = String(row[capacityIndex] == null ? '' : row[capacityIndex]).trim();
    const capacity = rawCapacity === '' ? null : Number(rawCapacity);
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
      throw new Error('DeveloperCapacity contains an invalid capacity.');
    }
    const entry = {
      developer: developer,
      capacity: capacity,
      notes: notesIndex === -1 ? '' : String(row[notesIndex] == null ? '' : row[notesIndex]).trim(),
      manager: managerIndex === -1 ? '' : String(row[managerIndex] == null ? '' : row[managerIndex]).trim()
    };
    if (sprintOverridesIndex !== -1) {
      const overrides = normalizeDeveloperSprintOverrides_(row[sprintOverridesIndex]);
      if (Object.keys(overrides).length > 0) {
        entry.sprintOverrides = overrides;
      }
    }
    entries.push(entry);
  });
  return entries;
}

/**
 * Reads Independent Tasks.
 * @param {Sheet} sheet
 * @returns {Array<Object>}
 */
function readIndependentTasks(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = normalizeSheetCellValue_(row[index], header);
      }
    });
    // Mark as independent task
    obj.isIndependent = true;
    return obj;
  });
}
