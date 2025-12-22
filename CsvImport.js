/**
 * @file CsvImport.js
 * @description CSV import functionality for processing and importing Jira data from uploaded files.
 * 
 * This module handles:
 * - CSV file validation and parsing
 * - Header detection and mapping
 * - Data comparison and synchronization
 * - Adding new items, updating existing items, and archiving removed items
 * 
 * Dependencies:
 * - Constants.js (JIRA_DATA_SHEET)
 * - SheetOperations.js (getSheetOrThrow)
 * - DataUtilities.js (equalFieldValues_, normalizeValue_)
 * - CacheManager.js (clearProjectCache)
 */

/**
 * Import Jira data from uploaded CSV file
 * @param {Object} fileData - File data object containing base64Data, fileName, mimeType, and options
 * @param {Object} user - The user object performing the import
 * @returns {Object} Import results with status, message, and detailed statistics
 */
function importJiraCsv_(fileData, user) {
  if (!fileData || !fileData.base64Data) {
    return { status: 'error', message: 'No file data received to import.' };
  }
  
  // All files are converted to CSV on the client side now
  var fileName = fileData.fileName || '';
  if (!fileName.toLowerCase().endsWith('.csv')) {
    return { status: 'error', message: 'Invalid file type. Expected CSV format.' };
  }

  try {
    // Determine Target Spreadsheet (Global vs Personal)
    let targetSS = SpreadsheetApp.getActiveSpreadsheet();
    
    // Check if user has a personal sheet
    if (user && user.id) {
      const fullUser = getUserById(user.id);
      if (fullUser && fullUser.dataSheetId && String(fullUser.dataSheetId).trim() !== '') {
        try {
          const personalSS = SpreadsheetApp.openById(fullUser.dataSheetId);
          targetSS = personalSS;
          console.log('Importing into Personal Sheet: ' + fullUser.dataSheetId);
        } catch (e) {
          console.warn('Failed to open personal sheet, falling back to global.', e);
        }
      }
    }

    var sheet = getSheetOrThrow(targetSS, JIRA_DATA_SHEET);
    
    var existingDataRange = sheet.getDataRange();
    // *** FIX: Use getValues() to read raw sheet data for comparison with CSV ***
    var existingValues = existingDataRange.getValues(); 
    var headers = existingValues.shift();
    var jiraIdColIndex = headers.indexOf('Jira #');
    if (jiraIdColIndex === -1) {
      return { status: 'error', message: 'Could not find "Jira #" column in the sheet.' };
    }

    var existingDataMap = new Map();
    existingValues.forEach(function(row, index) {
      var jiraId = row[jiraIdColIndex] ? String(row[jiraIdColIndex]).trim() : null;
      if (jiraId) {
        existingDataMap.set(jiraId, { data: row, sheetRowIndex: index + 2 });
      }
    });

    var blob = Utilities.newBlob(Utilities.base64Decode(fileData.base64Data), fileData.mimeType, fileData.fileName);
    
    // All files are now CSV format (converted on client side if needed)
    var uploadedValues = Utilities.parseCsv(blob.getDataAsString('UTF-8'));
    
    // Debug: Log total rows in uploaded file
    console.log('UPLOAD DEBUG: Total rows in uploaded file: ' + uploadedValues.length);
    
    let headerRowIndex = -1;
    let uploadedHeaders = [];

    // Helper to normalize header strings (trim, lowercase, strip BOM/non-breaking spaces)
    function normalizeHeader(h) {
      if (h === undefined || h === null) return '';
      return String(h).replace(/^[\uFEFF\u00A0]+/, '').trim().toLowerCase();
    }

    // Look for a header row that contains a Jira key column. Check a larger window of rows for HTML-based Excel files
    var maxHeaderSearchRows = Math.min(50, uploadedValues.length); // Increased from 20 to 50
    console.log('HEADER SEARCH: Will search first ' + maxHeaderSearchRows + ' rows for headers');
    
    for (let i = 0; i < maxHeaderSearchRows; i++) {
      var row = uploadedValues[i];
      if (!row || row.length === 0) continue;
      
      console.log('HEADER SEARCH ROW ' + (i + 1) + ': [' + (row || []).map(function(cell) { return '"' + (cell || '') + '"'; }).join(', ') + ']');
      
      var foundKey = false;
      for (var j = 0; j < row.length; j++) {
        var colNameRaw = row[j] || '';
        var colName = normalizeHeader(colNameRaw);
        // Accept exact 'key', common Jira exports 'issue key', and variants containing 'key'
        // Also look for common patterns like data-issue-key attributes from HTML exports
        if (colName === 'key' || 
            colName === 'issue key' || 
            colName === 'issuekey' || 
            colName === 'jira key' || 
            colName.indexOf('key') !== -1 ||
            colNameRaw.indexOf('data-issue-key') !== -1 ||
            colNameRaw.indexOf('issue-link') !== -1) {
          foundKey = true;
          console.log('FOUND KEY in row ' + (i + 1) + ', column ' + (j + 1) + ': "' + colNameRaw + '" (normalized: "' + colName + '")');
          break;
        }
      }
      if (foundKey) {
        headerRowIndex = i;
        uploadedHeaders = row.map(function(col) { return col === undefined || col === null ? '' : String(col).trim(); });
        
        // Debug: Log where headers were found for troubleshooting
        console.log('HEADER DETECTION: Found headers on row ' + (i + 1) + ': [' + uploadedHeaders.join(', ') + ']');
        
        break;
      }
    }

    if (headerRowIndex === -1) {
      return _generateHeaderNotFoundError(uploadedValues, maxHeaderSearchRows);
    }
    
    var headerMap = _buildHeaderMapping(headers, uploadedHeaders);
    
    // Ensure we can find the Jira ID column (try flexible checks as backup)
    if (headerMap['Jira #'].uploadIndex === -1) {
      return { status: 'error', message: 'Could not find a Jira key column in the uploaded CSV file. Detected headers: ' + uploadedHeaders.join(', ') };
    }

    var results = _processUploadedRows(uploadedValues, headerRowIndex, headerMap, headers, existingDataMap, sheet, fileData, user);
    
    // Clear cache after successful import
    clearProjectCache();
    
    return results;

  } catch (e) {
    return { status: 'error', message: 'Failed to import data: ' + e.message };
  }
}

