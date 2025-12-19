# Jira Tracker V2 - Rebuild & Maintenance Guide

This document serves as the comprehensive manual for the **Jira Tracker V2** application. It is designed to help developers, administrators, and future maintainers understand the system's architecture, data model, and deployment process.

If you need to rebuild this application from scratch or migrate it to a new environment, follow this guide.

---

## 1. System Overview

**Jira Tracker V2** is a Google Apps Script (GAS) web application that acts as a project management dashboard. It bridges the gap between Jira exports (CSV) and manual project tracking.

### Core Capabilities
*   **Data Ingestion**: Imports Jira CSV exports to update project status.
*   **Data Overlay**: Allows users to manually override fields (e.g., "Project Stage", "Comments") without altering the original Jira data.
*   **Visualization**: Provides Table, Kanban Board, and Gantt Chart views.
*   **Task Management**: Supports "Independent Tasks" that exist outside of Jira.
*   **Multi-User Support**: Includes a login system and role-based access (Admin vs. User).

---

## 2. Data Architecture (Google Sheets)

The application relies on a specific Google Sheet structure. If rebuilding, you must recreate these tabs with the exact names.

### Required Sheets (Tabs)

| Sheet Name | Purpose | Key Columns (Headers) |
| :--- | :--- | :--- |
| **`JiraData`** | Stores the raw data imported from Jira CSVs. | `Jira #`, `Summary`, `Status`, `Assignee`, `Updated`, `Created`, `Project`, `Priority`, `Type` |
| **`ManualData`** | Stores user overrides that persist across CSV imports. | `Jira ID`, `Field Name`, `Value`, `Updated At`, `Updated By` |
| **`OptionsList`** | Configuration for dropdowns and system settings. | `ACT/PCT Options`, `Planning Stage Options`, `Project Stage Options`, `HelpfulLinks`, `Priority Options` |
| **`IndependentTasks`** | Tasks created directly in the app (not in Jira). | `ID`, `Title`, `Status`, `Assignee`, `Due Date`, `Description`, `Created At` |
| **`Users`** | User directory and authentication. | `Username`, `Password` (Hash), `Role`, `Email`, `DisplayName`, `DataSheetId` (for personal spaces) |
| **`Sessions`** | Active login sessions. | `Token`, `Username`, `ExpiresAt` |
| **`AdminConfigs`** | System-wide admin settings. | `Key`, `Value` |

### Data Flow
1.  **Import**: User uploads a CSV.
2.  **Processing**: `CsvImport.js` parses the CSV.
3.  **Matching**: The system matches rows by `Jira #`.
4.  **Merging**:
    *   If the row exists in `JiraData`, it updates the fields.
    *   It then checks `ManualData` for any overrides (e.g., user changed "Status" manually).
    *   The final merged object is sent to the frontend.

---

## 3. Codebase Structure

The project uses a standard Google Apps Script structure but simulates a modern web app.

### Backend (Server-Side)
*   **`main.js`**: The entry point. Contains `doGet()` (serves the HTML) and all `google.script.run` exposed functions.
*   **`Constants.js`**: **CRITICAL**. Defines sheet names and global settings. Must be loaded early.
*   **`CsvImport.js`**: Logic for parsing and merging CSV data.
*   **`DataOperations.js`**: Handles reading/writing to `ManualData` and `OptionsList`.
*   **`SheetOperations.js`**: Low-level helpers for reading Sheet ranges.
*   **`Auth.js`**: Handles login, session validation, and password hashing.

### Frontend (Client-Side)
*   **`Dashboard.html`**: The main container for the Single Page Application (SPA).
*   **`Dashboard.js.html`**: The massive controller logic for the UI. Handles state, rendering, and API calls.
*   **`state.js.html`**: Manages the local application state (current view, filters, data cache).
*   **`ui.js.html`**: Helper functions for DOM manipulation and rendering components.
*   **`api.js.html`**: Wrappers for `google.script.run` to make backend calls cleaner.

---

## 4. Rebuild Instructions (Step-by-Step)

If you lost everything and had to start over:

### Step 1: Create the Google Sheet
1.  Create a new Google Sheet.
2.  Rename it to "Jira Tracker Data".
3.  Create the tabs listed in **Section 2 (Data Architecture)**.
4.  **Important**: In `Users` sheet, add a default admin user manually so you can log in.
    *   Row 1: `Username`, `Password`, `Role`, `Email`, `DisplayName`
    *   Row 2: `admin`, `(hash of password)`, `admin`, `admin@example.com`, `System Admin`

### Step 2: Create the Google Apps Script Project
1.  Open the Sheet -> Extensions -> Apps Script.
2.  Copy all `.js` files from the repository into `.gs` files in the editor.
3.  Copy all `.html` files from the repository into `.html` files in the editor.
    *   *Note*: GAS requires unique names. Ensure `Dashboard.css.html` is named `Dashboard.css.html` in the editor.

### Step 3: Configuration
1.  Open `Constants.js`.
2.  Ensure the sheet names match your Google Sheet tabs exactly.
3.  Open `Auth.js` and ensure the hashing secret (if any) is set.

### Step 4: Deployment
1.  Click **Deploy** -> **New Deployment**.
2.  Select **Web App**.
3.  **Execute as**: `Me` (The owner of the sheet).
4.  **Who has access**: `Anyone within [Organization]` or `Anyone` (depending on security needs).
5.  Copy the **Web App URL**.

### Step 5: Initialization
1.  Open the Web App URL.
2.  Log in with the manual user you created in Step 1.
3.  Go to **Settings** (Admin Panel).
4.  Click **"Initialize Sheets"** (if you built a setup script) or manually populate the `OptionsList` sheet with default dropdown values (e.g., "Not Started", "In Progress", "Done").

---

## 5. Troubleshooting & Maintenance

### Common Issues
*   **"ScriptError: Authorization Required"**: The script needs permission to access the Sheet. Run any function in the GAS editor to trigger the auth popup.
*   **"ReferenceError: [Variable] is not defined"**: Check the file load order. `Constants.js` must be loaded before other files that use it. In GAS, files are loaded alphabetically.
    *   *Fix*: Rename `Constants.js` to `_Constants.js` or `0_Constants.js` to force it to the top.
*   **CSV Import Fails**: Ensure the CSV has a column named `Jira #`. This is the primary key.

### Adding a New Column
1.  **Database**: Add the column header to the `JiraData` sheet.
2.  **Backend**: Update `SheetOperations.js` if you have hardcoded column indices (though the current code mostly uses header name matching).
3.  **Frontend**: Update `Dashboard.js.html` to render the new field in the table/modal.

---

## 6. Key Dependencies
*   **Tailwind CSS** (via CDN): Used for styling.
*   **SheetJS (XLSX)** (via CDN): Used for parsing Excel/CSV files on the client side.
*   **Google Apps Script V8 Runtime**: Ensure this is enabled in Project Settings.
