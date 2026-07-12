# Jira Tracker V2 - Architecture Documentation

## Project Overview
A Google Apps Script (GAS) web application that provides a dashboard for tracking Jira tickets with manual data overlay, CSV import capabilities, and project management features.

**Crucial Role**: Beyond being a dashboard, this application's underlying Google Sheet serves as the **Source of Truth** for the **UAT App**. The UAT App connects to this sheet to validate bug statuses in real-time.

## Technology Stack
- **Backend**: Google Apps Script (V8 Runtime)
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **UI Framework**: Tailwind CSS
- **Data Storage**: Google Sheets
- **File Processing**: SheetJS (XLSX library)
- **Deployment**: Google Apps Script Web App

## Core Architecture

### 1. Google Apps Script File Compilation Model

#### How GAS Combines Modular Files
Google Apps Script uses a **global namespace compilation model** where all `.js` files are combined into a single execution context at runtime. This is fundamentally different from modern JavaScript module systems.

##### Compilation Process:
1. **File Concatenation**: All `.js` files are concatenated in alphabetical order by filename
2. **Global Scope**: All functions and variables become globally accessible
3. **No Import/Export**: Traditional ES6 modules are not supported
4. **Hoisting**: Function declarations are hoisted across all files

##### File Execution Order:
```
AppCleanup.js       # (1st - alphabetical)
Code.js             # (2nd)
Constants.js        # (3rd) - CRITICAL: Must define constants early
DataService.js      # (4th)
EventManager.js     # (5th)
main.js             # (6th) - Entry points
setup.js            # (7th)
SprintFilter.js     # (8th)
TimerManager.js     # (9th)
```

**Important**: Since `Constants.js` loads 3rd alphabetically, all constant declarations are available to files loaded after it.

##### HTML File Inclusion System:
```javascript
// In any HTML file, include other HTML files:
<?!= include('Dashboard.css'); ?>    // Includes Dashboard.css.html
<?!= include('api.js'); ?>           // Includes api.js.html
```

#### Namespace Management Strategy

##### Backend JavaScript Files:
```javascript
// Constants.js - Global constants available everywhere
const JIRA_DATA_SHEET = "JiraData";
const MANUAL_DATA_SHEET = "ManualData";

// main.js - Public API functions (callable from frontend)
function getProjectData() {
  return getProjectData_();  // Calls internal function
}

// DataService.js - Internal functions (underscore convention)
function getProjectData_() {
  // Implementation - not directly callable from frontend
}
```

##### Function Naming Convention:
- **Public API**: `functionName()` - Callable from frontend via `google.script.run`
- **Internal Functions**: `functionName_()` - Internal use only
- **Constants**: `UPPER_CASE` - Global constants
- **Utilities**: `camelCase` - Helper functions

#### HTML Template System

##### GAS File Extension Strategy
Google Apps Script only supports two file types: `.gs` (server-side JavaScript) and `.html` (client-side templates). To organize modular frontend code, this project uses a **double extension naming convention**:

```
Standard Web Development    →    GAS Equivalent
├── styles.css             →    styles.css.html
├── script.js              →    script.js.html  
├── components.jsx         →    components.jsx.html
└── utils.ts               →    utils.ts.html
```

**Why This Works:**
- GAS sees `.css.html` and `.js.html` as valid HTML files
- The first extension (`.css`, `.js`) indicates the content type for developers
- The `.html` extension satisfies GAS file type requirements
- Content is included via `<?!= include() ?>` regardless of actual content type

##### Template Structure:
```html
<!-- Main HTML files (complete page templates) -->
Dashboard.html      # Complete page template
Config.html         # Complete page template  
tasks.html          # Complete page template

<!-- Component HTML files (included via <?!= include() ?>) -->
```

## 4. Integration with UAT App (The Sync)

The integration between **Jira Tracker** and **UAT App** is a **Passive Pull Model**.

### How it Works
1.  **Jira Tracker (Provider)**:
    *   Maintains the `JiraData` sheet.
    *   Ensures columns `Key` (or `Issue key`), `Status`, and `Summary` exist and are populated via CSV import.
    *   **Does NOT** push data to UAT. It simply hosts the data.

2.  **UAT App (Consumer)**:
    *   The UAT App's `DataRead.js` script opens the Jira Tracker's spreadsheet using `SpreadsheetApp.openById()`.
    *   It scans the `JiraData` tab.
    *   It maps Bug IDs (e.g., `PROJ-123`) to Statuses (e.g., `Closed`).

### Contract Requirements
For the sync to work, the Jira Tracker **MUST** maintain:
*   A sheet named `JiraData` (or whatever is configured in UAT).
*   A column containing the Jira Ticket ID (Header: `Key`, `Issue key`, or `Jira #`).
*   A column containing the Status (Header: `Status`).

---

## 5. Data Flow: The Import Process
1.  **Upload**: User drags a Jira CSV export into the web interface.
2.  **Client-Side Parse**: `SheetJS` parses the file in the browser to avoid GAS file size limits.
3.  **Server-Side Merge (`CsvImport.js`)**:
    *   The script reads the current `JiraData` sheet.
    *   It iterates through the CSV rows.
    *   **Match**: It matches rows based on the **Jira ID** (Primary Key).
    *   **Update**: If found, it updates the row. If not, it appends a new row.
    *   **Archive**: (Optional) It can mark items missing from the CSV as "Archived".

## 6. Security & Access
*   **Authentication**: Custom login system using a `Users` sheet with hashed passwords.
*   **Authorization**:
    *   **Admin**: Can change settings (`OptionsList`).
    *   **User**: Can view dashboard and import data.
*   **Sheet Access**: The UAT App's "Service Account" (or the user running the UAT App) must have **Viewer** access to the Jira Tracker spreadsheet to perform the sync.