/**
 * Generate detailed error message when header row is not found
 * @private
 */
function _generateHeaderNotFoundError(uploadedValues, maxHeaderSearchRows) {
  var sampleRows = uploadedValues.slice(0, Math.min(20, uploadedValues.length)).map(function(row, idx) { 
    return 'Row ' + (idx + 1) + ': [' + (row || []).map(function(cell) { return JSON.stringify(cell); }).join(', ') + ']'; 
  }).join('\n');
  
  var detectedHeaders = uploadedValues.slice(0, Math.min(20, uploadedValues.length)).map(function(row) {
    return (row || []).map(function(cell) { return _normalizeHeader(cell || ''); });
  });
  
  // Additional debug: check if any row contains "key" after normalization
  var debugInfo = '';
  for (var debugRow = 0; debugRow < Math.min(20, uploadedValues.length); debugRow++) {
    var row = uploadedValues[debugRow];
    if (row && row.length > 0) {
      var keyMatches = [];
      for (var debugCol = 0; debugCol < row.length; debugCol++) {
        var colName = _normalizeHeader(row[debugCol] || '');
        if (colName.indexOf('key') !== -1) {
          keyMatches.push('Col ' + debugCol + ': "' + (row[debugCol] || '') + '" (normalized: "' + colName + '")');
        }
      }
      if (keyMatches.length > 0) {
        debugInfo += '\nRow ' + (debugRow + 1) + ' key matches: ' + keyMatches.join(', ');
      }
    }
  }
  
  return { 
    status: 'error', 
    message: '[V7.1] Could not find header row with a Jira key column in the uploaded file (searched in first ' + maxHeaderSearchRows + ' rows, total file has ' + uploadedValues.length + ' rows).\n\n' +
             'Looking for columns containing: "key", "issue key", "issuekey", "jira key", or any header containing "key".\n\n' +
             'Detected normalized headers in first ' + Math.min(20, uploadedValues.length) + ' rows:\n' + 
             detectedHeaders.map(function(row, idx) { return 'Row ' + (idx + 1) + ': [' + row.join(', ') + ']'; }).join('\n') + '\n\n' +
             'Sample raw data:\n' + sampleRows + 
             (debugInfo ? '\n\nDEBUG - Found potential key columns:' + debugInfo : '\n\nDEBUG - No columns containing "key" found in first 20 rows') + 
             '\n\nTROUBLESHOOTING:\n' +
             '1. If this is an HTML-based Excel export, try opening in Excel and saving as CSV\n' +
             '2. If the file has only ' + uploadedValues.length + ' rows, it may be incomplete - try re-exporting from Jira\n' +
             '3. Ensure your export includes a "Key" or "Issue Key" column\n' +
             '4. For HTML table exports, use "Copy to clipboard" then paste into Excel first'
  };
}

