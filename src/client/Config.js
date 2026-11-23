    // --- Place this function near the top of the <script> tag ---
    function renderLinks(links) {
        var listEl = document.getElementById('linksList');
        if (!listEl) return; // Guard clause for when running in dashboard context if elements aren't ready
        
        listEl.replaceChildren();
        if (!links || links.length === 0) {
            var empty = document.createElement('p');
            empty.className = 'text-sm text-[#6F7171] py-2';
            empty.textContent = 'No links configured yet.';
            listEl.appendChild(empty);
            return;
        }

        links.forEach(function(link, index) {
            var linkEl = document.createElement('div');
            linkEl.className = 'flex items-center justify-between gap-4 py-3';
            // Store the full URL in a data attribute
            linkEl.setAttribute('data-url', link.url);

            var info = document.createElement('div');
            info.className = 'min-w-0';

            var titleSpan = document.createElement('span');
            titleSpan.className = 'font-medium text-sm text-black block truncate';
            titleSpan.textContent = link.title;

            var urlP = document.createElement('p');
            urlP.className = 'text-xs text-[#6F7171] truncate mt-0.5';
            urlP.textContent = link.url;

            info.appendChild(titleSpan);
            info.appendChild(urlP);

            var removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.setAttribute('data-index', String(index));
            removeBtn.className = 'remove-link-btn config-link-action shrink-0';
            removeBtn.textContent = 'Remove';

            linkEl.appendChild(info);
            linkEl.appendChild(removeBtn);
            listEl.appendChild(linkEl);
        });
    }

    function handleConfigFailure_(error) {
        var statusEl = document.getElementById('configStatus');
        var saveBtn = document.getElementById('saveConfigBtn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save changes';
        }
        if (statusEl) {
            statusEl.textContent = 'Error: ' + error.message;
            setConfigStatusTone_(statusEl, 'error');
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
    var availableStatuses = {
        epic: [],
        story: [],
        bug: []
    };
    var workbookUsers = [];
    var editingUserIndex = null;

    function getStatusesByIssueType_(projects) {
        var statuses = {
            epic: new Set(),
            story: new Set(),
            bug: new Set()
        };

        (projects || []).forEach(function(project) {
            var issueType = String(project['Issue Type'] || '').trim().toLowerCase();
            if (!Object.prototype.hasOwnProperty.call(statuses, issueType)) return;

            var status = String(project.Status || '').trim();
            if (status) statuses[issueType].add(status);
        });

        return {
            epic: Array.from(statuses.epic).sort(),
            story: Array.from(statuses.story).sort(),
            bug: Array.from(statuses.bug).sort()
        };
    }

    function syncConfigFooter_(targetSelector) {
        var isCapacity = targetSelector === '#tab-developer-capacity';
        var isUsers = targetSelector === '#tab-users';
        var isWorkspace = !isCapacity && !isUsers;

        var toggle = function(id, visible) {
            var el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', !visible);
        };

        toggle('saveConfigBtn', isWorkspace);
        toggle('configStatus', isWorkspace);
        toggle('save-developer-capacity', isCapacity);
        toggle('developer-capacity-status', isCapacity);
        toggle('save-users', isUsers);
        toggle('users-status', isUsers);
    }

    function setUsersStatus_(message, tone) {
        var status = document.getElementById('users-status');
        if (!status) return;
        status.textContent = message;
        setConfigStatusTone_(status, tone);
    }

    function setConfigStatusTone_(status, tone) {
        status.classList.remove('config-status-success', 'config-status-error', 'config-status-neutral');
        status.classList.add('config-status-' + tone);
    }

    function closeUserEditor_() {
        editingUserIndex = null;
        var panel = document.getElementById('user-editor-panel');
        var err = document.getElementById('user-editor-error');
        if (panel) panel.classList.add('hidden');
        if (err) err.textContent = '';
    }

    function openUserEditor_(index) {
        var panel = document.getElementById('user-editor-panel');
        if (!panel) return;
        editingUserIndex = typeof index === 'number' ? index : null;
        var user = editingUserIndex !== null ? workbookUsers[editingUserIndex] : {
            id: '',
            username: '',
            email: '',
            displayName: '',
            role: 'user',
            isActive: true,
            microsoftObjectId: ''
        };

        var titleEl = document.getElementById('user-editor-title');
        if (titleEl) titleEl.textContent = editingUserIndex !== null ? 'Edit user' : 'Add user';

        var displayNameEl = document.getElementById('user-edit-display-name');
        var usernameEl = document.getElementById('user-edit-username');
        var emailEl = document.getElementById('user-edit-email');
        var roleEl = document.getElementById('user-edit-role');
        var objectIdEl = document.getElementById('user-edit-object-id');
        var activeEl = document.getElementById('user-edit-active');
        var errEl = document.getElementById('user-editor-error');

        if (displayNameEl) displayNameEl.value = user.displayName || '';
        if (usernameEl) usernameEl.value = user.username || '';
        if (emailEl) emailEl.value = user.email || '';
        if (objectIdEl) objectIdEl.value = user.microsoftObjectId || '';
        if (activeEl) activeEl.checked = user.isActive === undefined ? true : user.isActive === true;
        if (errEl) errEl.textContent = '';

        if (roleEl) {
            roleEl.replaceChildren();
            var roles = ['user', 'admin'];
            var existingRole = String(user.role || '').trim().toLowerCase();
            if (existingRole && roles.indexOf(existingRole) === -1) roles.push(existingRole);
            roles.forEach(function(role) {
                var option = document.createElement('option');
                option.value = role;
                option.textContent = role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, ' ');
                roleEl.appendChild(option);
            });
            roleEl.value = existingRole || 'user';
        }

        panel.classList.remove('hidden');
        if (displayNameEl) displayNameEl.focus();
    }

    function applyUserEditor_() {
        var panel = document.getElementById('user-editor-panel');
        if (!panel || panel.classList.contains('hidden')) return true;

        var displayNameEl = document.getElementById('user-edit-display-name');
        var usernameEl = document.getElementById('user-edit-username');
        var emailEl = document.getElementById('user-edit-email');
        var roleEl = document.getElementById('user-edit-role');
        var objectIdEl = document.getElementById('user-edit-object-id');
        var activeEl = document.getElementById('user-edit-active');
        var errEl = document.getElementById('user-editor-error');

        var existing = editingUserIndex !== null ? workbookUsers[editingUserIndex] : null;
        var isNew = !existing || !existing.id;
        var username = usernameEl ? usernameEl.value.trim() : '';
        var displayName = (displayNameEl ? displayNameEl.value.trim() : '') || username;
        var email = emailEl ? emailEl.value.trim() : '';
        var role = roleEl ? roleEl.value.trim().toLowerCase() : 'user';
        var microsoftObjectId = objectIdEl ? objectIdEl.value.trim() : '';
        var isActive = activeEl ? activeEl.checked : true;

        var showError = function(msg, focusEl) {
            if (errEl) errEl.textContent = msg;
            if (focusEl) focusEl.focus();
            return false;
        };

        if (!username || username.length > 128) {
            return showError('Enter a username up to 128 characters.', usernameEl);
        }
        if ((isNew && !email) || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            return showError('Enter a valid email address.', emailEl);
        }
        if (isNew && !microsoftObjectId) {
            return showError('New users require a Microsoft Object ID.', objectIdEl);
        }
        if (microsoftObjectId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(microsoftObjectId)) {
            return showError('Enter a valid 36-character Microsoft Object ID.', objectIdEl);
        }

        var updated = {
            id: existing ? (existing.id || '') : '',
            username: username,
            email: email,
            displayName: displayName,
            role: role || 'user',
            isActive: isActive,
            microsoftObjectId: microsoftObjectId
        };

        if (editingUserIndex !== null) {
            workbookUsers[editingUserIndex] = updated;
        } else {
            workbookUsers.push(updated);
        }

        closeUserEditor_();
        renderUsers(workbookUsers);
        setUsersStatus_('Unsaved changes. Select Save users to commit.', 'neutral');
        return true;
    }

    function renderUsers(users) {
        var body = document.getElementById('users-body');
        if (!body) return;
        workbookUsers = Array.isArray(users) ? users.map(function(user) {
            return {
                id: user.id == null ? '' : String(user.id),
                username: user.username || '',
                email: user.email || '',
                displayName: user.displayName || '',
                role: String(user.role || 'user').trim().toLowerCase(),
                isActive: user.isActive === undefined ? true : user.isActive === true,
                microsoftObjectId: user.microsoftObjectId || ''
            };
        }) : [];
        body.replaceChildren();

        if (!workbookUsers.length) {
            var emptyRow = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.colSpan = 4;
            emptyCell.className = 'px-4 py-6 text-sm text-[#6F7171]';
            emptyCell.textContent = 'No users found.';
            emptyRow.appendChild(emptyCell);
            body.appendChild(emptyRow);
            return;
        }

        workbookUsers.forEach(function(user, index) {
            var row = document.createElement('tr');
            row.className = 'hover:bg-[#F6F6F6] transition-colors';

            var userCell = document.createElement('td');
            userCell.className = 'px-4 py-3';
            var nameEl = document.createElement('div');
            nameEl.className = 'font-medium text-black';
            nameEl.textContent = user.displayName || user.username;
            var metaEl = document.createElement('div');
            metaEl.className = 'text-xs text-[#6F7171] mt-0.5';
            metaEl.textContent = user.email ? (user.username && user.username !== user.email ? user.email + ' · ' + user.username : user.email) : user.username;
            userCell.appendChild(nameEl);
            userCell.appendChild(metaEl);
            row.appendChild(userCell);

            var roleCell = document.createElement('td');
            roleCell.className = 'px-4 py-3';
            var roleBadge = document.createElement('span');
            roleBadge.className = 'config-badge config-badge-role';
            var roleLabel = user.role || 'user';
            roleBadge.textContent = roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1).replace(/_/g, ' ');
            roleCell.appendChild(roleBadge);
            row.appendChild(roleCell);

            var statusCell = document.createElement('td');
            statusCell.className = 'px-4 py-3';
            var statusBadge = document.createElement('span');
            statusBadge.className = 'config-badge ' + (user.isActive ? 'config-badge-active' : 'config-badge-inactive');
            statusBadge.textContent = user.isActive ? 'Active' : 'Inactive';
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            var actionCell = document.createElement('td');
            actionCell.className = 'px-4 py-3 text-right';
            var editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'config-link-action';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', function() {
                openUserEditor_(index);
            });
            actionCell.appendChild(editBtn);
            row.appendChild(actionCell);

            body.appendChild(row);
        });
    }

    function loadUsers() {
        closeUserEditor_();
        setUsersStatus_('Loading users…', 'neutral');
        return callServer('getUsers', []).then(function(users) {
            if (!Array.isArray(users)) throw new Error('The workbook returned an invalid user list.');
            renderUsers(users);
            setUsersStatus_(users.length + (users.length === 1 ? ' user loaded.' : ' users loaded.'), 'neutral');
        }).catch(function(error) {
            setUsersStatus_('Could not load users: ' + getErrorMessage_(error), 'error');
        });
    }

    function saveUsers(event) {
        event.preventDefault();
        if (!applyUserEditor_()) return;
        var button = document.getElementById('save-users');

        if (button) button.disabled = true;
        setUsersStatus_('Saving users…', 'neutral');
        callServer('saveUsers', [workbookUsers]).then(function(response) {
            if (!response || response.status !== 'success') {
                throw new Error(response && response.message ? response.message : 'Could not save users.');
            }
            return callServer('getUsers', []).then(function(savedUsers) {
                renderUsers(savedUsers);
                setUsersStatus_('Users saved.', 'success');
            });
        }).catch(function(error) {
            setUsersStatus_(getErrorMessage_(error), 'error');
        }).finally(function() {
            if (button) button.disabled = false;
        });
    }

    // Expose globally so Dashboard can call it
    var _configUiInitialized = false;
    function _initConfigUI() {
        if (_configUiInitialized) return;
        _configUiInitialized = true;

        // Sidebar navigation toggling between panels + context-aware footer
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
                document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.add('hidden'); });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                var targetSelector = btn.dataset.target;
                var target = document.querySelector(targetSelector);
                if (target) target.classList.remove('hidden');
                if (targetSelector === '#tab-developer-capacity' && typeof renderDeveloperCapacityConfig === 'function') {
                    var capBody = document.getElementById('developer-capacity-body');
                    if (capBody && !capBody.querySelector('input[data-developer]')) {
                        renderDeveloperCapacityConfig();
                    }
                }
                syncConfigFooter_(targetSelector);
            });
        });

        var usersForm = document.getElementById('users-form');
        if (usersForm) usersForm.addEventListener('submit', saveUsers);
        var addUserButton = document.getElementById('add-user-row');
        if (addUserButton) addUserButton.addEventListener('click', function() {
            openUserEditor_(null);
        });
        var applyUserButton = document.getElementById('user-editor-apply');
        if (applyUserButton) applyUserButton.addEventListener('click', applyUserEditor_);
        var cancelUserButton = document.getElementById('user-editor-cancel');
        if (cancelUserButton) cancelUserButton.addEventListener('click', closeUserEditor_);

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
                if (statusEl) { statusEl.textContent = ''; setConfigStatusTone_(statusEl, 'neutral'); }

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
                    closedStatuses: (document.getElementById('closedStatuses') ? document.getElementById('closedStatuses').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    pastSprintClosedStages: (document.getElementById('pastSprintClosedStages') ? document.getElementById('pastSprintClosedStages').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    pastDueExemptStages: (document.getElementById('pastDueExemptStages') ? document.getElementById('pastDueExemptStages').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    // Legacy key retained for compatibility with existing config pipeline
                    inProgressStatuses: (document.getElementById('inProgressStatuses') ? document.getElementById('inProgressStatuses').value : '').split('\n').map(function(s) { return s.trim(); }).filter(Boolean),
                    helpfulLinks: linksData,
                    stageStatusMappings: getCurrentMappingsAsArray()
                };

                callServer('saveConfiguration', [optionsData]).then(function(response) {
                        if (response.status === 'success') {
                            if (statusEl) { statusEl.textContent = response.message || 'Configuration saved.'; setConfigStatusTone_(statusEl, 'success'); }
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
                        saveBtn.textContent = 'Save changes';
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
        var userProfile = window.ProjectHubExcel && window.ProjectHubExcel.user();
        var isAdmin = Boolean(userProfile && userProfile.role === 'admin');
        document.querySelectorAll('[data-admin-only]').forEach(function(tab) {
            tab.hidden = !isAdmin;
            tab.classList.toggle('hidden', !isAdmin);
        });
        var activeTab = document.querySelector('.tab-btn.active');
        if (!isAdmin && activeTab && activeTab.hasAttribute('data-admin-only')) {
            var defaultTab = document.querySelector('.tab-btn[data-target="#tab-dropdowns"]');
            if (defaultTab) defaultTab.click();
        } else {
            syncConfigFooter_(activeTab ? activeTab.dataset.target : '#tab-dropdowns');
        }
        if (isAdmin) {
            if (typeof renderDeveloperCapacityConfig === 'function') renderDeveloperCapacityConfig();
            loadUsers();
        }

        var statusEl = document.getElementById('configStatus');
        if (statusEl) {
            statusEl.textContent = 'Loading configuration…';
            setConfigStatusTone_(statusEl, 'neutral');
        }

        callServer('getConfigData', []).then(onConfigDataLoaded, handleConfigFailure_);
    };

    function renderKpiStageSelector(groupedStages, selectedStages) {
        var container = document.getElementById('kpiStageSelector');
        if (!container) {
            console.error('KPI Stage Selector container not found!');
            return;
        }
        
        container.innerHTML = '';
        container.className = 'w-full rounded-lg border border-[#D8DADA] p-3 max-h-56 overflow-y-auto bg-white';
        
        var selectedSet = new Set(selectedStages || []);
        var hasAnyStages = false;

        // Helper to render a group
        var renderGroup = function(title, stages) {
            if (!stages || stages.length === 0) return;
            hasAnyStages = true;

            var groupHeader = document.createElement('div');
            groupHeader.className = 'text-xs font-semibold text-[#6F7171] uppercase tracking-wider mt-3 first:mt-0 mb-1.5 pb-1 border-b border-[#D8DADA]';
            groupHeader.textContent = title;
            container.appendChild(groupHeader);

            stages.forEach(function(stage) {
                var label = document.createElement('label');
                label.className = 'flex items-center space-x-2 p-1.5 hover:bg-[#F6F6F6] rounded cursor-pointer';
                
                var checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = stage;
                checkbox.checked = selectedSet.has(stage);
                checkbox.className = 'form-checkbox h-4 w-4 text-black rounded border-[#D8DADA]';
                
                var span = document.createElement('span');
                span.textContent = stage;
                span.className = 'text-sm text-black truncate';
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
            container.innerHTML = '<p class="text-sm text-[#6F7171] p-1">No project stages defined. Add options to the Project stages lists above.</p>';
        }
    }

    function onConfigDataLoaded(data) {
        try {
            
            var statusEl = document.getElementById('configStatus');
            if (statusEl) {
                statusEl.textContent = 'Loaded configuration payload.';
                setConfigStatusTone_(statusEl, 'neutral');
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
        if (data.config.closedStatuses) {
            setVal('closedStatuses', data.config.closedStatuses.join('\n'));
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
        
        
        
        // Update segmented tab buttons
        document.querySelectorAll('.mapping-tab-btn').forEach(function(btn) {
            var isMatch = btn.getAttribute('data-type') === type;
            btn.classList.toggle('active', isMatch);
            btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
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
                        
                        
                        // Keep Jira statuses scoped to their issue type.
                        availableStatuses = getStatusesByIssueType_(projects);
                        
                        // Get stages from configuration options, not from project data
                        availableStages.epic = getConfigOptionsList('epicProjectStageOptions');
                        availableStages.story = getConfigOptionsList('storyProjectStageOptions'); 
                        availableStages.bug = getConfigOptionsList('bugProjectStageOptions');
                        
                        
                        
                        // Render the updated lists for current tab
                        
                        
                        // Always initialize the epic tab when data is first loaded
                        
                        switchMappingTab('epic');
                        
                        // Update status
                        var statusEl = document.getElementById('refreshDataStatus');
                        if (statusEl) {
                            var totalStages = availableStages.epic.length + availableStages.story.length + availableStages.bug.length;
                            var totalStatuses = new Set(
                                availableStatuses.epic.concat(availableStatuses.story, availableStatuses.bug)
                            ).size;
                            statusEl.textContent = 'Found ' + totalStatuses + ' statuses and ' + totalStages + ' total stages';
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
            
            (availableStatuses[selectedType] || []).forEach(function(status) {
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
