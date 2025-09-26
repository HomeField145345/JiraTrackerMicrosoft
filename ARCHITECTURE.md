# Jira Tracker V2 - Architecture Documentation

## Project Overview
A Google Apps Script (GAS) web application that provides a dashboard for tracking Jira tickets with manual data overlay, CSV import capabilities, and project management features.

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
Dashboard.css.html  # CSS styles - contains <style> tags
Dashboard.js.html   # JavaScript logic - contains <script> tags
api.js.html         # API call functions - contains <script> tags
utils.js.html       # Utility functions - contains <script> tags
events.js.html      # Event handlers - contains <script> tags
```

##### File Content Examples:

**Dashboard.css.html** (CSS disguised as HTML):
```html
<style>
/* CSS content goes here */
.dashboard-container {
  display: flex;
  flex-direction: column;
}

.header-row {
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}
</style>
```

**api.js.html** (JavaScript disguised as HTML):
```html
<script>
// JavaScript content goes here
function callServerAPI() {
  google.script.run
    .withSuccessHandler(handleSuccess)
    .withFailureHandler(handleError)
    .getProjectData();
}

function handleSuccess(data) {
  console.log('Data received:', data);
}
</script>
```

##### Template Inclusion Process:
1. **Server-Side Rendering**: GAS processes `<?!= ?>` tags on server
2. **File Resolution**: `include('filename')` resolves to `filename.html`
3. **Content Injection**: File contents replace the include tag
4. **Client Delivery**: Final combined HTML sent to browser

##### Example Template Building:
```html
<!-- Dashboard.html (before processing) -->
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard</title>
  <?!= include('Dashboard.css'); ?>  <!-- Injects Dashboard.css.html -->
</head>
<body>
  <div id="app"></div>
  <?!= include('Dashboard.js'); ?>   <!-- Injects Dashboard.js.html -->
  <?!= include('api.js'); ?>         <!-- Injects api.js.html -->
