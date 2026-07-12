# Developer Knowledge Transfer (KT) Guide - Jira Tracker V2

**Version**: 2.0
**Last Updated**: December 18, 2025

---

## 1. Introduction
This guide is for developers maintaining or extending the **Jira Tracker V2**. It focuses on the internal logic, data processing flows, and specifically the integration contract with the UAT App.

---

## 2. Core Concepts

### The "Data Mirror" Philosophy
Unlike a typical CRUD app, this system is designed to be a **Read-Heavy Mirror** of Jira, with a lightweight **Write Layer** on top.
*   **Jira Data**: Immutable (mostly). We import it, we don't edit it.
*   **Manual Data**: Mutable. We store overrides here.
*   **Merge Logic**: At runtime (or read time), we merge `JiraData` + `ManualData` to present the final view.

### The "Passive Provider" Role
This app does not "push" data to the UAT App. It sits there and waits to be read.
*   **UAT App** = The Client.
*   **Jira Tracker** = The Database.
*   **Mechanism**: The UAT App uses `SpreadsheetApp.openById()` to read the `JiraData` tab directly.

---

## 3. Key Workflows

### A. CSV Import (The Ingestion Engine)
**File**: `CsvImport.js`
1.  **Client-Side**: User drops a file. `SheetJS` parses it to JSON/Array in the browser.
2.  **Server-Side**: `importJiraCsv(data)` is called.
3.  **Header Mapping**: The script looks for known headers (`Key`, `Issue key`, `Summary`, `Status`).
4.  **Upsert Logic**:
    *   Reads existing `JiraData` into a Map (`Key` -> `RowIndex`).
    *   Iterates through CSV data.
    *   If Key exists -> Update Row.
    *   If Key new -> Append Row.
5.  **Optimization**: Uses batch operations (`setValues`) where possible, but row-by-row updates are sometimes necessary for partial updates.

### B. Data Fetching (The Dashboard)
**File**: `main.js` -> `getProjectData()`
1.  **Auth**: Validates the user token.
2.  **Fetch**: Reads `JiraData` and `ManualData`.
3.  **Merge**:
    *   Creates a list of Project Objects from `JiraData`.
    *   Overwrites properties if a matching entry exists in `ManualData`.
    *   *Example*: Jira says Status="Open", Manual says Status="Blocked". Final object has Status="Blocked".
4.  **Return**: Sends JSON to frontend.

### C. Manual Overrides
**File**: `DataOperations.js` -> `saveManualData()`
1.  **Input**: `JiraID`, `Field`, `Value`.
2.  **Storage**: Checks `ManualData` sheet.
3.  **Logic**:
    *   If an override for this ID exists, update it.
    *   If not, create a new row.
    *   *Note*: We store all overrides for one ID in one row (using JSON or separate columns depending on implementation version).

---

## 4. UAT App Integration Contract (CRITICAL)

If you change the `JiraData` sheet structure, **YOU WILL BREAK THE UAT APP**.

### The Contract
The UAT App expects the following to be true about the `JiraData` sheet:
1.  **Tab Name**: Must be `JiraData`.
2.  **Key Column**: Must exist. Headers accepted: `Jira #`, `Key`, `Issue key`.
3.  **Status Column**: Must exist. Header: `Status`.
4.  **Summary Column**: Must exist. Header: `Summary`.

### Breaking Changes
*   **Renaming the Tab**: ❌ Will break UAT sync immediately.
*   **Deleting Columns**: ❌ Will break UAT sync.
*   **Changing Header Names**: ⚠️ Risky. UAT App has some auto-detection, but stick to standard Jira names.

### Testing the Sync
To verify the sync is working without opening the UAT App:
1.  Open the `JiraData` sheet.
2.  Find a bug (e.g., `BUG-123`). Change its status to `Closed`.
3.  Open the UAT App (as a Manager).
4.  Go to "Failed Queue".
5.  Ensure `BUG-123` now shows as "Completed" (Gray Badge).

---

## 5. Development Tips

### "Global Scope" Trap
Remember that `Constants.js` variables are global.
*   **Do not** redeclare `const JIRA_DATA_SHEET` in other files.
*   **Do** rely on the load order (alphabetical).

### Debugging
*   **Server**: `console.log` in GAS goes to Cloud Logging (View -> Executions).
*   **Client**: `console.log` goes to Browser Console.

### Deployment
*   Always deploy as **Web App**.
*   Execute as **Me** (Owner).
*   Access: **Anyone** (or Org).
*   **New Version**: When pushing changes, you must create a new version in the Deployment dialog for users to see it (unless using the `/dev` URL).
