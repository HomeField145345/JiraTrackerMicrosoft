/**
 * @file Auth.js
 * @description Local profiles, user management, and session tokens.
 */

// --- HELPER FUNCTIONS ---
function generateId() {
  return Platform.uuid().replace(/-/g, '');
}

function safeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isActiveUser_(value) {
  if (value === true || value === 1) return true;
  return typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase());
}

function findRowById(sheet, id, idColIndex = 0) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][idColIndex] === id) return i + 1;
  }
  return -1;
}

/**
 * Gets a user by ID.
 * @param {string} userId
 * @returns {Object|null} User object or null
 */
function getUserById(userId) {
  if (!userId) return null;

  const users = getUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i] && users[i].id === userId) {
      return users[i];
    }
  }

  return null;
}

// --- USER MANAGEMENT ---

/**
 * Gets all users from the Users sheet.
 */
function getUsers() {
  const usersCacheKey = (typeof USERS_CACHE_KEY !== 'undefined') ? USERS_CACHE_KEY : 'users_list_v1';
  const usersCacheTtlSeconds = (typeof USERS_CACHE_TTL_SECONDS !== 'undefined') ? USERS_CACHE_TTL_SECONDS : 300;
  const cache = Platform.cache();
  const cachedUsers = cache.get(usersCacheKey);
  if (cachedUsers) {
    try {
      const parsedUsers = JSON.parse(cachedUsers);
      if (Array.isArray(parsedUsers)) {
        return parsedUsers;
      }
    } catch (e) {
      // Fall through to rebuild cache
    }
  }

  const ss = WorkbookService.getActiveWorkbook();
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  
  // Read all data including the new column (Index 9)
  const data = sheet.getDataRange().getValues().slice(1);
  const users = data.map(row => {
    return { 
      id: row[0], 
      username: row[1], 
      email: row[2], 
      displayName: row[3], 
      role: row[4], 
      isActive: isActiveUser_(row[5]), 
      createdAt: safeIsoDate(row[7]), 
      lastLoginAt: safeIsoDate(row[8]),
      dataSheetId: row[9],
      microsoftObjectId: row[10]
    };
  }).filter(Boolean);

  try {
    cache.put(usersCacheKey, JSON.stringify(users), usersCacheTtlSeconds);
  } catch (e) {
    // Ignore cache write failures
  }

  return users;
}

function resolveMicrosoftUser(objectId, ownerObjectId, identityEmail) {
  const normalizedObjectId = String(objectId || '').trim().toLowerCase();
  if (!normalizedObjectId) throw new Error('Microsoft did not provide an account ID.');

  const users = getUsers();
  let matches = users.filter(user =>
    String(user.microsoftObjectId || '').trim().toLowerCase() === normalizedObjectId
  );
  if (matches.length > 1) throw new Error('This Microsoft account is assigned to multiple workbook users.');

  if (matches.length === 0 && normalizedObjectId === String(ownerObjectId || '').trim().toLowerCase()) {
    let admins = users.filter(user =>
      user.isActive === true && String(user.role || '').trim().toLowerCase() === 'admin' &&
      !String(user.microsoftObjectId || '').trim()
    );
    const normalizedEmail = String(identityEmail || '').trim().toLowerCase();
    if (admins.length > 1 && normalizedEmail) {
      const emailMatches = admins.filter(user => String(user.email || '').trim().toLowerCase() === normalizedEmail);
      if (emailMatches.length === 1) admins = emailMatches;
    }
    if (admins.length === 1) {
      updateUser(admins[0].id, { microsoftObjectId: objectId });
      matches = getUsers().filter(user =>
        String(user.microsoftObjectId || '').trim().toLowerCase() === normalizedObjectId
      );
    } else if (admins.length === 0) {
      throw new Error('The configured Microsoft owner has no active Admin row in the Users sheet. Add or activate an Admin user, then sign in again.');
    } else {
      throw new Error('The configured Microsoft owner matches multiple Admin rows. Add the owner email to exactly one Admin row in the Users sheet, then sign in again.');
    }
  }

  const user = matches[0];
  if (!user || user.isActive !== true) {
    const accountLabel = String(identityEmail || normalizedObjectId).trim();
    throw new Error(`Microsoft account ${accountLabel} (Object ID ${normalizedObjectId}) is not assigned to an active user. Add this Object ID to the matching active row in the Users sheet.`);
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: String(user.role || 'viewer').trim().toLowerCase().replace(/\s+/g, '_'),
    isActive: true,
    dataSheetId: user.dataSheetId,
    microsoftObjectId: user.microsoftObjectId
  };
}

