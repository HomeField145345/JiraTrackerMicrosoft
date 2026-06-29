/**
 * @file DriveIntegration.js
 * @description Google Drive integration for automated project folder creation.
 * Creates a structured folder hierarchy under the _CXO Projects parent folder.
 * Idempotent — safe to re-run if folders are deleted, moved, or missing.
 */

/**
 * Creates (or repairs) a project folder structure for an epic.
 * 
 * Folder structure:
 *   _CXO Projects/
 *     └── [EPIC-ID Title]/
 *           ├── Notes/
 *           ├── Misc Documents/
 *           └── Archive/
 *
 * Re-run safety logic:
 *   1. If a stored folderId exists and is still valid → verify/repair subfolders only
 *   2. If stored folderId is missing/trashed/inaccessible → search by name under parent
 *   3. If no match found → create fresh folder + subfolders
 *   4. Always returns the complete folder map so the client can update artifacts data
 *
 * @param {string} jiraId - The Jira epic ID (e.g., "PROJ-123")
 * @param {string} epicTitle - The epic summary/title
 * @param {string} [existingFolderId] - Previously stored root folder ID (from artifacts JSON)
 * @returns {Object} { rootFolderId, rootFolderUrl, subfolders: { name: { id, url } } }
 */
function createProjectFolder_(jiraId, epicTitle, existingFolderId) {
  var parentFolder = DriveApp.getFolderById(CXO_PROJECTS_FOLDER_ID);
  var folderName = jiraId + ' ' + epicTitle;
  
  // Sanitize folder name (remove characters Drive doesn't like)
  folderName = folderName.replace(/[\/\\:*?"<>|]/g, '-').substring(0, 200);
  
  var rootFolder = null;

  // --- Step 1: Try to use existing stored folder ID ---
  if (existingFolderId) {
    rootFolder = _tryGetFolder(existingFolderId);
  }

  // --- Step 2: If stored ID failed, search by name under parent ---
  if (!rootFolder) {
    rootFolder = _findFolderByName(parentFolder, folderName);
  }

  // --- Step 3: If still nothing, also try searching just by Jira ID prefix ---
  //     (handles case where epic title was renamed)
  if (!rootFolder) {
    rootFolder = _findFolderByPrefix(parentFolder, jiraId);
  }

  // --- Step 4: Create fresh if nothing found ---
  if (!rootFolder) {
    rootFolder = parentFolder.createFolder(folderName);
    Logger.log('[DriveIntegration] Created new project folder: ' + folderName);
  } else {
    Logger.log('[DriveIntegration] Found existing project folder: ' + rootFolder.getName() + ' (ID: ' + rootFolder.getId() + ')');
  }

  // --- Step 5: Ensure all subfolders exist (repair missing ones) ---
  var subfolderMap = {};
  PROJECT_SUBFOLDERS.forEach(function(subName) {
    var sub = _findFolderByName(rootFolder, subName);
    if (!sub) {
      sub = rootFolder.createFolder(subName);
      Logger.log('[DriveIntegration] Created subfolder: ' + subName);
    }
    subfolderMap[subName] = {
      id: sub.getId(),
      url: sub.getUrl()
    };
  });

  return {
    rootFolderId: rootFolder.getId(),
    rootFolderUrl: rootFolder.getUrl(),
    subfolders: subfolderMap
  };
}

/**
 * Attempt to get a folder by ID. Returns null if trashed, deleted, or inaccessible.
 * @private
 */
function _tryGetFolder(folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    // Check if it's been trashed
    if (folder.isTrashed()) {
      Logger.log('[DriveIntegration] Stored folder ' + folderId + ' is trashed, will recreate.');
      return null;
    }
    return folder;
  } catch (e) {
    Logger.log('[DriveIntegration] Stored folder ' + folderId + ' not accessible: ' + e.message);
    return null;
  }
}

/**
 * Search for a folder by exact name under a parent. Returns first match or null.
 * @private
 */
function _findFolderByName(parentFolder, name) {
  var folders = parentFolder.getFoldersByName(name);
  while (folders.hasNext()) {
    var f = folders.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

/**
 * Search for a folder whose name starts with a prefix (e.g., "PROJ-123 ")
 * under a parent. Handles renamed epics.
 * @private
 */
function _findFolderByPrefix(parentFolder, prefix) {
  // DriveApp doesn't support startsWith search, so we search for the prefix
  // and filter manually
  var folders = parentFolder.searchFolders('title contains "' + prefix + '"');
  while (folders.hasNext()) {
    var f = folders.next();
    if (!f.isTrashed() && f.getName().indexOf(prefix) === 0) {
      return f;
    }
  }
  return null;
}