</body>
</html>
```

```html
<!-- Dashboard.html (after GAS processing - sent to browser) -->
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard</title>
  <style>
  /* Contents of Dashboard.css.html injected here */
  .dashboard-container { display: flex; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
  // Contents of Dashboard.js.html injected here  
  function initializeDashboard() { /* logic */ }
  </script>
  <script>
  // Contents of api.js.html injected here
  function callServerAPI() { /* API logic */ }
  </script>
</body>
</html>
```

**Result**: Single HTML file with all CSS and JavaScript inline - no external file dependencies.

##### Benefits of This Approach:

1. **Modular Development**: Separate files for different concerns (CSS, JS, components)
2. **GAS Compatibility**: All files are valid HTML files that GAS can process
3. **IDE Support**: Modern IDEs recognize `.css` and `.js` portions for syntax highlighting
4. **Build Process**: Simple include system - no complex bundling required
5. **Version Control**: Each component can be tracked separately in Git

##### File Naming Best Practices:

```
Component-based naming:
├── Dashboard.css.html      # Dashboard-specific styles
├── Dashboard.js.html       # Dashboard-specific logic
├── Config.css.html         # Config page styles
└── Config.js.html          # Config page logic

Utility-based naming:  
├── api.js.html            # Server communication functions
├── utils.js.html          # Helper utilities
├── events.js.html         # Event handling
└── state.js.html          # State management
```

### 2. Data Layer Architecture

#### Google Sheets Structure
The application uses 4 main sheets:

1. **JiraData Sheet** (Primary data storage)
   - Columns A-P: Sync Status, Jira #, Summary, Status, Issue Type, Assignee, Sprint, Epic Link, PM Lead, Story Points, Updated, Resolved, Created, Resolution, Acceptance Criteria, Target Date
   - Stores imported Jira data with sync status tracking

2. **ManualData Sheet** (User input overlay)
   - Columns A-I: Jira #, ACT/PCT, Planning Stage, Project Stage, Last Checked, Start Date, End Date, Drive Link, Priority
   - Stores manual user inputs that overlay Jira data

3. **OptionsList Sheet** (Configuration)
   - Columns A-M: Various dropdown options, stage mappings, and configuration data
   - Stores application configuration and dropdown values

4. **IndependentTasks Sheet** (Standalone tasks)
   - Columns A-I: ID, Title, Assignee, Status, Priority, Due, Project, Tags, Description
   - Stores tasks not linked to Jira

### 3. Application Layers

#### Layer 1: Web App Entry Point (`main.js`)
- **Purpose**: Route requests and serve HTML templates
- **Key Functions**:
  - `doGet(e)`: Routes to different pages based on parameters
  - `include(filename)`: Includes HTML components
  - Public API wrappers that call internal functions

#### Layer 2: Data Service Layer (`DataService.js`)
- **Purpose**: Core business logic and data operations
- **Key Functions**:
  - `getProjectData_()`: Retrieves and combines all project data
  - `importJiraCsv_(fileData)`: Handles CSV import logic
  - `saveConfiguration_()`: Saves application configuration
  - `saveManualData_()`: Saves user manual inputs
  - Sheet reading/writing operations with caching

#### Layer 3: Setup & Utilities
- **`setup.js`**: Sheet creation, migration, and mock data generation
- **`Constants.js`**: Global constants and sheet names
- **Other utility files**: Specialized functionality (timers, events, cleanup)

#### Layer 4: Frontend Interface
- **HTML Templates**: Serve the user interface
- **CSS**: Styling with Tailwind CSS framework
- **JavaScript**: Client-side logic, API calls, and user interactions

### 4. Key Design Patterns

#### API Pattern
```javascript
// main.js - Public API
function getProjectData() {
  return getProjectData_();
}

// DataService.js - Internal implementation
function getProjectData_() {
  // Implementation logic
}
```

#### Data Flow Pattern
```
CSV Import → DataService → Google Sheets → Cache → Frontend Display
Manual Input → DataService → Google Sheets → Cache Invalidation → Frontend Update
```

#### Caching Strategy
- Script cache for expensive data operations
- Chunked cache storage for large datasets
- Cache invalidation on data updates

### 5. Import/Export System

#### CSV Import Pipeline
1. **File Upload**: Client-side file processing with XLSX.js
2. **Format Detection**: Auto-detect Excel vs CSV, find header rows
3. **Data Mapping**: Map CSV columns to sheet columns
4. **Comparison Logic**: Field-aware comparison to detect changes
5. **Sheet Updates**: Batch updates with sync status tracking

#### Supported Import Formats
- CSV files
- Excel files (.xls, .xlsx) - converted to CSV client-side
- HTML table exports - with special parsing logic

### 6. State Management

#### Client-Side State
- Filter states (search, status, sprint)
- View modes (table, board, gantt)
- UI component states

#### Server-Side State
- Sheet data cache
- Configuration cache
- Timestamp logging (optional)

## Deployment Guide

### Prerequisites
1. Google Account with access to Google Apps Script
2. Node.js and npm (for CLASP if using)
3. Git (for version control)

### Understanding How GAS Combines Modular Files

#### Runtime Execution Model
Google Apps Script creates a **single global execution context** from all your modular files:

##### JavaScript File Combination:
```javascript
// What you write (modular files):
// Constants.js
const JIRA_DATA_SHEET = "JiraData";

// main.js  
function getProjectData() {
  return getProjectData_();
}

// DataService.js
function getProjectData_() {
  var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), JIRA_DATA_SHEET);
  // ... implementation
}
```

```javascript
// What GAS creates at runtime (combined):
// ALL FILES MERGED INTO SINGLE GLOBAL SCOPE:
const JIRA_DATA_SHEET = "JiraData";  // From Constants.js

function getProjectData() {           // From main.js
  return getProjectData_();
}

function getProjectData_() {          // From DataService.js
  var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), JIRA_DATA_SHEET);
  // ... implementation  
}
```

##### HTML Template Combination:
```html
<!-- What you write (Dashboard.html): -->
<!DOCTYPE html>
<html>
<head>
  <?!= include('Dashboard.css'); ?>
</head>
<body>
  <div id="app"></div>
  <?!= include('Dashboard.js'); ?>
  <?!= include('api.js'); ?>
</body>
</html>
```

```html
<!-- What GAS serves to browser (combined): -->
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard</title>
  <style>
    /* Contents of Dashboard.css.html injected here */
    .app { /* styles */ }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    // Contents of Dashboard.js.html injected here
    function initializeDashboard() { /* logic */ }
    
    // Contents of api.js.html injected here  
    function callServerFunction() {
      google.script.run.getProjectData();
    }
  </script>