/**
 * Starts a session for the local browser profile.
 *
 * The browser-only build has no identity provider, so it signs in as the first active admin
 * (or the first active user when no admin exists). Microsoft Entra ID sign-in replaces this once
 * a backend is connected; workbook data stays on this device until then.
 * @returns {Object} Result object
 */
function startLocalSession() {
  const ss = WorkbookService.getActiveWorkbook();
  const userSheet = ss.getSheetByName(USERS_SHEET);
  if (!userSheet) {
    return { success: false, message: "System error: Users sheet not found." };
  }

  // Columns: ID, Username, Email, Display Name, Role, Is Active, Password, Created At, Last Login At
  const data = userSheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] !== true) continue;
    if (String(data[i][4]).toLowerCase() === 'admin') {
      rowIndex = i;
      break;
    }
    if (rowIndex === -1) rowIndex = i;
  }

  if (rowIndex === -1) {
    return { success: false, message: "No active users found. Reset this site's data to restore the default admin profile." };
  }

  const row = data[rowIndex];
  userSheet.getRange(rowIndex + 1, 9).setValue(new Date());

  const userObj = {
    id: row[0],
    username: row[1],
    email: row[2],
    displayName: row[3],
    role: row[4]
  };

  cleanupSessions();
  const token = createSession(userObj.id, userObj.username, userObj.role);

  return {
    success: true,
    username: userObj.username,
    role: userObj.role,
    token: token,
    user: userObj
  };
}

/**
 * Creates a new user.
 */
function createUser(user) {
  var lock = Platform.lock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { success: false, message: 'Server is busy. Please try again.' };
  }

  try {
    const ss = WorkbookService.getActiveWorkbook();
    let userSheet = ss.getSheetByName(USERS_SHEET);
    
    if (!userSheet) {
      return { success: false, message: "Users sheet missing." };
    }
    
    // Check for duplicates
    const data = userSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === user.username) { // Check username
        return { success: false, message: "Username already exists." };
      }
    }
    
    const id = generateId();
    
    // AUTO-CREATE USER SPREADSHEET (Hub & Spoke)
    let dataSheetId = '';
    try {
      // Create a dedicated spreadsheet for this user
      dataSheetId = createUserDataSpreadsheet(user);
    } catch (e) {
      console.error("Failed to create user spreadsheet: " + e.toString());
      // Continue anyway, but log error
    }

    // ID, Username, Email, Display Name, Role, Is Active, Password, Created At, Last Login At, Data Sheet ID
    userSheet.appendRow([
      id, 
      user.username, 
      user.email, 
      user.displayName || user.username, 
      user.role, 
      user.isActive !== undefined ? user.isActive : true, 
      '', // Password (not used by the browser build)
      new Date(), 
      '',
      dataSheetId || '', // Store the Spreadsheet ID
      user.microsoftObjectId || ''
    ]);

    clearUsersCache();
    
    return { success: true, message: "User created successfully." };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates an existing user.
 */
function updateUser(userId, updates) {
  const ss = WorkbookService.getActiveWorkbook();
  const sheet = ss.getSheetByName(USERS_SHEET);
  const rowIndex = findRowById(sheet, userId, 0);
  
  if (rowIndex === -1) return { success: false, message: 'User not found' };
  
  // Get current data to check for username change
  const currentUsername = sheet.getRange(rowIndex, 2).getValue();
  
  // Columns: ID(0), Username(1), Email(2), Display Name(3), Role(4), Is Active(5), Password(6), Created(7), LastLogin(8), DataSheetID(9)
  
  if (updates.username) {
      sheet.getRange(rowIndex, 2).setValue(updates.username);
      
      // Trigger data update if username changed
      if (currentUsername !== updates.username) {
          // Call the function from DataOwnership.js
          if (typeof updateDataOwnership === 'function') {
              updateDataOwnership(currentUsername, updates.username);
          }
      }
  }
  if (updates.email) sheet.getRange(rowIndex, 3).setValue(updates.email);
  if (updates.displayName) sheet.getRange(rowIndex, 4).setValue(updates.displayName);
  if (updates.role) sheet.getRange(rowIndex, 5).setValue(updates.role);
  if (updates.isActive !== undefined) sheet.getRange(rowIndex, 6).setValue(updates.isActive);
  if (updates.microsoftObjectId !== undefined) sheet.getRange(rowIndex, 11).setValue(updates.microsoftObjectId);
  
  // Data Sheet ID Update
  if (updates.dataSheetId !== undefined) {
      sheet.getRange(rowIndex, 10).setValue(updates.dataSheetId);
  }

  clearUsersCache();
  
  return { success: true };
}