/**
 * Build mapping between sheet headers and uploaded CSV headers
 * @private
 */
function _buildHeaderMapping(headers, uploadedHeaders) {
  const headerNameMap = {
    'Key': 'Jira #', 'Summary': 'Summary', 'Status': 'Status', 'Issue Type': 'Issue Type',
    'Assignee': 'Assignee', 'Sprint': 'sprint', 'Epic Link': 'Epic Link', 'PM Lead': 'PM Lead',
    'Story Points': 'Story Points', 'Updated': 'Updated', 'Resolved': 'Resolved', 'Created': 'Created',
    'Resolution': 'Resolution',
    'Acceptance Criteria': 'Acceptance Critera', // Map to existing sheet header (with typo)
    'Acceptance Critera': 'Acceptance Critera', // Also support if import has the typo
    'Links': 'Links', 'Linked Issues': 'Links', 'Issue Links': 'Links' // Map various link headers to 'Links'
  };
  
  const headerMap = {};
  // Build a case-insensitive mapping helper for uploaded headers
  var uploadedHeadersNorm = uploadedHeaders.map(function(h){ return _normalizeHeader(h); });

  function findUploadedIndex(uploadHeaderName) {
    var targetNorm = _normalizeHeader(uploadHeaderName);
    // 1) exact match against raw header text
    var idx = uploadedHeaders.indexOf(uploadHeaderName);
    if (idx !== -1) return idx;
    // 2) case-insensitive / BOM-normalized exact match
    idx = uploadedHeadersNorm.indexOf(targetNorm);
    if (idx !== -1) return idx;
    // 3) relaxed matching for the 'Key' column: any header containing 'key'
    if (targetNorm === 'key') {
      for (var k = 0; k < uploadedHeadersNorm.length; k++) {
        if (uploadedHeadersNorm[k].indexOf('key') !== -1) return k;
      }
    }
    // 4) for common synonyms, allow matching where uploaded header contains the target tokens
    for (var m = 0; m < uploadedHeadersNorm.length; m++) {
      if (uploadedHeadersNorm[m].indexOf(targetNorm) !== -1) return m;
    }
    return -1;
  }

  headers.forEach(function(sheetHeader, sheetIndex) {
    // Find all potential upload headers that map to this sheet header
    const potentialUploadHeaders = Object.keys(headerNameMap).filter(function(k){ return headerNameMap[k] === sheetHeader; });
    // Also check the sheet header itself as a fallback
    if (potentialUploadHeaders.indexOf(sheetHeader) === -1) {
        potentialUploadHeaders.push(sheetHeader);
    }
    
    var uploadIndex = -1;
    // Try each potential header until we find a match in the upload
    for (var i = 0; i < potentialUploadHeaders.length; i++) {
        uploadIndex = findUploadedIndex(potentialUploadHeaders[i]);
        if (uploadIndex !== -1) break;
    }

    headerMap[sheetHeader] = { 
      sheetIndex: sheetIndex, 
      uploadIndex: uploadIndex
    };
  });

  // Ensure we can find the Jira ID column (try flexible checks as backup)
  if (headerMap['Jira #'].uploadIndex === -1) {
    for (var u = 0; u < uploadedHeaders.length; u++) {
      if (_normalizeHeader(uploadedHeaders[u]).indexOf('key') !== -1) {
        headerMap['Jira #'].uploadIndex = u;
        break;
      }
    }
  }

  return headerMap;
}

/**
 * Process uploaded rows and handle add/update/archive operations
 * @private
 */
