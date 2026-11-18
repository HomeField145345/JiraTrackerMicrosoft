/**
 * @file api.js
 * @description Handles dashboard data calls to the Excel workbook bridge (callServer).
 */

// --- AUTHENTICATION ---
function getToken() {
  var excel = window.ProjectHubExcel;
  return excel && excel.isSignedIn() ? 'microsoft' : null;
}

function checkAuth() {
  const token = getToken();
  if (!token) {
    showSessionExpiredModal();
    return null;
  }
  return token;
}

function showSessionExpiredModal() {
  hideLoading();
  if (window.ProjectHubExcel) window.ProjectHubExcel.showSignIn();
}

window.redirectToLogin = function() {
  if (window.ProjectHubExcel) window.ProjectHubExcel.signIn();
};

function getErrorMessage_(error) {
  if (error && error.message) return error.message;
  return String(error || 'Something went wrong.');
}

// --- DATA FETCHING & CALLBACKS ---
function showLoading(message) {
  var overlay = $('#loading-overlay');
  if (overlay) {
    var textEl = overlay.querySelector('.loading-text');
    if (textEl && message) {
      textEl.textContent = message;
    }
    overlay.classList.remove('hidden');
  }
}

function hideLoading() {
  var overlay = $('#loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

function handleDataLoaded(data) {
  console.log("Data received from server (raw):", typeof data);
  
  // Handle stringified JSON (workaround for transport issues)
  if (typeof data === 'string') {
      try {
          console.log("Parsing JSON string data...");
          data = JSON.parse(data);
      } catch (e) {
          console.error("Failed to parse data string:", e);
          handleFailure({ message: "Server returned invalid data format." });
          return false;
      }
  }

  console.log("Data object:", data);
  // Validate data structure
  if (!isValidData(data)) {
    hideLoading();
    return false;
  }
  
  // Store the data
  APP_STATE.allData = data;

  try {
    // Initialize the UI components
    initializeUI();
  } catch (initError) {
    console.error('Initialization error:', initError);
    hideLoading();
    handleFailure({ message: 'Failed while initializing the dashboard UI. Please refresh. Details: ' + (initError && initError.message ? initError.message : initError) });
    return false;
  }
  
  // Hide loading indicator after a short delay to ensure smooth transition
  TimerManager.setTimeout(function() {
    hideLoading();
  }, 100, 'hide_loading');
  
  return true;
}

/**
 * Validates the data received from the server
 * @param {Object} data - The data object from the server
 * @returns {boolean} - Whether the data is valid
 */
function isValidData(data) {
  // Check for explicit error from server
  if (data && data.error) {
    handleFailure({ message: data.message || 'Server error retrieving data.' });
    return false;
  }
  
  // Check for required data structures
  if (!data) {
    handleFailure({ message: "No data received from server." });
    return false;
  }

  if (!data.projects) {
    console.error("Missing 'projects' in data", data);
    handleFailure({ message: "Invalid data: Missing projects list." });
    return false;
  }

  if (!data.independentTasks) {
    console.error("Missing 'independentTasks' in data", data);
    handleFailure({ message: "Invalid data: Missing independent tasks list." });
    return false;
  }

  if (!data.config) {
    console.error("Missing 'config' in data", data);
    handleFailure({ message: "Invalid data: Missing configuration." });
    return false;
  }
  
  return true;
}

/**
 * Initialize the UI components after data is loaded
 */
function initializeUI() {
  // Populate the filters before loading saved filter state
  populateFilters();
  
  // Setup multi-select dropdown event listeners after filters are populated
  if (typeof setupMultiSelectDropdowns === 'function') {
    setupMultiSelectDropdowns();
  }
  
  // Load filter state from localStorage
  let filterStateLoaded = false;
  if (typeof loadFilterState === 'function') {
    filterStateLoaded = loadFilterState();
    console.log("Filter state loaded:", filterStateLoaded);
  }
  
  // Apply filters to ensure UI is updated
  if (filterStateLoaded) {
    applyFilters();
  }
  
  // Render the application
  renderApp();
}


function handleFailure(error) {
  // Create a more informative error message
  var errorMessage = "An unknown error occurred on the server. The script may have timed out or requires new permissions.";
  if (error && error.message) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  
  // Suppress raw error logging in production

  // Display the message to the user on the page
  var wrapper = $('#content-wrapper');
  if (wrapper) {
    wrapper.innerHTML = '<div class="p-8 text-center text-red-500 font-semibold">Error: ' + errorMessage + '</div>';
  }
  
  // Re-enable any disabled buttons from the upload modal
  var uploadBtn = $('#uploadBtn');
  if(uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload and Replace Data';
  }
}


function handleUpdateSuccess(response) {
  if (response.status === 'success') {
    showToast(response.message || 'Saved!');
  } else {
    alert('Failed to save: ' + response.message);
  }
}

// --- SERVER-CALLING FUNCTIONS ---
function refreshData() {
  const token = checkAuth();
  if (!token) return;

  showLoading('Loading project data...');

  callServer('getProjectData', []).then(handleDataLoaded, function(error) {
      hideLoading();
      handleFailure(error);
    });
}

function forceRefreshData() {
  const token = checkAuth();
  if (!token) return;

  showLoading('Fetching latest data from the workbook...');
  showToast('Fetching latest data from the workbook...');
  var btn = $('#forceRefreshBtn');
  if(btn) btn.disabled = true;
  
  callServer('forceGetProjectData', []).then(function(data) {
        handleDataLoaded(data);
        if(btn) btn.disabled = false;
    }, function(error) {
        hideLoading();
        handleFailure(error);
        if(btn) btn.disabled = false;
    });
}

function saveTask(taskData) {
  const token = checkAuth();
  if (!token) return;

  callServer('saveIndependentTask', [taskData]).then(function(response) {
      handleUpdateSuccess(response);
      if (response.status === 'success') {
        closeModal();
        refreshData();
      } else {
          // Re-enable button if not success
          var saveBtn = $('#modalSave');
          if (saveBtn) {
              saveBtn.disabled = false;
              if (saveBtn.dataset.originalText) saveBtn.textContent = saveBtn.dataset.originalText;
          }
      }
    }, function(e) {
        showToast(getErrorMessage_(e));
        var saveBtn = $('#modalSave');
        if (saveBtn) {
            saveBtn.disabled = false;
            if (saveBtn.dataset.originalText) saveBtn.textContent = saveBtn.dataset.originalText;
        }
    });
}

function saveManualField(jiraId, field, value) {
  const token = checkAuth();
  if (!token) return;

  // Create a unique key for this field on this item
  const key = 'save-' + jiraId + '-' + field;

  // Debounce the server call (1 second delay)
  // This prevents flooding the server if the user types quickly or changes their mind
  KeyedDebouncer.debounce(key, function() {
      callServer('saveManualData', [jiraId, field, value]).then(function(response) {
          handleUpdateSuccess(response);
          if (response.status === 'success') {
            // Update validation status in real-time after saving any manual field
            updateRowValidation(jiraId);
          }
        }, function(e) {
            showToast(getErrorMessage_(e));
        });
  }, 1000);
}

function updateLastChecked(jiraId, element) {
  const token = checkAuth();
  if (!token) return;

  // Element can be either a button or a validation badge
  var isButton = element && element.tagName === 'BUTTON';
  var isBadge = element && element.classList && element.classList.contains('validation-clickable');
  
  // Store original state
  var originalText = element ? element.textContent : '';
  var originalDisabled = element ? element.disabled : false;
  
  // Disable and show loading state
  if (element) {
    element.disabled = true;
    if (isButton) {
      element.textContent = '...';
    } else if (isBadge) {
      // For badge, just add a visual indicator without changing text
      element.style.opacity = '0.6';
      element.style.pointerEvents = 'none';
    }
  }
  
  callServer('updateLastChecked', [jiraId]).then(function(response) {
      console.log('updateLastChecked response:', response);
      handleUpdateSuccess(response);
      if (response.status === 'success') {
        console.log('Updating row timestamp for Jira ID:', jiraId, 'with timestamp:', response.newTimestamp);
        // Update the single row timestamp
        updateRowTimestamp(jiraId, response.newTimestamp);
        // Update validation status based on new timestamp
        console.log('Updating row validation for Jira ID:', jiraId);
        updateRowValidation(jiraId);
        // Also refresh the sync indicator (status/stage dot)
        try { if (typeof updateRowSyncIndicator === 'function') updateRowSyncIndicator(jiraId); } catch (e) {}
      }
      // Re-enable the element and restore original state
      if (element) {
        element.disabled = false;
        if (isButton) {
          element.textContent = 'Check';
        } else if (isBadge) {
          element.style.opacity = '';
          element.style.pointerEvents = '';
          // Badge text should be updated by updateRowValidation, not here
        }
      }
    }, function(error) {
      showToast(getErrorMessage_(error));
      // Re-enable the element on failure
      if (element) {
        element.disabled = false;
        if (isButton) {
          element.textContent = 'Check';
        } else if (isBadge) {
          element.style.opacity = '';
          element.style.pointerEvents = '';
        }
      }
    });
}

function uploadCsvData(fileData) {
    const token = checkAuth();
    if (!token) return;

    updateProgress(75, 'Processing data on server...');
    
    callServer('importJiraFile', [fileData]).then(function(response) {
            console.log('UPLOAD SUCCESS RESPONSE:', JSON.stringify(response, null, 2));
            if (response.results) {
                console.log('UPLOAD RESULTS SUMMARY:');
                console.log('- Added:', response.results.added);
                console.log('- Updated:', response.results.updated);
                console.log('- Archived:', response.results.archived);
                console.log('- Total:', response.results.total);
                if (response.results.details) {
                    console.log('DETAILED RESULTS:');
                    if (response.results.details.addedItems && response.results.details.addedItems.length > 0) {
                        console.log('Added items:', response.results.details.addedItems.map(item => item.jiraId).join(', '));
                    }
                    if (response.results.details.updatedItems && response.results.details.updatedItems.length > 0) {
                        console.log('Updated items:', response.results.details.updatedItems.map(item => item.jiraId).join(', '));
                    }
                    if (response.results.details.archivedItems && response.results.details.archivedItems.length > 0) {
                        console.log('Archived items:', response.results.details.archivedItems.map(item => item.jiraId).join(', '));
                    }
                }
            }
            updateProgress(100, 'Upload complete!');
            setTimeout(function() {
                hideUploadProgress();
                showUploadResults(response);
                handleUpdateSuccess(response);
                refreshData();
            }, 500);
        }, function(error) {
            hideUploadProgress();
            var errorMessage = error.message || 'Upload failed. Please try again.';
            
            // Enhanced error display for debugging
            var resultsHtml = '<div class="upload-error">' +
                '<h4 class="font-semibold mb-2 text-red-600">Upload Failed</h4>' +
                '<div class="error-message bg-red-50 p-3 rounded border-l-4 border-red-400">' +
                '<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto;">' + 
                errorMessage + 
                '</pre></div>' +
                '<div class="mt-3 text-sm text-gray-600">' +
                '<p><strong>Troubleshooting tips:</strong></p>' +
                '<ul class="list-disc ml-5 mt-1">' +
                '<li>Ensure your file has a "Key" or "Issue Key" column</li>' +
                '<li>Try exporting as CSV directly from Jira instead of Excel</li>' +
                '<li>Open the file in Excel first, then save as CSV</li>' +
                '</ul>' +
                '</div>' +
                '</div>';
                
            showUploadResults({ 
                status: 'error', 
                message: 'Upload failed',
                html: resultsHtml
            });
        });
}
