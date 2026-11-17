/**
 * @file manifest.js
 * @description Server scripts in load order (paths relative to src/server/).
 * Shared by worker.js and the Node test harness.
 */

var SERVER_SCRIPTS = [
  'platform/Platform.js',
  'platform/Workbook.js',
  'Constants.js',
  'CacheManager.js',
  'DataUtilities.js',
  'SprintUtilities.js',
  'ContextRouter.js',
  'SheetOperations.js',
  'Auth.js',
  'DataOwnership.js',
  'Setup.js',
  'ProjectAnalysis.js',
  'DataOperations.js',
  'CsvImport.js',
  'Tasks.js',
  'Migration.js',
  'Api.js',
  'platform/Server.js'
];
