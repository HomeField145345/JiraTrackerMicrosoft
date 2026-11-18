/**
 * @file Dashboard.js
 * @description Main entry point for the dashboard client-side script.
 */

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
  setupEventListeners(); // Set up all user interaction listeners

  window.ProjectHubExcel.whenSignedIn().then(function() {
    if (typeof initUserDropdown === 'function') initUserDropdown();
    refreshData();
  });

  // Add event listener to save filter state and perform cleanup before leaving the page
  EventManager.addEventListener(window, 'beforeunload', function() {
    // Save user state to localStorage
    saveFilterState();
    
    // Perform full application cleanup
    AppCleanup.fullCleanup();
  }, false, 'beforeunload_handler');
});
