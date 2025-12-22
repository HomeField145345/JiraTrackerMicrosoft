/**
 * @file Auth.gs
 * @description Authentication logic for the application.
 * Replicated from UAT-App with Session Management extensions.
 */

// --- HELPER FUNCTIONS ---
function generateId() {
  return Utilities.getUuid().replace(/-/g, '');
}

function safeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) return null;
  
  const rowIndex = findRowById(sheet, userId, 0);
  if (rowIndex === -1) return null;
  
  // Read up to column 10 (Index 9) for Data Sheet ID
  const row = sheet.getRange(rowIndex, 1, 1, 10).getValues()[0];
  return {
      id: row[0], 
      username: row[1], 
      email: row[2], 
      displayName: row[3], 
      role: row[4], 
      isActive: row[5],
      dataSheetId: row[9] // New field
  };
}

// --- USER MANAGEMENT ---

/**
 * Gets all users from the Users sheet.
 */
function getUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  
  // Read all data including the new column (Index 9)
  const data = sheet.getDataRange().getValues().slice(1);
  return data.map(row => {
    return { 
      id: row[0], 
      username: row[1], 
      email: row[2], 
      displayName: row[3], 
      role: row[4], 
      isActive: row[5], 
      createdAt: safeIsoDate(row[7]), 
      lastLoginAt: safeIsoDate(row[8]),
      dataSheetId: row[9] // New field
    };
  }).filter(Boolean);
}

/**
 * Authenticates a user against the Users sheet.
 * @param {string} username
 * @param {string} password
 * @returns {Object} Result object
 */
function authenticateUser(username, password) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { success: false, message: 'Server is busy. Please try again.' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName(USERS_SHEET);
    
    if (!userSheet) {
      return { success: false, message: "System error: Users sheet not found." };
    }
    
    const data = userSheet.getDataRange().getValues();
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // Columns: ID, Username, Email, Display Name, Role, Is Active, Password, Created At, Last Login At
      // Indices: 0,  1,        2,     3,            4,    5,         6,        7,          8
      
      const uName = row[1];
      const uPass = row[6];
      const isActive = row[5];
      
      if (String(uName).toLowerCase() === String(username).toLowerCase() && isActive === true) {
        if (String(uPass) === String(password)) {
          // Update Last Login
          userSheet.getRange(i + 1, 9).setValue(new Date());
          
          const userObj = {
            id: row[0],
            username: row[1],
            email: row[2],
            displayName: row[3],
            role: row[4]
          };
          
          // Create session
          const token = createSession(userObj.id, userObj.username, userObj.role);
          
          return { 
            success: true, 
            username: userObj.username,
            role: userObj.role,
            token: token,
            user: userObj
          };
        }
        return { success: false, message: "Incorrect password." };
      }
    }
    
    return { success: false, message: "User not found or inactive." };
    
  } catch (e) {
    Logger.log("Auth Error: " + e.toString());
    return { success: false, message: "An error occurred during login." };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Authenticates using the active Google User (for SSO).
 */
function loginWithGoogle() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { success: false, message: 'Server is busy. Please try again.' };
  }

  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) return { success: false, message: 'No Google User found' };
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName(USERS_SHEET);
    if (!userSheet) return { success: false, message: "Users sheet not found." };
    
    const data = userSheet.getDataRange().getValues();
    
    // Find user by Email (Column 3 / Index 2)
    for(let i=1; i<data.length; i++) {
      const row = data[i];
      // Columns: ID, Username, Email, Display Name, Role, Is Active, Password, Created At, Last Login At
      
      if(String(row[2]).trim().toLowerCase() === String(email).trim().toLowerCase() && row[5] === true) {
          // Update Last Login
          userSheet.getRange(i+1, 9).setValue(new Date());
          
          const userObj = { 
              id: row[0], 
              username: row[1], 
              email: row[2],
              displayName: row[3], 
              role: row[4]
          };
          
          const token = createSession(userObj.id, userObj.username, userObj.role);
          
          return { 
              success: true, 
              username: userObj.username,
              role: userObj.role,
              token: token,
              user: userObj
          };
      }
    }
    
    return { success: false, message: 'Access Denied: Email not registered (' + email + ')' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates a new user.
 */
function createUser(user) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { success: false, message: 'Server is busy. Please try again.' };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
      user.password || '123456', 
      new Date(), 
      '',
      dataSheetId || '' // Store the Spreadsheet ID
    ]);
    
    return { success: true, message: "User created successfully." };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates an existing user.
 */
function updateUser(userId, updates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  
  // Password Update
  if (updates.password && updates.password.trim() !== '') {
      sheet.getRange(rowIndex, 7).setValue(updates.password);
  }

  // Data Sheet ID Update
  if (updates.dataSheetId !== undefined) {
      sheet.getRange(rowIndex, 10).setValue(updates.dataSheetId);
  }
  
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  
  const token = Utilities.getUuid();
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
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