function _processUploadedRows(uploadedValues, headerRowIndex, headerMap, headers, existingDataMap, sheet, fileData, user) {
  var rowsToAdd = [];
  var rowsToUpdate = [];
  var addedItems = [];
  var updatedItems = [];
  var archivedItems = [];

  for (let i = headerRowIndex + 1; i < uploadedValues.length; i++) {
    const uploadedRow = uploadedValues[i];

    if (uploadedRow[0] && uploadedRow[0].toString().startsWith('Generated at')) {
      continue; 
    }
    if (uploadedRow.length < 2) continue;

    var uploadJiraId = headerMap['Jira #'].uploadIndex;
    var jiraId = uploadedRow[uploadJiraId] ? String(uploadedRow[uploadJiraId]).trim() : null;

    if (jiraId && existingDataMap.has(jiraId)) {
      var updateResult = _processExistingItem(jiraId, uploadedRow, existingDataMap, headerMap, headers, user);
      if (updateResult.shouldUpdate) {
        rowsToUpdate.push({ sheetRowIndex: updateResult.sheetRowIndex, data: updateResult.data });
        if (updateResult.hasChanges) {
          updatedItems.push(updateResult.itemInfo);
        }
      }
      existingDataMap.delete(jiraId);
    } else if (jiraId) {
      var newRowData = _createNewRowData(uploadedRow, headerMap, headers, user);
      rowsToAdd.push(newRowData);
      addedItems.push({
        jiraId: jiraId,
        summary: uploadedRow[headerMap['Summary'].uploadIndex] || '',
        issueType: uploadedRow[headerMap['Issue Type'].uploadIndex] || ''
      });
    }
  }

  // Archive remaining items (removed from Jira) - only if archiveMissing is true
  var shouldArchiveMissing = fileData.archiveMissing !== false; // Default to true if not specified
  if (shouldArchiveMissing) {
    archivedItems = _archiveRemainingItems(existingDataMap, sheet, headerMap, headers, user);
  }
  
  // Apply all updates to the sheet
  _applySheetUpdates(sheet, rowsToUpdate, rowsToAdd);
  
  // Separate unarchived items from regular updates for reporting
  var unarchivedItems = updatedItems.filter(function(item) { return item.wasUnarchived; });
  var regularUpdatedItems = updatedItems.filter(function(item) { return !item.wasUnarchived; });
  
  console.log('UPLOAD COMPLETED - Final counts: added=' + addedItems.length + ', updated=' + regularUpdatedItems.length + ', unarchived=' + unarchivedItems.length + ', archived=' + archivedItems.length);
  
  // Clear cache for the user so they see new data immediately
  if (user && typeof clearProjectCache === 'function') {
      clearProjectCache(user.username);
  }
  
  return { 
    status: 'success', 
    message: 'Data successfully updated! Headers found on row ' + (headerRowIndex + 1) + ', processed ' + (uploadedValues.length - headerRowIndex - 1) + ' data rows.',
    results: {
      added: addedItems.length,
      updated: regularUpdatedItems.length,
      unarchived: unarchivedItems.length,
      archived: archivedItems.length,
      total: addedItems.length + regularUpdatedItems.length + unarchivedItems.length + archivedItems.length,
      details: {
        addedItems: addedItems,
        updatedItems: regularUpdatedItems,
        unarchivedItems: unarchivedItems,
        archivedItems: archivedItems
      }
    }
  };
}

/**
 * Process an existing item to determine if it needs updating
 * @private
 */