</body>
</html>
```

#### Critical Dependencies & Load Order

##### File Dependencies Map:
```
Constants.js (NO dependencies)
    ↓
main.js (depends on: Constants.js, DataService.js)
    ↓  
DataService.js (depends on: Constants.js)
    ↓
setup.js (depends on: Constants.js)
    ↓
All other .js files (depend on: Constants.js)
```

##### Why Load Order Matters:
```javascript
// ❌ WRONG ORDER - Will cause errors:
// If DataService.js loads before Constants.js:
function getProjectData_() {
  var sheet = getSheetOrThrow(ss, JIRA_DATA_SHEET); // ❌ JIRA_DATA_SHEET undefined!
}

// ✅ CORRECT ORDER - Constants.js loads first:
const JIRA_DATA_SHEET = "JiraData";  // Constants.js loaded first

function getProjectData_() {         // DataService.js loaded after
  var sheet = getSheetOrThrow(ss, JIRA_DATA_SHEET); // ✅ JIRA_DATA_SHEET available!
}
```

##### GAS Alphabetical Loading Solution:
Since GAS loads files alphabetically, the project uses strategic naming:
```
AppCleanup.js    # Loads 1st (A...)
Code.js          # Loads 2nd (C...)  
Constants.js     # Loads 3rd (C...) - ✅ Early enough for dependencies
DataService.js   # Loads 4th (D...) - ✅ Constants available
main.js          # Loads 6th (m...) - ✅ All dependencies available
```

### Step 1: Create New GAS Project
1. Go to [script.google.com](https://script.google.com)
2. Create new project
3. Set up project structure

### Step 2: File Upload Strategy

#### Understanding GAS Project Structure
When you upload files to Google Apps Script, they are organized as follows:

##### Backend Files (.gs extension in GAS editor):
```
Code.gs             # All .js files become .gs in GAS
Constants.gs        # Global constants - loads early alphabetically  
DataService.gs      # Core business logic
main.gs             # Entry point functions
setup.gs            # Setup and migration functions
[...other .js files become .gs]
```

##### Frontend Files (.html extension in GAS editor):
```
Dashboard.html      # Main pages - standalone templates
Config.html         # Configuration page
tasks.html          # Task management page
Dashboard.css.html  # CSS components - included via <?!= include() ?>
Dashboard.js.html   # JS components - included via <?!= include() ?>
api.js.html         # API functions - included via <?!= include() ?>
[...other .html files stay .html]
```

**Key Point**: The `.css.html` and `.js.html` naming convention is crucial for organizing frontend code within GAS limitations:

- **GAS Limitation**: Only supports `.gs` and `.html` file types
- **Solution**: Use double extensions (`.css.html`, `.js.html`) where:
  - First extension indicates content type for developers
  - `.html` extension satisfies GAS requirements
  - Files contain `<style>` or `<script>` tags with the actual CSS/JS code

##### Example File Contents:

**Dashboard.css.html**:
```html
<style>
.dashboard-header { background: #fff; }
.search-container { display: flex; }
</style>
```

**api.js.html**:
```html
<script>
function callServerFunction() {
  google.script.run.getProjectData();
}
</script>
```

##### File Upload Process:

#### Option A: Manual Upload (Step-by-Step)
1. **Create GAS Project**:
   ```
   1. Go to script.google.com
   2. Click "New Project"
   3. Delete default "Code.gs" file
   ```

2. **Upload Backend Files**:
   ```
   For each .js file in source:
   1. Click "+" → "Script file"
   2. Name it exactly as source (without .js extension)
   3. Copy entire file content
   4. Paste into GAS editor
   5. Save (Ctrl+S)
   ```

3. **Upload Frontend Files**:
   ```
   For each .html file in source:
   1. Click "+" → "HTML file"  
   2. Name it exactly as source (with .html extension)
   3. Copy entire file content
   4. Paste into GAS editor
   5. Save (Ctrl+S)
   ```

4. **Critical File Order** (upload in this sequence):
   ```
   1. Constants.js → Constants.gs (FIRST - needed by others)
   2. main.js → main.gs (Entry points)
   3. DataService.js → DataService.gs (Core logic)
   4. setup.js → setup.gs (Setup functions)
   5. All other .js files → .gs files
   6. All .html files (order doesn't matter for HTML)
   ```

5. **Update appsscript.json**:
   ```json
   {
     "timeZone": "America/Chicago",  // Update to your timezone
     "dependencies": {},
     "exceptionLogging": "STACKDRIVER", 
     "runtimeVersion": "V8",
     "webapp": {
       "executeAs": "USER_ACCESSING",
       "access": "MYSELF"  // or "ANYONE" for public access
     }
   }
   ```

#### Option B: CLASP Deployment (Automated)
```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Jira Tracker V2"

# CLASP automatically:
# - Converts .js files to .gs in GAS
# - Preserves .html files as .html
# - Uploads appsscript.json configuration
# - Maintains file relationships

clasp push
```

#### File Relationship Validation
After upload, verify in GAS editor:

1. **Function Accessibility**:
   ```javascript
   // Should be accessible from any .gs file:
   console.log(JIRA_DATA_SHEET); // From Constants.gs
   
   // Should be callable:
   getProjectData(); // From main.gs
   getProjectData_(); // From DataService.gs
   ```

2. **HTML Includes**:
   ```html
   <!-- In Dashboard.html, these should resolve: -->
   <?!= include('Dashboard.css'); ?>  <!-- Finds Dashboard.css.html -->
   <?!= include('api.js'); ?>         <!-- Finds api.js.html -->
   ```

3. **Global Namespace Test**:
   ```javascript
   // All functions should be in global scope:
   typeof getProjectData === 'function'     // true
   typeof getProjectData_ === 'function'    // true  
   typeof JIRA_DATA_SHEET === 'string'      // true
   ```

#### Common Upload Issues & Solutions:

##### Issue 1: "Function not found" errors
```
Cause: Files uploaded in wrong order, Constants.js not loaded first
Solution: Ensure Constants.js uploaded before files that use constants
```

##### Issue 2: HTML includes don't work
```
Cause: Incorrect filename in include() call
Solution: Verify exact filename match (case-sensitive)
Dashboard.css.html ← include('Dashboard.css')
```

##### Issue 3: Functions not accessible from frontend
```
Cause: Function names with underscore (private convention)
Solution: Only call public functions (without underscore) from frontend
✓ google.script.run.getProjectData()
✗ google.script.run.getProjectData_()
```

##### Issue 4: CSS/JS files not loading
```
Cause: Misunderstanding of double extension system
Solution: Ensure proper file structure and content wrapping
✓ Dashboard.css.html contains: <style>/* CSS here */</style>
✓ api.js.html contains: <script>/* JS here */</script>
✗ Dashboard.css.html contains raw CSS without <style> tags
```

##### Issue 5: Syntax highlighting not working in IDE
```
Cause: IDE doesn't recognize content type in .html files
Solution: Use IDE plugins or configure file associations
- VS Code: Associate .css.html with CSS, .js.html with JavaScript
- Or use comments to hint content type: <!-- CSS --> or <!-- JS -->
```

3. **Adding New HTML Components**:
   ```html
   <!-- Step 1: Create NewComponent.js.html -->
   <script>
   function newComponentLogic() {
     // Component JavaScript
   }
   </script>
   
   <!-- Step 2: Include in main template -->
   <?!= include('NewComponent.js'); ?>
   ```

4. **Adding New CSS Styles**:
   ```html
   <!-- Step 1: Create NewStyles.css.html -->
   <style>
   .new-feature {
     background: #f0f0f0;
     padding: 1rem;
   }
   
   .new-feature-button {
     background: #007bff;
     color: white;
   }
   </style>
   
   <!-- Step 2: Include in main template -->
   <?!= include('NewStyles.css'); ?>
   ```

5. **Working with Double Extensions**:
   ```bash
   # When creating new files, follow the naming convention:
   touch NewFeature.css.html    # For CSS content
   touch NewFeature.js.html     # For JavaScript content
   touch NewFeature.html        # For complete HTML templates
   
   # File content structure:
   # CSS files must wrap content in <style> tags
   # JS files must wrap content in <script> tags
   # Complete templates use standard HTML structure
   ```
