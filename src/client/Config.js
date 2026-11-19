    // --- Place this function near the top of the <script> tag ---
    function renderLinks(links) {
        var listEl = document.getElementById('linksList');
        if (!listEl) return; // Guard clause for when running in dashboard context if elements aren't ready
        
        listEl.innerHTML = '';
        if (!links || links.length === 0) {
            listEl.innerHTML = '<p class="text-sm text-gray-500">No links configured yet.</p>';
            return;
        }

        links.forEach(function(link, index) {
            var linkEl = document.createElement('div');
            linkEl.className = 'flex items-center justify-between bg-gray-50 p-2 rounded-md';
            // Store the full URL in a data attribute
            linkEl.setAttribute('data-url', link.url); 
            
            linkEl.innerHTML =
                '<div style="overflow: hidden;">' + // Add a wrapper to prevent long text from breaking layout
                    '<span class="font-medium text-sm">' + link.title + '</span>' +
                    // Use a p tag for display, but it won't be used for saving
                    '<p class="text-xs text-gray-500 truncate">' + link.url + '</p>' + 
                '</div>' +
                '<button data-index="' + index + '" class="remove-link-btn text-sm text-red-500 hover:text-red-700 ml-4 flex-shrink-0">Remove</button>';
            listEl.appendChild(linkEl);
        });
    }

    function handleConfigFailure_(error) {
        var statusEl = document.getElementById('configStatus');
        if (statusEl) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.className = 'mt-4 text-sm text-red-600 text-right';
        } else {
            console.error('Config Error:', error);
            alert('Config Error: ' + error.message);
        }
    }

    var currentMappings = {
        epic: {}, // {status: [stage1, stage2, ...]}
        story: {},
        bug: {}
    };
    var selectedStatus = null;
    var selectedType = 'epic'; // current tab
    var availableStages = {
        epic: [],
        story: [],
        bug: []
    };
    var availableStatuses = [];

    // Expose globally so Dashboard can call it
    var _configUiInitialized = false;
    function _initConfigUI() {
        if (_configUiInitialized) return;
        _configUiInitialized = true;

        // Tabs: simple toggling between panels
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
                document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.add('hidden'); });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                var target = document.querySelector(btn.dataset.target);
                if (target) target.classList.remove('hidden');
            });
        });

        // Clean buttons: dedupe, trim, sort
        document.querySelectorAll('[data-clean-for]').forEach(function(el) {
            el.addEventListener('click', function() {
                var id = el.getAttribute('data-clean-for');
                var ta = document.getElementById(id);
                if (!ta) return;
                var cleaned = (ta.value || '')
                    .split('\n')
                    .map(function(s) { return s.trim(); })
                    .filter(Boolean);
                var seen = {};
                var result = [];
                cleaned.forEach(function(v) { var key = v.toLowerCase(); if (!seen[key]) { seen[key] = true; result.push(v); } });
                result.sort(function(a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0; });
                ta.value = result.join('\n');
            });
        });

        // KPI stage selector live update
        var stageInputs = ['projectStageOptions', 'epicProjectStageOptions', 'storyProjectStageOptions', 'bugProjectStageOptions'];
        function updateKpiSelectorOptions() {
            var groupedStages = { global: [], epic: [], story: [], bug: [] };
            var getStages = function(id) {
                var el = document.getElementById(id);
                return el ? el.value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean).sort() : [];
            };
            groupedStages.global = getStages('projectStageOptions');
            groupedStages.epic   = getStages('epicProjectStageOptions');
            groupedStages.story  = getStages('storyProjectStageOptions');
            groupedStages.bug    = getStages('bugProjectStageOptions');
            var currentSelected = Array.from(document.querySelectorAll('#kpiStageSelector input[type="checkbox"]:checked')).map(function(cb) { return cb.value; });
            renderKpiStageSelector(groupedStages, currentSelected);
        }
        stageInputs.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', updateKpiSelectorOptions);
        });

        // Save button
        var saveBtn = document.getElementById('saveConfigBtn');
        var statusEl = document.getElementById('configStatus');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const token = checkAuth();
                if (!token) return;

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                if (statusEl) { statusEl.textContent = ''; statusEl.className = 'text-sm text-gray-500'; }

                var linksData = Array.from(document.querySelectorAll('#linksList .flex')).map(function(el) {
                    return { title: el.querySelector('span').textContent, url: el.getAttribute('data-url') };
                });

                var optionsData = {
                    notInProgressStatuses: (document.getElementById('inProgressStatuses') ? document.getElementById('inProgressStatuses').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    actPctOptions: document.getElementById('actPctOptions').value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    planningStageOptions: document.getElementById('planningStageOptions').value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    projectStageOptions: document.getElementById('projectStageOptions').value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    kpiProjectStages: Array.from(document.querySelectorAll('#kpiStageSelector input[type="checkbox"]:checked')).map(function(cb) { return cb.value; }),
                    epicProjectStageOptions: (document.getElementById('epicProjectStageOptions').value || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    storyProjectStageOptions: (document.getElementById('storyProjectStageOptions').value || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    bugProjectStageOptions: (document.getElementById('bugProjectStageOptions').value || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    priorityOptions: (document.getElementById('priorityOptions').value || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    independentTaskStatusOptions: (document.getElementById('independentTaskStatusOptions') ? document.getElementById('independentTaskStatusOptions').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    closedProjectStages: (document.getElementById('closedProjectStages').value || '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    pastSprintClosedStages: (document.getElementById('pastSprintClosedStages') ? document.getElementById('pastSprintClosedStages').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    pastDueExemptStages: (document.getElementById('pastDueExemptStages') ? document.getElementById('pastDueExemptStages').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    // Legacy key retained for compatibility with existing config pipeline
                    inProgressStatuses: (document.getElementById('inProgressStatuses') ? document.getElementById('inProgressStatuses').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    helpfulLinks: linksData,
                    stageStatusMappings: getCurrentMappingsAsArray()
                };

                callServer('saveConfiguration', [optionsData]).then(function(response) {
                        if (response.status === 'success') {
                            if (statusEl) { statusEl.textContent = response.message || 'Configuration Saved!'; statusEl.className = 'text-sm text-green-600'; }
                            try {
                                // Apply new config immediately across the dashboard.
                                if (typeof refreshData === 'function') {
                                    refreshData();
                                }
                            } catch (refreshError) {
                                console.warn('Config saved, but refresh failed:', refreshError);
                            }
                        } else {
                            handleConfigFailure_(new Error(response.message));
                        }
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save Configuration';
                        setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 3000);
                    }, handleConfigFailure_);
            });
        }

        // Add Link button
        var addLinkBtn = document.getElementById('addLinkBtn');
        if (addLinkBtn) {
            addLinkBtn.addEventListener('click', function() {
                var titleInput = document.getElementById('newLinkTitle');
                var urlInput = document.getElementById('newLinkUrl');
                var title = titleInput ? titleInput.value.trim() : '';
                var url = urlInput ? urlInput.value.trim() : '';
                if (title && url) {
                    var newLink = { title: title, url: url };
                    var currentLinks = Array.from(document.querySelectorAll('#linksList .flex')).map(function(el) {
                        return { title: el.querySelector('span').textContent, url: el.getAttribute('data-url') };
                    });
                    currentLinks.push(newLink);
                    renderLinks(currentLinks);
                    if (titleInput) titleInput.value = '';
                    if (urlInput) urlInput.value = '';
                }
            });
        }

        // Links list remove
        var linksListEl = document.getElementById('linksList');
        if (linksListEl) {
            linksListEl.addEventListener('click', function(e) {
                if (e.target.classList.contains('remove-link-btn')) {
                    e.target.parentElement.remove();
                }
            });
        }

        // Mapping refresh button
        var refreshBtn = document.getElementById('refreshMappingDataBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', extractDataFromProjects);

        // Mapping type tabs (epic / story / bug)
        document.querySelectorAll('.mapping-tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                switchMappingTab(btn.getAttribute('data-type'));
            });
        });

    }

    window.loadConfigData = function() {
        const token = getToken();
        if (!token) return;

        _initConfigUI();

        var statusEl = document.getElementById('configStatus');
        if (statusEl) statusEl.textContent = 'Loading configuration...';

        callServer('getConfigData', []).then(onConfigDataLoaded, handleConfigFailure_);
    };

    function renderKpiStageSelector(groupedStages, selectedStages) {
        var container = document.getElementById('kpiStageSelector');
        if (!container) {
            console.error('KPI Stage Selector container not found!');
            return;
        }
        
        container.innerHTML = '';
        // Reset class to ensure it matches the new layout if needed, but keep the grid
        // Use fixed height to match textareas (approx h-60) and ensure scrolling
        container.className = 'mt-1 w-full rounded-md border border-gray-300 shadow-sm p-2 h-60 overflow-y-auto bg-white';
        
        var selectedSet = new Set(selectedStages || []);
        var hasAnyStages = false;

        // Helper to render a group
        var renderGroup = function(title, stages) {
            if (!stages || stages.length === 0) return;
            hasAnyStages = true;

            var groupHeader = document.createElement('div');
            groupHeader.className = 'text-xs font-bold text-gray-500 uppercase tracking-wider mt-2 mb-1 pb-1 border-b border-gray-100';
            groupHeader.textContent = title;
            container.appendChild(groupHeader);

            stages.forEach(function(stage) {
                var label = document.createElement('label');
                label.className = 'flex items-center space-x-2 p-1 hover:bg-gray-100 rounded cursor-pointer ml-1';
                
                var checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = stage;
                checkbox.checked = selectedSet.has(stage);
                checkbox.className = 'form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500';
                
                var span = document.createElement('span');
                span.textContent = stage;
                span.className = 'text-sm text-gray-700 truncate';
                span.title = stage; // Tooltip for long names
                
                label.appendChild(checkbox);
                label.appendChild(span);
                container.appendChild(label);
            });
        };

        renderGroup('Global Options', groupedStages.global);
        renderGroup('Epic Options', groupedStages.epic);
        renderGroup('Story Options', groupedStages.story);
        renderGroup('Bug Options', groupedStages.bug);

        if (!hasAnyStages) {
            container.innerHTML = '<p class="text-sm text-gray-500 p-2">No Project Stages defined. Please add options to any of the "Project Stage Options" lists below.</p>';
        }
    }

    function onConfigDataLoaded(data) {
        try {
            
            var statusEl = document.getElementById('configStatus');
            if (statusEl) {
                statusEl.textContent = 'Loaded configuration payload.';
                statusEl.className = 'text-sm text-gray-500';
            }
        } catch (e) { /* no-op */ }
        if (!data || !data.config) {
            handleConfigFailure_({ message: "Could not load config data." });
            return;
        }
        
        // Helper to safely set value
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('actPctOptions', data.config.actPctOptions.join('\n'));
        setVal('planningStageOptions', data.config.planningStageOptions.join('\n'));
        setVal('projectStageOptions', data.config.projectStageOptions.join('\n'));
        
        // Per-type Project Stage options (Epic/Story/Bug)
        if (data.config.epicProjectStageOptions) {
            setVal('epicProjectStageOptions', data.config.epicProjectStageOptions.join('\n'));
        }
        if (data.config.storyProjectStageOptions) {
            setVal('storyProjectStageOptions', data.config.storyProjectStageOptions.join('\n'));
        }
        if (data.config.bugProjectStageOptions) {
            setVal('bugProjectStageOptions', data.config.bugProjectStageOptions.join('\n'));
        }

        // Group stages for KPI selector
        var groupedStages = {
            global: (data.config.projectStageOptions || []).filter(Boolean).sort(),
            epic: (data.config.epicProjectStageOptions || []).filter(Boolean).sort(),
            story: (data.config.storyProjectStageOptions || []).filter(Boolean).sort(),
            bug: (data.config.bugProjectStageOptions || []).filter(Boolean).sort()
        };
        
        renderKpiStageSelector(groupedStages, data.config.kpiProjectStages);
        
        // Priority options
        if (data.config.priorityOptions) {
            setVal('priorityOptions', data.config.priorityOptions.join('\n'));
        }
        // Independent Task Status Options
        if (data.config.independentTaskStatusOptions) {
            setVal('independentTaskStatusOptions', data.config.independentTaskStatusOptions.join('\n'));
        }
        // Closed mappings
        if (data.config.closedProjectStages) {
            setVal('closedProjectStages', data.config.closedProjectStages.join('\n'));
        }
        // Past sprint closed mappings (optional)
        if (data.config.pastSprintClosedStages) {
            var ta = document.getElementById('pastSprintClosedStages');
            if (ta) ta.value = data.config.pastSprintClosedStages.join('\n');
        }
        // Past due exempt stages (optional)
        if (data.config.pastDueExemptStages) {
            var ta = document.getElementById('pastDueExemptStages');
            if (ta) ta.value = data.config.pastDueExemptStages.join('\n');
        }
        // In Progress Statuses (optional)
        if (data.config.inProgressStatuses) {
            var ta = document.getElementById('inProgressStatuses');
            if (ta) ta.value = data.config.inProgressStatuses.join('\n');
        }
       
        // Load stage status mappings into visual interface
        try {
            var mappings = Array.isArray(data.config.stageStatusMappings) ? data.config.stageStatusMappings : [];
            loadMappingsData(mappings);
    } catch (e) { }
        renderLinks(data.config.helpfulLinks);
        
        // Initialize available stages from configuration options
        availableStages.epic = getConfigOptionsList('epicProjectStageOptions');
        availableStages.story = getConfigOptionsList('storyProjectStageOptions');
        availableStages.bug = getConfigOptionsList('bugProjectStageOptions');
        
        
        // Load project data for mapping interface (will get statuses)
        extractDataFromProjects();
    }
    
    function switchMappingTab(type) {
        selectedType = type;
        selectedStatus = null;
        
        
        
        // Update tab buttons
        document.querySelectorAll('.mapping-tab-btn').forEach(function(btn) {
            btn.classList.remove('border-blue-500', 'text-blue-600');
            btn.classList.add('border-transparent');
            if (btn.getAttribute('data-type') === type) {
                btn.classList.add('border-blue-500', 'text-blue-600');
                btn.classList.remove('border-transparent');
            }
        });
        
        // Show/hide panels
        document.querySelectorAll('.mapping-panel').forEach(function(panel) {
            panel.classList.add('hidden');
        });
        var activePanel = document.getElementById(type + 'MappingPanel');
        
        if (activePanel) {
            activePanel.classList.remove('hidden');
        }
        
        // Re-render for new type
        
        try {
            
            renderStatusValuesList();
            
            renderProjectStagesList();
            
            renderCurrentMappings();
            
            
            // Check if containers were actually populated
            var statusContainer = document.getElementById(selectedType + 'StatusValuesList');
            var stageContainer = document.getElementById(selectedType + 'ProjectStagesList');
            var mappingContainer = document.getElementById(selectedType + 'CurrentMappings');
            
            
        } catch (e) {
            
        }
    }
    
    function loadMappingsData(mappings) {
        // Reset mappings
        currentMappings = { epic: {}, story: {}, bug: {} };
        
        // For backward compatibility, if mappings use old format (stage->statuses),
        // we need to convert them to new format (status->stages)
        mappings.forEach(function(m) {
            if (m.stage && m.expectedStatuses) {
                // Old format: convert stage->statuses to status->stages
                m.expectedStatuses.forEach(function(status) {
                    // For now, put in all three types until we have type-specific data
                    ['epic', 'story', 'bug'].forEach(function(type) {
                        if (!currentMappings[type][status]) {
                            currentMappings[type][status] = [];
                        }
                        if (currentMappings[type][status].indexOf(m.stage) === -1) {
                            currentMappings[type][status].push(m.stage);
                        }
                    });
                });
            }
        });
        
        renderCurrentMappings();
    }
    
    // Helper function to get configuration options list
    function getConfigOptionsList(optionId) {
        var element = document.getElementById(optionId);
        if (!element || !element.value) {
            
            return [];
        }
        var options = element.value.split('\n')
            .map(function(s) { return s.trim(); })
            .filter(Boolean)
            .sort();
        
        return options;
    }
    
        // Visual mapping functions
        function extractDataFromProjects() {
            const token = checkAuth();
            if (!token) return;
            
            // Get the project data from the global state
            callServer('getProjectData', []).then(function(response) {
                    // getProjectData() returns a JSON string (stringified for transport reliability)
                    if (typeof response === 'string') {
                        try { response = JSON.parse(response); } catch (e) { response = null; }
                    }
                    
                    // Handle different possible response formats
                    var projects = null;
                    if (response && response.projects && Array.isArray(response.projects)) {
                        projects = response.projects;
                    } else if (response && Array.isArray(response)) {
                        projects = response;
                    } else if (response && response.items && Array.isArray(response.items)) {
                        projects = response.items;
                    } else if (response && response.data && Array.isArray(response.data)) {
                        projects = response.data;
                    } else if (response && response.allItems && Array.isArray(response.allItems)) {
                        projects = response.allItems;
                    }
                    
                    if (projects && Array.isArray(projects)) {
                        
                        
                        // Extract unique statuses only - stages come from configuration
                        var statusesSet = new Set();
                        
                        projects.forEach(function(project) {
                            var status = project['Status'];
                            if (status && status.trim()) {
                                statusesSet.add(status.trim());
                            }
                        });
                        
                        // Get stages from configuration options, not from project data
                        availableStages.epic = getConfigOptionsList('epicProjectStageOptions');
                        availableStages.story = getConfigOptionsList('storyProjectStageOptions'); 
                        availableStages.bug = getConfigOptionsList('bugProjectStageOptions');
                        availableStatuses = Array.from(statusesSet).sort();
                        
                        
                        
                        // Render the updated lists for current tab
                        
                        
                        // Always initialize the epic tab when data is first loaded
                        
                        switchMappingTab('epic');
                        
                        // Update status
                        var statusEl = document.getElementById('refreshDataStatus');
                        if (statusEl) {
                            var totalStages = availableStages.epic.length + availableStages.story.length + availableStages.bug.length;
                            statusEl.textContent = 'Found ' + availableStatuses.length + ' statuses and ' + totalStages + ' total stages';
                            statusEl.className = 'text-sm text-green-600';
                            setTimeout(function() { statusEl.textContent = ''; }, 3000);
                        }
                    } else {
                        
                        var statusEl = document.getElementById('refreshDataStatus');
                        if (statusEl) {
                            statusEl.textContent = 'Failed to extract data - no project array found';
                            statusEl.className = 'text-sm text-red-600';
                        }
                    }
                }, function(error) {
                    
                    var statusEl = document.getElementById('refreshDataStatus');
                    if (statusEl) {
                        statusEl.textContent = 'Error: ' + error.message;
                        statusEl.className = 'text-sm text-red-600';
                    }
                }); // This should call the same function as the dashboard
        }
        
        function renderStatusValuesList() {
            var containerId = selectedType + 'StatusValuesList';
            var container = document.getElementById(containerId);
            
            if (!container) return;
            
            container.innerHTML = '';
            
            availableStatuses.forEach(function(status) {
                var btn = document.createElement('button');
                btn.className = 'status-btn w-full text-left p-2 rounded border text-sm hover:bg-blue-50 hover:border-blue-300';
                btn.textContent = status;
                btn.onclick = function() { selectStatus(status); };
                container.appendChild(btn);
            });
            
        }
        
        function renderProjectStagesList() {
            var containerId = selectedType + 'ProjectStagesList';
            var container = document.getElementById(containerId);
            
            if (!container) return;
            
            if (!selectedStatus) {
                container.innerHTML = '<p class="text-xs text-gray-500">Select a status first</p>';
                return;
            }
            
            container.innerHTML = '';
            var stages = availableStages[selectedType] || [];
            
            stages.forEach(function(stage) {
                var btn = document.createElement('button');
                btn.className = 'stage-btn w-full text-left p-2 rounded border text-sm hover:bg-green-50 hover:border-green-300';
                btn.textContent = stage;
                btn.onclick = function() { toggleStageForSelectedStatus(stage); };
                container.appendChild(btn);
            });
            
            updateStageButtonStyles();
        }
        
        function selectStatus(status) {
            selectedStatus = status;
            
            
            // Update status button styles
            document.querySelectorAll('#' + selectedType + 'StatusValuesList .status-btn').forEach(function(btn) {
                btn.classList.remove('bg-blue-100', 'border-blue-500', 'font-medium');
                if (btn.textContent === status) {
                    btn.classList.add('bg-blue-100', 'border-blue-500', 'font-medium');
                    
                }
            });
            
            // Update stage list and styles
            
            renderProjectStagesList();
        }
        
        function updateStageButtonStyles() {
            var mappedStages = selectedStatus ? (currentMappings[selectedType][selectedStatus] || []) : [];
            
            // Get all stages that are mapped to ANY status WITHIN THIS TYPE ONLY
            var allMappedStages = [];
            if (currentMappings[selectedType]) {
                Object.keys(currentMappings[selectedType]).forEach(function(status) {
                    allMappedStages = allMappedStages.concat(currentMappings[selectedType][status] || []);
                });
            }
            
            
            
            document.querySelectorAll('#' + selectedType + 'ProjectStagesList .stage-btn').forEach(function(btn) {
                var stageName = btn.textContent;
                
                // Reset all styles
                btn.classList.remove('bg-green-100', 'border-green-500', 'font-medium', 'bg-yellow-100', 'border-yellow-500');
                
                if (mappedStages.includes(stageName)) {
                    // This stage is mapped to the currently selected status (green = active mapping)
                    btn.classList.add('bg-green-100', 'border-green-500', 'font-medium');
                } else if (allMappedStages.includes(stageName)) {
                    // This stage is mapped to a different status within this type (yellow = taken by another status)
                    btn.classList.add('bg-yellow-100', 'border-yellow-500');
                }
            });
        }
        
        function toggleStageForSelectedStatus(stage) {
            
            if (!selectedStatus) {
                
                return;
            }
            
            // Ensure the type-specific mapping object exists
            if (!currentMappings[selectedType]) {
                currentMappings[selectedType] = {};
                
            }
            
            // Check if this stage is already mapped to a different status WITHIN THIS TYPE ONLY
            var existingStatus = null;
            Object.keys(currentMappings[selectedType]).forEach(function(status) {
                if (status !== selectedStatus && currentMappings[selectedType][status].indexOf(stage) > -1) {
                    existingStatus = status;
                }
            });
            
            if (existingStatus) {
                // Remove from existing status first (within this type only)
                var existingStages = currentMappings[selectedType][existingStatus];
                var existingIndex = existingStages.indexOf(stage);
                if (existingIndex > -1) {
                    existingStages.splice(existingIndex, 1);
                    if (existingStages.length === 0) {
                        delete currentMappings[selectedType][existingStatus];
                    }
                    
                }
            }
            
            if (!currentMappings[selectedType][selectedStatus]) {
                currentMappings[selectedType][selectedStatus] = [];
                
            }
            
            var stages = currentMappings[selectedType][selectedStatus];
            var index = stages.indexOf(stage);
            
            if (index > -1) {
                stages.splice(index, 1);
                
                if (stages.length === 0) {
                    delete currentMappings[selectedType][selectedStatus];
                    
                }
            } else {
                stages.push(stage);
                
                if (existingStatus) {
                    
                }
            }
            
            
            updateStageButtonStyles();
            try {
                
                renderCurrentMappings();
                
                
                // Trigger real-time update of sync indicators
                triggerSyncIndicatorUpdate();
            } catch (e) {
                
            }
        }
        
        function renderCurrentMappings() {
            var containerId = selectedType + 'CurrentMappings';
            var container = document.getElementById(containerId);
            
            if (!container) return;
            
            container.innerHTML = '';
            var mappings = currentMappings[selectedType] || {};
            
            
            if (Object.keys(mappings).length === 0) {
                container.innerHTML = '<p class="text-xs text-gray-500">No mappings yet</p>';
                
                return;
            }
            
            Object.keys(mappings).sort().forEach(function(status) {
                var stages = mappings[status] || [];
                
                if (stages.length > 0) {
                    var mappingDiv = document.createElement('div');
                    mappingDiv.className = 'mb-2 p-2 bg-white rounded border text-xs';
                    
                    var statusDiv = document.createElement('div');
                    statusDiv.className = 'font-medium text-blue-700 mb-1';
                    statusDiv.textContent = status;
                    
                    var stagesDiv = document.createElement('div');
                    stagesDiv.className = 'text-gray-600';
                    stagesDiv.textContent = '← ' + stages.join(', ');
                    
                    var removeBtn = document.createElement('button');
                    removeBtn.className = 'text-red-500 hover:text-red-700 float-right';
                    removeBtn.textContent = '×';
                    removeBtn.onclick = function() {
                        delete currentMappings[selectedType][status];
                        renderCurrentMappings();
                        updateStageButtonStyles();
                    };
                    
                    mappingDiv.appendChild(removeBtn);
                    mappingDiv.appendChild(statusDiv);
                    mappingDiv.appendChild(stagesDiv);
                    container.appendChild(mappingDiv);
                    
                }
            });
            
            
        }

    function getCurrentMappingsAsArray() {
        var result = [];
        Object.keys(currentMappings).forEach(function(type) {
            Object.keys(currentMappings[type]).forEach(function(status) {
                var stages = currentMappings[type][status] || [];
                if (stages.length > 0) {
                    // Convert back to stage->statuses format for backend compatibility
                    stages.forEach(function(stage) {
                        var existing = result.find(function(m) { return m.stage === stage; });
                        if (existing) {
                            if (existing.expectedStatuses.indexOf(status) === -1) {
                                existing.expectedStatuses.push(status);
                            }
                        } else {
                            result.push({
                                stage: stage,
                                expectedStatuses: [status]
                            });
                        }
                    });
                }
            });
        });
        return result;
    }

    // Legacy functions removed - now using visual mapping interface
    // (All DOM wiring is in _initConfigUI(), called from loadConfigData())

    // Function to trigger real-time sync indicator updates
    function triggerSyncIndicatorUpdate() {
        const token = checkAuth();
        if (!token) return;
        
        // Try to post message to parent window/iframe
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'mappingChanged',
                    data: currentMappings
                }, '*');
                
            }
        } catch (e) {
            
        }
    }
