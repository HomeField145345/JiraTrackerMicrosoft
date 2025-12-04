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

// --- USER MANAGEMENT ---

/**
 * Gets all users from the Users sheet.
 */
function getUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  
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
      lastLoginAt: safeIsoDate(row[8]) 
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
          const token = createSession(userObj.username, userObj.role);
          
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
  }
}

/**
 * Authenticates using the active Google User (for SSO).
 */
function loginWithGoogle() {
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
        
        const token = createSession(userObj.username, userObj.role);
        
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
}

/**
 * Creates a new user.
 */
function createUser(user) {
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
  // ID, Username, Email, Display Name, Role, Is Active, Password, Created At, Last Login At
  userSheet.appendRow([
    id, 
    user.username, 
    user.email, 
    user.displayName || user.username, 
    user.role, 
    user.isActive !== undefined ? user.isActive : true, 
    user.password || '123456', 
    new Date(), 
    ''
  ]);
  
  return { success: true, message: "User created successfully." };
}

/**
 * Updates an existing user.
 */
function updateUser(userId, updates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET);
  const rowIndex = findRowById(sheet, userId, 0);
  
  if (rowIndex === -1) return { success: false, message: 'User not found' };
  
  // Columns: ID(0), Username(1), Email(2), Display Name(3), Role(4), Is Active(5), Password(6)
  
  if (updates.username) sheet.getRange(rowIndex, 2).setValue(updates.username);
  if (updates.email) sheet.getRange(rowIndex, 3).setValue(updates.email);
  if (updates.displayName) sheet.getRange(rowIndex, 4).setValue(updates.displayName);
  if (updates.role) sheet.getRange(rowIndex, 5).setValue(updates.role);
  if (updates.isActive !== undefined) sheet.getRange(rowIndex, 6).setValue(updates.isActive);
  
  // Password Update
  if (updates.password && updates.password.trim() !== '') {
      sheet.getRange(rowIndex, 7).setValue(updates.password);
  }
  
  return { success: true };
}

// --- SESSION MANAGEMENT (Existing Logic) ---

/**
 * Creates a new session for a user.
 * @param {string} username
 * @param {string} role
 * @returns {string} The session token
 */
function createSession(username, role) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sessionSheet = ss.getSheetByName(SESSIONS_SHEET);
  
  if (!sessionSheet) {
    sessionSheet = ss.insertSheet(SESSIONS_SHEET);
    sessionSheet.appendRow(['Token', 'Username', 'Role', 'Expiration']);
  }
  
  const token = Utilities.getUuid();
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 24); // 24 hour session
  
  sessionSheet.appendRow([token, username, role, expiration]);
  
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
        return { valid: true, username: data[i][1], role: data[i][2] };
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
  const token = createSession(userObj.username, userObj.role);

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