function _processExistingItem(jiraId, uploadedRow, existingDataMap, headerMap, headers, user) {
  var existingRecord = existingDataMap.get(jiraId);
  
  // Check if this item was previously archived
  var currentIcon = existingRecord.data[0];
  var wasArchived = currentIcon === '📁';
  
  var hasChanged = false;
  var changedFields = [];
  
  // If item was archived but now appears in upload, it's been unarchived
  if (wasArchived) {
    hasChanged = true;
    changedFields.push('Unarchived');
    console.log('UNARCHIVING item ' + jiraId + ' - was archived but now appears in upload');
  }

  // Handle Owner field specifically (Append new owner if needed)
  var ownerIndex = headers.indexOf('Owner');
  var newOwnerValue = ownerIndex !== -1 ? existingRecord.data[ownerIndex] : null;
  
  if (ownerIndex !== -1) {
      // If CSV has Owner, start with that (overwrite existing)
      if (headerMap['Owner'] && headerMap['Owner'].uploadIndex !== -1) {
          newOwnerValue = uploadedRow[headerMap['Owner'].uploadIndex];
      }
      
      // Append current user if not present
      if (user) {
          var owners = String(newOwnerValue || '').split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; });
          if (owners.indexOf(user.username) === -1) {
              owners.push(user.username);
              newOwnerValue = owners.join(', ');
          }
      }
      
      // Check if it changed from existing
      if (newOwnerValue !== existingRecord.data[ownerIndex]) {
          hasChanged = true;
          changedFields.push('Owner');
          console.log('OWNER UPDATE for ' + jiraId + ': ' + existingRecord.data[ownerIndex] + ' -> ' + newOwnerValue);
      }
  }
  
  for (var j = 0; j < headers.length; j++) {
    var header = headers[j];
    // Skip Owner here as we handled it above
    if (header === 'Owner') continue;

    if (headerMap[header].uploadIndex !== -1 && header !== 'Sync Status') {
      // Field-aware comparison to minimize false positives
      var existingRaw = existingRecord.data[j];
      var uploadedRaw = uploadedRow[headerMap[header].uploadIndex];
      if (!equalFieldValues_(header, existingRaw, uploadedRaw)) {
        hasChanged = true;
        changedFields.push(header);
        console.log('FIELD CHANGE DETECTED for ' + jiraId + ' in field "' + header + '": ' +
          'existing="' + existingRaw + '" (type: ' + typeof existingRaw + ') ' +
          'uploaded="' + uploadedRaw + '" (type: ' + typeof uploadedRaw + ') ' +
          'normalized existing="' + normalizeValue_(existingRaw) + '" ' +
          'normalized uploaded="' + normalizeValue_(uploadedRaw) + '"');
      }
    }
  }
  
  // Always log the result for debugging
  console.log('RECORD ' + jiraId + ' hasChanged: ' + hasChanged + ', changedFields: [' + changedFields.join(', ') + ']');
  
  // Only update the row if there are actual changes OR if it was archived
  if (hasChanged) {
    var updatedRowData = [];
    headers.forEach(function(header, headerIndex) {
      if (headerIndex === 0) {
        // First column: use appropriate icon (remove archive icon if was archived)
        updatedRowData.push('🔄');
      } else if (header === 'Sync Status') {
        updatedRowData.push('🔄'); // Mark as changed
      } else if (header === 'Owner') {
        updatedRowData.push(newOwnerValue);
      } else if (headerMap[header].uploadIndex !== -1) {
        updatedRowData.push(uploadedRow[headerMap[header].uploadIndex]);
      } else {
        updatedRowData.push(existingRecord.data[headerIndex]);
      }
    });
    
    return {
      shouldUpdate: true,
      hasChanges: true,
      sheetRowIndex: existingRecord.sheetRowIndex,
      data: updatedRowData,
      itemInfo: {
        jiraId: jiraId,
        summary: uploadedRow[headerMap['Summary'].uploadIndex] || '',
        changedFields: changedFields,
        wasUnarchived: wasArchived
      }
    };
  } else {
    // No changes detected, but we should still update sync status to ✅ if it's not already
    var currentSyncStatus = existingRecord.data[headers.indexOf('Sync Status')];
    if (currentSyncStatus !== '✅') {
      var syncOnlyRowData = existingRecord.data.slice(); // Copy existing data
      syncOnlyRowData[headers.indexOf('Sync Status')] = '✅'; // Update only sync status
      return {
        shouldUpdate: true,
        hasChanges: false,
        sheetRowIndex: existingRecord.sheetRowIndex,
        data: syncOnlyRowData
      };
    }
  }
  
  return { shouldUpdate: false };
}

/**
 * Create new row data for a new item
 * @private
 */
function _createNewRowData(uploadedRow, headerMap, headers, user) {
  var newRowData = [];
  headers.forEach(function(header) {
    if (header === 'Sync Status') {
      newRowData.push('🔄');
    } else if (header === 'Owner') {
      var csvOwner = (headerMap['Owner'] && headerMap['Owner'].uploadIndex !== -1) 
                     ? uploadedRow[headerMap['Owner'].uploadIndex] 
                     : '';
      var owners = String(csvOwner || '').split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; });
      if (user && owners.indexOf(user.username) === -1) {
        owners.push(user.username);
      }
      newRowData.push(owners.join(', '));
    } else if (headerMap[header].uploadIndex !== -1) {
      newRowData.push(uploadedRow[headerMap[header].uploadIndex]);
    } else {
      newRowData.push('');
    }
  });
  return newRowData;
}