// --- SESSION MANAGEMENT (Existing Logic) ---

/**
 * Creates a new session for a user.
 * @param {string} userId
 * @param {string} username
 * @param {string} role
 * @returns {string} The session token
 */
function createSession(userId, username, role) {
  const ss = WorkbookService.getActiveWorkbook();
  let sessionSheet = ss.getSheetByName(SESSIONS_SHEET);
  
  if (!sessionSheet) {
    sessionSheet = ss.insertSheet(SESSIONS_SHEET);
    sessionSheet.appendRow(['Token', 'Username', 'Role', 'Expiration', 'UserID']);
  } else {
    // Ensure header has UserID
    if (sessionSheet.getLastColumn() < 5) {
       sessionSheet.getRange(1, 5).setValue('UserID');
    }
  }
  
  const token = Platform.uuid();
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 24); // 24 hour session
  
  sessionSheet.appendRow([token, username, role, expiration, userId]);
  
  // Clean up old sessions occasionally
  if (Math.random() < 0.1) cleanupSessions();
  
  return token;
}

/**
 * Validates a session token.
 * @param {string} token
 * @returns {Object} {valid: boolean, username: string, role: string}
 */
function validateSession(token) {
  if (!token) return { valid: false };
  
  const ss = WorkbookService.getActiveWorkbook();
  const sessionSheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sessionSheet) return { valid: false };
  
  const data = sessionSheet.getDataRange().getValues();
  const now = new Date();
  
  // Skip header
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const expiration = new Date(data[i][3]);
      if (expiration > now) {
        // Normalize role to lowercase for consistent checking
        const role = String(data[i][2]).toLowerCase();
        const userId = data[i][4]; // UserID is at index 4
        
        // Fetch full user details to ensure we have dataSheetId
        // This fixes the issue where manual data writes go to global sheet
        const fullUser = getUserById(userId);
        
        if (fullUser) {
            return { 
                valid: true, 
                username: fullUser.username, 
                role: fullUser.role,
                userId: userId,
                user: fullUser // Contains dataSheetId
            };
        } else {
             // Fallback if user lookup fails (shouldn't happen unless user deleted)
             return { 
                valid: true, 
                username: data[i][1], 
                role: role,
                userId: userId,
                user: { username: data[i][1], role: role, id: userId }
            };
        }
      } else {
        // Expired
        return { valid: false, reason: 'expired' };
      }
    }
  }
  
  return { valid: false, reason: 'not_found' };
}

/**
 * Logs out a user by invalidating their token.
 * @param {string} token
 */
function logout(token) {
  const ss = WorkbookService.getActiveWorkbook();
  const sessionSheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sessionSheet) return;
  
  const data = sessionSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      sessionSheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false };
}

/**
 * Impersonates a user (Admin only).
 * @param {string} adminToken
 * @param {string} targetUserId
 */
function impersonateUser_(adminToken, targetUserId) {
  // 1. Validate Admin
  const adminSession = validateSession(adminToken);
  if (!adminSession.valid || adminSession.role !== 'admin') {
    return { success: false, message: 'Unauthorized' };
  }

  // 2. Find Target User
  const ss = WorkbookService.getActiveWorkbook();
  const userSheet = ss.getSheetByName(USERS_SHEET);
  if (!userSheet) return { success: false, message: 'System error' };

  const rowIndex = findRowById(userSheet, targetUserId, 0);
  if (rowIndex === -1) return { success: false, message: 'User not found' };

  const data = userSheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
  // ID(0), Username(1), Email(2), Display Name(3), Role(4), Is Active(5)

  if (!data[5]) return { success: false, message: 'User is inactive' };

  const userObj = {
    id: data[0],
    username: data[1],
    email: data[2],
    displayName: data[3],
    role: data[4]
  };

  // 3. Create Session for Target User
  const token = createSession(userObj.id, userObj.username, userObj.role);

  return {
    success: true,
    token: token,
    user: userObj
  };
}

/**
 * Removes expired sessions.
 */
function cleanupSessions() {
  const ss = WorkbookService.getActiveWorkbook();
  const sessionSheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sessionSheet) return;
  
  const data = sessionSheet.getDataRange().getValues();
  const now = new Date();
  
  // Go backwards to delete safely
  for (let i = data.length - 1; i >= 1; i--) {
    const expiration = new Date(data[i][3]);
    if (expiration <= now) {
      sessionSheet.deleteRow(i + 1);
    }
  }
}