/**
 * Archive items that are no longer in the upload
 * @private
 */
function _archiveRemainingItems(existingDataMap, sheet, headerMap, headers, user) {
  var archivedItems = [];
  var ownerIndex = headers ? headers.indexOf('Owner') : -1;
  
  existingDataMap.forEach(function(staleRecord, jiraId) {
    // Check if the item is already archived (has 📁 icon in first column)
    var currentIcon = staleRecord.data[0];
    var isAlreadyArchived = currentIcon === '📁';
    
    if (!isAlreadyArchived) {
      // Check ownership before archiving
      var shouldArchive = true;
      var updateOwner = false;
      var newOwnerValue = '';

      if (user && ownerIndex !== -1) {
        var currentOwnerVal = staleRecord.data[ownerIndex];
        var owners = String(currentOwnerVal || '').split(',').map(function(s) { return s.trim(); });
        var userIndex = owners.indexOf(user.username);
        
        if (userIndex === -1) {
          // User is NOT an owner, so do NOT archive (it belongs to someone else)
          shouldArchive = false;
          console.log('DEBUG: Skipping archive for ' + jiraId + ' (User ' + user.username + ' is not an owner)');
        } else {
          // User IS an owner
          if (owners.length > 1) {
            // Multiple owners: Remove current user, but do NOT archive
            shouldArchive = false;
            owners.splice(userIndex, 1);
            newOwnerValue = owners.join(', ');
            updateOwner = true;
            console.log('DEBUG: Removing ' + user.username + ' from owners of ' + jiraId + '. Remaining: ' + newOwnerValue);
          } else {
            // User is the ONLY owner: Archive it
            shouldArchive = true;
          }
        }
      }

      if (shouldArchive) {
        // Only archive if not already archived
        sheet.getRange(staleRecord.sheetRowIndex, 1).setValue('📁');
        archivedItems.push({
          jiraId: jiraId,
          summary: staleRecord.data[headerMap['Summary'].sheetIndex] || ''
        });
        console.log('DEBUG: Archiving item ' + jiraId + ' (was not already archived)');
      } else if (updateOwner) {
        // Update the owner field to remove the current user
        // ownerIndex is 0-based index in data array. Sheet column is index + 1
        sheet.getRange(staleRecord.sheetRowIndex, ownerIndex + 1).setValue(newOwnerValue);
      }
    } else {
      console.log('DEBUG: Skipping already archived item ' + jiraId);
    }
  });
  
  return archivedItems;
}

/**
 * Apply all row updates and additions to the sheet
 * @private
 */
function _applySheetUpdates(sheet, rowsToUpdate, rowsToAdd) {
  // Timestamp fields that need special formatting
  var timestampFields = ['Updated', 'Created', 'Resolved', 'Last Checked'];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  rowsToUpdate.forEach(function(update) {
    // Set the values first
    sheet.getRange(update.sheetRowIndex, 1, 1, update.data.length).setValues([update.data]);
    
    // Then apply number format to timestamp columns to show both date and time
    timestampFields.forEach(function(field) {
      var colIndex = headers.indexOf(field);
      if (colIndex !== -1 && update.data[colIndex]) {
        var cell = sheet.getRange(update.sheetRowIndex, colIndex + 1);
        cell.setNumberFormat('MM/dd/yyyy HH:mm:ss');
      }
    });
  });

  if (rowsToAdd.length > 0) {
    var firstNewRow = sheet.getLastRow() + 1;
    sheet.getRange(firstNewRow, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
    
    // Apply number format to timestamp columns for new rows
    timestampFields.forEach(function(field) {
      var colIndex = headers.indexOf(field);
      if (colIndex !== -1) {
        var range = sheet.getRange(firstNewRow, colIndex + 1, rowsToAdd.length, 1);
        range.setNumberFormat('MM/dd/yyyy HH:mm:ss');
      }
    });
  }
}

/**
 * Helper function to normalize header strings (extracted for reuse)
 * @private
 */
function _normalizeHeader(h) {
  if (h === undefined || h === null) return '';
  return String(h).replace(/^[\uFEFF\u00A0]+/, '').trim().toLowerCase();
}
