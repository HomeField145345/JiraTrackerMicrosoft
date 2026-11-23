/**
 * @file ui.js
 * @description Handles all UI rendering and DOM manipulation.
 */

// --- HELPER FUNCTION ---
function getClosedMappings() {
    var cfg = (APP_STATE && APP_STATE.allData && APP_STATE.allData.config) || {};
    var stages = Array.isArray(cfg.closedProjectStages) ? cfg.closedProjectStages : ['In Production', 'Production', 'Prod', 'Fixed', 'Done', 'Canceled'];
    var statuses = Array.isArray(cfg.closedStatuses) ? cfg.closedStatuses : ['Fixed', 'Closed', 'Done', 'Resolved', 'Ready for Production', 'In Production'];
    // Normalize for comparison
    return {
        stages: stages.map(function (s) { return (s || '').toLowerCase().trim(); }),
        statuses: statuses.map(function (s) { return (s || '').toLowerCase().trim(); })
    };
}

function getPastDueExemptStages() {
    var cfg = (APP_STATE && APP_STATE.allData && APP_STATE.allData.config) || {};
    var stages = Array.isArray(cfg.pastDueExemptStages) ? cfg.pastDueExemptStages : [];
    return stages.map(function (s) { return (s || '').toLowerCase().trim(); });
}

function isStoryObjectClosed(story) {
    var projectStage = (story['Project Stage'] || '').toLowerCase().trim();
    var status = (story['Status'] || '').toLowerCase().trim();
    var maps = getClosedMappings();
    return maps.stages.indexOf(projectStage) !== -1 || maps.statuses.indexOf(status) !== -1;
}

function escapeHtml_(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeCssColor_(value) {
    var color = String(value || '').trim();
    if (!color) return '';

    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color;
    if (/^(rgb|rgba)\((\s*\d+\s*,){2,3}\s*(\d+|0?\.\d+|1)\s*\)$/i.test(color)) return color;
    if (/^[a-z]{3,20}$/i.test(color)) return color;

    return '';
}

function formatJiraRichText_(rawValue) {
    var normalized = String(rawValue || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .trim();

    // Some imports flatten Jira wiki text into one long line. Restore likely block boundaries.
    normalized = normalized
        .replace(/\s+----\s+/g, '\n----\n')
        .replace(/\s+(h[1-6]\.\s+)/gi, '\n$1')
        .replace(/\s+([#]{1,6}\s+)/g, '\n$1');
    if (!normalized) {
        return '<p>No description provided</p>';
    }

    var html = escapeHtml_(normalized);

    // Jira color markup: {color:#ff0000}Text{color}
    html = html.replace(/\{color:([^\}]+)\}([\s\S]*?)\{color\}/gi, function (_, colorValue, content) {
        var safeColor = sanitizeCssColor_(colorValue);
        if (!safeColor) return content;
        return '<span style="color:' + safeColor + ';">' + content + '</span>';
    });

    // Jira bold variant: {*}Text{*}
    html = html.replace(/\{\*\}([\s\S]*?)\{\*\}/g, '<strong>$1</strong>');

    // Jira quote block: {quote}...{quote}
    html = html.replace(/\{quote\}([\s\S]*?)\{quote\}/gi, function (_, content) {
        return '<blockquote>' + String(content || '').replace(/\n/g, '<br>') + '</blockquote>';
    });

    // Jira headings: h1. Heading / h1 Heading (allow leading spaces)
    html = html.replace(/^\s*h([1-6])\.?\s+(.+)$/gmi, function (_, level, content) {
        return '<div class="jira-wiki-h' + level + '">' + content + '</div>';
    });

    // Support escaped HTML headings from imports: &lt;h2&gt;Title&lt;/h2&gt;
    html = html.replace(/&lt;h([1-6])(?:\s+[^&]*)&gt;([\s\S]*?)&lt;\/h\1&gt;/gi, function (_, level, content) {
        return '<div class="jira-wiki-h' + level + '">' + content.trim() + '</div>';
    });

    // Inline code: {{code}}
    html = html.replace(/\{\{([\s\S]+?)\}\}/g, '<code>$1</code>');

    // Jira horizontal divider
    html = html.replace(/^-{4,}$/gm, '<hr class="jira-wiki-hr" />');

    // Links: [Text|https://example.com]
    html = html.replace(/\[([^\|\]\n]+)\|((?:https?:\/\/)[^\]\s]+)\]/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Bold / italic in Jira-style wiki text
    html = html.replace(/\*(?!\s)([^*\n]+?)\*/g, '<strong>$1</strong>');
    html = html.replace(/_(?!\s)([^_\n]+?)_/g, '<em>$1</em>');

    // Bare URLs
    html = html.replace(/(^|[\s(])((https?:\/\/)[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');

    // Build simple block-level structure with list support
    var lines = html.split('\n');
    var out = [];
    var inUl = false;
    var inOl = false;
    var inTable = false;
    var tableRows = [];

    function parseJiraTableRow_(line, delimiter) {
        var parts = line.split(delimiter).map(function (part) {
            return String(part || '').trim();
        });

        // Remove empty edges caused by leading/trailing delimiters
        if (parts.length && parts[0] === '') parts.shift();
        if (parts.length && parts[parts.length - 1] === '') parts.pop();

        return parts;
    }

    function renderTableHtml_(rows) {
        if (!rows || !rows.length) return '';

        var hasHeader = rows[0].isHeader;
        var headerHtml = '';
        var bodyStart = 0;

        if (hasHeader) {
            headerHtml = '<thead><tr>' + rows[0].cells.map(function (cell) {
                return '<th>' + cell + '</th>';
            }).join('') + '</tr></thead>';
            bodyStart = 1;
        }

        var bodyRows = rows.slice(bodyStart).map(function (row) {
            return '<tr>' + row.cells.map(function (cell) {
                return '<td>' + cell + '</td>';
            }).join('') + '</tr>';
        }).join('');

        if (!bodyRows && hasHeader) {
            bodyRows = '<tr>' + rows[0].cells.map(function () { return '<td>—</td>'; }).join('') + '</tr>';
        }

        return '<div class="jira-wiki-table-wrap"><table class="jira-wiki-table">' +
            headerHtml +
            '<tbody>' + bodyRows + '</tbody>' +
            '</table></div>';
    }

    function closeLists() {
        if (inUl) {
            out.push('</ul>');
            inUl = false;
        }
        if (inOl) {
            out.push('</ol>');
            inOl = false;
        }
    }

    function closeTable() {
        if (!inTable) return;
        out.push(renderTableHtml_(tableRows));
        tableRows = [];
        inTable = false;
    }

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var bulletMatch = line.match(/^\*+\s+(.+)$/);
        var numberMatch = line.match(/^#+\s+(.+)$/);
        var quoteMatch = line.match(/^bq\.\s+(.+)$/i);
        var altQuoteMatch = line.match(/^>\s?(.+)$/);
        var tableHeaderMatch = line.match(/^\|\|.+\|\|$/);
        var tableRowMatch = !tableHeaderMatch && line.match(/^\|.+\|$/);

        if (tableHeaderMatch || tableRowMatch) {
            closeLists();
            if (!inTable) {
                inTable = true;
            }

            var isHeader = !!tableHeaderMatch;
            var delimiter = isHeader ? '||' : '|';
            var cells = parseJiraTableRow_(line, delimiter);
            if (cells.length) {
                tableRows.push({ isHeader: isHeader, cells: cells });
            }
            continue;
        }

        closeTable();

        if (bulletMatch) {
            if (inOl) {
                out.push('</ol>');
                inOl = false;
            }
            if (!inUl) {
                out.push('<ul>');
                inUl = true;
            }
            out.push('<li>' + bulletMatch[1] + '</li>');
            continue;
        }

        if (numberMatch) {
            if (inUl) {
                out.push('</ul>');
                inUl = false;
            }
            if (!inOl) {
                out.push('<ol>');
                inOl = true;
            }
            out.push('<li>' + numberMatch[1] + '</li>');
            continue;
        }

        closeLists();

        if (!line.trim()) continue;
        if (/^<div class="jira-wiki-h[1-6]">/.test(line) || /^<blockquote>/.test(line) || /^<hr class="jira-wiki-hr"\s*\/>$/.test(line)) {
            out.push(line);
        } else if (quoteMatch) {
            out.push('<blockquote>' + quoteMatch[1] + '</blockquote>');
        } else if (altQuoteMatch) {
            out.push('<blockquote>' + altQuoteMatch[1] + '</blockquote>');
        } else {
            out.push('<p>' + line + '</p>');
        }
    }

    closeLists();
    closeTable();
    return out.join('');
}

function splitVersionValues_(rawValue) {
    var raw = String(rawValue || '').trim();
    if (!raw) return [];

    // Jira exports sometimes include structured values like
    // "id=123, name=v1.2, ...". Prefer extracting the `name=` values when present.
    var extractedNames = [];
    var seenNames = {};
    raw.replace(/name\s*=\s*("[^"]+"|'[^']+'|[^,;\]\}\n]+)/ig, function (_, namePart) {
        var cleaned = String(namePart || '').trim().replace(/^['"]|['"]$/g, '');
        var key = cleaned.toLowerCase();
        if (!cleaned || seenNames[key]) return '';
        seenNames[key] = true;
        extractedNames.push(cleaned);
        return '';
    });

    if (extractedNames.length) {
        return extractedNames;
    }

    var seen = {};
    var values = [];
    raw
        .split(/[\n,;|]+/)
        .map(function (part) { return String(part || '').trim(); })
        .filter(Boolean)
        .forEach(function (v) {
            var key = v.toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            values.push(v);
        });

    return values;
}

function compareVersionLike_(a, b) {
    var sa = String(a || '').trim();
    var sb = String(b || '').trim();

    var numsA = sa.match(/\d+/g);
    var numsB = sb.match(/\d+/g);

    if (numsA && numsB) {
        var len = Math.max(numsA.length, numsB.length);
        for (var i = 0; i < len; i++) {
            var na = parseInt(numsA[i] || '0', 10);
            var nb = parseInt(numsB[i] || '0', 10);
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
    } else if (numsA && !numsB) {
        return 1;
    } else if (!numsA && numsB) {
        return -1;
    }

    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

function getLatestFixVersionValue_(values) {
    if (!values || !values.length) return '';

    var latest = values[0];
    for (var i = 1; i < values.length; i++) {
        if (compareVersionLike_(values[i], latest) >= 0) {
            latest = values[i];
        }
    }

    return latest;
}

function extractSprintValues_(rawValue) {
    var raw = String(rawValue || '');
    if (!raw) return [];

    var matches = raw.match(/Sprint\s*\d+/ig);
    if (!matches || !matches.length) {
        var single = raw.trim();
        return single ? [single] : [];
    }

    var unique = {};
    var values = [];
    matches.forEach(function (m) {
        var normalized = String(m || '').replace(/\s+/g, ' ').trim();
        var key = normalized.toLowerCase();
        if (!normalized || unique[key]) return;
        unique[key] = true;
        values.push(normalized);
    });

    return values;
}

function getLatestSprintValue_(values) {
    if (!values || !values.length) return '';

    var bestIndex = -1;
    var bestNumber = -1;

    for (var i = 0; i < values.length; i++) {
        var formatted = (typeof formatSprint === 'function') ? formatSprint(values[i]) : null;
        var candidate = formatted || values[i];
        var match = String(candidate).match(/Sprint\s*(\d+)/i);
        if (!match) continue;

        var n = parseInt(match[1], 10);
        if (!isNaN(n) && n >= bestNumber) {
            bestNumber = n;
            bestIndex = i;
        }
    }

    if (bestIndex !== -1) {
        return values[bestIndex];
    }

    return values[values.length - 1];
}

function buildLatestWithHistoryHtml_(rawValue, options) {
    options = options || {};
    var values = options.valuesResolver ? options.valuesResolver(rawValue) : splitVersionValues_(rawValue);
    if (!values.length) return '—';

    var latestRaw = options.latestResolver ? options.latestResolver(values) : values[values.length - 1];
    var displayFormatter = options.displayFormatter || function (v) { return v; };
    var label = options.historyLabel || 'Other values';

    var latestDisplay = displayFormatter(latestRaw || '') || '—';
    var others = values.filter(function (v) { return v !== latestRaw; });

    if (!others.length) {
        return escapeHtml_(latestDisplay);
    }

    var historyLines = others.map(function (v) { return '• ' + displayFormatter(v); });
    var tooltip = label + ':\n' + historyLines.join('\n');

    return escapeHtml_(latestDisplay) +
        ' <span class="text-gray-400" style="cursor:help;" title="' + escapeHtml_(tooltip) + '" aria-label="Show other values">ⓘ</span>';
}

// --- MODAL UI ---
function openModal(title, type) {
    type = type || 'task';
    var modalHost = type === 'import' ? $('#importModalHost') : $('#modalHost');
    if (type === 'task') {
        $('#modalTitle').textContent = title || 'New Task';
    }
    modalHost.style.display = 'flex';
    modalHost.setAttribute('aria-hidden', 'false');

    // Use TimerManager for better memory management
    TimerManager.setTimeout(function () {
        var firstInput = modalHost.querySelector('input, select');
        if (firstInput) firstInput.focus();
    }, 50, 'modal_focus');
}

function closeModal(type) {
    type = type || 'task';
    var modalHost = type === 'import' ? $('#importModalHost') : $('#modalHost');
    modalHost.style.display = 'none';
    modalHost.setAttribute('aria-hidden', 'true');
    if (type === 'task') {
        APP_STATE.currentEditId = null;
        var form = modalHost.querySelector('.grid');
        if (form) {
            var elements = form.querySelectorAll('input, select, textarea');
            for (var i = 0; i < elements.length; i++) {
                if (elements[i].tagName === 'SELECT') {
                    elements[i].selectedIndex = 0;
                } else {
                    elements[i].value = '';
                }
            }
        }
    }
}

// --- STORY INFO MODAL ---
function openStoryInfoModal(jiraId) {
    // Find the story data
    var story = null;
    if (APP_STATE.allData && APP_STATE.allData.projects) {
        story = APP_STATE.allData.projects.find(function (p) {
            return p['Jira #'] === jiraId;
        });
    }

    if (!story) {
        console.error('Story not found:', jiraId);
        return;
    }

    // Populate modal with story data
    $('#storyInfoJiraNumber').innerHTML = '<a href="https://onejira.verizon.com/browse/' + jiraId + '" target="_blank" class="text-blue-600 hover:underline">' + jiraId + '</a>';
    $('#storyInfoSummary').textContent = story.Summary || '—';
    var description = story['Description'] ||
        story['Issue Description'] ||
        story['description'] ||
        'No description provided';
    $('#storyInfoDescription').innerHTML = formatJiraRichText_(description);
    $('#storyInfoStatus').textContent = story.Status || '—';
    $('#storyInfoType').textContent = story['Issue Type'] || '—';
    $('#storyInfoPriority').textContent = story.Priority || '—';
    $('#storyInfoAssignee').textContent = story.Assignee || '—';
    $('#storyInfoSprint').textContent = story.sprint || '—';
    $('#storyInfoStoryPoints').textContent = story['Story Points'] || '—';

    // Populate Labels
    var labelsSection = $('#storyInfoLabelsSection');
    var labelsEl = $('#storyInfoLabels');
    var rawLabels = story['Labels'] || story['labels'] || '';
    if (rawLabels && String(rawLabels).trim() !== '') {
        var labelList = String(rawLabels).split(/[,;]+/).map(function (l) { return l.trim(); }).filter(function (l) { return l !== ''; });
        labelsEl.innerHTML = labelList.map(function (l) {
            return '<span style="display:inline-block;background:#e0e7ff;color:#3730a3;border-radius:4px;padding:1px 8px;margin:2px 3px 2px 0;font-size:0.8em;font-weight:500;">' + l.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
        }).join('');
        if (labelsSection) labelsSection.style.display = '';
    } else {
        labelsEl.textContent = '—';
        if (labelsSection) labelsSection.style.display = '';
    }

    // Format acceptance criteria
    // Try multiple possible field names for Acceptance Criteria (including common typo)
    var acceptanceCriteria = story['Acceptance Criteria'] ||
        story['Acceptance Critera'] || // common typo (missing 'i')
        story['Acceptance Criteria '] || // with trailing space
        story['AcceptanceCriteria'] || // no space
        story['acceptance criteria'] || // lowercase
        story['acceptance_criteria'] || // underscore
        'No acceptance criteria defined';

    $('#storyInfoAcceptanceCriteria').textContent = acceptanceCriteria;

    // Store the current jiraId for saving later
    $('#storyInfoModal').dataset.currentJiraId = jiraId;

    // Populate Project Artifacts (epics only)
    var issueType = String(story['Issue Type'] || '').toLowerCase();
    var artifactsSection = $('#storyInfoArtifactsSection');
    if (artifactsSection) {
        if (issueType === 'epic') {
            artifactsSection.style.display = '';
            populateArtifactsChecklist_(jiraId, story);
        } else {
            artifactsSection.style.display = 'none';
        }
    }

    // Format dates
    var formatDate = function (dateStr) {
        if (!dateStr) return '—';
        try {
            var date = parseServerDate(dateStr);
            return date ? formatDateTimeLocal(dateStr) : '—';
        } catch (e) {
            return dateStr;
        }
    };

    $('#storyInfoCreated').textContent = formatDate(story.Created);
    $('#storyInfoUpdated').textContent = formatDate(story.Updated);

    // Show modal
    var modal = $('#storyInfoModal');
    var isAlreadyOpen = modal.style.display === 'flex' && modal.classList.contains('is-open');
    TimerManager.clearTimeout('story_info_close_anim');
    modal.style.display = 'flex';
    if (!isAlreadyOpen) {
        modal.classList.remove('is-open');
        TimerManager.setTimeout(function () {
            modal.classList.add('is-open');
        }, 0, 'story_info_open_anim');
    }
    modal.setAttribute('aria-hidden', 'false');
}

function closeStoryInfoModal() {
    var modal = $('#storyInfoModal');
    TimerManager.clearTimeout('story_info_open_anim');
    modal.classList.remove('is-open');
    TimerManager.setTimeout(function () {
        modal.style.display = 'none';
    }, 230, 'story_info_close_anim');
    modal.setAttribute('aria-hidden', 'true');
}

// ═══════════════════════════════════════════════
// PROJECT ARTIFACTS CHECKLIST (Epic-level)
// ═══════════════════════════════════════════════

var DEFAULT_ARTIFACTS = [
    { key: 'project_folder', label: 'Project Folder', icon: '\uD83D\uDCC1' },
    { key: 'e2e_deck', label: 'E2E Project Deck', icon: '\uD83D\uDCCA' },
    { key: 'acceptance_criteria', label: 'Acceptance Criteria', icon: '\u2705' },
    { key: 'business_signoff', label: 'Business Signoff', icon: '\u270D\uFE0F' },
    { key: 'test_plan', label: 'Test Plan', icon: '\uD83E\uDDEA' },
    { key: 'release_notes', label: 'Release Notes', icon: '\uD83D\uDCDD' },
    { key: 'meeting_notes', label: 'Meeting / Call Notes', icon: '\uD83D\uDCDE' },
    { key: 'design_docs', label: 'Design Documents', icon: '\uD83C\uDFA8' }
];

var ARTIFACT_STATUSES = ['Not Started', 'In Progress', 'Complete', 'Signed Off', 'N/A'];

function populateArtifactsChecklist_(jiraId, story) {
    var tbody = document.getElementById('artifactsTableBody');
    if (!tbody) return;

    // Load saved artifacts from ManualData (stored as JSON string)
    var savedRaw = story['Artifacts'] || '';
    var saved = {};
    if (savedRaw) {
        try { saved = JSON.parse(savedRaw); } catch (e) { saved = {}; }
    }

    var html = '';
    var complete = 0;
    var total = 0;

    DEFAULT_ARTIFACTS.forEach(function (art) {
        var data = saved[art.key] || {};
        var status = data.status || 'Not Started';
        var link = data.link || '';
        var notes = data.notes || '';
        var isComplete = (status === 'Complete' || status === 'Signed Off');
        var isNA = status === 'N/A';

        if (!isNA) total++;
        if (isComplete) complete++;

        // Status select color
        var statusCls = 'color:#6b7280;background:#f3f4f6;';
        if (status === 'In Progress') statusCls = 'color:#b45309;background:#fef3c7;';
        else if (status === 'Complete') statusCls = 'color:#047857;background:#d1fae5;';
        else if (status === 'Signed Off') statusCls = 'color:#1d4ed8;background:#dbeafe;';
        else if (status === 'N/A') statusCls = 'color:#9ca3af;background:#f9fafb;';

        var rowOpacity = isNA ? 'opacity:0.5;' : '';

        // Link display
        var linkHtml = '';
        if (link) {
            linkHtml = '<a href="' + link + '" target="_blank" class="text-blue-600 hover:underline text-xs" style="margin-right:4px;">Open \u2197</a>';
        }

        html += '<tr style="border-bottom:1px solid #f3f4f6;' + rowOpacity + '" data-artifact-key="' + art.key + '">' +
            '<td style="padding:5px 8px;text-align:center;">' + art.icon + '</td>' +
            '<td style="padding:5px 8px;font-weight:500;">' + art.label + '</td>' +
            '<td style="padding:5px 8px;">' +
            '<select class="artifact-status-select" data-key="' + art.key + '" style="font-size:0.78em;padding:2px 6px;border-radius:6px;border:1px solid #e5e7eb;cursor:pointer;' + statusCls + '">' +
            ARTIFACT_STATUSES.map(function (s) {
                return '<option value="' + s + '"' + (s === status ? ' selected' : '') + '>' + s + '</option>';
            }).join('') +
            '</select>' +
            '</td>' +
            '<td style="padding:5px 8px;">' +
            '<div style="display:flex;align-items:center;gap:4px;">' +
            linkHtml +
            '<input class="artifact-link-input" data-key="' + art.key + '" type="text" placeholder="Paste link..." value="' + (link || '').replace(/"/g, '&quot;') + '" style="flex:1;font-size:0.78em;padding:2px 6px;border:1px solid #e5e7eb;border-radius:4px;min-width:0;" />' +
            '<input class="artifact-notes-input" data-key="' + art.key + '" type="text" placeholder="Notes..." value="' + (notes || '').replace(/"/g, '&quot;') + '" style="flex:1;font-size:0.78em;padding:2px 6px;border:1px solid #e5e7eb;border-radius:4px;min-width:0;" />' +
            '</div>' +
            '</td>' +
            '</tr>';
    });

    tbody.innerHTML = html;

    // Update readiness badge
    var readinessEl = document.getElementById('artifactsReadiness');
    if (readinessEl) {
        var pct = total > 0 ? Math.round((complete / total) * 100) : 0;
        readinessEl.textContent = complete + '/' + total + ' complete (' + pct + '%)';
        if (pct === 100) { readinessEl.style.background = '#d1fae5'; readinessEl.style.color = '#047857'; }
        else if (pct >= 50) { readinessEl.style.background = '#fef3c7'; readinessEl.style.color = '#b45309'; }
        else { readinessEl.style.background = '#fee2e2'; readinessEl.style.color = '#b91c1c'; }
    }

    // Wire change handlers (debounced auto-save)
    var saveTimer = null;
    function scheduleArtifactSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { saveArtifacts_(jiraId); }, 800);
    }

    tbody.querySelectorAll('.artifact-status-select').forEach(function (sel) {
        sel.addEventListener('change', function () {
            // Update row styling immediately
            var row = sel.closest('tr');
            var isNA = sel.value === 'N/A';
            row.style.opacity = isNA ? '0.5' : '1';
            // Update select color
            var cls = 'color:#6b7280;background:#f3f4f6;';
            if (sel.value === 'In Progress') cls = 'color:#b45309;background:#fef3c7;';
            else if (sel.value === 'Complete') cls = 'color:#047857;background:#d1fae5;';
            else if (sel.value === 'Signed Off') cls = 'color:#1d4ed8;background:#dbeafe;';
            else if (sel.value === 'N/A') cls = 'color:#9ca3af;background:#f9fafb;';
            sel.style.cssText = 'font-size:0.78em;padding:2px 6px;border-radius:6px;border:1px solid #e5e7eb;cursor:pointer;' + cls;
            scheduleArtifactSave();
        });
    });

    tbody.querySelectorAll('.artifact-link-input, .artifact-notes-input').forEach(function (inp) {
        inp.addEventListener('input', scheduleArtifactSave);
    });
}

function saveArtifacts_(jiraId) {
    var tbody = document.getElementById('artifactsTableBody');
    if (!tbody) return;

    var artifacts = {};
    DEFAULT_ARTIFACTS.forEach(function (art) {
        var statusSel = tbody.querySelector('.artifact-status-select[data-key="' + art.key + '"]');
        var linkInp = tbody.querySelector('.artifact-link-input[data-key="' + art.key + '"]');
        var notesInp = tbody.querySelector('.artifact-notes-input[data-key="' + art.key + '"]');

        var status = statusSel ? statusSel.value : 'Not Started';
        var link = linkInp ? linkInp.value.trim() : '';
        var notes = notesInp ? notesInp.value.trim() : '';

        // Only save non-default entries to keep JSON small
        if (status !== 'Not Started' || link || notes) {
            artifacts[art.key] = { status: status };
            if (link) artifacts[art.key].link = link;
            if (notes) artifacts[art.key].notes = notes;
        }
    });

    var jsonStr = JSON.stringify(artifacts);

    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token) return;

    // Update readiness badge immediately
    var complete = 0, total = 0;
    DEFAULT_ARTIFACTS.forEach(function (art) {
        var d = artifacts[art.key] || {};
        var s = d.status || 'Not Started';
        if (s !== 'N/A') total++;
        if (s === 'Complete' || s === 'Signed Off') complete++;
    });
    var readinessEl = document.getElementById('artifactsReadiness');
    if (readinessEl) {
        var pct = total > 0 ? Math.round((complete / total) * 100) : 0;
        readinessEl.textContent = complete + '/' + total + ' complete (' + pct + '%)';
        if (pct === 100) { readinessEl.style.background = '#d1fae5'; readinessEl.style.color = '#047857'; }
        else if (pct >= 50) { readinessEl.style.background = '#fef3c7'; readinessEl.style.color = '#b45309'; }
        else { readinessEl.style.background = '#fee2e2'; readinessEl.style.color = '#b91c1c'; }
    }

    // Save via existing ManualData mechanism
    callServer('saveManualData', [jiraId, 'Artifacts', jsonStr]).then(function () {
        // Update local data so reopening the modal shows latest
        if (APP_STATE.allData && APP_STATE.allData.projects) {
            var story = APP_STATE.allData.projects.find(function (p) { return p['Jira #'] === jiraId; });
            if (story) story['Artifacts'] = jsonStr;
        }
    }, function (err) {
        console.error('[Artifacts] save failed:', err);
    });
}

// --- DATA VALIDATION & FORMATTING ---
function getValidationStatus(planningStage, updatedStr, checkedStr, projectStage, targetDateStr) {
    const projectStageStatus = (projectStage || '').toLowerCase().trim();

    // Configurable closed project stages: treat as Closed
    const maps = getClosedMappings();
    if (maps.stages.indexOf(projectStageStatus) !== -1) {
        return {
            text: APP_CONSTANTS.VALIDATION.CLOSED,
            className: 'status-ok',
            updatedClassName: '',
            checkedClassName: ''
        };
    }

    // Check for Past Due - only if target date exists and is valid
    // Skip if targetDateStr is null, undefined, empty, or whitespace
    if (targetDateStr && targetDateStr.toString().trim() !== '') {
        // Check if this stage is exempt from Past Due checks
        const exemptStages = getPastDueExemptStages();
        if (exemptStages.indexOf(projectStageStatus) === -1) {
            const targetDate = parseServerDate(targetDateStr);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Compare dates only, not times

            if (targetDate && !isNaN(targetDate.getTime()) && targetDate < today) {
                // Target date exists, is valid, and is in the past
                return {
                    text: APP_CONSTANTS.VALIDATION.PAST_DUE,
                    className: 'status-overdue',
                    updatedClassName: '',
                    checkedClassName: ''
                };
            }
        }
    }

    // Use robust parser so comparisons are consistent
    // Last Updated is stored as UTC in sheet, Last Checked is stored as CST
    const updated = updatedStr ? parseServerDate(updatedStr) : null;
    const checked = checkedStr ? parseCSTDate(checkedStr) : null;
    const today = new Date();

    // If no last checked date exists, it needs review
    if (!checked) {
        return {
            text: APP_CONSTANTS.VALIDATION.NEEDS_REVIEW,
            className: 'status-review',
            updatedClassName: '',
            checkedClassName: ''
        };
    }

    // Calculate days since last checked
    const daysSinceChecked = Math.floor((today.getTime() - checked.getTime()) / APP_CONSTANTS.TIME.DAY_MS);

    // Priority 1: If item was updated after last checked, it needs review
    if (updated && updated.getTime() > checked.getTime()) {
        return {
            text: APP_CONSTANTS.VALIDATION.NEEDS_REVIEW,
            className: 'status-review',
            updatedClassName: '',
            checkedClassName: ''
        };
    }

    // Priority 2: If last checked date is greater than the stale threshold, it's stale
    if (daysSinceChecked >= APP_CONSTANTS.TIME.STALE_DAYS) {
        return {
            text: APP_CONSTANTS.VALIDATION.STALE,
            className: 'status-stale',
            updatedClassName: '',
            checkedClassName: 'text-red-500 font-semibold'
        };
    }

    // Otherwise, it's up to date
    const result = {
        text: APP_CONSTANTS.VALIDATION.UP_TO_DATE,
        className: 'status-ok',
        updatedClassName: '',
        checkedClassName: ''
    };

    // Add highlighting for old dates
    if (updated) {
        var daysSinceUpdatedHighlight = Math.floor((new Date().getTime() - updated.getTime()) / (1000 * 3600 * 24));
        if (daysSinceUpdatedHighlight > 14) {
            result.updatedClassName = 'text-red-500 font-semibold';
        }
    }

    return result;
}


// --- DYNAMIC ELEMENT CREATION ---
function createDropdown(options, selectedValue, jiraId, field) {
    var select = document.createElement('select');
    select.className = 'manual-field-dropdown select w-full text-xs';
    select.dataset.jiraId = jiraId;
    select.dataset.field = field;
    var optionsHtml = '<option value="">Select...</option>';

    // Safety check: ensure options is an array
    if (!options || !Array.isArray(options)) {
        options = [];
    }

    for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        var isSelected = (opt === selectedValue);
        optionsHtml += '<option value="' + opt + '" ' + (isSelected ? 'selected' : '') + '>' + opt + '</option>';
    }
    select.innerHTML = optionsHtml;
    return select;
}

function getStoryAtRiskInfo_(item) {
    if (!item || typeof item !== 'object') return null;
    var issueType = String(item['Issue Type'] || '').trim().toLowerCase();
    if (issueType === 'epic') return null;
    var jiraKey = String(item['Jira #'] || '').trim();
    if (!jiraKey || jiraKey === 'UNASSIGNED') return null;

    var status = String(item.Status || '').trim().toLowerCase();
    var stage = String(item['Project Stage'] || '').trim().toLowerCase();
    var closedStatuses = ['done', 'closed', 'resolved', 'fixed', 'complete', 'completed', 'ready for production', 'in production', 'canceled', 'cancelled'];
    var closedStages = ['done', 'production', 'in production', 'prod', 'fixed', 'canceled', 'cancelled'];
    if (closedStatuses.indexOf(status) !== -1 || (stage && closedStages.indexOf(stage) !== -1)) {
        return null;
    }

    var allData = (APP_STATE && APP_STATE.allData) || {};
    var rawCap = allData.sprintCapacity;
    if (!rawCap || !rawCap.sprintName || rawCap.sprintName === 'None') return null;
    var cap = typeof resolveSprintCapacityWithDates_ === 'function' ? resolveSprintCapacityWithDates_(rawCap) : rawCap;
    var currentSprintName = String((cap && cap.sprintName) || '').trim().toLowerCase();
    if (!currentSprintName || currentSprintName === 'none') return null;

    var targetKey = jiraKey.toLowerCase();
    var matchedDev = null;
    var matchedIssue = null;
    ((cap && cap.developers) || []).forEach(function (dev) {
        if (!dev || matchedDev) return;
        ((dev.issues) || []).forEach(function (iss) {
            if (iss && String(iss.jiraKey || '').trim().toLowerCase() === targetKey) {
                matchedDev = dev;
                matchedIssue = iss;
            }
        });
    });

    if (!matchedDev) {
        var sprintStr = String(item.sprint || item.Sprint || '').trim().toLowerCase();
        if (!sprintStr || sprintStr.indexOf(currentSprintName) === -1) return null;
        var assignee = String(item.Assignee || item['Assigned Dev'] || '').trim().toLowerCase();
        if (!assignee || assignee === 'unassigned') return null;
        matchedDev = ((cap && cap.developers) || []).find(function (dev) {
            return dev && String(dev.developer || '').trim().toLowerCase() === assignee;
        }) || null;
    }

    if (!matchedDev || typeof isCapacityDeveloperAtRisk_ !== 'function' || !isCapacityDeveloperAtRisk_(matchedDev)) {
        return null;
    }
    if (matchedIssue && matchedIssue.workState === 'completed') {
        return null;
    }

    var reasons = [];
    if (matchedDev.remaining != null && matchedDev.remaining < 0) {
        reasons.push(matchedDev.developer + ' is over capacity by ' + Math.abs(Math.round(matchedDev.remaining * 100) / 100) + ' pts');
    }
    if (matchedDev.pace && (matchedDev.pace.status === 'at_risk' || matchedDev.pace.status === 'behind')) {
        reasons.push(matchedDev.developer + ' is ' + (matchedDev.pace.label || 'behind sprint pace').toLowerCase());
    }
    var rawPts = item['Story Points'] !== undefined ? item['Story Points'] : item.storyPoints;
    var pts = parseFloat(String(rawPts == null ? '' : rawPts).trim());
    if (!Number.isFinite(pts) || pts <= 0) {
        reasons.push('Unestimated story in current sprint');
    }
    return {
        isAtRisk: true,
        developer: matchedDev.developer,
        reasons: reasons.length ? reasons : [matchedDev.developer + ' is at risk in ' + cap.sprintName]
    };
}

function createRow(item, type, parentEpicId, validationBadgeCount, hasChildren, isLastChild, openChildrenCount) {
    var row = document.createElement('tr');
    row.className = 'row-' + type;
    if (isLastChild) {
        row.classList.add('is-last-child');
    }
    // Preserve full sprint string (may contain multiple sprints) for accurate filtering
    row.dataset.sprint = (item['sprint'] && typeof item['sprint'] === 'string') ? item['sprint'] : '';
    row.dataset.title = (item.Summary || item.Title || '').toLowerCase();
    row.dataset.status = (item.Status || '').toString().trim();
    row.dataset.planningStage = (item['Planning Stage'] || '').toString().trim();
    row.dataset.projectStage = (item['Project Stage'] || '').toString().trim();
    row.dataset.fixVersion = (item['Fix Version'] || '').toString().trim();
    // Prefer Assigned PM/Dev; fall back to PM Lead/Assignee; always trim
    row.dataset.assignedPM = ((item['Assigned PM'] || item['PM Lead'] || '') + '').trim();
    row.dataset.assignedDev = ((item['Assigned Dev'] || item['Assignee'] || '') + '').trim();
    row.dataset.uatStatus = (item['UAT Status'] || '').toString().trim();
    row.dataset.issueType = item['Issue Type'] || '';
    row.dataset.jiraId = (item['Jira #'] || '').toLowerCase(); // Add Jira ID for search
    row.dataset.syncStatus = (item['Sync Status'] || '').toString().trim().toLowerCase();
    // Store canonical ISO values; Last Updated is UTC, Last Checked is CST
    row.dataset.updatedIso = normalizeUtcString(item['Updated']) || '';
    row.dataset.checkedIso = normalizeUtcString(item['Last Checked']) || '';
    // Also store the original Last Checked format for CST parsing
    row.dataset.checkedCst = item['Last Checked'] || '';

    var validation = getValidationStatus(item['Planning Stage'], item['Updated'], item['Last Checked'], item['Project Stage'], item['Target Date']);
    var isFauxEpic = item['Jira #'] === 'UNASSIGNED';
    if (isFauxEpic && type === 'epic') {
        if (validationBadgeCount > 0) {
            validation = {
                text: APP_CONSTANTS.VALIDATION.NEEDS_REVIEW,
                className: 'status-review',
                updatedClassName: '',
                checkedClassName: ''
            };
        } else {
            validation = {
                text: APP_CONSTANTS.VALIDATION.UP_TO_DATE,
                className: 'status-ok',
                updatedClassName: '',
                checkedClassName: ''
            };
        }
    }
    row.dataset.validation = validation.text;
    var isJiraItem = (type === 'epic' || type === 'story' || type === 'bug-child') && !isFauxEpic;
    var jiraCellHtml = '';

    // Logic for 'task' type (nested task)
    if (type === 'task') {
        row.dataset.parentEpic = parentEpicId;
        jiraCellHtml = item.Title || 'Untitled Task';
        row.innerHTML = '<td colspan="2">' + jiraCellHtml + '</td>' + // Span Jira # and Planning Stage
            '<td colspan="17">' + (item.Assignee ? 'Assignee: ' + item.Assignee : '') + '</td>'; // Span remaining cells for Assignee (17 = 20 total - 3 already used, Action column removed)
        return row;
    }

    // Logic for 'epic' and 'story' types
    if (type === 'epic') {
        row.dataset.id = item['Jira #'];
        row.dataset.showingAll = 'false';
        var expanderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>';
        var link = isFauxEpic ? '<span class="font-medium">' + item.Summary + '</span>' : '<a href="https://onejira.verizon.com/browse/' + item['Jira #'] + '" target="_blank" class="text-blue-600 hover:underline font-medium">' + item['Jira #'] + '</a>';

        // Add info icon for epics (not faux epics)
        var infoIconHtml = '';
        if (!isFauxEpic && item['Jira #']) {
            var infoIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>';
            infoIconHtml = '<button class="info-icon-btn" data-jira-id="' + item['Jira #'] + '" title="View Epic Details">' + infoIconSvg + '</button>';
        }

        var syncStatusHtml = item['Sync Status'] ? '<span class="text-xs font-bold mr-1" title="Sync Status: ' + item['Sync Status'] + '">' + item['Sync Status'] + '</span>' : '';
        jiraCellHtml = '<div class="flex items-center gap-2"><span class="expander">' + expanderSvg + '</span>' + syncStatusHtml + link + infoIconHtml + '</div>';
    } else if (type === 'story') {
        row.dataset.parentEpic = parentEpicId;
        row.dataset.id = item['Jira #']; // Add ID for child lookup
        row.dataset.openChildren = (openChildrenCount !== undefined) ? openChildrenCount : 0; // Store open children count
        var infoIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>';

        var expanderHtml = '';
        if (APP_STATE.nestBugs && hasChildren) {
            var expanderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>';
            expanderHtml = '<span class="expander">' + expanderSvg + '</span>';
            row.dataset.showingAll = 'false'; // Default to collapsed
        } else {
            // Plain placeholder for alignment - no .expander class to avoid unwanted styles
            expanderHtml = '<span style="width: 1.5rem; display: inline-block;"></span>';
        }

        var syncStatusHtml = item['Sync Status'] ? '<span class="text-xs font-bold mr-1" title="Sync Status: ' + item['Sync Status'] + '">' + item['Sync Status'] + '</span>' : '';
        var storyAtRisk = getStoryAtRiskInfo_(item);
        var storyAtRiskHtml = '';
        if (storyAtRisk && storyAtRisk.isAtRisk) {
            row.dataset.atRisk = 'true';
            var riskTitle = ('At Risk: ' + storyAtRisk.reasons.join(' · ')).replace(/"/g, '&quot;');
            storyAtRiskHtml = '<span class="story-at-risk-badge inline-flex items-center rounded-full bg-[#FFECE0] border border-[#F5C6A5] px-2 py-0.5 text-[11px] font-semibold text-[#B95319] whitespace-nowrap" data-at-risk-story="' + item['Jira #'] + '" title="' + riskTitle + '">At Risk</span>';
        }
        jiraCellHtml = '<div class="flex items-center gap-2">' + expanderHtml + syncStatusHtml + '<a href="https://onejira.verizon.com/browse/' + item['Jira #'] + '" target="_blank" class="text-blue-600 hover:underline font-medium">' + item['Jira #'] + '</a><button class="info-icon-btn" data-jira-id="' + item['Jira #'] + '" title="View Story Details">' + infoIconSvg + '</button>' + storyAtRiskHtml + '</div>';
    } else if (type === 'bug-child') {
        row.dataset.parentEpic = parentEpicId; // Actually parent Story ID
        var infoIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>';
        var syncStatusHtml = item['Sync Status'] ? '<span class="text-xs font-bold mr-1" title="Sync Status: ' + item['Sync Status'] + '">' + item['Sync Status'] + '</span>' : '';
        var bugAtRisk = getStoryAtRiskInfo_(item);
        var bugAtRiskHtml = '';
        if (bugAtRisk && bugAtRisk.isAtRisk) {
            row.dataset.atRisk = 'true';
            var bugRiskTitle = ('At Risk: ' + bugAtRisk.reasons.join(' · ')).replace(/"/g, '&quot;');
            bugAtRiskHtml = '<span class="story-at-risk-badge inline-flex items-center rounded-full bg-[#FFECE0] border border-[#F5C6A5] px-2 py-0.5 text-[11px] font-semibold text-[#B95319] whitespace-nowrap" data-at-risk-story="' + item['Jira #'] + '" title="' + bugRiskTitle + '">At Risk</span>';
        }
        jiraCellHtml = '<div class="flex items-center gap-2">' + syncStatusHtml + '<a href="https://onejira.verizon.com/browse/' + item['Jira #'] + '" target="_blank" class="text-blue-600 hover:underline font-medium">' + item['Jira #'] + '</a><button class="info-icon-btn" data-jira-id="' + item['Jira #'] + '" title="View Bug Details">' + infoIconSvg + '</button>' + bugAtRiskHtml + '</div>';
    } else { // Fallback for independent tasks on the old task view
        jiraCellHtml = item['Jira #'] ? '<a href="https://onejira.verizon.com/browse/' + item['Jira #'] + '" target="_blank" class="text-blue-600 hover:underline font-medium">' + item['Jira #'] + '</a>' : '—';
    }

    var issueType = item['Issue Type'] || '';
    var typePillClass = '';
    var displayText = issueType;

    if (isJiraItem || isFauxEpic) {
        switch (issueType.toLowerCase()) {
            case 'epic': typePillClass = 'type-epic'; break;
            case 'vzagile story': typePillClass = 'type-story'; displayText = 'Story'; break;
            case 'story': typePillClass = 'type-story'; break;
            case 'bug': typePillClass = 'type-bug'; break;
        }
    }
    var typeCellHtml = '<td class="col-type">' + (typePillClass ? '<span class="type-pill ' + typePillClass + '">' + displayText + '</span>' : '—') + '</td>';

    var createCellWithDropdown = function (options, value, jiraId, field, className) {
        var cell = document.createElement('td');
        if (className) cell.className = className;
        if (isJiraItem) {
            cell.appendChild(createDropdown(options, value, jiraId, field));
        } else {
            cell.textContent = '—';
        }
        return cell.outerHTML;
    };

    // Removed separate check button - validation badge is now clickable
    var sprintCellHtml = buildLatestWithHistoryHtml_(item['sprint'], {
        valuesResolver: extractSprintValues_,
        latestResolver: getLatestSprintValue_,
        displayFormatter: function (v) {
            var f = (typeof formatSprint === 'function') ? formatSprint(v) : null;
            return f || v;
        },
        historyLabel: 'Other sprints'
    });

    var fixVersionCellHtml = buildLatestWithHistoryHtml_(item['Fix Version'], {
        latestResolver: getLatestFixVersionValue_,
        historyLabel: 'Other fix versions'
    });

    var assignedPm = item['PM Lead'] || '—';
    var assignedDev = item['Assignee'] || '—';
    var storyPoints = item['Story Points'] || '—';

    var formatDateTime = function (dateStr) {
        return formatDateTimeLocal(dateStr);
    };

    var createDateInputCell = function (dateStr, jiraId, field, className) {
        var cell = className ? '<td class="' + className + '">' : '<td>';
        if (isJiraItem) {
            var dateValue = '';
            if (dateStr) {
                // Use local date-only formatter for inputs
                dateValue = formatDateLocalDateOnly(dateStr);
            }
            cell += '<input type="text" class="manual-text-input input text-xs p-1 w-full" data-jira-id="' + jiraId + '" data-field="' + field + '" value="' + dateValue + '">';
        } else {
            cell += '—';
        }
        return cell + '</td>';
    };

    // Before building innerHTML, compute localized displays from canonical dataset ISOs
    // Last Updated comes from sheet as UTC, convert to CST
    var lastUpdatedDisplay = '—';
    if (item['Updated'] !== undefined && item['Updated'] !== null && item['Updated'] !== '') {
        var parsedUpdated = parseServerDate(item['Updated']);
        lastUpdatedDisplay = parsedUpdated ? formatDateTimeLocal(row.dataset.updatedIso || item['Updated']) : item['Updated'];
    }

    // Last Checked is already in CST from sheet, display as-is
    var lastCheckedDisplay = (item['Last Checked'] !== undefined && item['Last Checked'] !== null && item['Last Checked'] !== '') ? item['Last Checked'] : 'Never';

    row.innerHTML = '<td class="col-jira">' + jiraCellHtml + '</td>' +
        (function () {
            var type = (item['Issue Type'] || '').toLowerCase();
            var cfg = APP_STATE.allData.config || {};
            var opts = cfg.projectStageOptions || [];
            if (type === 'epic' && Array.isArray(cfg.epicProjectStageOptions) && cfg.epicProjectStageOptions.length) opts = cfg.epicProjectStageOptions;
            else if ((type === 'story' || type === 'vzagile story') && Array.isArray(cfg.storyProjectStageOptions) && cfg.storyProjectStageOptions.length) opts = cfg.storyProjectStageOptions;
            else if (type === 'bug' && Array.isArray(cfg.bugProjectStageOptions) && cfg.bugProjectStageOptions.length) opts = cfg.bugProjectStageOptions;
            return createCellWithDropdown(opts, item['Project Stage'], item['Jira #'], 'Project Stage', 'col-project-stage');
        })() +
        '<td class="col-title">' + (item.Summary || item.Title || 'Untitled') + '</td>' +
        '<td class="col-validation"><span class="validation-pill-container">' +
        '<span class="status-pill validation-clickable ' + validation.className + '" ' +
        (isJiraItem ? 'data-jira-id="' + item['Jira #'] + '" data-clickable="true"' : '') + '>' +
        validation.text +
        '</span>' +
        (((type === 'epic' || type === 'story') && validationBadgeCount > 0) ? '<span class="validation-badge">' + validationBadgeCount + '</span>' : '') +
        '</span></td>' +
        (function () {
            var statusText = item.Status || '—';
            var stageText = item['Project Stage'] || '';

            if (!isJiraItem) {
                return '<td class="col-status">' + statusText + '</td>';
            }

            // Flag as out of sync if Project Stage is blank/empty
            var stageIsEmpty = !item['Project Stage'] || String(item['Project Stage']).trim() === '';
            if (stageIsEmpty) {
                var tooltip = 'Project Stage is empty - this should be set';
                var dot = '<span title="' + tooltip.replace(/\"/g, '&quot;') + '" style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:#f59e0b;margin-left:6px;vertical-align:middle;"></span>';
                return '<td class="col-status">' + statusText + dot + '</td>';
            }
            var s = String(item.Status).toLowerCase().trim();
            var stg = String(item['Project Stage']).toLowerCase().trim();
            var maps = getClosedMappings();
            var cfg = (APP_STATE && APP_STATE.allData && APP_STATE.allData.config) || {};

            var stageMap = {};
            (cfg.stageStatusMappings || []).forEach(function (m) {
                if (m && m.stage) {
                    var expectedStatuses = (m.expectedStatuses || []).map(function (x) { return (x || '').toLowerCase().trim(); });
                    stageMap[(m.stage + '').toLowerCase().trim()] = expectedStatuses;
                }
            });

            // Stage closed check is exact-match against configured closed stages
            var stageIsClosed = maps.stages.indexOf(stg) !== -1;

            // Evaluate mapping - check if current Status matches any expected Status for this Project Stage
            var expectedStatuses = stageMap[stg] || [];
            var matchedStatus = '';
            var statusAlignedWithStage = false;
            var statusIsEmpty = !item.Status || String(item.Status).trim() === '';

            if (expectedStatuses.length > 0) {
                if (statusIsEmpty) {
                    statusAlignedWithStage = false;
                } else {
                    var currentStatus = s; // already normalized
                    for (var si = 0; si < expectedStatuses.length; si++) {
                        var expectedStatus = expectedStatuses[si];
                        if (expectedStatus && currentStatus === expectedStatus) {
                            matchedStatus = expectedStatus;
                            statusAlignedWithStage = true;
                            break;
                        }
                    }
                }
            } else {
                // No stage-specific mapping: flag as mismatch so it gets attention
                statusAlignedWithStage = false;
            }

            var mismatch = !statusAlignedWithStage;

            try {
                if (mismatch || expectedStatuses.length > 0) {
                }
            } catch (e) { }
            if (!mismatch) {
                return '<td class="col-status">' + statusText + '</td>';
            }
            var tooltip = 'Status ("' + item.Status + '") and Project Stage ("' + item['Project Stage'] + '") may be out of sync' + (expectedStatuses.length ? ('\nExpected Status: ' + expectedStatuses.join(', ') + (matchedStatus ? ('\nCurrent matches: ' + matchedStatus) : '\nNo match found')) : '\nNo stage-specific mapping configured');
            var dot = '<span title="' + tooltip.replace(/\"/g, '&quot;') + '" style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:#f59e0b;margin-left:6px;vertical-align:middle;"></span>';
            return '<td class="col-status">' + statusText + dot + '</td>';
        })() +
        (function () {
            var uat = item['UAT Status'] || '';
            if (!uat || uat === '—') return '<td class="col-uat-status">—</td>';

            var s = uat.toLowerCase().trim();
            var cls = 'uat-default';

            if (s === 'pass' || s === 'passed' || s === 'approved' || s === 'complete' || s === 'completed') cls = 'uat-pass';
            else if (s === 'fail' || s === 'failed' || s === 'rejected' || s === 'defect') cls = 'uat-fail';
            else if (s === 'pending' || s === 'in progress' || s === 'testing' || s === 'review') cls = 'uat-pending';
            else if (s === 'blocked' || s === 'hold' || s === 'on hold') cls = 'uat-blocked';
            else if (s === 'n/a' || s === 'na' || s === 'none' || s === 'not required') cls = 'uat-na';

            return '<td class="col-uat-status"><span class="uat-badge ' + cls + '">' + uat + '</span></td>';
        })() +
        typeCellHtml +
        createCellWithDropdown(APP_STATE.allData.config.priorityOptions, item['Priority'], item['Jira #'], 'Priority', 'col-priority') +
        '<td class="col-story-points">' + storyPoints + '</td>' +
        '<td class="col-pm-lead">' + assignedPm + '</td>' + '<td class="col-dev-assignee">' + assignedDev + '</td>' + '<td class="col-sprint">' + sprintCellHtml + '</td>' +
        '<td class="col-target-date">' + (function () {
            var targetDate = item['Target Date'] || item['Target Date '];
            if (!targetDate) return '—';
            if (targetDate instanceof Date) {
                return targetDate.toLocaleDateString();
            } else if (typeof targetDate === 'string') {
                // If it includes time component (like "12/22/2025 00:00:00"), strip it
                if (targetDate.includes(' ')) {
                    return targetDate.split(' ')[0];
                }
                // Handle ISO date strings - extract just the date part
                if (targetDate.includes('T')) {
                    return new Date(targetDate).toLocaleDateString();
                }
                return targetDate;
            } else {
                return targetDate;
            }
        })() + '</td>' +
        '<td class="col-fix-version">' + fixVersionCellHtml + '</td>' +
        createCellWithDropdown(APP_STATE.allData.config.actPctOptions, item['ACT/PCT'], item['Jira #'], 'ACT/PCT', 'col-act-pct') +
        createDateInputCell(item['Start Date'], item['Jira #'], 'Start Date', 'col-start-date') +
        createDateInputCell(item['End Date'], item['Jira #'], 'End Date', 'col-end-date') +
        '<td class="col-last-updated ' + validation.updatedClassName + '">' + lastUpdatedDisplay + '</td>' +
        '<td class="col-last-checked ' + validation.checkedClassName + '">' + lastCheckedDisplay + '</td>';
    return row;
}

function renderApp() {
    // Safety check: ensure config has the required properties
    if (!APP_STATE.allData.config) {
        APP_STATE.allData.config = {};
    }
    if (!APP_STATE.allData.config.projectStageOptions) {
        APP_STATE.allData.config.projectStageOptions = ['Open', 'In Progress', 'Fixed', 'Closed'];
    }
    if (!APP_STATE.allData.config.actPctOptions) {
        APP_STATE.allData.config.actPctOptions = ['ACT', 'PCT'];
    }
    if (!APP_STATE.allData.config.planningStageOptions) {
        APP_STATE.allData.config.planningStageOptions = ['Planning', 'In Flight', 'Backlog'];
    }
    if (!APP_STATE.allData.config.priorityOptions) {
        APP_STATE.allData.config.priorityOptions = ['Critical', 'High', 'Medium', 'Low'];
    }
    if (!APP_STATE.allData.config.helpfulLinks) {
        APP_STATE.allData.config.helpfulLinks = [];
    }

    // Update Project Stage options dynamically from data (union with existing)
    try {
        var itemsForStages = (APP_STATE.allData.projects || []).concat(APP_STATE.allData.independentTasks || []);
        var derivedStages = {};
        for (var i = 0; i < itemsForStages.length; i++) {
            var psVal = (itemsForStages[i]['Project Stage'] || '').toString().trim();
            if (!psVal) continue;
            var low = psVal.toLowerCase();
            if (psVal === '—' || low === 'none' || low === 'n/a') continue;
            derivedStages[psVal] = true;
        }
        var currentStages = Array.isArray(APP_STATE.allData.config.projectStageOptions) ? APP_STATE.allData.config.projectStageOptions : [];
        var unionMap = {};
        currentStages.forEach(function (v) { if ((v || '').toString().trim()) unionMap[(v + '').trim()] = true; });
        Object.keys(derivedStages).forEach(function (v) { unionMap[v] = true; });
        var finalStages = Object.keys(unionMap).sort();
        if (finalStages.length > 0) APP_STATE.allData.config.projectStageOptions = finalStages;
    } catch (err) {
    }

    // *** REMOVED call to obsolete renderToolbar() ***
    populateFilters();
    renderKPIs();
    populateLinksDropdown();

    // Handle view container visibility
    var contentWrapper = $('#content-wrapper');
    var tasksView = $('#view-tasks');
    var capacityView = $('#view-capacity');

    if (contentWrapper) {
        contentWrapper.style.display = (APP_STATE.currentView === 'table' || APP_STATE.currentView === 'board') ? 'flex' : 'none';
    }

    if (tasksView) {
        tasksView.style.display = (APP_STATE.currentView === 'tasks') ? 'block' : 'none';
    }

    if (capacityView) {
        capacityView.style.display = (APP_STATE.currentView === 'capacity') ? 'block' : 'none';
    }

    if (APP_STATE.currentView === 'table') {
        renderTable();
    } else if (APP_STATE.currentView === 'board') {
        renderBoard();
    } else if (APP_STATE.currentView === 'gantt') {
        if (typeof renderGanttChart === 'function') {
            renderGanttChart(APP_STATE.allData.projects);
        } else if (typeof loadDeferredDashboardAsset === 'function') {
            var wrapper = $('#content-wrapper');
            if (wrapper) {
                wrapper.innerHTML = '<div class="p-8 text-center text-gray-500">Loading Gantt view...</div>';
            }
            loadDeferredDashboardAsset('gantt.js')
                .then(function () {
                    renderApp();
                })
                .catch(function (error) {
                    if (wrapper) {
                        wrapper.innerHTML = '<div class="p-8 text-center text-red-500">Failed to load Gantt view.</div>';
                    }
                    console.error('Failed to load Gantt module', error);
                });
        }
    } else if (APP_STATE.currentView === 'tasks') {
        if (typeof renderTasksView === 'function') {
            renderTasksView();
        }
    } else if (APP_STATE.currentView === 'capacity') {
        renderCapacityView();
    }

    var isGanttView = (APP_STATE.currentView === 'gantt');
    var ganttControls = $('#gantt-zoom-controls');
    if (ganttControls) ganttControls.style.display = isGanttView ? 'flex' : 'none';

    // Show/hide table controls based on view
    var tableControls = $('#table-controls');
    if (tableControls) {
        var shouldShowControls = APP_STATE.currentView === 'table' &&
            APP_STATE.allData &&
            APP_STATE.allData.projects &&
            APP_STATE.allData.projects.length > 0;
        tableControls.style.display = shouldShowControls ? 'block' : 'none';
    }

    // Logic to show/hide filter popup is now handled by dropdown events

    // Show/hide KPI container based on view
    var kpiContainer = $('.kpi-container');
    if (kpiContainer) {
        kpiContainer.style.display = APP_STATE.currentView === 'tasks' || APP_STATE.currentView === 'capacity' ? 'none' : 'flex';
    }

    if (APP_STATE.currentView !== 'gantt') {
        applyFilters();
    }
}

var SPRINT_DATE_OVERRIDES_KEY_ = 'projecthub_sprint_dates_v1';

function getStoredSprintDateOverride_(sprintName) {
    if (!sprintName || sprintName === 'None' || typeof localStorage === 'undefined') return null;
    try {
        var map = JSON.parse(localStorage.getItem(SPRINT_DATE_OVERRIDES_KEY_) || '{}');
        var entry = map && map[sprintName.toLowerCase()];
        if (entry && entry.start && entry.end) return entry;
    } catch (e) { }
    return null;
}

function saveSprintDateOverride_(sprintName, startYmd, endYmd) {
    if (!sprintName || sprintName === 'None' || typeof localStorage === 'undefined') return;
    try {
        var map = JSON.parse(localStorage.getItem(SPRINT_DATE_OVERRIDES_KEY_) || '{}') || {};
        if (startYmd && endYmd) {
            map[sprintName.toLowerCase()] = { start: startYmd, end: endYmd };
        } else {
            delete map[sprintName.toLowerCase()];
        }
        localStorage.setItem(SPRINT_DATE_OVERRIDES_KEY_, JSON.stringify(map));
    } catch (e) { }
}

function toYmdInputValue_(isoOrYmd) {
    if (!isoOrYmd) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(isoOrYmd))) return String(isoOrYmd);
    var d = new Date(isoOrYmd);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function computeClientSprintPace_(startYmd, endYmd, metrics, nowDate) {
    var totalPoints = Number(metrics.totalStoryPoints) || 0;
    var completedPoints = Number(metrics.completedPoints) || 0;
    var inProgressPoints = Number(metrics.inProgressPoints) || 0;
    var remainingPoints = Math.max(0, totalPoints - completedPoints);
    var totalIssues = Number(metrics.totalIssues) || 0;
    var completedIssues = Number(metrics.completedIssues) || 0;
    var inProgressIssues = Number(metrics.inProgressIssues) || 0;
    var remainingIssues = Math.max(0, totalIssues - completedIssues);
    var usePoints = totalPoints > 0;
    var completedPct = usePoints ? completedPoints / totalPoints : (totalIssues > 0 ? completedIssues / totalIssues : 0);
    var activePct = usePoints ? (completedPoints + inProgressPoints) / totalPoints : (totalIssues > 0 ? (completedIssues + inProgressIssues) / totalIssues : 0);
    var metricBasis = usePoints ? 'points' : 'issues';
    if (totalPoints === 0 && totalIssues === 0) {
        return { status: 'no_work', label: 'No work', timeElapsedPct: null, timeRemainingPct: null, completedPct: 0, activePct: 0, delta: null, remainingPoints: 0, remainingIssues: 0, requiredPointsPerDay: null, expectedPointsPerDay: null, totalDays: null, daysElapsed: null, daysRemaining: null, unit: null, metricBasis: metricBasis };
    }
    var start = startYmd ? new Date(startYmd + 'T00:00:00') : null;
    var end = endYmd ? new Date(endYmd + 'T23:59:59') : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        return { status: completedPct >= 1 ? 'completed' : 'no_dates', label: completedPct >= 1 ? 'Completed' : 'Dates unavailable', timeElapsedPct: null, timeRemainingPct: null, completedPct: completedPct, activePct: activePct, delta: null, remainingPoints: remainingPoints, remainingIssues: remainingIssues, requiredPointsPerDay: null, expectedPointsPerDay: null, totalDays: null, daysElapsed: null, daysRemaining: null, unit: null, metricBasis: metricBasis };
    }
    var now = nowDate instanceof Date && !isNaN(nowDate.getTime()) ? nowDate : new Date();
    var startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    var totalWorkdays = 0, elapsedWorkdays = 0, remainingWorkdays = 0, guard = 0;
    var cursor = new Date(startDay.getTime());
    while (cursor <= endDay && guard < 400) {
        guard++;
        var dow = cursor.getDay();
        if (dow >= 1 && dow <= 5) {
            totalWorkdays++;
            var ds = cursor.getTime(), de = ds + 86400000;
            if (now.getTime() >= de) elapsedWorkdays += 1;
            else if (now.getTime() > ds) {
                var frac = Math.max(0, Math.min(1, (now.getTime() - ds) / 86400000));
                elapsedWorkdays += frac;
                remainingWorkdays += (1 - frac);
            } else remainingWorkdays += 1;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    var timeElapsedPct, totalDays, daysElapsed, daysRemaining, unit;
    if (totalWorkdays > 0) {
        timeElapsedPct = Math.max(0, Math.min(1, elapsedWorkdays / totalWorkdays));
        totalDays = totalWorkdays;
        daysElapsed = Math.min(totalWorkdays, Math.max(0, Math.ceil(elapsedWorkdays)));
        daysRemaining = Math.max(0, Math.ceil(remainingWorkdays - 0.01));
        unit = 'workdays';
    } else {
        var totalMs = Math.max(1, end.getTime() - start.getTime());
        var elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - start.getTime()));
        timeElapsedPct = elapsedMs / totalMs;
        totalDays = Math.max(1, Math.round(totalMs / 86400000));
        daysElapsed = Math.min(totalDays, Math.max(0, Math.ceil(elapsedMs / 86400000)));
        daysRemaining = now > end ? 0 : Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
        unit = 'days';
    }
    var timeRemainingPct = Math.max(0, Math.min(1, 1 - timeElapsedPct));
    var delta = completedPct - timeElapsedPct;
    var remWork = usePoints ? remainingPoints : remainingIssues;
    var totWork = usePoints ? totalPoints : totalIssues;
    var requiredPointsPerDay = remWork <= 0 ? 0 : (daysRemaining > 0 ? remWork / daysRemaining : null);
    var expectedPointsPerDay = totalDays > 0 ? totWork / totalDays : null;
    var status, label;
    if (completedPct >= 1) { status = 'completed'; label = 'Completed'; }
    else if (now < start) { status = 'upcoming'; label = 'Upcoming'; }
    else if (now > end) { status = 'behind'; label = 'Behind'; }
    else if (timeElapsedPct <= 0.2) {
        status = (completedPct >= timeElapsedPct || activePct >= timeElapsedPct) ? 'on_track' : 'at_risk';
        label = status === 'on_track' ? 'On track' : 'At risk';
    } else if (delta >= -0.1) { status = 'on_track'; label = 'On track'; }
    else if (delta >= -0.25) { status = 'at_risk'; label = 'At risk'; }
    else { status = 'behind'; label = 'Behind'; }
    return { status: status, label: label, timeElapsedPct: timeElapsedPct, timeRemainingPct: timeRemainingPct, completedPct: completedPct, activePct: activePct, delta: delta, remainingPoints: remainingPoints, remainingIssues: remainingIssues, requiredPointsPerDay: requiredPointsPerDay, expectedPointsPerDay: expectedPointsPerDay, totalDays: totalDays, daysElapsed: daysElapsed, daysRemaining: daysRemaining, unit: unit, metricBasis: metricBasis };
}

function toClientIsoDateKey_(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        var m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function countClientIsoWorkdays_(startIso, endIso) {
    if (!startIso || !endIso || endIso < startIso) return 0;
    var sp = startIso.split('-').map(Number);
    var ep = endIso.split('-').map(Number);
    var cur = new Date(sp[0], sp[1] - 1, sp[2], 12, 0, 0);
    var end = new Date(ep[0], ep[1] - 1, ep[2], 12, 0, 0);
    var count = 0;
    while (cur <= end) {
        var dow = cur.getDay();
        if (dow >= 1 && dow <= 5) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function resolveSprintCapacityWithDates_(capacity) {
    if (!capacity || !capacity.sprintName || capacity.sprintName === 'None') return capacity;
    var allData = (APP_STATE && APP_STATE.allData) || {};
    var capSettings = allData.capacitySettings;
    var devCapList = allData.developerCapacity;
    var devConfigByName = new Map();
    (devCapList || []).forEach(function (c) {
        if (c && c.developer) devConfigByName.set(String(c.developer).trim().toLowerCase(), c);
    });
    var syncDevMeta = function (devList) {
        return (devList || []).map(function (dev) {
            if (!dev || dev.developer === 'Unassigned') return dev;
            var cfg = devConfigByName.get(String(dev.developer || '').trim().toLowerCase());
            if (!cfg) return dev;
            var next = Object.assign({}, dev);
            if (cfg.manager !== undefined) next.manager = String(cfg.manager || '').trim();
            if (cfg.pct) next.pct = String(cfg.pct).trim();
            return next;
        });
    };

    var override = getStoredSprintDateOverride_(capacity.sprintName);
    var startKey = override ? override.start : toClientIsoDateKey_(capacity.sprintStart);
    var endKey = override ? override.end : toClientIsoDateKey_(capacity.sprintEnd);
    if (!startKey || !endKey) {
        return devConfigByName.size ? Object.assign({}, capacity, { developers: syncDevMeta(capacity.developers) }) : capacity;
    }

    var startIso = override ? new Date(override.start + 'T00:00:00').toISOString() : capacity.sprintStart;
    var endIso = override ? new Date(override.end + 'T23:59:59').toISOString() : capacity.sprintEnd;
    var pace = override ? computeClientSprintPace_(startKey, endKey, {
        totalStoryPoints: capacity.totalStoryPoints,
        completedPoints: capacity.completedPoints,
        inProgressPoints: capacity.inProgressPoints,
        totalIssues: capacity.totalIssues,
        completedIssues: capacity.completedIssues,
        inProgressIssues: 0
    }) : capacity.pace;

    var hasDateBasedRules = Boolean(
        (capSettings && Array.isArray(capSettings.companyHolidays) && capSettings.companyHolidays.some(function (h) { return h && h.date; })) ||
        (Array.isArray(devCapList) && devCapList.some(function (d) { return d && Array.isArray(d.ptoDates) && d.ptoDates.length > 0; }))
    );

    if (!override && !hasDateBasedRules) {
        return devConfigByName.size ? Object.assign({}, capacity, { developers: syncDevMeta(capacity.developers) }) : capacity;
    }

    var sprintName = capacity.sprintName;
    var workdays = capSettings && Number(capSettings.sprintWorkdays) > 0 ? Number(capSettings.sprintWorkdays) : (capacity.sprintWorkdays || 10);
    var matchedHolidays = [];
    var sprintHolidayDays = 0;
    if (capSettings && Array.isArray(capSettings.companyHolidays)) {
        capSettings.companyHolidays.forEach(function (h) {
            if (!h || typeof h !== 'object') return;
            var hSprint = String(h.sprint == null ? '' : h.sprint).trim();
            var hDate = toClientIsoDateKey_(h.date);
            var hDays = Number(h.days);
            if (!Number.isFinite(hDays) || hDays <= 0) return;
            var matches = hDate ? (hDate >= startKey && hDate <= endKey) : (hSprint && hSprint.toLowerCase() === sprintName.toLowerCase());
            if (matches) {
                matchedHolidays.push({ name: String(h.name || 'Company Holiday').trim(), sprint: hSprint || sprintName, date: hDate || undefined, days: hDays });
                sprintHolidayDays += hDays;
            }
        });
    } else if (capacity.holidayDays > 0) {
        sprintHolidayDays = capacity.holidayDays;
        matchedHolidays = capacity.holidays || [];
    }

    var totalCapacity = 0;
    var hasConfiguredCapacity = false;
    var totalPtoDays = 0;

    var developers = (capacity.developers || []).map(function (dev) {
        var bd = getDeveloperPointBreakdown_(dev);
        var devPace = override ? (dev.issueCount > 0 ? computeClientSprintPace_(startKey, endKey, {
            totalStoryPoints: dev.storyPoints,
            completedPoints: bd.completed,
            inProgressPoints: bd.inProgress,
            totalIssues: dev.issueCount,
            completedIssues: dev.completedIssues || 0,
            inProgressIssues: dev.inProgressIssues || 0
        }) : null) : dev.pace;

        var cfg = dev.developer !== 'Unassigned' ? devConfigByName.get(dev.developer.toLowerCase()) : null;
        if (!cfg && !hasDateBasedRules) {
            if (dev.capacity != null) {
                totalCapacity += dev.capacity;
                hasConfiguredCapacity = true;
            }
            if (dev.ptoDays > 0) totalPtoDays += dev.ptoDays;
            return Object.assign({}, dev, { pace: devPace });
        }

        var baseCapacity = cfg ? (typeof cfg.capacity === 'number' && Number.isFinite(cfg.capacity) ? cfg.capacity : null) :
            (dev.baseCapacity !== undefined ? dev.baseCapacity : dev.capacity);
        var sprintOvr = null;
        if (cfg && cfg.sprintOverrides && typeof cfg.sprintOverrides === 'object') {
            Object.keys(cfg.sprintOverrides).forEach(function (k) {
                if (k !== '__ptoDates__' && k !== '__pct__' && k.trim().toLowerCase() === sprintName.toLowerCase()) {
                    sprintOvr = cfg.sprintOverrides[k];
                }
            });
        }
        var manualPto = sprintOvr && Number(sprintOvr.ptoDays) > 0 ? Number(sprintOvr.ptoDays) : 0;
        var datePto = 0;
        var dateNotes = [];
        if (cfg && Array.isArray(cfg.ptoDates)) {
            cfg.ptoDates.forEach(function (pt) {
                if (!pt) return;
                var sIso = toClientIsoDateKey_(pt.startDate || pt.date);
                if (!sIso) return;
                var eIso = toClientIsoDateKey_(pt.endDate) || sIso;
                if (eIso < sIso) eIso = sIso;
                var ovStart = sIso > startKey ? sIso : startKey;
                var ovEnd = eIso < endKey ? eIso : endKey;
                if (ovStart > ovEnd) return;
                var ovDays = countClientIsoWorkdays_(ovStart, ovEnd);
                var expDays = pt.days != null && pt.days !== '' && Number.isFinite(Number(pt.days)) && Number(pt.days) >= 0 ? Number(pt.days) : null;
                var add = expDays !== null ?
                    ((sIso >= startKey && eIso <= endKey) ? expDays : (countClientIsoWorkdays_(sIso, eIso) > 0 ? Math.round((expDays * (ovDays / countClientIsoWorkdays_(sIso, eIso))) * 100) / 100 : 0)) :
                    ovDays;
                if (add > 0) {
                    datePto += add;
                    var lbl = sIso === eIso ? sIso : (sIso + ' to ' + eIso);
                    dateNotes.push(pt.notes ? (pt.notes + ' (' + lbl + ')') : ('PTO ' + lbl));
                }
            });
        }
        var ptoDays = cfg ? Math.round((manualPto + datePto) * 100) / 100 : (dev.ptoDays || 0);
        var manualOverride = sprintOvr && sprintOvr.capacityOverride != null && sprintOvr.capacityOverride !== '' && Number.isFinite(Number(sprintOvr.capacityOverride)) ?
            Number(sprintOvr.capacityOverride) : (dev.capacityOverride !== undefined ? dev.capacityOverride : null);
        var effCap = baseCapacity;
        if (manualOverride != null) {
            effCap = manualOverride;
        } else if (baseCapacity != null && (ptoDays > 0 || sprintHolidayDays > 0)) {
            var avail = Math.max(0, workdays - sprintHolidayDays - ptoDays);
            effCap = Math.round((baseCapacity * (avail / workdays)) * 100) / 100;
        }
        if (effCap != null) {
            totalCapacity += effCap;
            hasConfiguredCapacity = true;
        }
        if (ptoDays > 0) totalPtoDays += ptoDays;
        var notes = [sprintOvr && sprintOvr.notes ? sprintOvr.notes : ''].concat(dateNotes).filter(Boolean).join('; ') || dev.overrideNotes;
        var updatedDev = Object.assign({}, dev, {
            capacity: effCap,
            remaining: effCap == null ? null : Math.round((effCap - dev.storyPoints) * 100) / 100,
            pace: devPace
        });
        if (cfg) {
            if (cfg.manager !== undefined) updatedDev.manager = String(cfg.manager || '').trim();
            if (cfg.pct) updatedDev.pct = String(cfg.pct).trim();
        }
        if (ptoDays > 0 || sprintHolidayDays > 0 || manualOverride != null || notes) {
            updatedDev.baseCapacity = baseCapacity;
            if (ptoDays > 0) updatedDev.ptoDays = ptoDays; else delete updatedDev.ptoDays;
            if (sprintHolidayDays > 0) updatedDev.holidayDays = sprintHolidayDays; else delete updatedDev.holidayDays;
            if (manualOverride != null) updatedDev.capacityOverride = manualOverride; else delete updatedDev.capacityOverride;
            if (notes) updatedDev.overrideNotes = notes; else delete updatedDev.overrideNotes;
        }
        return updatedDev;
    });

    return Object.assign({}, capacity, {
        sprintStart: startIso,
        sprintEnd: endIso,
        totalCapacity: hasConfiguredCapacity ? Math.round(totalCapacity * 100) / 100 : capacity.totalCapacity,
        holidayDays: sprintHolidayDays > 0 ? sprintHolidayDays : undefined,
        holidays: sprintHolidayDays > 0 ? matchedHolidays : undefined,
        totalPtoDays: totalPtoDays > 0 ? Math.round(totalPtoDays * 100) / 100 : undefined,
        pace: pace,
        developers: developers
    });
}

function bindCapacityDateInputs_(sprintName) {
    var startInput = document.getElementById('capacity-sprint-start');
    var endInput = document.getElementById('capacity-sprint-end');
    if (!startInput || !endInput || startInput._capacityDatesBound) return;
    startInput._capacityDatesBound = true;
    var onDateChange = function () {
        var activeName = (APP_STATE && APP_STATE.allData && APP_STATE.allData.sprintCapacity && APP_STATE.allData.sprintCapacity.sprintName) || sprintName;
        if (!activeName || activeName === 'None') return;
        saveSprintDateOverride_(activeName, startInput.value, endInput.value);
        renderCapacityView();
        if (typeof updateCurrentSprintKPI === 'function') updateCurrentSprintKPI();
    };
    startInput.addEventListener('change', onDateChange);
    endInput.addEventListener('change', onDateChange);
}

function getCapacityPaceBadgeClass_(status) {
    switch (status) {
        case 'on_track':
        case 'completed':
            return 'inline-flex items-center rounded-full bg-[#DCF5E6] px-2.5 py-0.5 text-xs font-medium text-[#008331]';
        case 'at_risk':
            return 'inline-flex items-center rounded-full bg-[#FFF9DE] px-2.5 py-0.5 text-xs font-medium text-[#4B3F04]';
        case 'behind':
            return 'inline-flex items-center rounded-full bg-[#FFECE0] px-2.5 py-0.5 text-xs font-medium text-[#B95319]';
        default:
            return 'inline-flex items-center rounded-full bg-[#EDEDED] px-2.5 py-0.5 text-xs font-medium text-[#333333]';
    }
}

function getDeveloperPointBreakdown_(developer) {
    if (developer && typeof developer.completedPoints === 'number' &&
        typeof developer.inProgressPoints === 'number' &&
        typeof developer.notStartedPoints === 'number') {
        return {
            completed: developer.completedPoints,
            inProgress: developer.inProgressPoints,
            notStarted: developer.notStartedPoints
        };
    }
    var completed = 0;
    var inProgress = 0;
    var notStarted = 0;
    var closedStatuses = ['done', 'closed', 'resolved', 'fixed', 'complete', 'completed', 'ready for production', 'in production', 'canceled', 'cancelled'];
    var notStartedStatuses = ['', 'to do', 'todo', 'open', 'new', 'backlog', 'not started', 'ready', 'ready for dev', 'ready for development', 'groomed', 'refined', 'selected for development', 'intake', 'triage'];
    ((developer && developer.issues) || []).forEach(function (issue) {
        var pts = Number(issue.storyPoints) || 0;
        var state = issue.workState;
        if (!state) {
            var status = String(issue.status || '').trim().toLowerCase();
            if (closedStatuses.indexOf(status) !== -1) state = 'completed';
            else if (notStartedStatuses.indexOf(status) !== -1) state = 'notStarted';
            else state = 'inProgress';
        }
        if (state === 'completed') completed += pts;
        else if (state === 'inProgress') inProgress += pts;
        else notStarted += pts;
    });
    return { completed: completed, inProgress: inProgress, notStarted: notStarted };
}

function formatCapacityDateRange_(startIso, endIso) {
    if (!startIso || !endIso) return '';
    var start = new Date(startIso);
    var end = new Date(endIso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
        var fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
        return fmt.format(start) + ' – ' + fmt.format(end);
    }
    return (start.getMonth() + 1) + '/' + start.getDate() + ' – ' + (end.getMonth() + 1) + '/' + end.getDate();
}

function appendStackedSegments_(track, breakdown, denominator) {
    var inner = document.createElement('div');
    inner.className = 'flex h-full w-full overflow-hidden rounded-full';
    var segments = [
        { key: 'completed', value: breakdown.completed, className: 'h-full bg-[#008331]' },
        { key: 'inProgress', value: breakdown.inProgress, className: 'h-full bg-[#006FC1]' },
        { key: 'notStarted', value: breakdown.notStarted, className: 'h-full bg-slate-300' }
    ];
    segments.forEach(function (segment) {
        if (segment.value <= 0 || denominator <= 0) return;
        var el = document.createElement('div');
        el.className = segment.className;
        el.dataset ? (el.dataset.segment = segment.key) : el.setAttribute('data-segment', segment.key);
        el.style.width = ((segment.value / denominator) * 100) + '%';
        inner.appendChild(el);
    });
    track.appendChild(inner);
    return inner;
}

function renderCapacityPace_(capacity, numberFormat, percentFormat) {
    var paceBadge = document.getElementById('capacity-pace-badge');
    var daysLeftBadge = document.getElementById('capacity-days-left-badge');
    var sprintDates = document.getElementById('capacity-sprint-dates');
    var paceCard = document.getElementById('capacity-pace-card');
    var paceSummary = document.getElementById('capacity-pace-summary');
    var paceBurnrate = document.getElementById('capacity-pace-burnrate');
    var paceBreakdown = document.getElementById('capacity-pace-breakdown');
    var paceBar = document.getElementById('capacity-pace-bar');
    var teamSummary = document.getElementById('capacity-team-summary');
    var pillPlanned = document.getElementById('capacity-pill-planned');
    var pillDone = document.getElementById('capacity-pill-done');
    var pillTarget = document.getElementById('capacity-pill-target');
    var startInput = document.getElementById('capacity-sprint-start');
    var endInput = document.getElementById('capacity-sprint-end');

    var hasSprint = Boolean(capacity && capacity.sprintName && capacity.sprintName !== 'None');
    var pace = capacity && capacity.pace;
    if (hasSprint) bindCapacityDateInputs_(capacity.sprintName);
    if (startInput) startInput.value = hasSprint ? toYmdInputValue_(capacity.sprintStart) : '';
    if (endInput) endInput.value = hasSprint ? toYmdInputValue_(capacity.sprintEnd) : '';

    if (paceBadge) {
        if (hasSprint && pace && pace.label) {
            paceBadge.className = getCapacityPaceBadgeClass_(pace.status);
            paceBadge.textContent = pace.label;
        } else {
            paceBadge.className = 'hidden';
            paceBadge.textContent = '';
        }
    }

    if (daysLeftBadge) {
        if (hasSprint && pace && pace.daysRemaining != null) {
            daysLeftBadge.className = 'inline-flex items-center rounded-md bg-[#EBF5FF] border border-[#B8DCFF] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#006FC1]';
            daysLeftBadge.textContent = pace.daysRemaining === 0 && pace.timeElapsedPct >= 1 ?
                'SPRINT END REACHED' :
                numberFormat.format(pace.daysRemaining) + ' DAY(S) LEFT';
        } else {
            daysLeftBadge.className = 'hidden';
            daysLeftBadge.textContent = '';
        }
    }

    if (sprintDates) {
        var dateRange = hasSprint ? formatCapacityDateRange_(capacity.sprintStart, capacity.sprintEnd) : '';
        if (dateRange && pace && pace.totalDays != null) {
            var dayLabel = pace.unit || 'workdays';
            var timingText = pace.daysRemaining === 0 && pace.timeElapsedPct >= 1 ?
                'Sprint end reached' :
                'Day ' + numberFormat.format(pace.daysElapsed) + ' of ' + numberFormat.format(pace.totalDays) + ' ' + dayLabel +
                ' · ' + numberFormat.format(pace.daysRemaining) + ' left';
            sprintDates.textContent = dateRange + ' · ' + timingText;
            sprintDates.className = 'text-xs text-[#6F7171] mt-0.5';
        } else if (dateRange) {
            sprintDates.textContent = dateRange;
            sprintDates.className = 'text-xs text-[#6F7171] mt-0.5';
        } else {
            sprintDates.textContent = '';
            sprintDates.className = 'text-xs text-[#6F7171] mt-0.5 hidden';
        }
    }

    if (!paceCard) return;
    if (!hasSprint || !pace) {
        paceCard.className = 'mt-3.5 pt-3.5 border-t border-[#D8DADA] hidden';
        return;
    }

    paceCard.className = 'mt-3.5 pt-3.5 border-t border-[#D8DADA]';
    var completedPts = capacity.completedPoints || 0;
    var inProgressPts = capacity.inProgressPoints || 0;
    var notStartedPts = capacity.notStartedPoints || 0;
    var totalPts = capacity.totalStoryPoints || 0;
    var expectedTargetPts = pace.timeElapsedPct != null ?
        Math.round((totalPts * Math.min(1, Math.max(0, pace.timeElapsedPct))) * 10) / 10 : totalPts;
    if (pillPlanned) pillPlanned.textContent = numberFormat.format(totalPts);
    if (pillDone) pillDone.textContent = numberFormat.format(completedPts);
    if (pillTarget) pillTarget.textContent = numberFormat.format(expectedTargetPts);

    if (paceSummary) {
        var basisLabel = pace.metricBasis === 'issues' ? 'issues' : 'points';
        var completedLabel = percentFormat.format(pace.completedPct || 0) + ' ' + basisLabel + ' completed';
        if (pace.timeElapsedPct != null) {
            paceSummary.textContent = pace.label + ' · ' + completedLabel + ' vs. ' + percentFormat.format(pace.timeElapsedPct) + ' time elapsed';
        } else {
            paceSummary.textContent = pace.label + ' · ' + completedLabel;
        }
    }

    if (paceBurnrate) {
        var remWork = pace.metricBasis === 'issues' ?
            (pace.remainingIssues != null ? pace.remainingIssues : Math.max(0, (capacity.totalIssues || 0) - (capacity.completedIssues || 0))) :
            (pace.remainingPoints != null ? pace.remainingPoints : Math.max(0, totalPts - completedPts));
        var unitShort = pace.metricBasis === 'issues' ? 'issues' : 'pts';
        if (pace.status === 'no_dates') {
            paceBurnrate.textContent = numberFormat.format(remWork) + ' ' + unitShort + ' remaining · Set sprint Start & End dates to track On track / Behind pace.';
        } else if (pace.daysRemaining != null) {
            var dayUnit = pace.unit || 'workdays';
            var rateText = pace.requiredPointsPerDay != null && pace.expectedPointsPerDay != null ?
                ' (' + numberFormat.format(pace.requiredPointsPerDay) + ' ' + unitShort + '/day needed vs. ' +
                numberFormat.format(pace.expectedPointsPerDay) + ' ' + unitShort + '/day target)' : '';
            paceBurnrate.textContent = numberFormat.format(remWork) + ' ' + unitShort + ' remaining · ' +
                numberFormat.format(pace.daysRemaining) + ' ' + dayUnit + ' left' + rateText;
        } else {
            paceBurnrate.textContent = numberFormat.format(remWork) + ' ' + unitShort + ' remaining';
        }
    }

    if (paceBreakdown) {
        var parts = [
            numberFormat.format(completedPts) + ' done',
            numberFormat.format(inProgressPts) + ' in progress',
            numberFormat.format(notStartedPts) + ' not started'
        ];
        if (capacity.unestimatedIssues > 0) {
            parts.push(numberFormat.format(capacity.unestimatedIssues) + ' unestimated');
        }
        paceBreakdown.textContent = parts.join(' · ');
    }

    if (paceBar) {
        paceBar.replaceChildren();
        var denominator = totalPts > 0 ? totalPts : Math.max(1, capacity.totalIssues || 0);
        var barBreakdown = totalPts > 0 ?
            { completed: completedPts, inProgress: inProgressPts, notStarted: notStartedPts } :
            {
                completed: capacity.completedIssues || 0,
                inProgress: Math.max(0, Math.round((pace.activePct - pace.completedPct) * (capacity.totalIssues || 0))),
                notStarted: Math.max(0, (capacity.totalIssues || 0) - Math.round((pace.activePct || 0) * (capacity.totalIssues || 0)))
            };
        appendStackedSegments_(paceBar, barBreakdown, denominator);
        if (pace.timeElapsedPct != null) {
            var marker = document.createElement('div');
            marker.className = 'absolute -top-1 -bottom-1 w-0.5 bg-gray-900 pointer-events-none';
            marker.setAttribute('data-marker', 'elapsed');
            marker.style.left = (Math.min(1, Math.max(0, pace.timeElapsedPct)) * 100) + '%';
            marker.title = 'Elapsed sprint time: ' + percentFormat.format(pace.timeElapsedPct);
            paceBar.appendChild(marker);
        }
    }

    if (teamSummary) {
        if (capacity.totalCapacity != null) {
            var teamRemaining = capacity.totalCapacity - totalPts;
            teamSummary.textContent = 'Team capacity: ' + numberFormat.format(totalPts) + ' / ' +
                numberFormat.format(capacity.totalCapacity) + ' pts (' +
                (teamRemaining < 0 ? numberFormat.format(Math.abs(teamRemaining)) + ' over' : numberFormat.format(teamRemaining) + ' left') + ')';
        } else {
            teamSummary.textContent = '';
        }
    }
}

var activeCapacityTab_ = 'current';
var capacityGroupByManager_ = (function () {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('projecthub_capacity_group_manager_v1') === '1';
    } catch (e) {
        return false;
    }
})();

var capacityFilterAtRisk_ = false;
var capacityCurrentFilter_ = '';
var capacityTeamScope_ = '';
var capacityUiPrefs_ = {
    showPaceSidebar: true,
    showTodayIndicator: true,
    showSprintEndIndicator: true
};

function matchesCapacityTeamScope_(developer, pctResolver) {
    if (!capacityTeamScope_) return true;
    if (!developer || developer.developer === 'Unassigned') return false;
    var resolver = pctResolver || buildClientActPctResolver_();
    if (capacityTeamScope_.indexOf('pct:') === 0) {
        var targetPct = capacityTeamScope_.slice(4).trim().toLowerCase();
        var devPct = String(resolver.resolveForDeveloper(developer) || '').trim().toLowerCase();
        return devPct === targetPct;
    }
    if (capacityTeamScope_.indexOf('mgr:') === 0) {
        var targetMgr = capacityTeamScope_.slice(4).trim().toLowerCase();
        var devMgr = String(developer.manager || '').trim().toLowerCase();
        return devMgr === targetMgr;
    }
    return true;
}

function populateCapacityTeamScopeDropdown_(developers) {
    var select = document.getElementById('capacity-team-scope');
    if (!select || typeof select.replaceChildren !== 'function') return;
    var resolver = buildClientActPctResolver_();
    var pcts = new Set();
    var managers = new Set();
    (developers || []).forEach(function (dev) {
        if (!dev || dev.developer === 'Unassigned') return;
        var p = resolver.resolveForDeveloper(dev);
        if (p) pcts.add(p);
        var m = String(dev.manager || '').trim();
        if (m) managers.add(m);
    });
    ((APP_STATE && APP_STATE.allData && APP_STATE.allData.developerCapacity) || []).forEach(function (c) {
        if (!c) return;
        if (c.pct) pcts.add(String(c.pct).trim());
        if (c.manager) managers.add(String(c.manager).trim());
    });
    var prev = capacityTeamScope_;
    select.replaceChildren();
    var allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All Team Members';
    select.appendChild(allOpt);
    Array.from(pcts).filter(Boolean).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = 'pct:' + p;
        opt.textContent = 'PCT: ' + p;
        select.appendChild(opt);
    });
    Array.from(managers).filter(Boolean).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = 'mgr:' + m;
        opt.textContent = 'Manager: ' + m;
        select.appendChild(opt);
    });
    select.value = prev;
}

function isCapacityDeveloperAtRisk_(developer) {
    if (!developer || developer.developer === 'Unassigned') return false;
    var paceStatus = developer.pace && developer.pace.status;
    if (paceStatus === 'at_risk' || paceStatus === 'behind') return true;
    if (developer.remaining != null && developer.remaining < 0) return true;
    return false;
}

function isCapacityDeveloperOverCapacity_(developer) {
    if (!developer || developer.developer === 'Unassigned') return false;
    return developer.remaining != null && developer.remaining < 0;
}

function isCapacityDeveloperUnderCapacity_(developer) {
    if (!developer || developer.developer === 'Unassigned') return false;
    return developer.remaining != null && developer.remaining > 0;
}

function setCapacityCurrentFilter_(filterKey) {
    capacityCurrentFilter_ = capacityCurrentFilter_ === filterKey ? '' : filterKey;
    capacityFilterAtRisk_ = capacityCurrentFilter_ === 'at_risk';
}

function filterCapacityDevelopers_(developers) {
    var list = developers || [];
    if (capacityTeamScope_) {
        var resolver = buildClientActPctResolver_();
        list = list.filter(function (d) { return matchesCapacityTeamScope_(d, resolver); });
    }
    if (capacityCurrentFilter_ === 'at_risk') return list.filter(isCapacityDeveloperAtRisk_);
    if (capacityCurrentFilter_ === 'over_capacity') return list.filter(isCapacityDeveloperOverCapacity_);
    if (capacityCurrentFilter_ === 'under_capacity') return list.filter(isCapacityDeveloperUnderCapacity_);
    return list;
}

function getTabCapacityCounts_(tabKey) {
    var allData = (APP_STATE && APP_STATE.allData) || {};
    var targetTab = tabKey || activeCapacityTab_ || 'current';
    var devs = [];
    if (targetTab === 'current') {
        var cap = resolveSprintCapacityWithDates_(allData.sprintCapacity || { sprintName: 'None', developers: [] });
        devs = (cap && cap.developers) || [];
    } else if (targetTab === 'future') {
        (allData.futureSprintCapacity || []).forEach(function (sp) {
            var resolvedSp = resolveSprintCapacityWithDates_(sp);
            devs = devs.concat((resolvedSp && resolvedSp.developers) || []);
        });
    }
    return {
        atRisk: devs.filter(isCapacityDeveloperAtRisk_).length,
        overCapacity: devs.filter(isCapacityDeveloperOverCapacity_).length,
        underCapacity: devs.filter(isCapacityDeveloperUnderCapacity_).length
    };
}

function syncCapacityFilterButtons_(counts) {
    var c = counts || getTabCapacityCounts_(activeCapacityTab_);
    var showFilters = activeCapacityTab_ === 'current' || activeCapacityTab_ === 'future';
    var configs = [
        {
            key: 'at_risk',
            btnId: 'capacity-filter-at-risk',
            countId: 'capacity-filter-at-risk-count',
            count: c.atRisk,
            activeBtnClass: 'inline-flex items-center gap-1.5 rounded-full border border-[#B95319] bg-[#B95319] px-3 py-1.5 text-xs font-medium text-white transition-colors',
            highlightCountClass: 'rounded-full bg-[#FFECE0] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#B95319]'
        },
        {
            key: 'over_capacity',
            btnId: 'capacity-filter-over-capacity',
            countId: 'capacity-filter-over-capacity-count',
            count: c.overCapacity,
            activeBtnClass: 'inline-flex items-center gap-1.5 rounded-full border border-[#B95319] bg-[#B95319] px-3 py-1.5 text-xs font-medium text-white transition-colors',
            highlightCountClass: 'rounded-full bg-[#FFECE0] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#B95319]'
        },
        {
            key: 'under_capacity',
            btnId: 'capacity-filter-under-capacity',
            countId: 'capacity-filter-under-capacity-count',
            count: c.underCapacity,
            activeBtnClass: 'inline-flex items-center gap-1.5 rounded-full border border-[#008331] bg-[#008331] px-3 py-1.5 text-xs font-medium text-white transition-colors',
            highlightCountClass: 'rounded-full bg-[#DCF5E6] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#008331]'
        }
    ];
    configs.forEach(function (cfg) {
        var btn = document.getElementById(cfg.btnId);
        var isActive = capacityCurrentFilter_ === cfg.key;
        if (btn) {
            btn.hidden = !showFilters;
            btn.setAttribute('aria-pressed', String(isActive));
            var baseClass = isActive ? cfg.activeBtnClass :
                'inline-flex items-center gap-1.5 rounded-full border border-[#D8DADA] bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-[#F6F6F6] transition-colors';
            btn.className = showFilters ? baseClass : (baseClass + ' hidden');
        }
        var countEl = document.getElementById(cfg.countId);
        if (countEl && typeof cfg.count === 'number') {
            countEl.textContent = String(cfg.count);
            if (isActive) {
                countEl.className = 'rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white';
            } else {
                countEl.className = cfg.count > 0 ? cfg.highlightCountClass :
                    'rounded-full bg-[#F6F6F6] px-1.5 py-0.5 text-[11px] tabular-nums text-[#6F7171]';
            }
        }
    });
}

var capacityGroupByPct_ = (function () {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('projecthub_capacity_group_pct_v1') === '1';
    } catch (e) {
        return false;
    }
})();
var capacityExpandAllIssues_ = false;

function buildClientActPctResolver_() {
    var allData = (APP_STATE && APP_STATE.allData) || {};
    var projects = allData.projects || [];
    var devCapList = allData.developerCapacity || [];
    var norm = function (v) {
        return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
    };
    var actPctByJiraKey = new Map();
    var actPctBySummary = new Map();
    var projectByJiraKey = new Map();
    projects.forEach(function (p) {
        if (!p || typeof p !== 'object') return;
        var jk = norm(p['Jira #']);
        var sum = norm(p.Summary || p.Title);
        var ap = String(p['ACT/PCT'] || '').trim();
        if (jk) projectByJiraKey.set(jk, p);
        if (ap) {
            if (jk) actPctByJiraKey.set(jk, ap);
            if (sum) actPctBySummary.set(sum, ap);
        }
    });
    var resolveProjectPct = function (p, visited) {
        if (!p || typeof p !== 'object') return '';
        var direct = String(p['ACT/PCT'] || '').trim();
        if (direct) return direct;
        var epicLink = norm(p['Epic Link']);
        if (epicLink) {
            var byKey = actPctByJiraKey.get(epicLink);
            if (byKey) return byKey;
            var bySum = actPctBySummary.get(epicLink);
            if (bySum) return bySum;
        }
        var rawLinks = String(p['Links'] || p['Linked Issues'] || '').trim();
        if (rawLinks) {
            var seen = visited || new Set();
            var selfKey = norm(p['Jira #']);
            if (selfKey) seen.add(selfKey);
            var parts = rawLinks.split(',');
            for (var i = 0; i < parts.length; i++) {
                var lk = norm(parts[i]);
                if (!lk || seen.has(lk)) continue;
                var directLinked = actPctByJiraKey.get(lk);
                if (directLinked) return directLinked;
                var linkedProj = projectByJiraKey.get(lk);
                if (linkedProj) {
                    seen.add(lk);
                    var nested = resolveProjectPct(linkedProj, seen);
                    if (nested) return nested;
                }
            }
        }
        return '';
    };
    var configuredPctByDev = new Map();
    devCapList.forEach(function (c) {
        if (!c || !c.developer) return;
        var dk = norm(c.developer);
        var explicitPct = String(c.pct || (c.sprintOverrides && c.sprintOverrides.__pct__) || '').trim();
        if (dk && explicitPct) configuredPctByDev.set(dk, explicitPct);
    });
    var fallbackPctByDev = new Map();
    projects.forEach(function (p) {
        var dev = norm(p && (p.Assignee || p.assignee || p['Assigned Dev']));
        if (!dev || dev === 'unassigned' || fallbackPctByDev.has(dev)) return;
        var resolved = resolveProjectPct(p);
        if (resolved) fallbackPctByDev.set(dev, resolved);
    });
    return {
        resolveForDeveloper: function (developer) {
            if (!developer || developer.developer === 'Unassigned') return '';
            var dk = norm(developer.developer);
            if (configuredPctByDev.has(dk)) return configuredPctByDev.get(dk);
            if (developer.pct && String(developer.pct).trim()) return String(developer.pct).trim();
            var sprintIssues = developer.issues || [];
            for (var i = 0; i < sprintIssues.length; i++) {
                var iss = sprintIssues[i];
                var ik = norm(iss && iss.jiraKey);
                if (ik && projectByJiraKey.has(ik)) {
                    var issPct = resolveProjectPct(projectByJiraKey.get(ik));
                    if (issPct) return issPct;
                }
            }
            return fallbackPctByDev.get(dk) || '';
        }
    };
}

function syncCapacityGroupButton_() {
    var showGrouping = activeCapacityTab_ === 'current' || activeCapacityTab_ === 'future';
    var drillToolbar = document.getElementById('capacity-drilldown-toolbar');
    if (drillToolbar) {
        drillToolbar.hidden = !showGrouping;
        drillToolbar.className = showGrouping ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-2 hidden';
    }
    var btn = document.getElementById('capacity-group-by-manager');
    if (btn) {
        btn.hidden = !showGrouping;
        btn.setAttribute('aria-pressed', String(capacityGroupByManager_));
        var mgrClass = capacityGroupByManager_ ?
            'inline-flex items-center gap-1.5 rounded-full border border-black bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors' :
            'inline-flex items-center gap-1.5 rounded-full border border-[#D8DADA] bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-[#F6F6F6] transition-colors';
        btn.className = showGrouping ? mgrClass : (mgrClass + ' hidden');
    }
    var pctBtn = document.getElementById('capacity-group-by-pct');
    if (pctBtn) {
        pctBtn.hidden = !showGrouping;
        pctBtn.setAttribute('aria-pressed', String(capacityGroupByPct_));
        var pctClass = capacityGroupByPct_ ?
            'inline-flex items-center gap-1.5 rounded-full border border-black bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors' :
            'inline-flex items-center gap-1.5 rounded-full border border-[#D8DADA] bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-[#F6F6F6] transition-colors';
        pctBtn.className = showGrouping ? pctClass : (pctClass + ' hidden');
    }
    var expandBtn = document.getElementById('capacity-expand-all-issues');
    if (expandBtn) {
        expandBtn.hidden = !showGrouping;
        expandBtn.setAttribute('aria-pressed', String(capacityExpandAllIssues_));
        var expLabel = expandBtn.querySelector ? expandBtn.querySelector('span') : null;
        var text = capacityExpandAllIssues_ ? 'Collapse all issues' : 'Expand all issues';
        if (expLabel) expLabel.textContent = text; else expandBtn.textContent = text;
        var expClass = capacityExpandAllIssues_ ?
            'inline-flex items-center gap-1.5 rounded-full border border-black bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors' :
            'inline-flex items-center gap-1.5 rounded-full border border-[#D8DADA] bg-[#F6F6F6] px-3 py-1.5 text-xs font-medium text-black hover:border-black transition-colors';
        expandBtn.className = showGrouping ? expClass : (expClass + ' hidden');
    }
}

function syncCapacityFilterBanner_(allDevs, displayedDevs, numberFormat) {
    var banner = document.getElementById('capacity-filter-banner');
    var bannerText = document.getElementById('capacity-filter-banner-text');
    if (!banner) return;
    var show = (activeCapacityTab_ === 'current' || activeCapacityTab_ === 'future') && Boolean(capacityCurrentFilter_);
    if (!show) {
        banner.hidden = true;
        banner.className = 'hidden mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F5C6A5] bg-[#FFECE0]/70 px-4 py-2 text-xs text-black';
        return;
    }
    var list = displayedDevs || [];
    var overPts = 0;
    var behindCount = 0;
    var unestCount = 0;
    list.forEach(function (d) {
        if (!d) return;
        if (d.remaining != null && d.remaining < 0) overPts += Math.abs(d.remaining);
        if (d.pace && (d.pace.status === 'at_risk' || d.pace.status === 'behind')) behindCount++;
        if (d.unestimatedCount > 0) unestCount += d.unestimatedCount;
    });
    var filterLabel = capacityCurrentFilter_ === 'at_risk' ? 'at-risk' :
        capacityCurrentFilter_ === 'over_capacity' ? 'over-capacity' : 'under-capacity';
    var details = [];
    if (overPts > 0) details.push(numberFormat.format(Math.round(overPts * 100) / 100) + ' pts over capacity');
    if (behindCount > 0) details.push(numberFormat.format(behindCount) + ' behind pace');
    if (unestCount > 0) details.push(numberFormat.format(unestCount) + (unestCount === 1 ? ' unestimated story in Jira' : ' unestimated stories in Jira'));
    if (bannerText) {
        bannerText.textContent = 'Showing ' + numberFormat.format(list.length) + ' ' + filterLabel +
            (list.length === 1 ? ' developer' : ' developers') +
            (details.length ? ' · ' + details.join(' · ') : '');
    }
    var isUnder = capacityCurrentFilter_ === 'under_capacity';
    banner.hidden = false;
    banner.className = isUnder ?
        'mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#A3E2B9] bg-[#DCF5E6]/70 px-4 py-2 text-xs text-black' :
        'mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F5C6A5] bg-[#FFECE0]/70 px-4 py-2 text-xs text-black';
}

function setActiveCapacityTab_(tabKey) {
    var keys = ['current', 'future', 'nosprint', 'pastopen'];
    activeCapacityTab_ = keys.indexOf(tabKey) !== -1 ? tabKey : 'current';
    keys.forEach(function (key) {
        var btn = document.getElementById('capacity-tab-' + key);
        var panel = document.getElementById('capacity-panel-' + key);
        var isActive = key === activeCapacityTab_;
        if (btn) {
            btn.setAttribute('aria-selected', String(isActive));
            btn.className = isActive ?
                'inline-flex items-center gap-2 rounded-full border border-black bg-black px-3.5 py-1.5 text-xs font-medium text-white transition-colors' :
                'inline-flex items-center gap-2 rounded-full border border-[#D8DADA] bg-white px-3.5 py-1.5 text-xs font-medium text-black hover:bg-[#F6F6F6] transition-colors';
        }
        if (panel) {
            panel.className = isActive ? 'px-4 pb-6' : 'px-4 pb-6 hidden';
        }
    });
    syncCapacityFilterButtons_();
    syncCapacityGroupButton_();
}

function bindCapacitySubTabs_() {
    ['current', 'future', 'nosprint', 'pastopen'].forEach(function (key) {
        var btn = document.getElementById('capacity-tab-' + key);
        if (btn && !btn._capTabBound) {
            btn._capTabBound = true;
            btn.addEventListener('click', function () { setActiveCapacityTab_(key); });
        }
    });
    var tileAtRisk = document.getElementById('capacity-tile-atrisk');
    if (tileAtRisk && !tileAtRisk._capTabBound) {
        tileAtRisk._capTabBound = true;
        tileAtRisk.addEventListener('click', function () {
            setActiveCapacityTab_('current');
            setCapacityCurrentFilter_('at_risk');
            syncCapacityFilterButtons_();
            renderCapacityView();
        });
    }
    var topAtRiskCard = document.getElementById('at-risk-devs-card');
    if (topAtRiskCard && !topAtRiskCard._capKpiBound) {
        topAtRiskCard._capKpiBound = true;
        topAtRiskCard.addEventListener('click', function () {
            APP_STATE.currentView = 'capacity';
            capacityCurrentFilter_ = 'at_risk';
            capacityFilterAtRisk_ = true;
            setActiveCapacityTab_('current');
            var capBtn = document.querySelector && document.querySelector('.view-btn[data-view="capacity"]');
            if (capBtn && typeof capBtn.click === 'function') {
                capBtn.click();
            } else {
                renderApp();
            }
        });
    }
    var tileNoSprint = document.getElementById('capacity-tile-nosprint');
    if (tileNoSprint && !tileNoSprint._capTabBound) {
        tileNoSprint._capTabBound = true;
        tileNoSprint.addEventListener('click', function () { setActiveCapacityTab_('nosprint'); });
    }
    var tilePastOpen = document.getElementById('capacity-tile-pastopen');
    if (tilePastOpen && !tilePastOpen._capTabBound) {
        tilePastOpen._capTabBound = true;
        tilePastOpen.addEventListener('click', function () { setActiveCapacityTab_('pastopen'); });
    }
    [
        { id: 'capacity-filter-at-risk', key: 'at_risk' },
        { id: 'capacity-filter-over-capacity', key: 'over_capacity' },
        { id: 'capacity-filter-under-capacity', key: 'under_capacity' }
    ].forEach(function (item) {
        var filterBtn = document.getElementById(item.id);
        if (filterBtn && !filterBtn._capFilterBound) {
            filterBtn._capFilterBound = true;
            filterBtn.addEventListener('click', function () {
                setCapacityCurrentFilter_(item.key);
                syncCapacityFilterButtons_();
                renderCapacityView();
            });
        }
    });
    var groupBtn = document.getElementById('capacity-group-by-manager');
    if (groupBtn && !groupBtn._capGroupBound) {
        groupBtn._capGroupBound = true;
        groupBtn.addEventListener('click', function () {
            capacityGroupByManager_ = !capacityGroupByManager_;
            if (capacityGroupByManager_) capacityGroupByPct_ = false;
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('projecthub_capacity_group_manager_v1', capacityGroupByManager_ ? '1' : '0');
                    localStorage.setItem('projecthub_capacity_group_pct_v1', capacityGroupByPct_ ? '1' : '0');
                }
            } catch (e) { }
            syncCapacityGroupButton_();
            renderCapacityView();
        });
    }
    var groupPctBtn = document.getElementById('capacity-group-by-pct');
    if (groupPctBtn && !groupPctBtn._capGroupPctBound) {
        groupPctBtn._capGroupPctBound = true;
        groupPctBtn.addEventListener('click', function () {
            capacityGroupByPct_ = !capacityGroupByPct_;
            if (capacityGroupByPct_) capacityGroupByManager_ = false;
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('projecthub_capacity_group_pct_v1', capacityGroupByPct_ ? '1' : '0');
                    localStorage.setItem('projecthub_capacity_group_manager_v1', capacityGroupByManager_ ? '1' : '0');
                }
            } catch (e) { }
            syncCapacityGroupButton_();
            renderCapacityView();
        });
    }
    var expandAllBtn = document.getElementById('capacity-expand-all-issues');
    if (expandAllBtn && !expandAllBtn._capExpandBound) {
        expandAllBtn._capExpandBound = true;
        expandAllBtn.addEventListener('click', function () {
            capacityExpandAllIssues_ = !capacityExpandAllIssues_;
            syncCapacityGroupButton_();
            renderCapacityView();
        });
    }
    var resetFilterBtn = document.getElementById('capacity-filter-reset');
    if (resetFilterBtn && !resetFilterBtn._capResetBound) {
        resetFilterBtn._capResetBound = true;
        resetFilterBtn.addEventListener('click', function () {
            capacityCurrentFilter_ = '';
            capacityFilterAtRisk_ = false;
            capacityTeamScope_ = '';
            var scopeSel = document.getElementById('capacity-team-scope');
            if (scopeSel) scopeSel.value = '';
            syncCapacityFilterButtons_();
            renderCapacityView();
        });
    }
    var tileCommitted = document.getElementById('capacity-tile-committed');
    if (tileCommitted && !tileCommitted._capCommittedBound) {
        tileCommitted._capCommittedBound = true;
        tileCommitted.addEventListener('click', function () {
            capacityCurrentFilter_ = '';
            capacityFilterAtRisk_ = false;
            setActiveCapacityTab_('current');
            syncCapacityFilterButtons_();
            renderCapacityView();
        });
    }
    var teamScopeSelect = document.getElementById('capacity-team-scope');
    if (teamScopeSelect && !teamScopeSelect._capScopeBound) {
        teamScopeSelect._capScopeBound = true;
        teamScopeSelect.addEventListener('change', function () {
            capacityTeamScope_ = String(teamScopeSelect.value || '');
            renderCapacityView();
        });
    }
    var openSettingsBtn = document.getElementById('capacity-open-settings-btn');
    if (openSettingsBtn && !openSettingsBtn._capSettingsBound) {
        openSettingsBtn._capSettingsBound = true;
        openSettingsBtn.addEventListener('click', function () {
            openCapacityQuickSettingsModal_();
        });
    }
    syncCapacityGroupButton_();
}

function getDeveloperInitials_(name) {
    var clean = String(name || '').trim();
    if (!clean || clean === 'Unassigned') return '?';
    var parts = clean.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
}

function renderCapacityPaceSidebar_(capacity, displayedDevs, numberFormat) {
    var sidebar = document.getElementById('capacity-pace-sidebar');
    var mainCol = document.getElementById('capacity-main-table-col');
    if (!sidebar) return;
    if (!capacityUiPrefs_.showPaceSidebar) {
        sidebar.hidden = true;
        sidebar.className = 'hidden';
        if (mainCol) mainCol.className = 'lg:col-span-12 overflow-x-auto rounded-xl border border-[#D8DADA] bg-white shadow-sm';
        return;
    }
    sidebar.hidden = false;
    sidebar.className = 'lg:col-span-4 rounded-xl border border-[#D8DADA] bg-white p-4 shadow-sm';
    if (mainCol) mainCol.className = 'lg:col-span-8 overflow-x-auto rounded-xl border border-[#D8DADA] bg-white shadow-sm';

    var teamNameEl = document.getElementById('capacity-sidebar-team-name');
    var teamBarEl = document.getElementById('capacity-sidebar-team-bar');
    var teamCaptionEl = document.getElementById('capacity-sidebar-team-caption');
    var teamTotalEl = document.getElementById('capacity-sidebar-team-total');
    var memberCountEl = document.getElementById('capacity-sidebar-member-count');
    var membersContainer = document.getElementById('capacity-sidebar-members');

    var scopeLabel = 'All Team Members';
    if (capacityTeamScope_.indexOf('pct:') === 0) scopeLabel = capacityTeamScope_.slice(4);
    else if (capacityTeamScope_.indexOf('mgr:') === 0) scopeLabel = capacityTeamScope_.slice(4) + ' Team';
    if (teamNameEl) teamNameEl.textContent = scopeLabel;

    var pace = capacity && capacity.pace;
    var elapsedRatio = (pace && typeof pace.timeElapsedPct === 'number') ?
        Math.min(1, Math.max(0, pace.timeElapsedPct)) : 0.5;

    var members = (displayedDevs || []).filter(function (d) { return d && d.developer !== 'Unassigned'; });
    if (memberCountEl) {
        memberCountEl.textContent = numberFormat.format(members.length) + (members.length === 1 ? ' dev' : ' devs');
    }

    var teamCompleted = 0;
    var teamAssigned = 0;
    var teamCapacity = 0;
    var hasTeamCap = false;
    members.forEach(function (dev) {
        var bd = getDeveloperPointBreakdown_(dev);
        teamCompleted += bd.completed;
        teamAssigned += dev.storyPoints || 0;
        if (dev.capacity != null) {
            teamCapacity += dev.capacity;
            hasTeamCap = true;
        }
    });
    var teamExpected = Math.round((teamAssigned * elapsedRatio) * 10) / 10;
    var teamVsExpectedPct = teamExpected > 0 ? Math.round((teamCompleted / teamExpected) * 1000) / 10 :
        (teamCompleted > 0 ? 100 : 0);

    if (teamBarEl) {
        teamBarEl.replaceChildren();
        var denom = Math.max(teamAssigned, teamCapacity, 1);
        var fillWrap = document.createElement('div');
        fillWrap.className = 'flex h-full w-full overflow-hidden rounded-full';
        var fill = document.createElement('div');
        fill.className = teamCompleted >= teamExpected ? 'h-full bg-[#008331]' : 'h-full bg-[#D97706]';
        fill.style.width = Math.min(100, (teamCompleted / denom) * 100) + '%';
        fillWrap.appendChild(fill);
        teamBarEl.appendChild(fillWrap);
        if (capacityUiPrefs_.showTodayIndicator && teamAssigned > 0) {
            var marker = document.createElement('div');
            marker.className = 'absolute -top-1 -bottom-1 w-0.5 bg-black pointer-events-none';
            marker.style.left = Math.min(100, (teamExpected / denom) * 100) + '%';
            marker.title = 'Expected completed today: ' + numberFormat.format(teamExpected) + 'p';
            teamBarEl.appendChild(marker);
        }
    }
    if (teamCaptionEl) {
        teamCaptionEl.textContent = '(' + numberFormat.format(teamCompleted) + 'p completed of ' +
            numberFormat.format(teamExpected) + 'p expected) ' + numberFormat.format(teamVsExpectedPct) + '%';
    }
    if (teamTotalEl) {
        teamTotalEl.textContent = hasTeamCap ?
            (numberFormat.format(teamAssigned) + ' / ' + numberFormat.format(teamCapacity) + 'p') :
            (numberFormat.format(teamAssigned) + 'p');
    }

    if (!membersContainer) return;
    membersContainer.replaceChildren();
    if (!members.length) {
        var emptyEl = document.createElement('p');
        emptyEl.className = 'text-xs text-[#6F7171] py-4 text-center';
        emptyEl.textContent = 'No matching developers for current filter.';
        membersContainer.appendChild(emptyEl);
        return;
    }

    var avatarColors = [
        'bg-[#D97706] text-white',
        'bg-[#006FC1] text-white',
        'bg-[#008331] text-white',
        'bg-[#7C3AED] text-white',
        'bg-[#DC2626] text-white',
        'bg-[#0D9488] text-white'
    ];
    members.forEach(function (dev, idx) {
        var bd = getDeveloperPointBreakdown_(dev);
        var assigned = dev.storyPoints || 0;
        var cap = dev.capacity;
        var overCap = dev.remaining != null && dev.remaining < 0;
        var expected = Math.round((assigned * elapsedRatio) * 10) / 10;
        var vsExpPct = expected > 0 ? Math.round((bd.completed / expected) * 1000) / 10 :
            (bd.completed > 0 ? 100 : 0);
        var isBehind = bd.completed < expected && assigned > 0;

        var card = document.createElement('div');
        card.className = overCap ?
            'rounded-lg border border-[#F5C6A5] bg-[#FFECE0]/40 p-2.5 cursor-pointer hover:border-[#B95319] transition-colors' :
            'rounded-lg border border-[#D8DADA]/80 bg-[#F6F6F6]/40 p-2.5 cursor-pointer hover:border-black transition-colors';
        card.setAttribute('data-sidebar-developer', dev.developer);

        var topRow = document.createElement('div');
        topRow.className = 'flex items-center justify-between gap-2';

        var leftInfo = document.createElement('div');
        leftInfo.className = 'flex items-center gap-2 min-w-0';
        var avatar = document.createElement('span');
        avatar.className = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ' +
            avatarColors[idx % avatarColors.length];
        avatar.textContent = getDeveloperInitials_(dev.developer);
        leftInfo.appendChild(avatar);

        var nameSpan = document.createElement('span');
        nameSpan.className = 'text-xs font-semibold text-black truncate';
        nameSpan.textContent = dev.developer;
        leftInfo.appendChild(nameSpan);
        topRow.appendChild(leftInfo);

        var loadPill = document.createElement('span');
        if (cap != null) {
            loadPill.className = overCap ?
                'inline-flex items-center rounded-md bg-[#FFECE0] border border-[#F5C6A5] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#B95319]' :
                'inline-flex items-center rounded-md bg-[#DCF5E6] border border-[#A3E2B9] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#008331]';
            loadPill.textContent = numberFormat.format(assigned) + ' / ' + numberFormat.format(cap);
        } else {
            loadPill.className = 'inline-flex items-center rounded-md bg-[#F6F6F6] border border-[#D8DADA] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[#6F7171]';
            loadPill.textContent = numberFormat.format(assigned) + 'p';
        }
        topRow.appendChild(loadPill);
        card.appendChild(topRow);

        var barTrack = document.createElement('div');
        barTrack.className = 'relative mt-2 h-2.5 w-full overflow-visible rounded-full bg-white border border-[#D8DADA]';
        var denom = Math.max(assigned, cap || 0, 1);
        var barInner = document.createElement('div');
        barInner.className = 'flex h-full w-full overflow-hidden rounded-full';
        var barFill = document.createElement('div');
        barFill.className = overCap ? 'h-full bg-[#B95319]' : (isBehind ? 'h-full bg-[#D97706]' : 'h-full bg-[#008331]');
        barFill.style.width = Math.min(100, (bd.completed / denom) * 100) + '%';
        barInner.appendChild(barFill);
        barTrack.appendChild(barInner);
        if (capacityUiPrefs_.showTodayIndicator && assigned > 0) {
            var expMarker = document.createElement('div');
            expMarker.className = 'absolute -top-0.5 -bottom-0.5 w-0.5 bg-black pointer-events-none';
            expMarker.style.left = Math.min(100, (expected / denom) * 100) + '%';
            expMarker.title = 'Expected today: ' + numberFormat.format(expected) + 'p';
            barTrack.appendChild(expMarker);
        }
        card.appendChild(barTrack);

        var capRow = document.createElement('div');
        capRow.className = 'mt-1 flex items-center justify-between gap-2 text-[11px] tabular-nums';
        var leftCap = document.createElement('span');
        leftCap.className = 'text-[#6F7171]';
        leftCap.textContent = '(' + numberFormat.format(bd.completed) + 'p out of expected ' +
            numberFormat.format(expected) + 'p) ' + numberFormat.format(vsExpPct) + '%';
        var rightCap = document.createElement('span');
        rightCap.className = 'font-medium text-black';
        rightCap.textContent = numberFormat.format(assigned) + 'p';
        capRow.appendChild(leftCap);
        capRow.appendChild(rightCap);
        card.appendChild(capRow);

        card.addEventListener('click', function () {
            var detailsEl = document.getElementById('capacity-issues-current-' + idx);
            if (detailsEl) {
                detailsEl.hidden = !detailsEl.hidden;
                if (typeof detailsEl.scrollIntoView === 'function') {
                    detailsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        });
        membersContainer.appendChild(card);
    });
}

function renderCapacityFooter_(tfoot, capacity, numberFormat) {
    if (!tfoot) return;
    tfoot.replaceChildren();
    if (!capacity || !capacity.developers || !capacity.developers.length) return;
    var row = tfoot.insertRow();
    row.className = 'bg-[#F6F6F6] border-t border-[#D8DADA] text-xs font-semibold text-black';
    var labelCell = row.insertCell();
    labelCell.className = 'px-4 py-2.5';
    labelCell.textContent = 'Team total';
    var issuesCell = row.insertCell();
    issuesCell.className = 'px-3 py-2.5 text-right tabular-nums';
    issuesCell.textContent = numberFormat.format(capacity.totalIssues || 0);
    var pointsCell = row.insertCell();
    pointsCell.className = 'px-3 py-2.5 text-right tabular-nums';
    pointsCell.textContent = numberFormat.format(capacity.totalStoryPoints || 0);
    var capCell = row.insertCell();
    capCell.className = 'px-3 py-2.5 text-right tabular-nums';
    capCell.textContent = capacity.totalCapacity == null ? '—' : numberFormat.format(capacity.totalCapacity);
    var remCell = row.insertCell();
    var teamRem = capacity.totalCapacity == null ? null : capacity.totalCapacity - (capacity.totalStoryPoints || 0);
    remCell.className = 'px-3 py-2.5 text-right tabular-nums ' + (teamRem == null ? 'text-[#6F7171]' : teamRem < 0 ? 'text-[#B95319]' : teamRem > 0 ? 'text-[#008331]' : 'text-[#6F7171]');
    remCell.textContent = teamRem == null ? '—' : numberFormat.format(teamRem);
    var wkCell = row.insertCell();
    wkCell.className = 'px-4 py-2.5 text-[#6F7171] font-normal';
    if (capacity.totalCapacity != null && capacity.totalCapacity > 0) {
        var pct = Math.round(((capacity.totalStoryPoints || 0) / capacity.totalCapacity) * 100);
        wkCell.textContent = pct + '% of configured team capacity';
    } else {
        wkCell.textContent = '';
    }
}

function renderCapacityView() {
    var rawCapacity = APP_STATE.allData.sprintCapacity || {
        sprintName: 'None', totalIssues: 0, totalStoryPoints: 0, developers: []
    };
    var capacity = resolveSprintCapacityWithDates_(rawCapacity);
    var sprintName = document.getElementById('capacity-sprint-name');
    var totalPoints = document.getElementById('capacity-total-points');
    var totalIssues = document.getElementById('capacity-total-issues');
    var body = document.getElementById('capacity-table-body');
    if (!body) return;

    var numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    var percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
    bindCapacitySubTabs_();
    if (sprintName) sprintName.textContent = capacity.sprintName && capacity.sprintName !== 'None' ? capacity.sprintName : 'No current sprint detected';
    if (totalPoints) totalPoints.textContent = numberFormat.format(capacity.totalStoryPoints || 0);
    if (totalIssues) totalIssues.textContent = numberFormat.format(capacity.totalIssues || 0);
    renderCapacityPace_(capacity, numberFormat, percentFormat);
    var allCurrentDevs = capacity.developers || [];
    populateCapacityTeamScopeDropdown_(allCurrentDevs);
    var atRiskDevs = allCurrentDevs.filter(isCapacityDeveloperAtRisk_);
    var overCapDevs = allCurrentDevs.filter(isCapacityDeveloperOverCapacity_);
    var underCapDevs = allCurrentDevs.filter(isCapacityDeveloperUnderCapacity_);
    syncCapacityFilterButtons_(activeCapacityTab_ === 'current' ? {
        atRisk: atRiskDevs.length,
        overCapacity: overCapDevs.length,
        underCapacity: underCapDevs.length
    } : undefined);
    var atRiskStat = document.getElementById('capacity-stat-atrisk');
    var atRiskSub = document.getElementById('capacity-stat-atrisk-sub');
    var atRiskTile = document.getElementById('capacity-tile-atrisk');
    var topAtRiskCount = document.getElementById('at-risk-devs-count');
    if (topAtRiskCount) {
        topAtRiskCount.textContent = numberFormat.format(atRiskDevs.length);
    }
    if (atRiskStat) {
        atRiskStat.textContent = numberFormat.format(atRiskDevs.length);
        atRiskStat.className = 'mt-1 text-2xl font-semibold tabular-nums ' + (atRiskDevs.length > 0 ? 'text-[#B95319]' : 'text-black');
    }
    if (atRiskSub) {
        if (atRiskDevs.length === 0) {
            atRiskSub.textContent = 'All developers on track';
        } else {
            var behindPaceCount = atRiskDevs.filter(function (d) {
                return d.pace && (d.pace.status === 'at_risk' || d.pace.status === 'behind');
            }).length;
            var riskParts = [];
            if (overCapDevs.length > 0) riskParts.push(numberFormat.format(overCapDevs.length) + ' over capacity');
            if (behindPaceCount > 0) riskParts.push(numberFormat.format(behindPaceCount) + ' behind pace');
            atRiskSub.textContent = riskParts.join(' · ') || (numberFormat.format(atRiskDevs.length) + ' need attention');
        }
    }
    if (atRiskTile) {
        atRiskTile.className = capacityCurrentFilter_ === 'at_risk' ?
            'text-left rounded-xl border-2 border-[#B95319] bg-[#FFECE0]/80 px-3.5 py-3 transition-colors' :
            atRiskDevs.length > 0 ?
                'text-left rounded-xl border border-[#F5C6A5] bg-[#FFECE0]/60 px-3.5 py-3 hover:border-[#B95319] transition-colors' :
                'text-left rounded-xl border border-[#D8DADA] bg-[#F6F6F6] px-3.5 py-3 hover:border-black transition-colors';
    }
    var displayedCurrentDevs = filterCapacityDevelopers_(allCurrentDevs);
    syncCapacityFilterBanner_(allCurrentDevs, displayedCurrentDevs, numberFormat);
    renderCapacityRows_(body, displayedCurrentDevs, numberFormat, 'current', true);
    renderCapacityFooter_(document.getElementById('capacity-table-footer'), capacity, numberFormat);
    renderCapacityPaceSidebar_(capacity, displayedCurrentDevs, numberFormat);

    var futureSprints = APP_STATE.allData.futureSprintCapacity || [];
    var noSprint = APP_STATE.allData.noSprintCapacity || { totalIssues: 0, totalStoryPoints: 0, developers: [] };
    var pastOpen = APP_STATE.allData.pastSprintOpenCapacity || { totalIssues: 0, totalStoryPoints: 0, issues: [] };

    var noSprintStat = document.getElementById('capacity-stat-nosprint');
    var noSprintSub = document.getElementById('capacity-stat-nosprint-sub');
    if (noSprintStat) noSprintStat.textContent = numberFormat.format(noSprint.totalIssues || 0);
    if (noSprintSub) noSprintSub.textContent = numberFormat.format(noSprint.totalStoryPoints || 0) + ' pts unscheduled';

    var pastOpenStat = document.getElementById('capacity-stat-pastopen');
    var pastOpenSub = document.getElementById('capacity-stat-pastopen-sub');
    var pastOpenTile = document.getElementById('capacity-tile-pastopen');
    if (pastOpenStat) {
        pastOpenStat.textContent = numberFormat.format(pastOpen.totalIssues || 0);
        pastOpenStat.className = 'mt-1 text-2xl font-semibold tabular-nums ' + ((pastOpen.totalIssues || 0) > 0 ? 'text-[#B95319]' : 'text-black');
    }
    if (pastOpenSub) pastOpenSub.textContent = numberFormat.format(pastOpen.totalStoryPoints || 0) + ' pts in past sprints';
    if (pastOpenTile) {
        pastOpenTile.className = (pastOpen.totalIssues || 0) > 0 ?
            'text-left rounded-xl border border-[#F5C6A5] bg-[#FFECE0]/60 px-3.5 py-3 hover:border-[#B95319] transition-colors' :
            'text-left rounded-xl border border-[#D8DADA] bg-[#F6F6F6] px-3.5 py-3 hover:border-black transition-colors';
    }

    var futureCountEl = document.getElementById('capacity-tab-future-count');
    var noSprintCountEl = document.getElementById('capacity-tab-nosprint-count');
    var pastOpenCountEl = document.getElementById('capacity-tab-pastopen-count');
    if (futureCountEl) futureCountEl.textContent = numberFormat.format(futureSprints.length);
    if (noSprintCountEl) noSprintCountEl.textContent = numberFormat.format(noSprint.totalIssues || 0);
    if (pastOpenCountEl) {
        pastOpenCountEl.textContent = numberFormat.format(pastOpen.totalIssues || 0);
        pastOpenCountEl.className = (pastOpen.totalIssues || 0) > 0 ?
            'rounded-full bg-[#FFECE0] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#B95319]' :
            'rounded-full bg-[#F6F6F6] px-1.5 py-0.5 text-[11px] tabular-nums text-[#6F7171]';
    }

    var futureContainer = document.getElementById('future-sprint-capacities');
    var futureEmpty = document.getElementById('future-sprint-empty');
    if (futureContainer) {
        futureContainer.replaceChildren();
        if (futureSprints.length) {
            if (futureEmpty) futureEmpty.className = 'hidden';
            var futureHeading = document.createElement('h2');
            futureHeading.className = 'text-lg font-semibold text-black mb-4';
            futureHeading.textContent = 'Future sprints';
            futureContainer.appendChild(futureHeading);
            futureSprints.forEach(function (rawFutureSprint, index) {
                var sprint = resolveSprintCapacityWithDates_(rawFutureSprint);
                var section = document.createElement('section');
                section.className = 'mb-6 rounded-xl border border-[#D8DADA] bg-white p-4';
                var heading = document.createElement('h3');
                heading.className = 'text-base font-semibold text-black';
                heading.textContent = sprint.sprintName;
                section.appendChild(heading);
                var summary = document.createElement('p');
                summary.className = 'text-xs text-[#6F7171] mt-0.5 mb-3';
                var dateRange = formatCapacityDateRange_(sprint.sprintStart, sprint.sprintEnd);
                var ptoSummaryParts = [];
                if (sprint.holidayDays > 0) ptoSummaryParts.push(numberFormat.format(sprint.holidayDays) + 'd holiday');
                if (sprint.totalPtoDays > 0) ptoSummaryParts.push(numberFormat.format(sprint.totalPtoDays) + 'd team PTO');
                summary.textContent = (dateRange ? dateRange + ' · ' : '') +
                    numberFormat.format(sprint.totalStoryPoints) + ' story points · ' +
                    numberFormat.format(sprint.totalIssues) + (sprint.totalIssues === 1 ? ' issue' : ' issues') +
                    (ptoSummaryParts.length ? ' · ' + ptoSummaryParts.join(' · ') : '');
                section.appendChild(summary);
                var tableWrapper = document.createElement('div');
                tableWrapper.className = 'overflow-x-auto';
                var table = document.createElement('table');
                table.className = 'w-full text-sm';
                var header = table.createTHead().insertRow();
                header.className = 'bg-[#F6F6F6] border-y border-[#D8DADA] text-left text-xs font-medium text-[#6F7171]';
                ['Developer', 'Issues', 'Story points', 'Capacity', 'Remaining', 'Workload'].forEach(function (label, colIdx) {
                    var cell = document.createElement('th');
                    cell.scope = 'col';
                    cell.className = 'px-3 py-2' + (colIdx > 0 && colIdx < 5 ? ' text-right' : '');
                    cell.textContent = label;
                    header.appendChild(cell);
                });
                var futureBody = table.createTBody();
                var displayedFutureDevs = filterCapacityDevelopers_(sprint.developers);
                renderCapacityRows_(futureBody, displayedFutureDevs, numberFormat, 'future-' + index, false);
                tableWrapper.appendChild(table);
                section.appendChild(tableWrapper);
                futureContainer.appendChild(section);
            });
        } else if (futureEmpty) {
            futureEmpty.className = 'rounded-xl border border-[#D8DADA] bg-white px-4 py-8 text-center text-sm text-[#6F7171]';
        }
    }

    renderNoSprintCapacity_(APP_STATE.allData.noSprintCapacity, numberFormat);
    renderPastSprintOpenCapacity_(APP_STATE.allData.pastSprintOpenCapacity, numberFormat);
    var noSprintEmpty = document.getElementById('no-sprint-empty');
    if (noSprintEmpty) {
        noSprintEmpty.className = (noSprint.totalIssues || 0) > 0 ? 'hidden' : 'rounded-xl border border-[#D8DADA] bg-white px-4 py-8 text-center text-sm text-[#6F7171]';
    }
    var pastOpenEmpty = document.getElementById('past-sprint-open-empty');
    if (pastOpenEmpty) {
        pastOpenEmpty.className = (pastOpen.totalIssues || 0) > 0 ? 'hidden' : 'rounded-xl border border-[#D8DADA] bg-white px-4 py-8 text-center text-sm text-[#6F7171]';
    }
    setActiveCapacityTab_(activeCapacityTab_);
}

function renderNoSprintCapacity_(noSprint, numberFormat) {
    var container = document.getElementById('no-sprint-capacity');
    if (!container) return;
    container.replaceChildren();
    if (!noSprint || !noSprint.totalIssues) return;

    var heading = document.createElement('h2');
    heading.className = 'text-xl font-normal text-black mt-8 mb-1';
    heading.textContent = 'No sprint assigned';
    container.appendChild(heading);

    var summary = document.createElement('p');
    summary.className = 'text-sm text-[#6F7171] mb-4';
    var parts = [
        numberFormat.format(noSprint.totalStoryPoints) + ' story points',
        numberFormat.format(noSprint.totalIssues) + (noSprint.totalIssues === 1 ? ' open issue' : ' open issues')
    ];
    if (noSprint.unestimatedIssues > 0) {
        parts.push(numberFormat.format(noSprint.unestimatedIssues) + ' unestimated');
    }
    summary.textContent = parts.join(' · ');
    container.appendChild(summary);

    var tableWrapper = document.createElement('div');
    tableWrapper.className = 'overflow-x-auto';
    var table = document.createElement('table');
    table.className = 'w-full text-sm';
    var header = table.createTHead().insertRow();
    header.className = 'bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-600';
    ['Assignee', 'Open issues', 'Story points', 'Status breakdown'].forEach(function (label, idx) {
        var cell = document.createElement('th');
        cell.scope = 'col';
        cell.className = 'px-3 py-2' + (idx === 1 || idx === 2 ? ' text-right' : '');
        cell.textContent = label;
        header.appendChild(cell);
    });
    var body = table.createTBody();
    (noSprint.developers || []).forEach(function (dev, index) {
        var row = body.insertRow();
        row.className = 'border-b border-gray-200';
        var nameCell = row.insertCell();
        nameCell.className = 'px-3 py-3 text-black';
        var name = document.createElement('span');
        name.className = 'block';
        name.textContent = dev.developer;
        nameCell.appendChild(name);

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'mt-1 inline-flex items-center justify-between gap-2 whitespace-nowrap rounded-xl border border-black bg-white px-2 py-1 text-xs text-black hover:bg-[#F6F6F6]';
        var toggleText = 'Issues (' + numberFormat.format(dev.issues.length) + ')';
        var detailsId = 'no-sprint-issues-' + index;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', detailsId);
        var lbl = document.createElement('span');
        lbl.textContent = toggleText;
        toggle.appendChild(lbl);
        var arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '▸';
        toggle.appendChild(arrow);
        nameCell.appendChild(toggle);

        var detailsRow = body.insertRow();
        detailsRow.id = detailsId;
        detailsRow.hidden = true;
        detailsRow.className = 'border-b border-[#D8DADA] bg-[#F6F6F6]';
        var detailsCell = detailsRow.insertCell();
        detailsCell.colSpan = 4;
        detailsCell.className = 'px-4 py-3';
        renderCapacityAssignments_(detailsCell, dev.issues, dev.developer + ' unscheduled issues', numberFormat);
        toggle.addEventListener('click', function () {
            var expand = detailsRow.hidden;
            detailsRow.hidden = !expand;
            toggle.setAttribute('aria-expanded', String(expand));
            arrow.textContent = expand ? '▾' : '▸';
        });

        var countCell = row.insertCell();
        countCell.className = 'px-3 py-3 text-right tabular-nums text-gray-700';
        countCell.textContent = numberFormat.format(dev.issueCount);

        var ptsCell = row.insertCell();
        ptsCell.className = 'px-3 py-3 text-right tabular-nums font-medium text-gray-900';
        ptsCell.textContent = numberFormat.format(dev.storyPoints);

        var statusCell = row.insertCell();
        statusCell.className = 'px-3 py-3 text-xs text-[#6F7171]';
        var bdParts = [];
        if (dev.inProgressPoints > 0) bdParts.push(numberFormat.format(dev.inProgressPoints) + ' active');
        if (dev.notStartedPoints > 0) bdParts.push(numberFormat.format(dev.notStartedPoints) + ' to do');
        if (dev.unestimatedCount > 0) bdParts.push(numberFormat.format(dev.unestimatedCount) + ' unest.');
        statusCell.textContent = bdParts.length ? bdParts.join(' · ') : 'Needs sprint';
    });
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
}

function renderPastSprintOpenCapacity_(pastOpen, numberFormat) {
    var container = document.getElementById('past-sprint-open-capacity');
    if (!container) return;
    container.replaceChildren();
    if (!pastOpen || !pastOpen.totalIssues) return;

    var headerRow = document.createElement('div');
    headerRow.className = 'flex flex-wrap items-center gap-3 mt-8 mb-1';
    var heading = document.createElement('h2');
    heading.className = 'text-xl font-normal text-black';
    heading.textContent = 'Open items in past sprints';
    headerRow.appendChild(heading);
    var pill = document.createElement('span');
    pill.className = 'inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700';
    pill.textContent = numberFormat.format(pastOpen.totalIssues) + ' open';
    headerRow.appendChild(pill);
    container.appendChild(headerRow);

    var summary = document.createElement('p');
    summary.className = 'text-sm text-[#6F7171] mb-4';
    summary.textContent = numberFormat.format(pastOpen.totalStoryPoints) + ' story points still open in closed or past sprints (not moved to current or future sprints).';
    container.appendChild(summary);

    var tableWrapper = document.createElement('div');
    tableWrapper.className = 'overflow-x-auto';
    var table = document.createElement('table');
    table.className = 'w-full text-sm';
    var header = table.createTHead().insertRow();
    header.className = 'bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-600';
    ['Jira key', 'Summary', 'Type', 'Status', 'Assignee', 'Past sprint', 'Story points'].forEach(function (label, idx) {
        var cell = document.createElement('th');
        cell.scope = 'col';
        cell.className = 'px-3 py-2' + (idx === 6 ? ' text-right' : '');
        cell.textContent = label;
        header.appendChild(cell);
    });
    var body = table.createTBody();
    (pastOpen.issues || []).forEach(function (issue) {
        var row = body.insertRow();
        row.className = 'border-b border-gray-200';
        var keyCell = row.insertCell();
        keyCell.className = 'px-3 py-2 whitespace-nowrap';
        appendCapacityJiraKeyTrigger_(keyCell, issue.jiraKey);
        [issue.summary || 'Untitled', issue.issueType || '—', issue.status || '—', issue.assignee || 'Unassigned', issue.sprintName || '—', numberFormat.format(issue.storyPoints)].forEach(function (val, idx) {
            var cell = row.insertCell();
            cell.className = 'px-3 py-2' + (idx === 5 ? ' text-right tabular-nums font-medium text-gray-900' : '');
            cell.textContent = val;
        });
    });
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
}

function renderCapacityManagerGroupRow_(body, managerName, members, numberFormat, percentFormat) {
    var totalIssues = 0;
    var totalPoints = 0;
    var totalCap = 0;
    var hasCap = false;
    var completed = 0;
    var inProgress = 0;
    var notStarted = 0;
    members.forEach(function (dev) {
        totalIssues += dev.issueCount || 0;
        totalPoints += dev.storyPoints || 0;
        if (dev.capacity != null) {
            totalCap += dev.capacity;
            hasCap = true;
        }
        var bd = getDeveloperPointBreakdown_(dev);
        completed += bd.completed;
        inProgress += bd.inProgress;
        notStarted += bd.notStarted;
    });

    var row = body.insertRow();
    row.className = 'bg-[#F6F6F6] border-t-2 border-b border-[#D8DADA] text-xs font-semibold text-black';
    row.setAttribute('data-manager-group', managerName);

    var nameCell = row.insertCell();
    nameCell.className = 'px-4 py-2.5 font-bold text-black tracking-tight';
    nameCell.textContent = managerName + ' (' + members.length + (members.length === 1 ? ' dev' : ' devs') + ')';

    var issuesCell = row.insertCell();
    issuesCell.className = 'px-3 py-2.5 text-right tabular-nums text-[#6F7171]';
    issuesCell.textContent = numberFormat.format(totalIssues);

    var ptsCell = row.insertCell();
    ptsCell.className = 'px-3 py-2.5 text-right tabular-nums text-black';
    ptsCell.textContent = numberFormat.format(totalPoints);

    var capCell = row.insertCell();
    capCell.className = 'px-3 py-2.5 text-right tabular-nums text-black';
    capCell.textContent = hasCap ? numberFormat.format(totalCap) : '—';

    var rem = hasCap ? totalCap - totalPoints : null;
    var remCell = row.insertCell();
    var remClass = rem == null ? 'text-[#6F7171]' : rem < 0 ? 'text-[#B95319]' : rem > 0 ? 'text-[#008331]' : 'text-[#6F7171]';
    remCell.className = 'px-3 py-2.5 text-right tabular-nums ' + remClass;
    remCell.textContent = rem == null ? '—' : numberFormat.format(rem);

    var wkCell = row.insertCell();
    wkCell.className = 'px-3 py-2.5 min-w-[180px] text-xs font-normal text-[#6F7171] whitespace-nowrap';
    if (hasCap && totalCap > 0) {
        var ratio = totalPoints / totalCap;
        var pctSpan = document.createElement('span');
        pctSpan.className = 'font-medium text-black';
        pctSpan.textContent = percentFormat.format(ratio);
        wkCell.appendChild(pctSpan);
        if (rem < 0) {
            var badge = document.createElement('span');
            badge.className = 'ml-2 inline-block rounded-full bg-[#FFF9DE] px-2 py-0.5 text-[#4B3F04] font-medium';
            badge.textContent = 'Over capacity';
            wkCell.appendChild(badge);
        }
        var track = document.createElement('div');
        track.className = 'relative mt-1 h-2 rounded-full bg-white border border-[#D8DADA]';
        track.setAttribute('aria-hidden', 'true');
        appendStackedSegments_(track, { completed: completed, inProgress: inProgress, notStarted: notStarted }, Math.max(totalCap, totalPoints));
        if (rem < 0 && totalPoints > 0) {
            var marker = document.createElement('div');
            marker.className = 'absolute -top-0.5 -bottom-0.5 w-0.5 bg-black';
            marker.style.left = ((totalCap / totalPoints) * 100) + '%';
            track.appendChild(marker);
        }
        wkCell.appendChild(track);
    } else if (totalPoints > 0) {
        wkCell.textContent = numberFormat.format(completed) + ' done · ' + numberFormat.format(inProgress) + ' active · ' + numberFormat.format(notStarted) + ' to do';
    } else {
        wkCell.textContent = '—';
    }
    return row;
}

function renderCapacityRows_(body, developers, numberFormat, sectionId, isCurrentSprint) {
    body.replaceChildren();
    if (!developers || developers.length === 0) {
        var emptyRow = body.insertRow();
        var emptyCell = emptyRow.insertCell();
        emptyCell.colSpan = 6;
        emptyCell.className = 'px-3 py-8 text-center text-gray-500';
        var emptyMsg = 'No developers found.';
        var scopeLabel = isCurrentSprint ? 'the current sprint.' : 'this sprint.';
        if (capacityCurrentFilter_ === 'at_risk') emptyMsg = 'No at-risk developers in ' + scopeLabel;
        else if (capacityCurrentFilter_ === 'over_capacity') emptyMsg = 'No over-capacity developers in ' + scopeLabel;
        else if (capacityCurrentFilter_ === 'under_capacity') emptyMsg = 'No under-capacity developers in ' + scopeLabel;
        emptyCell.textContent = emptyMsg;
        return;
    }

    var percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
    var pctResolver = buildClientActPctResolver_();
    var renderDeveloperRow = function (developer, index, indent) {
        var row = body.insertRow();
        var isOverCapRow = developer && developer.developer !== 'Unassigned' && developer.remaining != null && developer.remaining < 0;
        row.className = isOverCapRow ?
        'border-b border-[#F5C6A5] border-l-4 border-l-[#B95319] bg-[#FFECE0]/30 hover:bg-[#FFECE0]/55 transition-colors' :
        'border-b border-[#D8DADA]/70 hover:bg-[#F6F6F6]/70 transition-colors';
        var nameCell = row.insertCell();
        nameCell.className = (indent ? 'pl-7 pr-4' : 'px-4') + ' py-3.5 text-black align-top';
        var name = document.createElement('span');
        name.className = 'font-semibold text-sm text-black mr-2 align-middle';
        name.textContent = developer.developer;
        nameCell.appendChild(name);
        var unassigned = developer.developer === 'Unassigned';
        var assignments = developer.issues;
        var detailsLabel = unassigned ? 'Unassigned sprint issues' : developer.developer + ' sprint issues';
        if (!unassigned || assignments.length) {
            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#D8DADA] bg-white px-2.5 py-0.5 text-[11px] font-medium text-black hover:border-black hover:bg-[#F6F6F6] align-middle transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
            var toggleText = 'Issues (' + numberFormat.format(assignments.length) + ')';
            var isExpanded = Boolean(capacityExpandAllIssues_);
            toggle.setAttribute('aria-label', toggleText + ' — ' + detailsLabel);
            toggle.setAttribute('aria-expanded', String(isExpanded));
            var detailsId = 'capacity-issues-' + sectionId + '-' + index;
            toggle.setAttribute('aria-controls', detailsId);
            var label = document.createElement('span');
            label.textContent = toggleText;
            toggle.appendChild(label);
            var arrow = document.createElement('span');
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = isExpanded ? '▾' : '▸';
            toggle.appendChild(arrow);
            nameCell.appendChild(toggle);

            var detailsRow = body.insertRow();
            detailsRow.id = detailsId;
            detailsRow.hidden = !isExpanded;
            detailsRow.className = 'border-b border-[#D8DADA] bg-[#F6F6F6]/90';
            var detailsCell = detailsRow.insertCell();
            detailsCell.colSpan = 6;
            detailsCell.className = 'px-5 py-3.5';
            if (assignments.length) {
                renderCapacityAssignments_(detailsCell, assignments, detailsLabel, numberFormat);
            } else {
                detailsCell.textContent = 'No issues assigned for this sprint.';
            }
            toggle.addEventListener('click', function () {
                var expand = detailsRow.hidden;
                detailsRow.hidden = !expand;
                toggle.setAttribute('aria-expanded', String(expand));
                arrow.textContent = expand ? '▾' : '▸';
            });
        }
        if (!unassigned) {
            var peopleBtn = createDeveloperPeopleEditButton_(developer.developer);
            nameCell.appendChild(peopleBtn);
            var devPct = pctResolver.resolveForDeveloper(developer);
            var devMgr = String(developer.manager || '').trim();
            if (devPct || devMgr) {
                var metaWrap = document.createElement('div');
                metaWrap.className = 'mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#6F7171]';
                if (devPct) {
                    var pctBadge = document.createElement('span');
                    pctBadge.className = 'inline-flex items-center rounded-md bg-[#EBF5FF] border border-[#B8DCFF] px-1.5 py-0.5 text-[10px] font-semibold text-[#006FC1]';
                    pctBadge.textContent = devPct;
                    metaWrap.appendChild(pctBadge);
                }
                if (devMgr) {
                    var mgrBadge = document.createElement('span');
                    mgrBadge.className = 'inline-flex items-center rounded-md bg-[#F6F6F6] border border-[#D8DADA] px-1.5 py-0.5 text-[10px] font-medium text-[#6F7171]';
                    mgrBadge.textContent = 'Mgr: ' + devMgr;
                    metaWrap.appendChild(mgrBadge);
                }
                nameCell.appendChild(metaWrap);
            }
        }
        var issueCell = row.insertCell();
        issueCell.className = 'px-3 py-3.5 text-right tabular-nums text-xs font-medium text-[#6F7171] align-top';
        issueCell.textContent = numberFormat.format(developer.issueCount);
        var pointsCell = row.insertCell();
        pointsCell.className = 'px-3 py-3.5 text-right tabular-nums text-sm font-semibold text-black align-top';
        pointsCell.textContent = numberFormat.format(developer.storyPoints);
        var capCell = row.insertCell();
        capCell.className = 'px-3 py-3.5 text-right tabular-nums text-sm text-black align-top';
        var hasCapAdjustment = developer.ptoDays > 0 || developer.holidayDays > 0 || developer.capacityOverride != null;
        if (!hasCapAdjustment) {
            capCell.textContent = developer.capacity == null ? '—' : numberFormat.format(developer.capacity);
        } else {
            var capPrimary = document.createElement('div');
            capPrimary.className = 'font-medium text-black';
            capPrimary.textContent = developer.capacity == null ? '—' : numberFormat.format(developer.capacity);
            capCell.appendChild(capPrimary);
            var capSub = document.createElement('div');
            capSub.className = 'text-[11px] text-[#006FC1] whitespace-nowrap';
            var adjParts = [];
            if (developer.capacityOverride != null) {
                adjParts.push('Override');
            } else {
                if (developer.ptoDays > 0) adjParts.push('-' + numberFormat.format(developer.ptoDays) + 'd PTO');
                if (developer.holidayDays > 0) adjParts.push('-' + numberFormat.format(developer.holidayDays) + 'd Hol');
            }
            var baseText = developer.baseCapacity != null ? 'of ' + numberFormat.format(developer.baseCapacity) + ' ' : '';
            capSub.textContent = baseText + '(' + adjParts.join(', ') + ')';
            if (developer.overrideNotes) {
                capSub.title = developer.overrideNotes;
            }
            capCell.appendChild(capSub);
        }
        var remCell = row.insertCell();
        var remClass = developer.remaining == null ? 'text-[#6F7171]' :
            developer.remaining < 0 ? 'text-[#B95319] font-semibold' :
                developer.remaining > 0 ? 'text-[#008331] font-medium' : 'text-[#6F7171]';
        remCell.className = 'px-3 py-3.5 text-right tabular-nums text-sm align-top ' + remClass;
        remCell.textContent = developer.remaining == null ? '—' : numberFormat.format(developer.remaining);
        renderCapacityWorkload_(row.insertCell(), developer, unassigned, percentFormat, numberFormat, isCurrentSprint);
    };

    if (!capacityGroupByManager_ && !capacityGroupByPct_) {
        developers.forEach(function (developer, index) {
            renderDeveloperRow(developer, index, false);
        });
        return;
    }

    var isPctGrouping = Boolean(capacityGroupByPct_);
    var unassignedGroupLabel = isPctGrouping ? 'No PCT assigned' : 'No manager assigned';

    var groups = new Map();
    var unassignedDevs = [];
    developers.forEach(function (developer) {
        if (developer.developer === 'Unassigned') {
            unassignedDevs.push(developer);
            return;
        }
        var groupVal = isPctGrouping ?
            (pctResolver.resolveForDeveloper(developer) || unassignedGroupLabel) :
            (String(developer.manager || '').trim() || unassignedGroupLabel);
        var key = groupVal.toLowerCase();
        if (!groups.has(key)) groups.set(key, { name: groupVal, members: [] });
        groups.get(key).members.push(developer);
    });

    var sortedGroups = Array.from(groups.values()).sort(function (a, b) {
        if (a.name === unassignedGroupLabel && b.name !== unassignedGroupLabel) return 1;
        if (b.name === unassignedGroupLabel && a.name !== unassignedGroupLabel) return -1;
        return a.name.localeCompare(b.name);
    });

    var rowIndex = 0;
    sortedGroups.forEach(function (group) {
        var groupRow = renderCapacityManagerGroupRow_(body, group.name, group.members, numberFormat, percentFormat);
        if (isPctGrouping && groupRow && typeof groupRow.setAttribute === 'function') {
            groupRow.setAttribute('data-pct-group', group.name);
        }
        group.members.forEach(function (dev) {
            renderDeveloperRow(dev, rowIndex++, true);
        });
    });
    unassignedDevs.forEach(function (dev) {
        renderDeveloperRow(dev, rowIndex++, false);
    });
}

function renderCapacityWorkload_(cell, developer, unassigned, percentFormat, numberFormat, isCurrentSprint) {
    cell.className = 'px-4 py-3.5 min-w-[200px] text-xs text-[#6F7171] whitespace-nowrap align-top';
    if (unassigned) {
        cell.textContent = 'Needs assignee';
        return;
    }
    if (developer.remaining == null) {
        cell.textContent = developer.capacity == null ? 'Capacity not set' : 'No sprint';
        return;
    }

    var overCapacity = developer.remaining < 0;
    var ratio = developer.capacity > 0 ? Math.max(0, developer.storyPoints / developer.capacity) : null;
    if (ratio !== null) {
        var percent = document.createElement('span');
        percent.className = 'font-semibold text-black tabular-nums';
        percent.textContent = percentFormat.format(ratio);
        cell.appendChild(percent);
    }
    if (overCapacity || ratio === null) {
        var status = document.createElement('span');
        status.className = overCapacity ? 'inline-flex items-center rounded-full bg-[#FFECE0] border border-[#F5C6A5] px-2 py-0.5 text-[11px] font-semibold text-[#B95319]' : '';
        if (ratio !== null) status.className += ' ml-2';
        status.textContent = overCapacity ? 'Over capacity' : 'Zero capacity';
        cell.appendChild(status);
    }
    if (isCurrentSprint && developer.pace && ['on_track', 'at_risk', 'behind', 'completed'].indexOf(developer.pace.status) !== -1) {
        var pacePill = document.createElement('span');
        pacePill.className = getCapacityPaceBadgeClass_(developer.pace.status) + ' ml-2';
        pacePill.setAttribute('data-pace', developer.pace.status);
        pacePill.textContent = developer.pace.label;
        cell.appendChild(pacePill);
    }
    if (ratio !== null) {
        var breakdown = getDeveloperPointBreakdown_(developer);
        var denominator = Math.max(developer.capacity, developer.storyPoints);
        var track = document.createElement('div');
        track.className = 'relative mt-2 h-2 rounded-full bg-[#EDEDED] border border-[#D8DADA]/60';
        track.setAttribute('aria-hidden', 'true');
        track.title = numberFormat.format(breakdown.completed) + ' completed · ' +
            numberFormat.format(breakdown.inProgress) + ' in progress · ' +
            numberFormat.format(breakdown.notStarted) + ' not started';
        appendStackedSegments_(track, breakdown, denominator);
        if (overCapacity && developer.storyPoints > 0) {
            var limitMarker = document.createElement('div');
            limitMarker.className = 'absolute -top-0.5 -bottom-0.5 w-0.5 bg-gray-900';
            limitMarker.setAttribute('data-marker', 'capacity-limit');
            limitMarker.style.left = ((developer.capacity / developer.storyPoints) * 100) + '%';
            track.appendChild(limitMarker);
        }
        cell.appendChild(track);

        if (developer.storyPoints > 0) {
            var captionParts = [];
            if (breakdown.completed > 0) captionParts.push(numberFormat.format(breakdown.completed) + ' done');
            if (breakdown.inProgress > 0) captionParts.push(numberFormat.format(breakdown.inProgress) + ' active');
            if (breakdown.notStarted > 0) captionParts.push(numberFormat.format(breakdown.notStarted) + ' to do');
            if (developer.unestimatedCount > 0) captionParts.push(numberFormat.format(developer.unestimatedCount) + ' unest.');
            if (captionParts.length) {
                var caption = document.createElement('div');
                caption.className = 'mt-1 text-[11px] text-[#6F7171]';
                caption.textContent = captionParts.join(' · ');
                cell.appendChild(caption);
            }
        }
    }
}

function appendCapacityJiraKeyTrigger_(cell, jiraKey) {
    if (/^[A-Z][A-Z0-9_]*-\d+$/i.test(jiraKey)) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-[#006FC1] hover:underline font-medium bg-transparent border-0 p-0 cursor-pointer text-left';
        button.textContent = jiraKey;
        button.setAttribute('aria-label', 'View details for ' + jiraKey);
        button.setAttribute('data-jira-key', jiraKey);
        button.addEventListener('click', function () {
            if (typeof openStoryInfoModal === 'function') {
                openStoryInfoModal(jiraKey);
            }
        });
        cell.appendChild(button);
        var extLink = document.createElement('a');
        extLink.href = 'https://onejira.verizon.com/browse/' + jiraKey;
        extLink.target = '_blank';
        extLink.rel = 'noopener noreferrer';
        extLink.className = 'ml-1.5 text-[11px] text-[#6F7171] hover:text-black no-underline';
        extLink.title = 'Open ' + jiraKey + ' in Jira';
        extLink.setAttribute('aria-label', 'Open ' + jiraKey + ' in Jira');
        extLink.textContent = '↗';
        cell.appendChild(extLink);
    } else {
        cell.textContent = jiraKey || '—';
    }
}

function renderCapacityAssignments_(container, assignments, label, numberFormat) {
    var table = document.createElement('table');
    table.className = 'w-full text-xs text-black bg-white rounded-xl border border-[#D8DADA] overflow-hidden border-collapse';
    table.setAttribute('aria-label', label);
    var header = table.createTHead().insertRow();
    header.className = 'bg-[#F6F6F6] border-b border-[#D8DADA] text-[11px] font-semibold uppercase tracking-wider text-[#6F7171]';
    var columns = ['Jira key', 'Summary', 'Type', 'Status', 'Story points'];
    columns.forEach(function (label, index) {
        var cell = document.createElement('th');
        cell.scope = 'col';
        cell.className = 'px-3 py-2 ' + (index === columns.length - 1 ? 'text-right' : 'text-left');
        cell.textContent = label;
        header.appendChild(cell);
    });
    var body = table.createTBody();
    assignments.forEach(function (issue) {
        var row = body.insertRow();
        row.className = 'border-b border-[#D8DADA]/60 last:border-b-0 hover:bg-[#F6F6F6]/60 transition-colors';
        var keyCell = row.insertCell();
        keyCell.className = 'px-3 py-2.5 whitespace-nowrap';
        appendCapacityJiraKeyTrigger_(keyCell, issue.jiraKey);
        var values = [issue.summary || 'Untitled', issue.issueType || '—', issue.status || '—', numberFormat.format(issue.storyPoints)];
        values.forEach(function (value, index) {
            var cell = row.insertCell();
            var extraClass = '';
            if (index === 2) {
                extraClass = issue.workState === 'completed' ? ' text-[#008331] font-semibold' :
                    issue.workState === 'inProgress' ? ' text-[#006FC1] font-semibold' : ' text-[#6F7171]';
            } else if (index === values.length - 1) {
                extraClass = ' text-right tabular-nums font-semibold text-black';
            }
            cell.className = 'px-3 py-2.5' + extraClass;
            cell.textContent = value;
        });
    });
    container.appendChild(table);
}

var developerSprintOverridesState_ = new Map();
var developerPtoDatesState_ = new Map();
var developerCompanyHolidaysState_ = [];

function createDeveloperPeopleEditButton_(developerName) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inline-flex items-center justify-center rounded-lg border border-[#D8DADA] bg-white hover:bg-[#F6F6F6] hover:border-black p-1 text-[#6F7171] hover:text-black ml-1.5 align-middle transition-colors';
    btn.title = 'Edit capacity, manager & PTO for ' + developerName;
    if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-label', 'Edit capacity, manager and PTO for ' + developerName);
        btn.setAttribute('data-edit-developer-capacity', developerName);
    }
    var iconWrap = document.createElement('span');
    iconWrap.className = 'inline-flex items-center justify-center w-3.5 h-3.5';
    if (typeof iconWrap.setAttribute === 'function') iconWrap.setAttribute('aria-hidden', 'true');
    iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    btn.appendChild(iconWrap);
    if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', function (e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            openDeveloperQuickEditModal_(developerName);
        });
    }
    return btn;
}

function openCapacityQuickSettingsModal_() {
    var allData = (APP_STATE && APP_STATE.allData) || {};
    var rawSettings = allData.capacitySettings || { sprintWorkdays: 10, companyHolidays: [] };
    var localWorkdays = Number(rawSettings.sprintWorkdays) > 0 ? Number(rawSettings.sprintWorkdays) : 10;
    var localHolidays = (rawSettings.companyHolidays || []).map(function (h) {
        return {
            name: h.name || '',
            date: h.date || '',
            sprint: h.sprint || '',
            days: h.days != null ? Number(h.days) : 1
        };
    });

    var modal = document.getElementById('capacity-quick-settings-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'capacity-quick-settings-modal';
        if (document.body && typeof document.body.appendChild === 'function') {
            document.body.appendChild(modal);
        }
    }
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4';
    modal.hidden = false;
    if (typeof modal.setAttribute === 'function') {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
    }
    modal.replaceChildren();

    var card = document.createElement('div');
    card.className = 'w-full max-w-2xl rounded-xl border border-[#D8DADA] bg-white shadow-xl overflow-hidden flex flex-col max-h-[85vh]';

    var header = document.createElement('div');
    header.className = 'flex items-center justify-between border-b border-[#D8DADA] px-6 py-4 bg-white';
    var titleEl = document.createElement('h3');
    titleEl.className = 'text-base font-semibold text-black';
    titleEl.textContent = 'Settings';
    header.appendChild(titleEl);

    var closeModal = function () {
        modal.className = 'hidden';
        modal.hidden = true;
    };
    var closeBtn = document.createElement('button');
    closeBtn.id = 'capacity-settings-close';
    closeBtn.type = 'button';
    closeBtn.className = 'rounded-lg border border-[#D8DADA] px-2.5 py-1 text-xs text-[#6F7171] hover:text-black';
    closeBtn.textContent = '✕';
    if (typeof closeBtn.addEventListener === 'function') closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    card.appendChild(header);

    var tabBar = document.createElement('div');
    tabBar.className = 'flex items-center gap-6 border-b border-[#D8DADA] px-6 bg-[#F6F6F6]/60 text-xs font-medium';
    var tabDefs = [
        { key: 'timeoff', label: 'Team Time Off' },
        { key: 'metrics', label: 'Metrics' },
        { key: 'ui', label: 'User Interface' }
    ];
    var tabBtns = {};
    var tabPanels = {};
    var setActiveTab = function (activeKey) {
        tabDefs.forEach(function (t) {
            var isAct = t.key === activeKey;
            if (tabBtns[t.key]) {
                tabBtns[t.key].className = isAct ?
                    'py-3 border-b-2 border-[#006FC1] text-[#006FC1] font-semibold' :
                    'py-3 border-b-2 border-transparent text-[#6F7171] hover:text-black';
            }
            if (tabPanels[t.key]) {
                tabPanels[t.key].hidden = !isAct;
                tabPanels[t.key].className = isAct ? 'space-y-4' : 'space-y-4 hidden';
            }
        });
    };
    tabDefs.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'capacity-settings-tab-' + t.key;
        b.textContent = t.label;
        if (typeof b.addEventListener === 'function') {
            b.addEventListener('click', function () { setActiveTab(t.key); });
        }
        tabBtns[t.key] = b;
        tabBar.appendChild(b);
    });
    card.appendChild(tabBar);

    var body = document.createElement('div');
    body.className = 'p-6 overflow-y-auto flex-1';

    // Tab 1: Team Time Off (Modeled after Image 3)
    var timeoffPanel = document.createElement('div');
    tabPanels.timeoff = timeoffPanel;
    var addRow = document.createElement('div');
    addRow.className = 'grid grid-cols-1 sm:grid-cols-12 gap-2 items-end rounded-xl border border-[#D8DADA] bg-[#F6F6F6] p-3';

    var dateCol = document.createElement('div');
    dateCol.className = 'sm:col-span-4';
    var dateLbl = document.createElement('label');
    dateLbl.className = 'block text-[11px] font-medium text-[#6F7171] mb-1';
    dateLbl.textContent = 'Select date';
    var dateInp = document.createElement('input');
    dateInp.id = 'capacity-settings-holiday-date';
    dateInp.type = 'date';
    dateInp.className = 'w-full rounded-lg border border-[#D8DADA] bg-white px-2.5 py-1.5 text-xs text-black';
    dateCol.appendChild(dateLbl);
    dateCol.appendChild(dateInp);
    addRow.appendChild(dateCol);

    var reasonCol = document.createElement('div');
    reasonCol.className = 'sm:col-span-5';
    var reasonLbl = document.createElement('label');
    reasonLbl.className = 'block text-[11px] font-medium text-[#6F7171] mb-1';
    reasonLbl.textContent = 'Reason / Holiday Name';
    var reasonInp = document.createElement('input');
    reasonInp.id = 'capacity-settings-holiday-name';
    reasonInp.type = 'text';
    reasonInp.placeholder = 'e.g. Labor Day, Team Event';
    reasonInp.className = 'w-full rounded-lg border border-[#D8DADA] bg-white px-2.5 py-1.5 text-xs text-black';
    reasonCol.appendChild(reasonLbl);
    reasonCol.appendChild(reasonInp);
    addRow.appendChild(reasonCol);

    var daysCol = document.createElement('div');
    daysCol.className = 'sm:col-span-1';
    var daysLbl = document.createElement('label');
    daysLbl.className = 'block text-[11px] font-medium text-[#6F7171] mb-1';
    daysLbl.textContent = 'Days';
    var daysInp = document.createElement('input');
    daysInp.id = 'capacity-settings-holiday-days';
    daysInp.type = 'number';
    daysInp.min = '0.5';
    daysInp.step = '0.5';
    daysInp.value = '1';
    daysInp.className = 'w-full rounded-lg border border-[#D8DADA] bg-white px-2 py-1.5 text-xs text-right text-black';
    daysCol.appendChild(daysLbl);
    daysCol.appendChild(daysInp);
    addRow.appendChild(daysCol);

    var addBtnCol = document.createElement('div');
    addBtnCol.className = 'sm:col-span-2';
    var addHolBtn = document.createElement('button');
    addHolBtn.id = 'capacity-settings-holiday-add';
    addHolBtn.type = 'button';
    addHolBtn.className = 'w-full rounded-lg bg-[#006FC1] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90';
    addHolBtn.textContent = 'Add';
    addBtnCol.appendChild(addHolBtn);
    addRow.appendChild(addBtnCol);
    timeoffPanel.appendChild(addRow);

    var holTableWrap = document.createElement('div');
    holTableWrap.className = 'rounded-xl border border-[#D8DADA] overflow-hidden';
    var renderHolTable = function () {
        holTableWrap.replaceChildren();
        if (!localHolidays.length) {
            var emptyHol = document.createElement('p');
            emptyHol.className = 'px-4 py-6 text-center text-xs text-[#6F7171]';
            emptyHol.textContent = 'No company holidays or team events configured.';
            holTableWrap.appendChild(emptyHol);
            return;
        }
        var tbl = document.createElement('table');
        tbl.className = 'w-full text-xs';
        var thRow = tbl.createTHead().insertRow();
        thRow.className = 'bg-[#F6F6F6] border-b border-[#D8DADA] text-left font-semibold text-black';
        ['Date / Sprint', 'Reason', 'Days', 'Remove'].forEach(function (hText, idx) {
            var th = document.createElement('th');
            th.className = 'px-3 py-2' + (idx >= 2 ? ' text-right' : '');
            th.textContent = hText;
            thRow.appendChild(th);
        });
        var tb = tbl.createTBody();
        localHolidays.forEach(function (h, hIdx) {
            var tr = tb.insertRow();
            tr.className = 'border-b border-[#D8DADA]/60';
            var matchedSp = h.date ? findMatchingSprintForDate_(h.date) : '';
            var effSp = matchedSp || h.sprint || '';
            var c1 = tr.insertCell();
            c1.className = 'px-3 py-2 font-medium text-black';
            c1.textContent = (h.date || '—') + (effSp ? ' (' + effSp + ')' : '');
            var c2 = tr.insertCell();
            c2.className = 'px-3 py-2 text-[#6F7171]';
            c2.textContent = h.name || 'Company Holiday';
            var c3 = tr.insertCell();
            c3.className = 'px-3 py-2 text-right tabular-nums text-black';
            c3.textContent = String(h.days != null ? h.days : 1) + 'd';
            var c4 = tr.insertCell();
            c4.className = 'px-3 py-2 text-right';
            var rmBtn = document.createElement('button');
            rmBtn.type = 'button';
            rmBtn.className = 'text-[#B95319] hover:underline font-medium';
            rmBtn.textContent = 'Remove';
            if (typeof rmBtn.addEventListener === 'function') {
                rmBtn.addEventListener('click', function () {
                    localHolidays.splice(hIdx, 1);
                    renderHolTable();
                });
            }
            c4.appendChild(rmBtn);
        });
        holTableWrap.appendChild(tbl);
    };
    if (typeof addHolBtn.addEventListener === 'function') {
        addHolBtn.addEventListener('click', function () {
            var dVal = toClientIsoDateKey_(dateInp.value);
            var nVal = String(reasonInp.value || '').trim() || 'Company Holiday';
            var dyVal = Number(daysInp.value) > 0 ? Number(daysInp.value) : 1;
            var spMatch = dVal ? findMatchingSprintForDate_(dVal) : ((allData.sprintCapacity && allData.sprintCapacity.sprintName) || '');
            localHolidays.push({
                name: nVal,
                date: dVal || '',
                sprint: spMatch || '',
                days: dyVal
            });
            reasonInp.value = '';
            renderHolTable();
        });
    }
    renderHolTable();
    timeoffPanel.appendChild(holTableWrap);
    body.appendChild(timeoffPanel);

    // Tab 2: Metrics
    var metricsPanel = document.createElement('div');
    tabPanels.metrics = metricsPanel;
    var workdaysCard = document.createElement('div');
    workdaysCard.className = 'rounded-xl border border-[#D8DADA] bg-[#F6F6F6]/60 p-4 space-y-3';
    var wdLabel = document.createElement('label');
    wdLabel.className = 'block text-xs font-semibold text-black';
    wdLabel.textContent = 'Standard Sprint Workdays';
    var wdInp = document.createElement('input');
    wdInp.id = 'capacity-settings-workdays';
    wdInp.type = 'number';
    wdInp.min = '1';
    wdInp.step = '1';
    wdInp.value = String(localWorkdays);
    wdInp.className = 'rounded-lg border border-[#D8DADA] bg-white px-3 py-1.5 text-sm text-black w-32';
    if (typeof wdInp.addEventListener === 'function') {
        wdInp.addEventListener('input', function () {
            if (Number(wdInp.value) > 0) localWorkdays = Number(wdInp.value);
        });
    }
    var wdDaysRow = document.createElement('div');
    wdDaysRow.className = 'flex flex-wrap items-center gap-1.5 pt-2';
    ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach(function (day, dIdx) {
        var pill = document.createElement('span');
        pill.className = dIdx < 5 ?
            'rounded-md bg-[#EBF5FF] border border-[#B8DCFF] px-2.5 py-1 text-[11px] font-semibold text-[#006FC1]' :
            'rounded-md bg-[#F6F6F6] border border-[#D8DADA] px-2.5 py-1 text-[11px] text-[#6F7171]';
        pill.textContent = day;
        wdDaysRow.appendChild(pill);
    });
    workdaysCard.appendChild(wdLabel);
    workdaysCard.appendChild(wdInp);
    workdaysCard.appendChild(wdDaysRow);
    metricsPanel.appendChild(workdaysCard);
    body.appendChild(metricsPanel);

    // Tab 3: User Interface
    var uiPanel = document.createElement('div');
    tabPanels.ui = uiPanel;
    [
        { key: 'showPaceSidebar', label: 'Actual vs. Expected Sidebar', desc: 'Show live team and member actual vs. expected progress bars alongside the table' },
        { key: 'showTodayIndicator', label: 'Today / Expected Target Indicator', desc: 'Show vertical target marker line on sprint and developer progress bars' },
        { key: 'expandAll', label: 'Expand Developer Story Lists by Default', desc: 'Automatically open all developer issue drawers in the sprint table' }
    ].forEach(function (pref) {
        var row = document.createElement('label');
        row.className = 'flex items-center justify-between gap-4 rounded-xl border border-[#D8DADA] p-3.5 cursor-pointer hover:bg-[#F6F6F6]/50';
        var txtWrap = document.createElement('div');
        var t1 = document.createElement('div');
        t1.className = 'text-xs font-semibold text-black';
        t1.textContent = pref.label;
        var t2 = document.createElement('div');
        t2.className = 'text-[11px] text-[#6F7171] mt-0.5';
        t2.textContent = pref.desc;
        txtWrap.appendChild(t1);
        txtWrap.appendChild(t2);
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = pref.key === 'expandAll' ? Boolean(capacityExpandAllIssues_) : Boolean(capacityUiPrefs_[pref.key]);
        if (typeof chk.addEventListener === 'function') {
            chk.addEventListener('change', function () {
                if (pref.key === 'expandAll') {
                    capacityExpandAllIssues_ = Boolean(chk.checked);
                } else {
                    capacityUiPrefs_[pref.key] = Boolean(chk.checked);
                }
                syncCapacityGroupButton_();
                renderCapacityView();
            });
        }
        row.appendChild(txtWrap);
        row.appendChild(chk);
        uiPanel.appendChild(row);
    });
    body.appendChild(uiPanel);
    card.appendChild(body);
    setActiveTab('timeoff');

    var footer = document.createElement('div');
    footer.className = 'flex items-center justify-between gap-3 border-t border-[#D8DADA] bg-[#F6F6F6] px-6 py-3.5';
    var statusEl = document.createElement('p');
    statusEl.id = 'capacity-settings-status';
    statusEl.className = 'text-xs text-[#6F7171]';
    footer.appendChild(statusEl);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'flex items-center gap-2';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'rounded-lg border border-[#D8DADA] bg-white px-3.5 py-1.5 text-xs font-medium text-black hover:border-black';
    cancelBtn.textContent = 'Close';
    if (typeof cancelBtn.addEventListener === 'function') cancelBtn.addEventListener('click', closeModal);
    btnGroup.appendChild(cancelBtn);

    var saveBtn = document.createElement('button');
    saveBtn.id = 'capacity-settings-save';
    saveBtn.type = 'button';
    saveBtn.className = 'rounded-lg border border-black bg-black px-4 py-1.5 text-xs font-medium text-white hover:opacity-90';
    saveBtn.textContent = 'Save settings';
    if (typeof saveBtn.addEventListener === 'function') {
        saveBtn.addEventListener('click', function () {
            if (!checkAuth()) return;
            var entries = (allData.developerCapacity || []).map(function (e) {
                var copy = {
                    developer: e.developer,
                    capacity: e.capacity == null ? '' : String(e.capacity),
                    manager: e.manager || ''
                };
                if (e.pct) copy.pct = e.pct;
                if (e.sprintOverrides) copy.sprintOverrides = e.sprintOverrides;
                if (e.ptoDates) copy.ptoDates = e.ptoDates;
                return copy;
            });
            var sprintDatesMap = {};
            getKnownSprintDateWindows_().forEach(function (w) {
                sprintDatesMap[w.sprintName] = { start: w.start, end: w.end };
            });
            var settingsPayload = {
                sprintWorkdays: localWorkdays > 0 ? localWorkdays : 10,
                companyHolidays: localHolidays
            };
            if (Object.keys(sprintDatesMap).length > 0) {
                settingsPayload.sprintDates = sprintDatesMap;
            }
            saveBtn.disabled = true;
            statusEl.textContent = 'Saving...';
            callServer('saveDeveloperCapacity', [entries, settingsPayload]).then(function (res) {
                if (!res || res.status !== 'success') {
                    throw new Error((res && res.message) || 'Could not save settings.');
                }
                return callServer('getProjectData', []).then(function (data) {
                    if (!handleDataLoaded(data)) throw new Error('Settings saved, but refresh failed.');
                    renderCapacityView();
                    closeModal();
                });
            }).catch(function (err) {
                statusEl.textContent = getErrorMessage_(err);
                statusEl.className = 'text-xs text-[#B95319] font-medium';
            }).finally(function () {
                saveBtn.disabled = false;
            });
        });
    }
    btnGroup.appendChild(saveBtn);
    footer.appendChild(btnGroup);
    card.appendChild(footer);
    modal.appendChild(card);
}

function openDeveloperQuickEditModal_(developerName) {
    var devName = String(developerName || '').trim();
    if (!devName || devName === 'Unassigned') return;
    var devKey = devName.toLowerCase();

    var allData = (APP_STATE && APP_STATE.allData) || {};
    var devList = allData.developerCapacity || [];
    var existingEntry = devList.find(function (e) {
        return e && e.developer && String(e.developer).trim().toLowerCase() === devKey;
    }) || { developer: devName, capacity: null, manager: '', sprintOverrides: {}, ptoDates: [] };

    var rawSettings = allData.capacitySettings || { sprintWorkdays: 10, companyHolidays: [] };
    developerCompanyHolidaysState_ = (rawSettings.companyHolidays || []).map(function (h) {
        return { name: h.name || '', date: h.date || '', sprint: h.sprint || '', days: h.days != null ? h.days : 1 };
    });

    if (existingEntry.sprintOverrides && typeof existingEntry.sprintOverrides === 'object') {
        var oList = Object.keys(existingEntry.sprintOverrides).filter(function (k) { return k !== '__ptoDates__' && k !== '__pct__'; }).map(function (sp) {
            var item = existingEntry.sprintOverrides[sp] || {};
            return {
                sprint: sp,
                ptoDays: item.ptoDays != null ? String(item.ptoDays) : '0',
                capacityOverride: item.capacityOverride != null ? String(item.capacityOverride) : '',
                notes: item.notes || ''
            };
        });
        developerSprintOverridesState_.set(devKey, oList);
    } else {
        developerSprintOverridesState_.set(devKey, []);
    }

    if (Array.isArray(existingEntry.ptoDates) && existingEntry.ptoDates.length) {
        developerPtoDatesState_.set(devKey, existingEntry.ptoDates.map(function (pt) {
            return {
                startDate: pt.startDate || '',
                endDate: pt.endDate || pt.startDate || '',
                days: pt.days != null ? String(pt.days) : '',
                notes: pt.notes || ''
            };
        }));
    } else {
        developerPtoDatesState_.set(devKey, []);
    }

    var sprintList = document.getElementById('developer-sprint-options');
    if (sprintList) {
        sprintList.replaceChildren();
        getKnownCapacitySprints_().forEach(function (sprintName) {
            var opt = document.createElement('option');
            opt.value = sprintName;
            sprintList.appendChild(opt);
        });
    }
    var pctList = document.getElementById('developer-pct-options');
    if (pctList) {
        pctList.replaceChildren();
        var distinctPcts = new Set(((allData.config && allData.config.actPctOptions) || []).map(function (o) { return String(o || '').trim(); }).filter(Boolean));
        devList.forEach(function (e) {
            var p = e && e.pct ? String(e.pct).trim() : '';
            if (p) distinctPcts.add(p);
        });
        Array.from(distinctPcts).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (pctOpt) {
            var opt = document.createElement('option');
            opt.value = pctOpt;
            pctList.appendChild(opt);
        });
    }
    var managerList = document.getElementById('developer-manager-options');
    if (managerList) {
        managerList.replaceChildren();
        var distinctManagers = new Set();
        devList.forEach(function (e) {
            var m = e && e.manager ? String(e.manager).trim() : '';
            if (m) distinctManagers.add(m);
        });
        Array.from(distinctManagers).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (mgr) {
            var opt = document.createElement('option');
            opt.value = mgr;
            managerList.appendChild(opt);
        });
    }

    var modal = document.getElementById('developer-quick-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'developer-quick-edit-modal';
        if (document.body && typeof document.body.appendChild === 'function') {
            document.body.appendChild(modal);
        }
    }
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4';
    if (typeof modal.setAttribute === 'function') {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('data-editing-developer', devName);
    }
    modal.replaceChildren();

    var card = document.createElement('div');
    card.className = 'w-full max-w-3xl rounded-xl border border-[#D8DADA] bg-white shadow-xl overflow-hidden flex flex-col max-h-[85vh]';

    // Header
    var header = document.createElement('div');
    header.className = 'flex items-center justify-between border-b border-[#D8DADA] px-6 py-4 bg-[#F6F6F6]';
    var titleWrap = document.createElement('div');
    var titleEl = document.createElement('h3');
    titleEl.id = 'quick-edit-dev-title';
    titleEl.className = 'text-base font-semibold text-black';
    titleEl.textContent = devName + ' — Capacity, Manager & PTO';
    var subEl = document.createElement('p');
    subEl.className = 'text-xs text-[#6F7171] mt-0.5';
    subEl.textContent = 'Edit base sprint capacity, assigned manager, scheduled PTO dates, and manual sprint overrides.';
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(subEl);
    header.appendChild(titleWrap);

    var closeModal = function () {
        modal.className = 'hidden';
        modal.hidden = true;
    };
    modal.hidden = false;

    var closeBtn = document.createElement('button');
    closeBtn.id = 'quick-edit-dev-close';
    closeBtn.type = 'button';
    closeBtn.className = 'rounded-lg px-2.5 py-1 text-sm text-[#6F7171] hover:text-black';
    closeBtn.textContent = '✕';
    if (typeof closeBtn.setAttribute === 'function') closeBtn.setAttribute('aria-label', 'Close developer settings');
    if (typeof closeBtn.addEventListener === 'function') closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'p-6 space-y-5 overflow-y-auto flex-1';

    var topGrid = document.createElement('div');
    topGrid.className = 'grid grid-cols-1 md:grid-cols-3 gap-4';

    var mgrGroup = document.createElement('div');
    var mgrLabel = document.createElement('label');
    mgrLabel.htmlFor = 'quick-edit-dev-manager';
    mgrLabel.className = 'block text-xs font-medium text-black mb-1';
    mgrLabel.textContent = 'Manager';
    var mgrInput = document.createElement('input');
    mgrInput.id = 'quick-edit-dev-manager';
    mgrInput.type = 'text';
    mgrInput.maxLength = 128;
    mgrInput.placeholder = 'Assign manager';
    mgrInput.value = existingEntry.manager || '';
    if (typeof mgrInput.setAttribute === 'function') {
        mgrInput.setAttribute('list', 'developer-manager-options');
        mgrInput.setAttribute('aria-label', devName + ' manager');
    }
    mgrInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-3 py-1.5 w-full text-sm bg-white text-black';
    mgrGroup.appendChild(mgrLabel);
    mgrGroup.appendChild(mgrInput);
    topGrid.appendChild(mgrGroup);

    var capGroup = document.createElement('div');
    var capLabel = document.createElement('label');
    capLabel.htmlFor = 'quick-edit-dev-capacity';
    capLabel.className = 'block text-xs font-medium text-black mb-1';
    capLabel.textContent = 'Base sprint capacity (story points)';
    var capInput = document.createElement('input');
    capInput.id = 'quick-edit-dev-capacity';
    capInput.type = 'number';
    capInput.min = '0';
    capInput.step = 'any';
    capInput.placeholder = 'e.g. 10';
    capInput.value = existingEntry.capacity == null ? '' : String(existingEntry.capacity);
    if (typeof capInput.setAttribute === 'function') {
        capInput.setAttribute('aria-label', devName + ' base sprint capacity');
    }
    capInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-3 py-1.5 w-full text-sm bg-white text-black';
    capGroup.appendChild(capLabel);
    capGroup.appendChild(capInput);
    topGrid.appendChild(capGroup);

    var pctGroup = document.createElement('div');
    var pctLabel = document.createElement('label');
    pctLabel.htmlFor = 'quick-edit-dev-pct';
    pctLabel.className = 'block text-xs font-medium text-black mb-1';
    pctLabel.textContent = 'PCT';
    var pctInput = document.createElement('input');
    pctInput.id = 'quick-edit-dev-pct';
    pctInput.type = 'text';
    pctInput.maxLength = 128;
    pctInput.placeholder = 'Assign PCT';
    var resolvedInitialPct = existingEntry.pct || buildClientActPctResolver_().resolveForDeveloper({ developer: devName });
    pctInput.value = resolvedInitialPct || '';
    if (typeof pctInput.setAttribute === 'function') {
        pctInput.setAttribute('list', 'developer-pct-options');
        pctInput.setAttribute('aria-label', devName + ' PCT');
    }
    pctInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-3 py-1.5 w-full text-sm bg-white text-black';
    pctGroup.appendChild(pctLabel);
    pctGroup.appendChild(pctInput);
    topGrid.appendChild(pctGroup);
    body.appendChild(topGrid);

    var ptoContainer = document.createElement('div');
    ptoContainer.id = 'quick-edit-dev-pto-container';
    ptoContainer.className = 'rounded-xl border border-[#D8DADA] bg-[#F6F6F6]/70 p-4';
    var dummyBadgeBtn = document.createElement('button');
    var getBaseCap = function () {
        return capInput.value === '' ? null : Number(capInput.value);
    };
    renderDeveloperPtoSubpanel_(ptoContainer, devName, dummyBadgeBtn, getBaseCap);
    if (typeof capInput.addEventListener === 'function') {
        capInput.addEventListener('input', function () {
            renderDeveloperPtoSubpanel_(ptoContainer, devName, dummyBadgeBtn, getBaseCap);
        });
    }
    body.appendChild(ptoContainer);
    card.appendChild(body);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'flex flex-wrap items-center justify-between gap-3 border-t border-[#D8DADA] bg-[#F6F6F6] px-6 py-3.5';
    var statusEl = document.createElement('p');
    statusEl.id = 'quick-edit-dev-status';
    statusEl.className = 'text-xs text-[#6F7171]';
    footer.appendChild(statusEl);

    var actions = document.createElement('div');
    actions.className = 'flex items-center gap-2';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'rounded-lg border border-[#D8DADA] bg-white px-3.5 py-1.5 text-xs font-medium text-black hover:border-black';
    cancelBtn.textContent = 'Cancel';
    if (typeof cancelBtn.addEventListener === 'function') cancelBtn.addEventListener('click', closeModal);
    actions.appendChild(cancelBtn);

    var saveBtn = document.createElement('button');
    saveBtn.id = 'quick-edit-dev-save';
    saveBtn.type = 'button';
    saveBtn.className = 'rounded-lg border border-black bg-black px-4 py-1.5 text-xs font-medium text-white hover:opacity-90';
    saveBtn.textContent = 'Save changes';
    if (typeof saveBtn.addEventListener === 'function') {
        saveBtn.addEventListener('click', function () {
            if (!checkAuth()) return;
            var rawCap = String(capInput.value == null ? '' : capInput.value).trim();
            if (rawCap !== '' && (!Number.isFinite(Number(rawCap)) || Number(rawCap) < 0)) {
                statusEl.textContent = 'Enter a non-negative number or leave capacity blank.';
                statusEl.className = 'text-xs text-[#B95319] font-medium';
                return;
            }
            var overrideMap = {};
            (developerSprintOverridesState_.get(devKey) || []).forEach(function (item) {
                var sp = String(item.sprint || '').trim();
                if (!sp) return;
                var pto = item.ptoDays === '' || item.ptoDays == null ? 0 : Number(item.ptoDays);
                var ovr = item.capacityOverride === '' || item.capacityOverride == null ? null : Number(item.capacityOverride);
                var notes = String(item.notes || '').trim();
                if (pto > 0 || ovr !== null || notes) {
                    overrideMap[sp] = { ptoDays: pto, capacityOverride: ovr, notes: notes };
                }
            });
            var ptoDatesList = [];
            (developerPtoDatesState_.get(devKey) || []).forEach(function (pt) {
                var sIso = toClientIsoDateKey_(pt.startDate);
                if (!sIso) return;
                var eIso = toClientIsoDateKey_(pt.endDate) || sIso;
                if (eIso < sIso) eIso = sIso;
                var dVal = pt.days === '' || pt.days == null ? null : Number(pt.days);
                ptoDatesList.push({
                    startDate: sIso,
                    endDate: eIso,
                    days: dVal,
                    notes: String(pt.notes || '').trim()
                });
            });

            var byKey = new Map();
            (allData.projects || []).forEach(function (p) {
                var n = String(p.Assignee || '').trim();
                if (n && n.toLowerCase() !== 'unassigned' && !byKey.has(n.toLowerCase())) {
                    byKey.set(n.toLowerCase(), { developer: n, capacity: '' });
                }
            });
            (devList || []).forEach(function (e) {
                if (!e || !e.developer) return;
                var k = String(e.developer).trim().toLowerCase();
                var copy = {
                    developer: e.developer,
                    capacity: e.capacity == null ? '' : String(e.capacity),
                    manager: e.manager || ''
                };
                if (e.pct) copy.pct = e.pct;
                if (e.sprintOverrides) copy.sprintOverrides = e.sprintOverrides;
                if (e.ptoDates) copy.ptoDates = e.ptoDates;
                byKey.set(k, copy);
            });
            var updatedEntry = {
                developer: devName,
                capacity: rawCap,
                manager: String(mgrInput.value || '').trim(),
                sprintOverrides: overrideMap,
                ptoDates: ptoDatesList
            };
            var rawPctVal = String(pctInput.value || '').trim();
            if (rawPctVal || existingEntry.pct) {
                updatedEntry.pct = rawPctVal;
            }
            byKey.set(devKey, updatedEntry);
            var allEntries = Array.from(byKey.values());
            saveBtn.disabled = true;
            statusEl.textContent = 'Saving...';
            statusEl.className = 'text-xs text-[#6F7171]';
            callServer('saveDeveloperCapacity', [allEntries]).then(function (response) {
                if (!response || response.status !== 'success') {
                    throw new Error(response && response.message ? response.message : 'Could not save capacity.');
                }
                return callServer('getProjectData', []).then(function (data) {
                    if (!handleDataLoaded(data)) throw new Error('Saved, but refresh failed.');
                    if (typeof renderDeveloperCapacityConfig === 'function') renderDeveloperCapacityConfig();
                    renderCapacityView();
                    closeModal();
                });
            }).catch(function (error) {
                statusEl.textContent = typeof getErrorMessage_ === 'function' ? getErrorMessage_(error) : (error.message || String(error));
                statusEl.className = 'text-xs text-[#B95319] font-medium';
            }).finally(function () {
                saveBtn.disabled = false;
            });
        });
    }
    actions.appendChild(saveBtn);
    footer.appendChild(actions);
    card.appendChild(footer);
    modal.appendChild(card);
    return modal;
}

function getKnownSprintDateWindows_() {
    var windows = [];
    var seen = new Set();
    var addWindow = function (name, startVal, endVal) {
        var clean = String(name || '').trim();
        if (!clean || clean === 'None' || clean === '—') return;
        var key = clean.toLowerCase();
        if (seen.has(key)) return;
        var ovr = getStoredSprintDateOverride_(clean);
        var s = ovr ? ovr.start : toClientIsoDateKey_(startVal);
        var e = ovr ? ovr.end : toClientIsoDateKey_(endVal);
        if (s && e && e >= s) {
            seen.add(key);
            windows.push({ sprintName: clean, start: s, end: e });
        }
    };
    if (APP_STATE && APP_STATE.allData) {
        var sc = APP_STATE.allData.sprintCapacity;
        if (sc && sc.sprintName) addWindow(sc.sprintName, sc.sprintStart, sc.sprintEnd);
        (APP_STATE.allData.futureSprintCapacity || []).forEach(function (fs) {
            if (fs && fs.sprintName) addWindow(fs.sprintName, fs.sprintStart, fs.sprintEnd);
        });
        var sd = APP_STATE.allData.capacitySettings && APP_STATE.allData.capacitySettings.sprintDates;
        if (sd && typeof sd === 'object') {
            Object.keys(sd).forEach(function (k) {
                if (sd[k]) addWindow(k, sd[k].start, sd[k].end);
            });
        }
    }
    return windows;
}

function findMatchingSprintForDate_(dateIso) {
    var d = toClientIsoDateKey_(dateIso);
    if (!d) return '';
    var windows = getKnownSprintDateWindows_();
    for (var i = 0; i < windows.length; i++) {
        if (d >= windows[i].start && d <= windows[i].end) {
            return windows[i].sprintName;
        }
    }
    return '';
}

function getKnownCapacitySprints_() {
    var sprints = [];
    var seen = new Set();
    var addSprint = function (name) {
        var clean = String(name || '').trim();
        if (!clean || clean === 'None' || clean === '—') return;
        var key = clean.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            sprints.push(clean);
        }
    };
    if (APP_STATE.allData) {
        if (APP_STATE.allData.sprintCapacity && APP_STATE.allData.sprintCapacity.sprintName) {
            addSprint(APP_STATE.allData.sprintCapacity.sprintName);
        }
        (APP_STATE.allData.futureSprintCapacity || []).forEach(function (s) {
            if (s && s.sprintName) addSprint(s.sprintName);
        });
        (APP_STATE.allData.developerCapacity || []).forEach(function (entry) {
            if (entry && entry.sprintOverrides && typeof entry.sprintOverrides === 'object') {
                Object.keys(entry.sprintOverrides).forEach(function (k) {
                    if (k !== '__ptoDates__') addSprint(k);
                });
            }
        });
        if (APP_STATE.allData.capacitySettings && Array.isArray(APP_STATE.allData.capacitySettings.companyHolidays)) {
            APP_STATE.allData.capacitySettings.companyHolidays.forEach(function (h) {
                if (h && h.sprint) addSprint(h.sprint);
            });
        }
    }
    return sprints;
}

function renderCompanyHolidaysConfig_() {
    var listEl = document.getElementById('developer-company-holidays-list');
    if (!listEl) return;
    listEl.replaceChildren();
    if (!developerCompanyHolidaysState_.length) {
        var emptyMsg = document.createElement('p');
        emptyMsg.className = 'text-xs text-[#6F7171] italic';
        emptyMsg.textContent = 'No company holidays configured.';
        listEl.appendChild(emptyMsg);
        return;
    }
    developerCompanyHolidaysState_.forEach(function (holiday, idx) {
        var row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2 bg-[#F6F6F6] border border-[#D8DADA] rounded-lg px-3 py-2';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Holiday name (e.g. Memorial Day)';
        nameInput.value = holiday.name || '';
        nameInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-2.5 py-1 text-xs bg-white text-black flex-1 min-w-[140px]';
        if (typeof nameInput.setAttribute === 'function') nameInput.setAttribute('aria-label', 'Holiday name');
        if (typeof nameInput.addEventListener === 'function') {
            nameInput.addEventListener('input', function () {
                holiday.name = nameInput.value;
            });
        }
        row.appendChild(nameInput);

        var dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = holiday.date || '';
        dateInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-2.5 py-1 text-xs bg-white text-black w-36';
        if (typeof dateInput.setAttribute === 'function') dateInput.setAttribute('aria-label', 'Holiday date');
        row.appendChild(dateInput);

        var sprintInput = document.createElement('input');
        sprintInput.type = 'text';
        sprintInput.placeholder = 'Auto by date or sprint';
        sprintInput.value = holiday.sprint || '';
        if (typeof sprintInput.setAttribute === 'function') {
            sprintInput.setAttribute('list', 'developer-sprint-options');
            sprintInput.setAttribute('aria-label', 'Holiday sprint');
        }
        sprintInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-2.5 py-1 text-xs bg-white text-black w-36';
        if (typeof sprintInput.addEventListener === 'function') {
            sprintInput.addEventListener('input', function () {
                holiday.sprint = sprintInput.value;
            });
        }
        if (typeof dateInput.addEventListener === 'function') {
            dateInput.addEventListener('input', function () {
                holiday.date = dateInput.value;
                var matched = findMatchingSprintForDate_(dateInput.value);
                if (matched) {
                    holiday.sprint = matched;
                    sprintInput.value = matched;
                }
            });
        }
        row.appendChild(sprintInput);

        var daysInput = document.createElement('input');
        daysInput.type = 'number';
        daysInput.min = '0.5';
        daysInput.step = '0.5';
        daysInput.value = holiday.days != null ? String(holiday.days) : '1';
        if (typeof daysInput.setAttribute === 'function') daysInput.setAttribute('aria-label', 'Holiday days off');
        daysInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-2 py-1 text-xs bg-white text-black w-16 text-right';
        if (typeof daysInput.addEventListener === 'function') {
            daysInput.addEventListener('input', function () {
                holiday.days = daysInput.value;
            });
        }
        row.appendChild(daysInput);

        var daysLabel = document.createElement('span');
        daysLabel.className = 'text-xs text-[#6F7171]';
        daysLabel.textContent = 'days';
        row.appendChild(daysLabel);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'ml-auto text-xs text-[#6F7171] hover:text-black px-2 py-0.5';
        removeBtn.textContent = 'Remove';
        if (typeof removeBtn.addEventListener === 'function') {
            removeBtn.addEventListener('click', function () {
                developerCompanyHolidaysState_.splice(idx, 1);
                renderCompanyHolidaysConfig_();
            });
        }
        row.appendChild(removeBtn);

        listEl.appendChild(row);
    });
}

function renderDeveloperPtoSubpanel_(wrapper, devName, toggleBtn, getBaseCapacity) {
    var devKey = devName.toLowerCase();
    var entries = developerSprintOverridesState_.get(devKey) || [];
    var dateEntries = developerPtoDatesState_.get(devKey) || [];
    var updateBadge = function () {
        var manualCount = (developerSprintOverridesState_.get(devKey) || []).filter(function (item) {
            return String(item.sprint || '').trim() && (Number(item.ptoDays) > 0 || (item.capacityOverride !== '' && item.capacityOverride != null));
        }).length;
        var dateCount = (developerPtoDatesState_.get(devKey) || []).filter(function (item) {
            return Boolean(toClientIsoDateKey_(item.startDate));
        }).length;
        var activeCount = manualCount + dateCount;
        toggleBtn.textContent = activeCount > 0 ? 'PTO & overrides (' + activeCount + ')' : 'PTO & overrides';
        toggleBtn.className = activeCount > 0 ?
            'inline-flex items-center gap-1 rounded-lg border border-[#006FC1] bg-[#E5F2FA] px-2.5 py-1 text-xs font-medium text-[#006FC1] hover:border-black' :
            'inline-flex items-center gap-1 rounded-lg border border-[#D8DADA] bg-[#F6F6F6] px-2.5 py-1 text-xs text-black hover:border-black';
    };

    wrapper.replaceChildren();
    var header = document.createElement('div');
    header.className = 'flex flex-wrap items-center justify-between gap-2 mb-2';
    var title = document.createElement('span');
    title.className = 'text-xs font-semibold text-black';
    title.textContent = devName + ' — Scheduled PTO dates & manual sprint overrides';
    header.appendChild(title);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'flex flex-wrap items-center gap-2';

    var addDateBtn = document.createElement('button');
    addDateBtn.type = 'button';
    addDateBtn.className = 'rounded-lg border border-[#D8DADA] bg-white px-2.5 py-1 text-xs font-medium text-black hover:border-black';
    addDateBtn.textContent = '+ Add PTO date';
    if (typeof addDateBtn.setAttribute === 'function') {
        addDateBtn.setAttribute('data-add-pto-date-for', devName);
    }
    if (typeof addDateBtn.addEventListener === 'function') {
        addDateBtn.addEventListener('click', function () {
            var windows = getKnownSprintDateWindows_();
            var defaultDate = windows.length ? windows[0].start : '';
            dateEntries.push({ startDate: defaultDate, endDate: defaultDate, days: '', notes: '' });
            developerPtoDatesState_.set(devKey, dateEntries);
            renderDeveloperPtoSubpanel_(wrapper, devName, toggleBtn, getBaseCapacity);
            updateBadge();
        });
    }
    btnGroup.appendChild(addDateBtn);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'rounded-lg border border-[#D8DADA] bg-white px-2.5 py-1 text-xs font-medium text-black hover:border-black';
    addBtn.textContent = '+ Add manual PTO / override';
    if (typeof addBtn.setAttribute === 'function') {
        addBtn.setAttribute('data-add-pto-for', devName);
    }
    if (typeof addBtn.addEventListener === 'function') {
        addBtn.addEventListener('click', function () {
            var knownSprints = getKnownCapacitySprints_();
            var used = new Set(entries.map(function (e) { return String(e.sprint || '').trim().toLowerCase(); }));
            var defaultSprint = knownSprints.find(function (s) { return !used.has(s.toLowerCase()); }) || (knownSprints[0] || 'Sprint 1');
            entries.push({ sprint: defaultSprint, ptoDays: '1', capacityOverride: '', notes: '' });
            developerSprintOverridesState_.set(devKey, entries);
            renderDeveloperPtoSubpanel_(wrapper, devName, toggleBtn, getBaseCapacity);
            updateBadge();
        });
    }
    btnGroup.appendChild(addBtn);
    header.appendChild(btnGroup);
    wrapper.appendChild(header);

    if (!dateEntries.length && !entries.length) {
        var empty = document.createElement('p');
        empty.className = 'text-xs text-[#6F7171] italic';
        empty.textContent = 'No PTO or capacity overrides tracked for ' + devName + '. Use "+ Add PTO date" to pick dates on the calendar (auto-matched to sprint dates) or "+ Add manual PTO / override" for manual days or point overrides.';
        wrapper.appendChild(empty);
        updateBadge();
        return;
    }

    var list = document.createElement('div');
    list.className = 'space-y-2';

    // 1. Date-based PTO entries
    dateEntries.forEach(function (pt, idx) {
        var dRow = document.createElement('div');
        dRow.className = 'grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white border border-[#D8DADA] rounded-lg px-3 py-2 text-xs';

        var sWrap = document.createElement('div');
        sWrap.className = 'md:col-span-3';
        var sLbl = document.createElement('label');
        sLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        sLbl.textContent = 'PTO start date';
        var sInp = document.createElement('input');
        sInp.type = 'date';
        sInp.value = pt.startDate || '';
        sInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-xs text-black';
        if (typeof sInp.setAttribute === 'function') sInp.setAttribute('aria-label', devName + ' PTO start date');
        sWrap.appendChild(sLbl);
        sWrap.appendChild(sInp);
        dRow.appendChild(sWrap);

        var eWrap = document.createElement('div');
        eWrap.className = 'md:col-span-3';
        var eLbl = document.createElement('label');
        eLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        eLbl.textContent = 'PTO end date';
        var eInp = document.createElement('input');
        eInp.type = 'date';
        eInp.value = pt.endDate || pt.startDate || '';
        eInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-xs text-black';
        if (typeof eInp.setAttribute === 'function') eInp.setAttribute('aria-label', devName + ' PTO end date');
        eWrap.appendChild(eLbl);
        eWrap.appendChild(eInp);
        dRow.appendChild(eWrap);

        var daysWrap = document.createElement('div');
        daysWrap.className = 'md:col-span-2';
        var daysLbl = document.createElement('label');
        daysLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        daysLbl.textContent = 'Days (blank=auto)';
        var daysInp = document.createElement('input');
        daysInp.type = 'number';
        daysInp.min = '0';
        daysInp.step = '0.5';
        daysInp.placeholder = 'Auto';
        daysInp.value = pt.days != null && pt.days !== '' ? String(pt.days) : '';
        daysInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-right text-xs text-black';
        if (typeof daysInp.setAttribute === 'function') daysInp.setAttribute('aria-label', devName + ' PTO date days');
        daysWrap.appendChild(daysLbl);
        daysWrap.appendChild(daysInp);
        dRow.appendChild(daysWrap);

        var nWrap = document.createElement('div');
        nWrap.className = 'md:col-span-2';
        var nLbl = document.createElement('label');
        nLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        nLbl.textContent = 'Notes';
        var nInp = document.createElement('input');
        nInp.type = 'text';
        nInp.placeholder = 'Vacation';
        nInp.value = pt.notes || '';
        nInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-xs text-black';
        nWrap.appendChild(nLbl);
        nWrap.appendChild(nInp);
        dRow.appendChild(nWrap);

        var infoWrap = document.createElement('div');
        infoWrap.className = 'md:col-span-2 flex items-center justify-between gap-1 pt-3';
        var infoBadge = document.createElement('span');
        infoBadge.className = 'text-[11px] font-medium text-[#006FC1]';
        var updateDateInfo = function () {
            var sKey = toClientIsoDateKey_(pt.startDate);
            var eKey = toClientIsoDateKey_(pt.endDate) || sKey;
            if (!sKey) {
                infoBadge.textContent = 'Pick date';
                return;
            }
            if (eKey < sKey) eKey = sKey;
            var wDays = pt.days !== '' && pt.days != null && Number.isFinite(Number(pt.days)) ?
                Number(pt.days) : countClientIsoWorkdays_(sKey, eKey);
            var matchedSprint = findMatchingSprintForDate_(sKey) || findMatchingSprintForDate_(eKey);
            infoBadge.textContent = wDays + 'd' + (matchedSprint ? ' · ' + matchedSprint : ' · by date');
        };
        updateDateInfo();

        if (typeof sInp.addEventListener === 'function') {
            sInp.addEventListener('input', function () {
                pt.startDate = sInp.value;
                if (!pt.endDate || pt.endDate < pt.startDate) {
                    pt.endDate = pt.startDate;
                    eInp.value = pt.endDate;
                }
                updateDateInfo();
                updateBadge();
            });
        }
        if (typeof eInp.addEventListener === 'function') {
            eInp.addEventListener('input', function () {
                pt.endDate = eInp.value;
                updateDateInfo();
                updateBadge();
            });
        }
        if (typeof daysInp.addEventListener === 'function') {
            daysInp.addEventListener('input', function () {
                pt.days = daysInp.value;
                updateDateInfo();
            });
        }
        if (typeof nInp.addEventListener === 'function') {
            nInp.addEventListener('input', function () {
                pt.notes = nInp.value;
            });
        }

        var delDateBtn = document.createElement('button');
        delDateBtn.type = 'button';
        delDateBtn.className = 'text-[#6F7171] hover:text-black px-1.5 py-0.5';
        delDateBtn.textContent = '✕';
        if (typeof delDateBtn.setAttribute === 'function') delDateBtn.setAttribute('aria-label', 'Remove PTO date entry');
        if (typeof delDateBtn.addEventListener === 'function') {
            delDateBtn.addEventListener('click', function () {
                dateEntries.splice(idx, 1);
                developerPtoDatesState_.set(devKey, dateEntries);
                renderDeveloperPtoSubpanel_(wrapper, devName, toggleBtn, getBaseCapacity);
                updateBadge();
            });
        }
        infoWrap.appendChild(infoBadge);
        infoWrap.appendChild(delDateBtn);
        dRow.appendChild(infoWrap);
        list.appendChild(dRow);
    });

    // 2. Manual Sprint PTO & Point Override entries
    entries.forEach(function (item, idx) {
        var itemRow = document.createElement('div');
        itemRow.className = 'grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white border border-[#D8DADA] rounded-lg px-3 py-2 text-xs';

        var sprintWrap = document.createElement('div');
        sprintWrap.className = 'md:col-span-3';
        var sprintLbl = document.createElement('label');
        sprintLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        sprintLbl.textContent = 'Sprint (manual)';
        var sprintInp = document.createElement('input');
        sprintInp.type = 'text';
        sprintInp.value = item.sprint || '';
        sprintInp.placeholder = 'e.g. Sprint 12';
        if (typeof sprintInp.setAttribute === 'function') {
            sprintInp.setAttribute('list', 'developer-sprint-options');
            sprintInp.setAttribute('aria-label', devName + ' PTO sprint');
        }
        sprintInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-xs text-black';
        sprintWrap.appendChild(sprintLbl);
        sprintWrap.appendChild(sprintInp);
        itemRow.appendChild(sprintWrap);

        var ptoWrap = document.createElement('div');
        ptoWrap.className = 'md:col-span-2';
        var ptoLbl = document.createElement('label');
        ptoLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        ptoLbl.textContent = 'Manual PTO (days)';
        var ptoInp = document.createElement('input');
        ptoInp.type = 'number';
        ptoInp.min = '0';
        ptoInp.step = '0.5';
        ptoInp.value = item.ptoDays != null ? String(item.ptoDays) : '0';
        if (typeof ptoInp.setAttribute === 'function') {
            ptoInp.setAttribute('aria-label', devName + ' PTO days');
        }
        ptoInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-right text-xs text-black';
        ptoWrap.appendChild(ptoLbl);
        ptoWrap.appendChild(ptoInp);
        itemRow.appendChild(ptoWrap);

        var ovrWrap = document.createElement('div');
        ovrWrap.className = 'md:col-span-2';
        var ovrLbl = document.createElement('label');
        ovrLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        ovrLbl.textContent = 'Point override (pts)';
        var ovrInp = document.createElement('input');
        ovrInp.type = 'number';
        ovrInp.min = '0';
        ovrInp.step = 'any';
        ovrInp.placeholder = 'Auto';
        ovrInp.value = item.capacityOverride != null && item.capacityOverride !== '' ? String(item.capacityOverride) : '';
        if (typeof ovrInp.setAttribute === 'function') {
            ovrInp.setAttribute('aria-label', devName + ' capacity override');
        }
        ovrInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-right text-xs text-black';
        ovrWrap.appendChild(ovrLbl);
        ovrWrap.appendChild(ovrInp);
        itemRow.appendChild(ovrWrap);

        var noteWrap = document.createElement('div');
        noteWrap.className = 'md:col-span-3';
        var noteLbl = document.createElement('label');
        noteLbl.className = 'block text-[10px] text-[#6F7171] mb-0.5';
        noteLbl.textContent = 'Notes';
        var noteInp = document.createElement('input');
        noteInp.type = 'text';
        noteInp.placeholder = 'e.g. 50% Auth team';
        noteInp.value = item.notes || '';
        noteInp.className = 'border border-[#D8DADA] rounded px-2 py-1 w-full text-xs text-black';
        noteWrap.appendChild(noteLbl);
        noteWrap.appendChild(noteInp);
        itemRow.appendChild(noteWrap);

        var previewWrap = document.createElement('div');
        previewWrap.className = 'md:col-span-2 flex items-center justify-between gap-1 pt-3';
        var previewBadge = document.createElement('span');
        previewBadge.className = 'text-[11px] font-medium text-[#006FC1]';
        var updatePreview = function () {
            var base = getBaseCapacity();
            var workdaysEl = document.getElementById('developer-sprint-workdays');
            var workdays = workdaysEl && Number(workdaysEl.value) > 0 ? Number(workdaysEl.value) : 10;
            var sprintKey = String(item.sprint || '').trim().toLowerCase();
            var holDays = developerCompanyHolidaysState_.reduce(function (sum, h) {
                var matchedSp = h.date ? findMatchingSprintForDate_(h.date) : '';
                var effSp = String(matchedSp || h.sprint || '').trim().toLowerCase();
                return effSp === sprintKey && Number(h.days) > 0 ? sum + Number(h.days) : sum;
            }, 0);
            var pto = Number(item.ptoDays) > 0 ? Number(item.ptoDays) : 0;
            if (item.capacityOverride !== '' && item.capacityOverride != null && Number.isFinite(Number(item.capacityOverride))) {
                previewBadge.textContent = '→ ' + Number(item.capacityOverride) + ' pts';
            } else if (base != null && Number.isFinite(base)) {
                var avail = Math.max(0, workdays - holDays - pto);
                var eff = Math.round((base * (avail / workdays)) * 100) / 100;
                previewBadge.textContent = '→ ' + eff + ' pts';
            } else {
                previewBadge.textContent = 'Set base cap';
            }
        };
        updatePreview();

        if (typeof sprintInp.addEventListener === 'function') sprintInp.addEventListener('input', function () { item.sprint = sprintInp.value; updatePreview(); updateBadge(); });
        if (typeof ptoInp.addEventListener === 'function') ptoInp.addEventListener('input', function () { item.ptoDays = ptoInp.value; updatePreview(); updateBadge(); });
        if (typeof ovrInp.addEventListener === 'function') ovrInp.addEventListener('input', function () { item.capacityOverride = ovrInp.value; updatePreview(); updateBadge(); });
        if (typeof noteInp.addEventListener === 'function') noteInp.addEventListener('input', function () { item.notes = noteInp.value; });

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'text-[#6F7171] hover:text-black px-1.5 py-0.5';
        delBtn.textContent = '✕';
        if (typeof delBtn.setAttribute === 'function') delBtn.setAttribute('aria-label', 'Remove sprint PTO entry');
        if (typeof delBtn.addEventListener === 'function') {
            delBtn.addEventListener('click', function () {
                entries.splice(idx, 1);
                developerSprintOverridesState_.set(devKey, entries);
                renderDeveloperPtoSubpanel_(wrapper, devName, toggleBtn, getBaseCapacity);
                updateBadge();
            });
        }
        previewWrap.appendChild(previewBadge);
        previewWrap.appendChild(delBtn);
        itemRow.appendChild(previewWrap);
        list.appendChild(itemRow);
    });
    wrapper.appendChild(list);
    updateBadge();
}

function renderDeveloperCapacityConfig() {
    var body = document.getElementById('developer-capacity-body');
    if (!body) return;
    body.replaceChildren();
    developerSprintOverridesState_ = new Map();
    developerPtoDatesState_ = new Map();
    var rawSettings = (APP_STATE.allData && APP_STATE.allData.capacitySettings) || { sprintWorkdays: 10, companyHolidays: [] };
    developerCompanyHolidaysState_ = (rawSettings.companyHolidays || []).map(function (h) {
        return { name: h.name || '', date: h.date || '', sprint: h.sprint || '', days: h.days != null ? h.days : 1 };
    });
    var workdaysInput = document.getElementById('developer-sprint-workdays');
    if (workdaysInput) {
        workdaysInput.value = rawSettings.sprintWorkdays > 0 ? String(rawSettings.sprintWorkdays) : '10';
    }
    var addHolidayBtn = document.getElementById('add-company-holiday-btn');
    if (addHolidayBtn) {
        addHolidayBtn.onclick = function () {
            var known = getKnownCapacitySprints_();
            var windows = getKnownSprintDateWindows_();
            developerCompanyHolidaysState_.push({
                name: '',
                date: windows.length ? windows[0].start : '',
                sprint: known[0] || '',
                days: 1
            });
            renderCompanyHolidaysConfig_();
        };
    }
    renderCompanyHolidaysConfig_();

    var sprintList = document.getElementById('developer-sprint-options');
    if (sprintList) {
        sprintList.replaceChildren();
        getKnownCapacitySprints_().forEach(function (sprintName) {
            var opt = document.createElement('option');
            opt.value = sprintName;
            sprintList.appendChild(opt);
        });
    }

    var names = new Map();
    (APP_STATE.allData.projects || []).forEach(function (project) {
        var name = String(project.Assignee || '').trim();
        if (name && name.toLowerCase() !== 'unassigned' && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    });
    var capacities = new Map();
    var managers = new Map();
    var pcts = new Map();
    var distinctManagers = new Set();
    var distinctPcts = new Set(((APP_STATE.allData && APP_STATE.allData.config && APP_STATE.allData.config.actPctOptions) || []).map(function (o) { return String(o || '').trim(); }).filter(Boolean));
    (APP_STATE.allData.developerCapacity || []).forEach(function (entry) {
        if (!entry || !entry.developer) return;
        var key = entry.developer.toLowerCase();
        capacities.set(key, entry.capacity);
        var mgr = String(entry.manager || '').trim();
        if (mgr) {
            managers.set(key, mgr);
            distinctManagers.add(mgr);
        }
        var pctVal = String(entry.pct || '').trim();
        if (pctVal) {
            pcts.set(key, pctVal);
            distinctPcts.add(pctVal);
        }
        if (entry.sprintOverrides && typeof entry.sprintOverrides === 'object') {
            var list = Object.keys(entry.sprintOverrides).filter(function (k) { return k !== '__ptoDates__' && k !== '__pct__'; }).map(function (sprintName) {
                var item = entry.sprintOverrides[sprintName] || {};
                return {
                    sprint: sprintName,
                    ptoDays: item.ptoDays != null ? String(item.ptoDays) : '0',
                    capacityOverride: item.capacityOverride != null ? String(item.capacityOverride) : '',
                    notes: item.notes || ''
                };
            });
            if (list.length) developerSprintOverridesState_.set(key, list);
        }
        if (Array.isArray(entry.ptoDates) && entry.ptoDates.length) {
            developerPtoDatesState_.set(key, entry.ptoDates.map(function (pt) {
                return {
                    startDate: pt.startDate || '',
                    endDate: pt.endDate || pt.startDate || '',
                    days: pt.days != null ? String(pt.days) : '',
                    notes: pt.notes || ''
                };
            }));
        }
    });
    var managerList = document.getElementById('developer-manager-options');
    if (managerList) {
        managerList.replaceChildren();
        Array.from(distinctManagers).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (mgr) {
            var opt = document.createElement('option');
            opt.value = mgr;
            managerList.appendChild(opt);
        });
    }
    var pctList = document.getElementById('developer-pct-options');
    if (pctList) {
        pctList.replaceChildren();
        Array.from(distinctPcts).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (pctOpt) {
            var opt = document.createElement('option');
            opt.value = pctOpt;
            pctList.appendChild(opt);
        });
    }
    var developers = Array.from(names.values()).sort(function (a, b) { return a.localeCompare(b); });
    if (!developers.length) {
        var empty = body.insertRow().insertCell();
        empty.colSpan = 4;
        empty.className = 'px-3 py-8 text-gray-600';
        empty.textContent = 'No Jira assignees found.';
    }
    developers.forEach(function (name, index) {
        var row = body.insertRow();
        row.className = 'hover:bg-[#F6F6F6] transition-colors';
        var nameCell = row.insertCell();
        nameCell.className = 'px-4 py-3';
        var label = document.createElement('label');
        label.htmlFor = 'developer-capacity-' + index;
        label.className = 'text-black font-normal';
        label.textContent = name;
        nameCell.appendChild(label);

        var managerCell = row.insertCell();
        managerCell.className = 'px-4 py-3';
        var managerInput = document.createElement('input');
        managerInput.id = 'developer-manager-' + index;
        managerInput.type = 'text';
        managerInput.maxLength = 128;
        managerInput.placeholder = 'Assign manager';
        if (typeof managerInput.setAttribute === 'function') {
            managerInput.setAttribute('list', 'developer-manager-options');
            managerInput.setAttribute('aria-label', name + ' manager');
        }
        managerInput.dataset.developerManager = name;
        managerInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-3 py-1.5 w-36 bg-white text-black mr-2';
        managerInput.value = managers.get(name.toLowerCase()) || '';
        managerCell.appendChild(managerInput);

        var pctInput = document.createElement('input');
        pctInput.id = 'developer-pct-' + index;
        pctInput.type = 'text';
        pctInput.maxLength = 128;
        pctInput.placeholder = 'PCT';
        if (typeof pctInput.setAttribute === 'function') {
            pctInput.setAttribute('list', 'developer-pct-options');
            pctInput.setAttribute('aria-label', name + ' PCT');
        }
        pctInput.dataset.developerPct = name;
        pctInput.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-2.5 py-1.5 w-28 bg-white text-black';
        pctInput.value = pcts.get(name.toLowerCase()) || '';
        managerCell.appendChild(pctInput);

        var cell = row.insertCell();
        cell.className = 'px-4 py-3 text-right';
        var input = document.createElement('input');
        input.id = label.htmlFor;
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        input.dataset.developer = name;
        input.className = 'border border-[#D8DADA] focus:border-black focus:outline-none rounded-lg px-3 py-1.5 w-28 text-right bg-white';
        var capacity = capacities.get(name.toLowerCase());
        input.value = capacity == null ? '' : String(capacity);
        cell.appendChild(input);

        var ptoCell = row.insertCell();
        ptoCell.className = 'px-4 py-3 text-right';
        var ptoToggle = document.createElement('button');
        ptoToggle.type = 'button';
        if (typeof ptoToggle.setAttribute === 'function') {
            ptoToggle.setAttribute('data-developer-pto-toggle', name);
            ptoToggle.setAttribute('aria-expanded', 'false');
        }
        ptoCell.appendChild(ptoToggle);

        var ptoRow = body.insertRow();
        ptoRow.hidden = true;
        ptoRow.className = 'bg-[#F6F6F6]/80 border-b border-[#D8DADA] hidden';
        var ptoDetailsCell = ptoRow.insertCell();
        ptoDetailsCell.colSpan = 4;
        ptoDetailsCell.className = 'px-4 py-3';
        var ptoPanelWrapper = document.createElement('div');
        ptoDetailsCell.appendChild(ptoPanelWrapper);

        var getBaseCap = function () {
            return input.value === '' ? null : Number(input.value);
        };
        renderDeveloperPtoSubpanel_(ptoPanelWrapper, name, ptoToggle, getBaseCap);
        if (typeof input.addEventListener === 'function') {
            input.addEventListener('input', function () {
                renderDeveloperPtoSubpanel_(ptoPanelWrapper, name, ptoToggle, getBaseCap);
            });
        }
        var togglePtoRow = function (e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            var expand = Boolean(ptoRow.hidden);
            ptoRow.hidden = !expand;
            if (ptoRow.classList && typeof ptoRow.classList.toggle === 'function') {
                ptoRow.classList.toggle('hidden', !expand);
            } else {
                ptoRow.className = expand ? 'bg-[#F6F6F6]/80 border-b border-[#D8DADA]' : 'bg-[#F6F6F6]/80 border-b border-[#D8DADA] hidden';
            }
            if (typeof ptoToggle.setAttribute === 'function') {
                ptoToggle.setAttribute('aria-expanded', String(expand));
            }
        };
        if (typeof ptoToggle.addEventListener === 'function') {
            ptoToggle.addEventListener('click', togglePtoRow);
        }
    });
}

function saveDeveloperCapacity(event) {
    event.preventDefault();
    if (!checkAuth()) return;
    var status = document.getElementById('developer-capacity-status');
    var button = document.getElementById('save-developer-capacity');
    var inputs = Array.from(document.querySelectorAll('#developer-capacity-body input[data-developer]'));
    var managerInputs = Array.from(document.querySelectorAll('#developer-capacity-body input[data-developer-manager]'));
    var pctInputs = Array.from(document.querySelectorAll('#developer-capacity-body input[data-developer-pct]'));
    var managerByDev = new Map();
    managerInputs.forEach(function (input) {
        if (input && input.dataset && input.dataset.developerManager) {
            managerByDev.set(input.dataset.developerManager.toLowerCase(), String(input.value || '').trim());
        }
    });
    var pctByDev = new Map();
    pctInputs.forEach(function (input) {
        if (input && input.dataset && input.dataset.developerPct) {
            pctByDev.set(input.dataset.developerPct.toLowerCase(), String(input.value || '').trim());
        }
    });
    var invalid = inputs.find(function (input) {
        return !input.validity.valid || (input.value !== '' && (!Number.isFinite(Number(input.value)) || Number(input.value) < 0));
    });
    if (invalid) {
        status.textContent = 'Enter a non-negative number or leave capacity blank.';
        status.classList.remove('config-status-neutral', 'config-status-success');
        status.classList.add('config-status-error');
        invalid.focus();
        return;
    }
    var entries = inputs.map(function (input) {
        var dev = input.dataset.developer;
        var key = dev.toLowerCase();
        var entry = { developer: dev, capacity: input.value };
        if (managerByDev.has(key)) {
            entry.manager = managerByDev.get(key);
        }
        if (pctByDev.get(key)) {
            entry.pct = pctByDev.get(key);
        }
        if (developerSprintOverridesState_.has(key)) {
            var overrideMap = {};
            (developerSprintOverridesState_.get(key) || []).forEach(function (item) {
                var sp = String(item.sprint || '').trim();
                if (!sp) return;
                var pto = item.ptoDays === '' || item.ptoDays == null ? 0 : Number(item.ptoDays);
                var ovr = item.capacityOverride === '' || item.capacityOverride == null ? null : Number(item.capacityOverride);
                var notes = String(item.notes || '').trim();
                if (pto > 0 || ovr !== null || notes) {
                    overrideMap[sp] = { ptoDays: pto, capacityOverride: ovr, notes: notes };
                }
            });
            entry.sprintOverrides = overrideMap;
        }
        if (developerPtoDatesState_.has(key)) {
            var ptoDatesList = [];
            (developerPtoDatesState_.get(key) || []).forEach(function (pt) {
                var sIso = toClientIsoDateKey_(pt.startDate);
                if (!sIso) return;
                var eIso = toClientIsoDateKey_(pt.endDate) || sIso;
                if (eIso < sIso) eIso = sIso;
                var dVal = pt.days === '' || pt.days == null ? null : Number(pt.days);
                ptoDatesList.push({
                    startDate: sIso,
                    endDate: eIso,
                    days: dVal,
                    notes: String(pt.notes || '').trim()
                });
            });
            entry.ptoDates = ptoDatesList;
        }
        return entry;
    });
    var workdaysEl = document.getElementById('developer-sprint-workdays');
    var holidaysListEl = document.getElementById('developer-company-holidays-list');
    var serverArgs = [entries];
    if (workdaysEl || holidaysListEl) {
        var workdaysVal = workdaysEl && Number(workdaysEl.value) > 0 ? Number(workdaysEl.value) : 10;
        var holidaysPayload = developerCompanyHolidaysState_.filter(function (h) {
            return (String(h.sprint || '').trim() || toClientIsoDateKey_(h.date)) && Number(h.days) > 0;
        }).map(function (h) {
            var hObj = {
                name: String(h.name || 'Company Holiday').trim() || 'Company Holiday',
                sprint: String(h.sprint || '').trim(),
                days: Number(h.days)
            };
            var hDate = toClientIsoDateKey_(h.date);
            if (hDate) hObj.date = hDate;
            return hObj;
        });
        var sprintDatesMap = {};
        getKnownSprintDateWindows_().forEach(function (w) {
            sprintDatesMap[w.sprintName] = { start: w.start, end: w.end };
        });
        var settingsPayload = { sprintWorkdays: workdaysVal, companyHolidays: holidaysPayload };
        if (Object.keys(sprintDatesMap).length > 0) {
            settingsPayload.sprintDates = sprintDatesMap;
        }
        serverArgs.push(settingsPayload);
    }
    button.disabled = true;
    inputs.forEach(function (input) { input.disabled = true; });
    managerInputs.forEach(function (input) { input.disabled = true; });
    status.textContent = 'Saving capacity...';
    status.classList.remove('config-status-error', 'config-status-success');
    status.classList.add('config-status-neutral');
    callServer('saveDeveloperCapacity', serverArgs).then(function (response) {
        if (!response || response.status !== 'success') {
            throw new Error(response && response.message ? response.message : 'Could not save capacity.');
        }
        return callServer('getProjectData', []).then(function (data) {
            if (!handleDataLoaded(data)) throw new Error('Capacity saved, but refresh failed. Reload the page.');
            renderDeveloperCapacityConfig();
            status.textContent = 'Capacity saved.';
            status.classList.remove('config-status-neutral', 'config-status-error');
            status.classList.add('config-status-success');
        }, function (error) {
            throw new Error('Capacity saved, but refresh failed: ' + getErrorMessage_(error));
        });
    }).catch(function (error) {
        status.textContent = getErrorMessage_(error);
        status.classList.remove('config-status-neutral', 'config-status-success');
        status.classList.add('config-status-error');
    }).finally(function () {
        button.disabled = false;
        inputs.forEach(function (input) { input.disabled = false; });
        managerInputs.forEach(function (input) { input.disabled = false; });
    });
}

function renderKPIs() {
    // Update KPI card values
    if (typeof updateKPICards === 'function') {
        updateKPICards();
    }
}

function populateLinksDropdown() {
    var linksPopup = $('#links-popup');
    if (!linksPopup) {
        return;
    }

    var helpfulLinks = APP_STATE.allData.config.helpfulLinks || [];

    if (helpfulLinks.length === 0) {
        linksPopup.innerHTML = '<div class="px-4 py-2 text-gray-500 text-sm">No links configured</div>';
        return;
    }

    var linksHtml = helpfulLinks.map(function (link) {
        return '<a href="' + link.url + '" target="_blank" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900">' +
            link.title +
            '</a>';
    }).join('');

    linksPopup.innerHTML = linksHtml;
}

// *** DELETED the renderToolbar() function as it is no longer needed ***

function populateFilters() {
    var allItems = [].concat(APP_STATE.allData.projects, APP_STATE.allData.independentTasks);
    var allStatuses = {}, allSprints = {}, allPlanningStages = {}, allValidations = {};
    var allProjectStages = {}, allAssignedPMs = {}, allAssignedDevs = {}, allUatStatuses = {}, allFixVersions = {};

    for (var i = 0; i < allItems.length; i++) {
        var item = allItems[i];
        if (item.Status) allStatuses[(item.Status + '').trim()] = true;
        if (item['Planning Stage']) allPlanningStages[(item['Planning Stage'] + '').trim()] = true;
        var ps = (item['Project Stage'] || '').toString().trim();
        if (ps && ps !== '—' && ps.toLowerCase() !== 'none' && ps.toLowerCase() !== 'n/a') allProjectStages[ps] = true;
        // Prefer Assigned PM/Dev; fall back to PM Lead/Assignee
        var apm = (item['Assigned PM'] || item['PM Lead'] || '').toString().trim();
        if (apm && apm !== '—' && apm.toLowerCase() !== 'none') allAssignedPMs[apm] = true;
        var adv = (item['Assigned Dev'] || item['Assignee'] || '').toString().trim();
        if (adv && adv !== '—' && adv.toLowerCase() !== 'none') allAssignedDevs[adv] = true;
        var uat = (item['UAT Status'] || '').toString().trim();
        if (uat && uat !== '—') allUatStatuses[uat] = true;
        var fixVersions = splitVersionValues_(item['Fix Version']);
        fixVersions.forEach(function (v) {
            if (v && v !== '—' && v.toLowerCase() !== 'none' && v.toLowerCase() !== 'n/a') allFixVersions[v] = true;
        });

        var validationText = getValidationStatus(item['Planning Stage'], item['Updated'], item['Last Checked'], item['Project Stage'], item['Target Date']).text;
        allValidations[validationText] = true;
        if (item.sprint) {
            var sprintParts = item.sprint.split(',');
            sprintParts.forEach(function (part) {
                var formatted = formatSprint(part.trim());
                if (formatted) allSprints[formatted] = true;
            });
        }
    }

    var sortedSprints = Object.keys(allSprints).sort(function (a, b) {
        var numA = parseInt((a.match(/\d+/) || [0])[0], 10);
        var numB = parseInt((b.match(/\d+/) || [0])[0], 10);
        return numB - numA;
    });

    // Populate multi-select dropdowns
    populateMultiSelectDropdown('status', Object.keys(allStatuses).sort(), 'All Statuses');
    populateMultiSelectDropdown('sprint', sortedSprints, 'All Sprints');
    populateMultiSelectDropdown('planningStage', Object.keys(allPlanningStages).sort(), 'All Planning Stages');
    populateMultiSelectDropdown('validation', Object.keys(allValidations).sort(), 'All Validations');
    populateMultiSelectDropdown('projectStage', Object.keys(allProjectStages).sort(), 'All Project Stages');
    populateMultiSelectDropdown('uatStatus', Object.keys(allUatStatuses).sort(), 'All UAT Statuses');
    populateMultiSelectDropdown('fixVersion', Object.keys(allFixVersions).sort(), 'All Fix Versions');
    populateMultiSelectDropdown('assignedPM', Object.keys(allAssignedPMs).sort(), 'All PMs');
    populateMultiSelectDropdown('assignedDev', Object.keys(allAssignedDevs).sort(), 'All Devs');

    // Still populate the task modal status dropdown the old way
    var tStatus = $('#t-status');
    if (tStatus) {
        var statusOptions = Object.keys(allStatuses).sort();
        var statusHtml = '';
        statusOptions.forEach(function (opt) {
            statusHtml += '<option value="' + opt + '">' + opt + '</option>';
        });
        tStatus.innerHTML = statusHtml;
    }

    // Populate the task modal priority dropdown from configuration
    var tPriority = $('#t-priority');
    if (tPriority && APP_STATE.allData && APP_STATE.allData.config && APP_STATE.allData.config.priorityOptions) {
        var priorityOptions = APP_STATE.allData.config.priorityOptions;
        var priorityHtml = '';
        priorityOptions.forEach(function (opt) {
            priorityHtml += '<option value="' + opt + '">' + opt + '</option>';
        });
        tPriority.innerHTML = priorityHtml;
    }
}

function populateMultiSelectDropdown(filterType, options, defaultLabel) {
    var dropdown = $('[data-filter="' + filterType + '"]');
    if (!dropdown) return;

    var optionsList = dropdown.querySelector('.filter-options-list');
    var label = dropdown.querySelector('.filter-label');

    if (!optionsList || !label) return;

    // Clear existing options
    optionsList.innerHTML = '';

    // Add "Select All" option at the top
    var selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'filter-option select-all-option';

    var selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.id = filterType + '-select-all';
    selectAllCheckbox.className = 'select-all-checkbox';

    var selectAllLabel = document.createElement('label');
    selectAllLabel.htmlFor = selectAllCheckbox.id;
    selectAllLabel.textContent = 'Select All';
    selectAllLabel.className = 'select-all-label';

    selectAllDiv.appendChild(selectAllCheckbox);
    selectAllDiv.appendChild(selectAllLabel);
    optionsList.appendChild(selectAllDiv);

    // Add a divider
    var divider = document.createElement('div');
    divider.className = 'filter-divider';
    optionsList.appendChild(divider);

    // Add individual options with checkboxes
    options.forEach(function (option) {
        var optionDiv = document.createElement('div');
        optionDiv.className = 'filter-option';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = option;
        checkbox.id = filterType + '-' + option.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        checkbox.className = 'filter-checkbox';

        var labelEl = document.createElement('label');
        labelEl.htmlFor = checkbox.id;
        labelEl.textContent = option;

        optionDiv.appendChild(checkbox);
        optionDiv.appendChild(labelEl);
        optionsList.appendChild(optionDiv);

        // Add event listener for checkbox changes
        checkbox.addEventListener('change', function () {
            // When an individual checkbox changes, update the "Select All" checkbox
            updateSelectAllCheckbox(filterType);
            updateFilterSelection(filterType);
        });
    });

    // Add event listener for "Select All" checkbox
    selectAllCheckbox.addEventListener('change', function () {
        var isChecked = this.checked;
        var checkboxes = optionsList.querySelectorAll('.filter-checkbox');

        // Update all checkboxes to match the "Select All" state
        checkboxes.forEach(function (cb) {
            cb.checked = isChecked;
        });

        updateFilterSelection(filterType);
    });

    // Update the display label
    updateFilterLabel(filterType, defaultLabel);
}

function updateFilterSelection(filterType) {
    var dropdown = $('[data-filter="' + filterType + '"]');
    if (!dropdown) return;

    var checkboxes = dropdown.querySelectorAll('.filter-checkbox:checked');
    var selectedValues = Array.from(checkboxes).map(function (cb) { return cb.value; });

    // Update the state
    APP_STATE.multiSelectFilters[filterType] = selectedValues;

    // Removed auto-enabling of the "Show Closed" toggle based on status selection.

    // Update the label
    updateFilterLabel(filterType, getDefaultLabel(filterType));

    // Apply filters
    applyFilters();
}

function updateSelectAllCheckbox(filterType) {
    var dropdown = $('[data-filter="' + filterType + '"]');
    if (!dropdown) return;

    var selectAllCheckbox = dropdown.querySelector('.select-all-checkbox');
    var individualCheckboxes = dropdown.querySelectorAll('.filter-checkbox');
    var checkedCount = dropdown.querySelectorAll('.filter-checkbox:checked').length;

    if (!selectAllCheckbox || individualCheckboxes.length === 0) return;

    // Set the select all checkbox state based on individual checkboxes
    selectAllCheckbox.checked = checkedCount > 0 && checkedCount === individualCheckboxes.length;

    // Make it indeterminate if some but not all are checked
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < individualCheckboxes.length;
}

function updateFilterLabel(filterType, defaultLabel) {
    var dropdown = $('[data-filter="' + filterType + '"]');
    if (!dropdown) return;

    var label = dropdown.querySelector('.filter-label');
    if (!label) return;

    // Safety check: ensure the filter array exists
    if (!APP_STATE.multiSelectFilters[filterType]) {
        APP_STATE.multiSelectFilters[filterType] = [];
    }

    var selectedCount = APP_STATE.multiSelectFilters[filterType].length;
    var toggleButton = dropdown.querySelector('.filter-dropdown-toggle');

    // If no defaultLabel provided, determine based on filterType
    if (!defaultLabel) {
        switch (filterType) {
            case 'status': defaultLabel = 'All Statuses'; break;
            case 'sprint': defaultLabel = 'All Sprints'; break;
            case 'planningStage': defaultLabel = 'All Planning Stages'; break;
            case 'validation': defaultLabel = 'All Validations'; break;
            case 'projectStage': defaultLabel = 'All Project Stages'; break;
            case 'uatStatus': defaultLabel = 'All UAT Statuses'; break;
            case 'fixVersion': defaultLabel = 'All Fix Versions'; break;
            case 'assignedPM': defaultLabel = 'All PMs'; break;
            case 'assignedDev': defaultLabel = 'All Devs'; break;
            default: defaultLabel = 'All Items';
        }
    }

    // Remove existing badges from the label
    while (label.querySelector('.filter-badge')) {
        label.querySelector('.filter-badge').remove();
    }

    // Remove active class from toggle button
    if (toggleButton) {
        toggleButton.classList.remove('has-active-filters');
    }

    if (selectedCount === 0) {
        // No filters active - reset to default
        label.textContent = defaultLabel;
    } else {
        // Filters are active - show with badge
        // First, set the base text without "All"
        label.textContent = defaultLabel.replace('All ', '');

        // Create badge element
        var badge = document.createElement('span');
        badge.className = 'filter-badge';
        badge.textContent = selectedCount;

        // Append the badge to the label
        label.appendChild(document.createTextNode(' '));
        label.appendChild(badge);

        // Mark the toggle button as having active filters
        if (toggleButton) {
            toggleButton.classList.add('has-active-filters');
        }

    }
}

function getDefaultLabel(filterType) {
    var labels = {
        'status': 'All Statuses',
        'sprint': 'All Sprints',
        'validation': 'All Validations',
        'projectStage': 'All Project Stages',
        'uatStatus': 'All UAT Statuses',
        'fixVersion': 'All Fix Versions',
        'assignedPM': 'All PMs',
        'assignedDev': 'All Devs'
    };
    return labels[filterType] || 'All';
}

function renderTable() {
    var wrapper = $('#content-wrapper');
    wrapper.innerHTML = '<div class="table-container"><table class="table" aria-describedby="count"><thead><tr>' +
        '<th class="col-jira">Jira #</th><th class="col-project-stage">Project Stage</th><th class="col-title">Title</th>' +
        '<th class="col-validation">Validation</th><th class="col-status">Status</th><th class="col-uat-status">UAT Status</th><th class="col-type">Type</th><th class="col-priority">Priority</th><th class="col-story-points">Story Points</th>' +
        '<th class="col-pm-lead">Assigned PM</th><th class="col-dev-assignee">Assigned Dev</th><th class="col-sprint">Sprint</th><th class="col-target-date">Target Date</th><th class="col-fix-version">Fix Version</th>' +
        '<th class="col-act-pct">ACT/PCT</th><th class="col-start-date">Start Date</th><th class="col-end-date">End Date</th><th class="col-last-updated">Last Updated</th><th class="col-last-checked">Last Checked</th>' +
        '</tr></thead><tbody id="list-body"></tbody></table></div>';
    var projects = APP_STATE.allData.projects;
    var epics = projects.filter(function (p) { return p['Issue Type'] === 'Epic'; });
    var allChildren = projects.filter(function (p) { return p['Issue Type'] !== 'Epic'; });

    var stories = allChildren;
    var storyBugsMap = {};
    var bugs = [];

    if (APP_STATE.nestBugs) {
        bugs = allChildren.filter(function (p) { return p['Issue Type'] === 'Bug'; });
        var nonBugs = allChildren.filter(function (p) { return p['Issue Type'] !== 'Bug'; });

        // Create lookups for bidirectional linking
        var storyLookup = {};
        nonBugs.forEach(function (s) { storyLookup[s['Jira #']] = s; });

        var bugLookup = {};
        bugs.forEach(function (b) { bugLookup[b['Jira #']] = b; });

        // 1. Check Bug Links (Child -> Parent)
        bugs.forEach(function (bug) {
            var links = (bug['Links'] || bug['Linked Issues'] || '').split(',');
            links.forEach(function (link) {
                var parentKey = link.trim();
                if (parentKey && storyLookup[parentKey]) {
                    var parentStory = storyLookup[parentKey];
                    // Nest regardless of Epic Link
                    if (!storyBugsMap[parentKey]) storyBugsMap[parentKey] = [];
                    // Avoid duplicates
                    if (!storyBugsMap[parentKey].some(function (b) { return b['Jira #'] === bug['Jira #']; })) {
                        storyBugsMap[parentKey].push(bug);
                    }
                }
            });
        });

        // 2. Check Story Links (Parent -> Child)
        nonBugs.forEach(function (story) {
            var links = (story['Links'] || story['Linked Issues'] || '').split(',');
            links.forEach(function (link) {
                var childKey = link.trim();
                if (childKey && bugLookup[childKey]) {
                    var bug = bugLookup[childKey];
                    // Nest regardless of Epic Link
                    var storyKey = story['Jira #'];
                    if (!storyBugsMap[storyKey]) storyBugsMap[storyKey] = [];

                    // Avoid duplicates
                    if (!storyBugsMap[storyKey].some(function (b) { return b['Jira #'] === bug['Jira #']; })) {
                        storyBugsMap[storyKey].push(bug);
                    }
                }
            });
        });

        stories = nonBugs;
    }

    var epicSummaries = {};
    epics.forEach(function (epic) { epicSummaries[normalizeString(epic.Summary)] = true; });

    var epicIds = {};
    epics.forEach(function (epic) { if (epic['Jira #']) epicIds[epic['Jira #']] = true; });

    var orphanStories = stories.filter(function (p) {
        // Check Epic Link
        if (epicSummaries[normalizeString(p['Epic Link'])]) return false;

        // Check Linked Issues
        var links = (p['Links'] || p['Linked Issues'] || '').split(',');
        var hasEpicLink = links.some(function (link) { return epicIds[link.trim()]; });
        if (hasEpicLink) return false;

        return true;
    });

    var orphanBugs = [];
    if (APP_STATE.nestBugs) {
        orphanBugs = bugs.filter(function (p) {
            // Check Epic Link
            if (epicSummaries[normalizeString(p['Epic Link'])]) return false;

            // Check Linked Issues
            var links = (p['Links'] || p['Linked Issues'] || '').split(',');
            var hasEpicLink = links.some(function (link) { return epicIds[link.trim()]; });
            if (hasEpicLink) return false;

            return true;
        });
    }

    var body = $('#list-body');
    body.style.display = 'none';
    var sortOrders = {
        projectStage: {
            'in progress': 1,
            'in planning': 2,
            'planning': 2,
            'on hold': 3,
            'done': 4,
            'in production': 4,
            'production': 4,
            'prod': 4,
            'fixed': 4,
            'canceled': 5,
            'cancelled': 5
        },
        validation: { 'Past Due': 1, 'Needs Review': 2, 'Stale': 3, 'Up to Date': 4, 'Closed': 5 },
        priority: {} // Will be populated dynamically from config
    };

    // Populate priority sort order from configuration
    if (APP_STATE.allData && APP_STATE.allData.config && APP_STATE.allData.config.priorityOptions) {
        APP_STATE.allData.config.priorityOptions.forEach(function (priority, index) {
            sortOrders.priority[priority.toLowerCase().trim()] = index + 1;
        });
    }
    var sortEpics = function (a, b) {
        // 1) Priority (highest priority first)
        var priorityA = (a['Priority'] || '').toLowerCase().trim();
        var priorityB = (b['Priority'] || '').toLowerCase().trim();
        var priorOrderA = sortOrders.priority[priorityA] || 99;
        var priorOrderB = sortOrders.priority[priorityB] || 99;
        if (priorOrderA !== priorOrderB) return priorOrderA - priorOrderB;

        // 2) Project Stage (custom order)
        var stageA = (a['Project Stage'] || '').toLowerCase().trim();
        var stageB = (b['Project Stage'] || '').toLowerCase().trim();
        var orderA = sortOrders.projectStage[stageA] || 99;
        var orderB = sortOrders.projectStage[stageB] || 99;
        if (orderA !== orderB) return orderA - orderB;

        // 3) Validation
        var valA = getValidationStatus(a['Planning Stage'], a['Updated'], a['Last Checked'], a['Project Stage'], a['Target Date']).text;
        var valB = getValidationStatus(b['Planning Stage'], b['Updated'], b['Last Checked'], b['Project Stage'], b['Target Date']).text;
        var valOrderA = sortOrders.validation[valA] || 99;
        var valOrderB = sortOrders.validation[valB] || 99;
        if (valOrderA !== valOrderB) return valOrderA - valOrderB;

        // 4) Tie-breaker by title
        var ta = (a.Summary || '').toLowerCase();
        var tb = (b.Summary || '').toLowerCase();
        return ta < tb ? -1 : ta > tb ? 1 : 0;
    };

    var sortChildren = function (a, b) {
        // 1) Priority (highest priority first)
        var priorityA = (a['Priority'] || '').toLowerCase().trim();
        var priorityB = (b['Priority'] || '').toLowerCase().trim();
        var priorOrderA = sortOrders.priority[priorityA] || 99;
        var priorOrderB = sortOrders.priority[priorityB] || 99;
        if (priorOrderA !== priorOrderB) return priorOrderA - priorOrderB;

        // 2) Validation
        var valA = getValidationStatus(a['Planning Stage'], a['Updated'], a['Last Checked'], a['Project Stage'], a['Target Date']).text;
        var valB = getValidationStatus(b['Planning Stage'], b['Updated'], b['Last Checked'], b['Project Stage'], b['Target Date']).text;
        var valOrderA = sortOrders.validation[valA] || 99;
        var valOrderB = sortOrders.validation[valB] || 99;
        if (valOrderA !== valOrderB) return valOrderA - valOrderB;

        // 3) Project Stage (custom order)
        var stageA = (a['Project Stage'] || '').toLowerCase().trim();
        var stageB = (b['Project Stage'] || '').toLowerCase().trim();
        var orderA = sortOrders.projectStage[stageA] || 99;
        var orderB = sortOrders.projectStage[stageB] || 99;
        if (orderA !== orderB) return orderA - orderB;

        // 4) Tie-breaker by title
        var ta = (a.Summary || '').toLowerCase();
        var tb = (b.Summary || '').toLowerCase();
        return ta < tb ? -1 : ta > tb ? 1 : 0;
    };

    epics.sort(sortEpics);

    for (var i = 0; i < epics.length; i++) {
        var epic = epics[i];
        var childStories = stories.filter(function (story) {
            // 1. Check standard Epic Link (matches by Summary/Name)
            if (normalizeString(story['Epic Link']) === normalizeString(epic.Summary)) return true;

            // 2. Check Linked Issues (matches by Key) - allows stories to appear under multiple Epics
            var links = (story['Links'] || story['Linked Issues'] || '').split(',');
            var epicId = epic['Jira #'];
            return links.some(function (link) { return link.trim() === epicId; });
        });

        // Find direct bugs for this epic if nestBugs is true
        var directBugs = [];
        if (APP_STATE.nestBugs) {
            directBugs = bugs.filter(function (bug) {
                // Check Epic Link
                if (normalizeString(bug['Epic Link']) === normalizeString(epic.Summary)) return true;
                // Check Linked Issues
                var links = (bug['Links'] || bug['Linked Issues'] || '').split(',');
                var epicId = epic['Jira #'];
                return links.some(function (link) { return link.trim() === epicId; });
            });
        }

        var needsAttentionCount = 0;
        childStories.forEach(function (story) {
            var status = getValidationStatus(story['Planning Stage'], story['Updated'], story['Last Checked'], story['Project Stage'], story['Target Date']).text;
            if (status === 'Needs Review' || status === 'Past Due') {
                needsAttentionCount++;
            }
        });

        // Add attention count from direct bugs
        directBugs.forEach(function (bug) {
            var status = getValidationStatus(bug['Planning Stage'], bug['Updated'], bug['Last Checked'], bug['Project Stage'], bug['Target Date']).text;
            if (status === 'Needs Review' || status === 'Past Due') {
                needsAttentionCount++;
            }
        });

        body.appendChild(createRow(epic, 'epic', null, needsAttentionCount));

        if (epic.tasks) {
            epic.tasks.forEach(function (task) {
                if (!task['Associated Story']) {
                    body.appendChild(createRow(task, 'task', epic['Jira #']));
                }
            });
        }

        var renderedBugIds = {};

        childStories.sort(sortChildren);
        childStories.forEach(function (story) {
            var openBugCount = 0;
            var needsAttentionCount = 0;
            var childBugs = [];
            if (APP_STATE.nestBugs && storyBugsMap[story['Jira #']]) {
                childBugs = storyBugsMap[story['Jira #']];
                childBugs.forEach(function (b) {
                    if (!isStoryObjectClosed(b)) openBugCount++;
                    var status = getValidationStatus(b['Planning Stage'], b['Updated'], b['Last Checked'], b['Project Stage'], b['Target Date']).text;
                    if (status === 'Needs Review' || status === 'Past Due') {
                        needsAttentionCount++;
                    }
                    renderedBugIds[b['Jira #']] = true;
                });
            }

            body.appendChild(createRow(story, 'story', epic['Jira #'], needsAttentionCount, childBugs.length > 0, false, openBugCount));

            if (childBugs.length > 0) {
                childBugs.sort(sortChildren);
                childBugs.forEach(function (bug, index) {
                    var isLast = index === childBugs.length - 1;
                    body.appendChild(createRow(bug, 'bug-child', story['Jira #'], null, false, isLast));
                });
            }

            if (story.tasks) {
                story.tasks.forEach(function (task) {
                    body.appendChild(createRow(task, 'task', epic['Jira #']));
                });
            }
        });

        // Render Direct Bugs (that weren't rendered as nested bugs)
        if (APP_STATE.nestBugs && directBugs.length > 0) {
            directBugs.sort(sortChildren);
            directBugs.forEach(function (bug) {
                if (!renderedBugIds[bug['Jira #']]) {
                    // Render as direct child (using 'story' type to align with stories)
                    // We pass 0 for openChildrenCount as bugs don't have children
                    body.appendChild(createRow(bug, 'story', epic['Jira #'], null, false, false, 0));
                }
            });
        }

        var footerRow = document.createElement('tr');
        footerRow.className = 'row-epic-footer';
        footerRow.dataset.parentEpic = epic['Jira #'];
        var footerCell = document.createElement('td');
        footerCell.colSpan = 20;
        footerRow.appendChild(footerCell);
        body.appendChild(footerRow);
    }

    if (orphanStories.length > 0 || orphanBugs.length > 0) {
        var unassignedEpic = { 'Jira #': 'UNASSIGNED', Summary: 'Unassigned Stories', 'Issue Type': 'Epic' };
        var unassignedNeedsReviewCount = 0;
        orphanStories.forEach(function (story) {
            var status = getValidationStatus(story['Planning Stage'], story['Updated'], story['Last Checked'], story['Project Stage'], story['Target Date']).text;
            if (status === 'Needs Review') {
                unassignedNeedsReviewCount++;
            }
        });

        orphanBugs.forEach(function (bug) {
            var status = getValidationStatus(bug['Planning Stage'], bug['Updated'], bug['Last Checked'], bug['Project Stage'], bug['Target Date']).text;
            if (status === 'Needs Review') {
                unassignedNeedsReviewCount++;
            }
        });

        var unassignedEpicRow = createRow(unassignedEpic, 'epic', null, unassignedNeedsReviewCount);
        body.prepend(unassignedEpicRow);

        var orphanStoryRows = [];
        var renderedOrphanBugIds = {};

        orphanStories.sort(sortChildren).forEach(function (story) {
            var openBugCount = 0;
            var needsAttentionCount = 0;
            var childBugs = [];
            if (APP_STATE.nestBugs && storyBugsMap[story['Jira #']]) {
                childBugs = storyBugsMap[story['Jira #']];
                childBugs.forEach(function (b) {
                    if (!isStoryObjectClosed(b)) openBugCount++;
                    var status = getValidationStatus(b['Planning Stage'], b['Updated'], b['Last Checked'], b['Project Stage'], b['Target Date']).text;
                    if (status === 'Needs Review' || status === 'Past Due') {
                        needsAttentionCount++;
                    }
                    renderedOrphanBugIds[b['Jira #']] = true;
                });
            }

            orphanStoryRows.push(createRow(story, 'story', 'UNASSIGNED', needsAttentionCount, childBugs.length > 0, false, openBugCount));

            if (childBugs.length > 0) {
                childBugs.sort(sortChildren);
                childBugs.forEach(function (bug, index) {
                    var isLast = index === childBugs.length - 1;
                    orphanStoryRows.push(createRow(bug, 'bug-child', 'UNASSIGNED', null, false, isLast));
                });
            }
        });

        if (APP_STATE.nestBugs && orphanBugs.length > 0) {
            orphanBugs.sort(sortChildren);
            orphanBugs.forEach(function (bug) {
                if (!renderedOrphanBugIds[bug['Jira #']]) {
                    orphanStoryRows.push(createRow(bug, 'story', 'UNASSIGNED', null, false, false, 0));
                }
            });
        }

        unassignedEpicRow.after.apply(unassignedEpicRow, orphanStoryRows);

        var unassignedFooterRow = document.createElement('tr');
        unassignedFooterRow.className = 'row-epic-footer';
        unassignedFooterRow.dataset.parentEpic = 'UNASSIGNED';
        var unassignedFooterCell = document.createElement('td');
        unassignedFooterCell.colSpan = 18;
        unassignedFooterRow.appendChild(unassignedFooterCell);

        if (orphanStoryRows.length > 0) {
            orphanStoryRows[orphanStoryRows.length - 1].after(unassignedFooterRow);
        } else {
            unassignedEpicRow.after(unassignedFooterRow);
        }
    }

    if (Object.keys(APP_STATE.expandedEpicIds).length > 0) {
        for (var epicId in APP_STATE.expandedEpicIds) {
            if (APP_STATE.expandedEpicIds.hasOwnProperty(epicId)) {
                var epicRow = document.querySelector('.row-epic[data-id="' + epicId + '"]');
                if (epicRow) epicRow.classList.add('expanded');
            }
        }
    }
    applyFilters(true);
    body.style.display = '';
}

function renderTasksView() {
    var tbody = document.getElementById('tasks-table-body');
    if (!tbody) { console.warn('[TaskHub] tasks-table-body not found'); return; }

    var allTasks = (APP_STATE.allData && APP_STATE.allData.independentTasks) || [];
    var statusFilter = document.getElementById('tasks-filter-status');
    var filterVal = statusFilter ? statusFilter.value : 'open';

    var filtered = allTasks.filter(function (t) {
        if (filterVal === 'open') return t.Status !== 'Done';
        if (filterVal === 'done') return t.Status === 'Done';
        return true;
    });

    var totalEl = document.getElementById('tasks-total-count');
    if (totalEl) totalEl.textContent = filtered.length + ' task' + (filtered.length !== 1 ? 's' : '');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8 text-sm">No tasks to show. Select + New Task to add one.</td></tr>';
        wireTaskHubButtons_();
        return;
    }

    // Bucket tasks by due date
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    var dayAfterTomorrow = new Date(todayStart); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    var weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    var nextWeekEnd = new Date(weekEnd); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

    var buckets = [
        { key: 'overdue', label: '\u26A0 Overdue', cls: 'text-red-700 bg-red-50', tasks: [] },
        { key: 'today', label: 'Due Today', cls: 'text-orange-700 bg-orange-50', tasks: [] },
        { key: 'tomorrow', label: 'Due Tomorrow', cls: 'text-yellow-700 bg-yellow-50', tasks: [] },
        { key: 'thisweek', label: 'This Week', cls: 'text-blue-700 bg-blue-50', tasks: [] },
        { key: 'nextweek', label: 'Next Week', cls: 'text-indigo-700 bg-indigo-50', tasks: [] },
        { key: 'later', label: 'Later', cls: 'text-gray-600 bg-gray-50', tasks: [] },
        { key: 'nodate', label: 'No Due Date', cls: 'text-gray-500 bg-gray-50', tasks: [] }
    ];

    filtered.forEach(function (t) {
        if (!t.Due) { buckets[6].tasks.push(t); return; }
        var d = taskHub_parseDueDate_(t.Due);
        if (isNaN(d.getTime())) { buckets[6].tasks.push(t); return; }
        var dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

        if (dDate < todayStart) buckets[0].tasks.push(t);
        else if (dDate < tomorrowStart) buckets[1].tasks.push(t);
        else if (dDate < dayAfterTomorrow) buckets[2].tasks.push(t);
        else if (dDate < weekEnd) buckets[3].tasks.push(t);
        else if (dDate < nextWeekEnd) buckets[4].tasks.push(t);
        else buckets[5].tasks.push(t);
    });

    // Sort within each bucket by due date then priority
    var prioOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    buckets.forEach(function (b) {
        b.tasks.sort(function (a, bb) {
            var da = a.Due ? taskHub_parseDueDate_(a.Due).getTime() : 8640000000000000;
            var db = bb.Due ? taskHub_parseDueDate_(bb.Due).getTime() : 8640000000000000;
            if (da !== db) return da - db;
            return (prioOrder[a.Priority] || 2) - (prioOrder[bb.Priority] || 2);
        });
    });

    var html = '';
    buckets.forEach(function (bucket) {
        if (bucket.tasks.length === 0) return;
        html += '<tr class="' + bucket.cls + '"><td colspan="5" class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">' + bucket.label + ' <span class="font-normal opacity-70">(' + bucket.tasks.length + ')</span></td></tr>';
        bucket.tasks.forEach(function (task) {
            html += buildTaskRow_(task);
        });
    });

    tbody.innerHTML = html;

    // Wire click handlers
    tbody.querySelectorAll('.task-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            taskHub_toggleComplete_(btn.getAttribute('data-task-id'));
        });
    });
    tbody.querySelectorAll('.task-row-click').forEach(function (row) {
        row.addEventListener('click', function () {
            taskHub_openDrawer_(row.getAttribute('data-task-id'));
        });
    });

    wireTaskHubButtons_();
}

function buildTaskRow_(task) {
    var id = task.ID || '';
    var title = task.Title || '';
    var status = task.Status || 'Open';
    var priority = task.Priority || 'Medium';
    var recurrence = task.Recurrence || '';
    var isDone = status === 'Done';

    var dueLabel = '';
    if (task.Due) {
        var d = taskHub_parseDueDate_(task.Due);
        if (!isNaN(d.getTime())) dueLabel = (d.getMonth() + 1) + '/' + d.getDate();
    }

    var checkIcon = isDone
        ? '<svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>'
        : '<svg class="w-4 h-4 text-gray-300 hover:text-green-400 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"></circle></svg>';

    var prioBg = 'bg-gray-100 text-gray-600';
    if (priority === 'Critical') prioBg = 'bg-red-100 text-red-700';
    else if (priority === 'High') prioBg = 'bg-red-50 text-red-600';
    else if (priority === 'Medium') prioBg = 'bg-yellow-50 text-yellow-700';
    else if (priority === 'Low') prioBg = 'bg-blue-50 text-blue-600';

    var titleCls = isDone ? 'line-through text-gray-400' : 'text-gray-900';
    var rowCls = isDone ? 'opacity-60' : '';
    var recurBadge = recurrence ? ' <span class="text-xs text-purple-500" title="Recurs ' + recurrence + '">\uD83D\uDD01</span>' : '';

    return '<tr class="border-b border-gray-100 hover:bg-gray-50 ' + rowCls + '">' +
        '<td class="px-3 py-2 text-center"><button class="task-toggle-btn" data-task-id="' + id + '">' + checkIcon + '</button></td>' +
        '<td class="px-3 py-2 task-row-click cursor-pointer" data-task-id="' + id + '"><span class="font-medium text-sm ' + titleCls + '">' + title + '</span>' + recurBadge + (task.Project ? ' <span class="text-xs text-gray-400">' + task.Project + '</span>' : '') + '</td>' +
        '<td class="px-3 py-2"><span class="text-xs px-1.5 py-0.5 rounded ' + prioBg + '">' + priority + '</span></td>' +
        '<td class="px-3 py-2 text-xs text-gray-600">' + dueLabel + '</td>' +
        '<td class="px-3 py-2"><span class="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">' + status + '</span></td>' +
        '</tr>';
}

/* ─── TASK HUB BUTTON WIRING ─── */

function wireTaskHubButtons_() {
    var statusFilter = document.getElementById('tasks-filter-status');
    if (statusFilter && !statusFilter._wired) {
        statusFilter._wired = true;
        statusFilter.addEventListener('change', function () { renderTasksView(); });
    }

    var refreshBtn = document.getElementById('refresh-tasks-btn');
    if (refreshBtn && !refreshBtn._wired) {
        refreshBtn._wired = true;
        refreshBtn.addEventListener('click', function () { taskHub_refreshFromWorkbook_(); });
    }

    var addBtn = document.getElementById('add-task-btn');
    if (addBtn && !addBtn._wired) {
        addBtn._wired = true;
        addBtn.addEventListener('click', function () {
            var bar = document.getElementById('quick-add-bar');
            if (bar) {
                bar.classList.remove('hidden');
                var titleInput = document.getElementById('quick-add-title');
                if (titleInput) titleInput.focus();
            }
        });
    }

    var quickSave = document.getElementById('quick-add-save');
    if (quickSave && !quickSave._wired) {
        quickSave._wired = true;
        quickSave.addEventListener('click', function () { taskHub_quickAdd_(); });
    }

    var quickCancel = document.getElementById('quick-add-cancel');
    if (quickCancel && !quickCancel._wired) {
        quickCancel._wired = true;
        quickCancel.addEventListener('click', function () {
            document.getElementById('quick-add-bar').classList.add('hidden');
        });
    }

    var quickTitle = document.getElementById('quick-add-title');
    if (quickTitle && !quickTitle._wired) {
        quickTitle._wired = true;
        quickTitle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') taskHub_quickAdd_();
        });
    }

    var descToggle = document.getElementById('drawer-task-desc-toggle');
    if (descToggle && !descToggle._wired) {
        descToggle._wired = true;
        descToggle.addEventListener('click', function () { taskHub_toggleDescriptionEditor_(); });
    }

    var descField = document.getElementById('drawer-task-desc');
    if (descField && !descField._wired) {
        descField._wired = true;
        descField.addEventListener('input', function () {
            if (descField.classList.contains('hidden')) return;
            taskHub_renderDescriptionPreview_();
        });
    }

    var drawerClose = document.getElementById('drawer-close-btn');
    if (drawerClose && !drawerClose._wired) {
        drawerClose._wired = true;
        drawerClose.addEventListener('click', function () { taskHub_closeDrawer_(); });
    }
    var drawerOverlay = document.getElementById('task-drawer-overlay');
    if (drawerOverlay && !drawerOverlay._wired) {
        drawerOverlay._wired = true;
        drawerOverlay.addEventListener('click', function () { taskHub_closeDrawer_(); });
    }

    var drawerSave = document.getElementById('drawer-save-btn');
    if (drawerSave && !drawerSave._wired) {
        drawerSave._wired = true;
        drawerSave.addEventListener('click', function () { taskHub_saveFromDrawer_(); });
    }

    var drawerDelete = document.getElementById('drawer-delete-btn');
    if (drawerDelete && !drawerDelete._wired) {
        drawerDelete._wired = true;
        drawerDelete.addEventListener('click', function () { taskHub_deleteFromDrawer_(); });
    }

}

/* ─── TASK HUB ACTIONS ─── */

function taskHub_refreshData_(options) {
    options = options || {};
    var preserveRows = options.preserveRows === true;
    var onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token) {
        if (onComplete) onComplete();
        return;
    }
    var tbody = document.getElementById('tasks-table-body');
    if (tbody && !preserveRows) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-6 animate-pulse">Reloading Task Hub...</td></tr>';
    }
    callServer('getProjectData', []).then(function (data) {
        if (data) {
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { console.error('[TaskHub] parse error', e); if (onComplete) onComplete(); return; } }
            APP_STATE.allData = data;
            renderTasksView();
        }
        if (onComplete) onComplete();
    }, function (err) {
        console.error('[TaskHub] refresh failed', err);
        if (preserveRows) {
            if (typeof showToast === 'function') {
                showToast('Task refresh failed: ' + (err && err.message ? err.message : err));
            }
            if (onComplete) onComplete();
            return;
        }
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-400 py-6">Refresh failed: ' + (err && err.message ? err.message : err) + '</td></tr>';
        if (onComplete) onComplete();
    });
}

function taskHub_refreshFromWorkbook_() {
    var refreshBtn = document.getElementById('refresh-tasks-btn');
    var originalLabel = refreshBtn ? refreshBtn.textContent : '';

    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
    }
    taskHub_refreshData_({
        preserveRows: true, onComplete: function () {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = originalLabel || 'Refresh';
            }
        }
    });
}

function taskHub_toggleComplete_(taskId) {
    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token || !taskId) return;

    var allTasks = (APP_STATE.allData && APP_STATE.allData.independentTasks) || [];
    var task = allTasks.find(function (t) { return t.ID === taskId; });
    if (task) {
        task.Status = (task.Status === 'Done') ? 'Open' : 'Done';
        renderTasksView();
    }

    callServer('toggleTaskComplete', [taskId]).then(function () { taskHub_refreshData_({ preserveRows: true }); }, function (err) {
        if (typeof showToast === 'function') showToast('Toggle failed: ' + (err && err.message ? err.message : err));
        taskHub_refreshData_({ preserveRows: true });
    });
}

function taskHub_quickAdd_() {
    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token) return;
    var titleEl = document.getElementById('quick-add-title');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) { if (titleEl) titleEl.focus(); return; }

    var taskData = {
        Title: title,
        Due: document.getElementById('quick-add-due').value || '',
        Priority: document.getElementById('quick-add-priority').value || 'Medium',
        Recurrence: document.getElementById('quick-add-recurrence').value || '',
        Status: 'Open'
    };

    var saveBtn = document.getElementById('quick-add-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Adding...'; }

    callServer('createTaskAndSync', [taskData]).then(function (res) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Add'; }
        if (titleEl) titleEl.value = '';
        document.getElementById('quick-add-due').value = '';
        document.getElementById('quick-add-priority').value = 'Medium';
        document.getElementById('quick-add-recurrence').value = '';
        if (typeof showToast === 'function') showToast(res.message || 'Task created');
        taskHub_refreshData_({ preserveRows: true });
    }, function (err) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Add'; }
        if (typeof showToast === 'function') showToast('Failed: ' + (err && err.message ? err.message : err));
    });
}

/* ─── TASK DETAIL DRAWER ─── */

function taskHub_openDrawer_(taskId) {
    var allTasks = (APP_STATE.allData && APP_STATE.allData.independentTasks) || [];
    var task = allTasks.find(function (t) { return t.ID === taskId; });
    if (!task) return;

    APP_STATE._editingTaskId = taskId;

    document.getElementById('drawer-title').textContent = 'Personal Task';
    document.getElementById('drawer-task-title').value = task.Title || '';
    document.getElementById('drawer-task-status').value = task.Status || 'Open';
    document.getElementById('drawer-task-priority').value = task.Priority || 'Medium';

    var dueInput = document.getElementById('drawer-task-due');
    if (task.Due) {
        try {
            var d = taskHub_parseDueDate_(task.Due);
            if (!isNaN(d.getTime())) {
                dueInput.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            } else { dueInput.value = ''; }
        } catch (e) { dueInput.value = ''; }
    } else { dueInput.value = ''; }

    document.getElementById('drawer-task-recurrence').value = task.Recurrence || '';
    document.getElementById('drawer-task-project').value = task.Project || '';
    document.getElementById('drawer-task-tags').value = task.Tags || '';
    document.getElementById('drawer-task-desc').value = task.Description || '';
    taskHub_renderDescriptionPreview_();
    taskHub_setDescriptionEditMode_(false);

    var meta = [];
    if (task.Created) meta.push('Created: ' + new Date(task.Created).toLocaleString());
    if (task.Updated) meta.push('Updated: ' + new Date(task.Updated).toLocaleString());
    meta.push('ID: ' + taskId);
    document.getElementById('drawer-task-meta').textContent = meta.join(' \u00B7 ');

    document.getElementById('task-detail-drawer').classList.remove('hidden');
}

function taskHub_closeDrawer_() {
    document.getElementById('task-detail-drawer').classList.add('hidden');
    APP_STATE._editingTaskId = null;
}

function taskHub_renderDescriptionPreview_() {
    var preview = document.getElementById('drawer-task-desc-preview');
    var textarea = document.getElementById('drawer-task-desc');
    if (!preview || !textarea) return;
    preview.innerHTML = formatJiraRichText_(textarea.value || '');
}

function taskHub_setDescriptionEditMode_(isEditing) {
    var preview = document.getElementById('drawer-task-desc-preview');
    var textarea = document.getElementById('drawer-task-desc');
    var toggle = document.getElementById('drawer-task-desc-toggle');
    if (!preview || !textarea || !toggle) return;

    if (isEditing) {
        preview.classList.add('hidden');
        textarea.classList.remove('hidden');
        toggle.textContent = 'Done';
        textarea.focus();
    } else {
        taskHub_renderDescriptionPreview_();
        textarea.classList.add('hidden');
        preview.classList.remove('hidden');
        toggle.textContent = 'Edit';
    }
}

function taskHub_toggleDescriptionEditor_() {
    var textarea = document.getElementById('drawer-task-desc');
    if (!textarea) return;
    var isEditing = !textarea.classList.contains('hidden');
    taskHub_setDescriptionEditMode_(!isEditing);
}

function taskHub_saveFromDrawer_() {
    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token || !APP_STATE._editingTaskId) return;

    var taskData = {
        ID: APP_STATE._editingTaskId,
        Title: document.getElementById('drawer-task-title').value,
        Status: document.getElementById('drawer-task-status').value,
        Priority: document.getElementById('drawer-task-priority').value,
        Due: document.getElementById('drawer-task-due').value,
        Recurrence: document.getElementById('drawer-task-recurrence').value,
        Project: document.getElementById('drawer-task-project').value,
        Tags: document.getElementById('drawer-task-tags').value,
        Description: document.getElementById('drawer-task-desc').value
    };

    var saveBtn = document.getElementById('drawer-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    callServer('updateTaskAndSync', [taskData]).then(function () {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save changes'; }
        if (typeof showToast === 'function') showToast('Task updated');
        taskHub_closeDrawer_();
        taskHub_refreshData_({ preserveRows: true });
    }, function (err) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save changes'; }
        if (typeof showToast === 'function') showToast('Save failed: ' + (err && err.message ? err.message : err));
    });
}

function taskHub_deleteFromDrawer_() {
    if (!APP_STATE._editingTaskId) return;
    if (!confirm('Delete this task?')) return;

    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token) return;

    callServer('deleteTaskAndSync', [APP_STATE._editingTaskId]).then(function () {
        if (typeof showToast === 'function') showToast('Task deleted');
        taskHub_closeDrawer_();
        taskHub_refreshData_({ preserveRows: true });
    }, function (err) {
        if (typeof showToast === 'function') showToast('Delete failed: ' + (err && err.message ? err.message : err));
    });
}

function renderBoard() {
    var wrapper = $('#content-wrapper');
    wrapper.innerHTML = '<div id="kanban-board" class="kanban-board-container"></div>';
    var board = $('#kanban-board');
    var tasks = APP_STATE.allData.independentTasks;
    var statusMap = {};
    tasks.forEach(function (task) { if (task.Status) statusMap[task.Status] = true; });
    var statuses = Object.keys(statusMap).sort();

    if (statuses.length === 0) {
        board.innerHTML = '<p class="p-8 text-center text-gray-500">No independent tasks to display.</p>';
        return;
    }

    statuses.forEach(function (status) {
        var column = document.createElement('div');
        column.className = 'kanban-column';
        column.innerHTML = '<h3 class="kanban-column-title">' + status + '</h3><div class="kanban-cards"></div>';
        board.appendChild(column);
        var cardsContainer = column.querySelector('.kanban-cards');
        tasks.filter(function (task) { return task.Status === status; })
            .forEach(function (task) {
                var card = document.createElement('div');
                card.className = 'kanban-card edit-task-btn';
                card.dataset.id = task.ID;
                card.dataset.title = (task.Title || '').toLowerCase();
                card.dataset.status = task.Status || '';
                card.innerHTML = '<div class="kanban-card-title">' + (task.Title || 'Untitled') + '</div>' +
                    '<div class="kanban-card-meta">' + (task.Assignee || 'Unassigned') + '</div>';
                cardsContainer.appendChild(card);
            });
    });
}

// --- DATE/TIME HELPERS ---
function normalizeUtcString(val) {
    if (!val && val !== 0) return null;

    // If a Date is passed, return ISO
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val.toISOString();
    }
    var s = String(val).trim();
    if (!s) return null;

    // If already ISO with timezone (Z or +/-hh:mm), trust it
    if (/Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
        var d1 = new Date(s);
        return isNaN(d1.getTime()) ? null : d1.toISOString();
    }

    // Handle common US-style slash date-times as UTC, e.g. "M/D/YYYY HH:mm[:ss]" or with AM/PM
    // Examples: "2/15/2025 13:21", "02/15/2025 13:21:45", "2/15/2025 1:21 PM"
    var slashDateTimeRe = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i;
    var m = s.match(slashDateTimeRe);
    if (m) {
        var mm = parseInt(m[1], 10);
        var dd = parseInt(m[2], 10);
        var yy = parseInt(m[3], 10);
        if (yy < 100) yy += 2000; // handle YY format just in case
        var hh = parseInt(m[4], 10);
        var mi = parseInt(m[5], 10);
        var ss = m[6] ? parseInt(m[6], 10) : 0;
        var ampm = m[7] ? m[7].toUpperCase() : '';
        if (ampm) {
            // Convert 12-hour to 24-hour
            if (ampm === 'AM') {
                if (hh === 12) hh = 0;
            } else if (ampm === 'PM') {
                if (hh !== 12) hh += 12;
            }
        }
        var utcMs = Date.UTC(yy, mm - 1, dd, hh, mi, ss);
        var dSlash = new Date(utcMs);
        return isNaN(dSlash.getTime()) ? null : dSlash.toISOString();
    }

    // Handle US-style slash date-only as UTC midnight for consistency (M/D/YYYY)
    var slashDateOnlyRe = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
    var md = s.match(slashDateOnlyRe);
    if (md) {
        var mmOnly = parseInt(md[1], 10);
        var ddOnly = parseInt(md[2], 10);
        var yyOnly = parseInt(md[3], 10);
        if (yyOnly < 100) yyOnly += 2000;
        var utcMsOnly = Date.UTC(yyOnly, mmOnly - 1, ddOnly, 0, 0, 0);
        var dSlashOnly = new Date(utcMsOnly);
        return isNaN(dSlashOnly.getTime()) ? null : dSlashOnly.toISOString();
    }

    // Date-only string 'YYYY-MM-DD' -> treat as UTC midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        var parts = s.split('-');
        var utcMsDate = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0);
        var dLocal = new Date(utcMsDate);
        return isNaN(dLocal.getTime()) ? null : dLocal.toISOString();
    }

    // Pattern like 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DDTHH:mm:ss' without TZ -> treat as UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) {
        var d2 = new Date(s.replace(' ', 'T') + 'Z');
        return isNaN(d2.getTime()) ? null : d2.toISOString();
    }

    // Handle sheet timestamps with no timezone info (e.g., "6/12/2025 22:04:00")
    // The sheet time is ALREADY in UTC
    // Updated regex to handle optional seconds
    var generalTimestampRe = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
    var tm = s.match(generalTimestampRe);
    if (tm) {
        // Parse components
        var tmMonth = parseInt(tm[1], 10);
        var tmDay = parseInt(tm[2], 10);
        var tmYear = parseInt(tm[3], 10);
        var tmHour = parseInt(tm[4], 10);
        var tmMin = parseInt(tm[5], 10);
        var tmSec = tm[6] ? parseInt(tm[6], 10) : 0;

        // Treat the "neutral" string as UTC.
        // This allows the client to convert it to Local Time.
        var utcMs = Date.UTC(tmYear, tmMonth - 1, tmDay, tmHour, tmMin, tmSec);
        var utcDate = new Date(utcMs);
        var isoResult = utcDate.toISOString();

        return isNaN(utcDate.getTime()) ? null : isoResult;
    }

    // Handle AM/PM format: "9/4/2025 10:21:18 PM" or "9/4/2025 10:21 PM"
    // Updated regex to handle optional seconds
    var amPmTimestampRe = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(AM|PM)$/i;
    var tm2 = s.match(amPmTimestampRe);
    if (tm2) {
        var tmMonth = parseInt(tm2[1], 10);
        var tmDay = parseInt(tm2[2], 10);
        var tmYear = parseInt(tm2[3], 10);
        var tmHour = parseInt(tm2[4], 10);
        var tmMin = parseInt(tm2[5], 10);
        var tmSec = tm2[6] ? parseInt(tm2[6], 10) : 0;
        var amPm = tm2[7].toUpperCase();

        if (amPm === 'PM' && tmHour < 12) tmHour += 12;
        if (amPm === 'AM' && tmHour === 12) tmHour = 0;

        var utcMs = Date.UTC(tmYear, tmMonth - 1, tmDay, tmHour, tmMin, tmSec);
        var utcDate = new Date(utcMs);
        return isNaN(utcDate.getTime()) ? null : utcDate.toISOString();
    }

    // Fallback: try to parse as-is
    var d3 = new Date(s);
    if (!isNaN(d3.getTime())) {
        // If the string doesn't have timezone info, we assume it represents UTC time
        // But d3 was parsed as Local by the browser. We need to extract the components and treat them as UTC.
        if (!/[+-]\d{2}:?\d{2}$|Z$/.test(s)) {
            // Extract "face value" components from the local parsing
            var year = d3.getFullYear();
            var month = d3.getMonth();
            var day = d3.getDate();
            var hour = d3.getHours();
            var min = d3.getMinutes();
            var sec = d3.getSeconds();

            var utcMs = Date.UTC(year, month, day, hour, min, sec);
            var res = new Date(utcMs).toISOString();
            return res;
        }
        return d3.toISOString();
    }

    // Final fallback: return null if we can't parse it
    return null;
}


function parseServerDate(val) {
    // Handle Date directly
    if (val instanceof Date) return val;
    if (!val) return null;

    try {
        // If it's an ISO string with timezone info, trust it
        if (typeof val === 'string' && /Z$/i.test(val) || /[+-]\d{2}:?\d{2}$/.test(val)) {
            var dIso = new Date(val);
            return isNaN(dIso.getTime()) ? null : dIso;
        }

        // Slash timestamp (MM/DD/YYYY HH:mm[:ss]) -> treat as UTC from sheet
        if (typeof val === 'string' && val.indexOf('/') !== -1 && val.indexOf(':') !== -1) {
            var parts = val.split(' ');
            if (parts.length === 2) {
                var dateParts = parts[0].split('/');
                var timeParts = parts[1].split(':');
                var month = parseInt(dateParts[0], 10) - 1;
                var day = parseInt(dateParts[1], 10);
                var year = parseInt(dateParts[2], 10);
                var hour = parseInt(timeParts[0], 10);
                var minute = parseInt(timeParts[1], 10);
                var second = timeParts.length > 2 ? parseInt(timeParts[2], 10) : 0;
                var dUtc = new Date(Date.UTC(year, month, day, hour, minute, second));
                return isNaN(dUtc.getTime()) ? null : dUtc;
            }
        }

        // Fallback to normalized UTC string approach
        var iso = normalizeUtcString(val);
        return iso ? new Date(iso) : null;
    } catch (e) {
        return null;
    }
}

// Parse a date string that's in CST/CDT timezone (for Last Checked)
function parseCSTDate(val) {
    if (val instanceof Date) return val;
    if (!val) return null;

    try {
        // Slash timestamp (MM/DD/YYYY HH:mm[:ss]) -> treat as CST
        if (typeof val === 'string' && val.indexOf('/') !== -1 && val.indexOf(':') !== -1) {
            var parts = val.split(' ');
            if (parts.length === 2) {
                var dateParts = parts[0].split('/');
                var timeParts = parts[1].split(':');
                var month = parseInt(dateParts[0], 10) - 1;
                var day = parseInt(dateParts[1], 10);
                var year = parseInt(dateParts[2], 10);
                var hour = parseInt(timeParts[0], 10);
                var minute = parseInt(timeParts[1], 10);
                var second = timeParts.length > 2 ? parseInt(timeParts[2], 10) : 0;

                // Create date string in CST and parse it
                var dateStr = year + '-' +
                    String(month + 1).padStart(2, '0') + '-' +
                    String(day).padStart(2, '0') + 'T' +
                    String(hour).padStart(2, '0') + ':' +
                    String(minute).padStart(2, '0') + ':' +
                    String(second).padStart(2, '0');

                // Parse as local time, then convert to actual CST
                // We need to create a Date that represents this time in CST
                var dLocal = new Date(dateStr);
                if (!isNaN(dLocal.getTime())) {
                    // Format it in CST to get the actual UTC time
                    var cstStr = dLocal.toLocaleString('en-US', { timeZone: 'America/Chicago' });
                    // This gives us the CST interpretation, but we need to work backwards
                    // Actually, easier approach: create a UTC date offset by CST offset
                    var cstOffsetMs = 6 * 60 * 60 * 1000; // CST is UTC-6 (CDT is UTC-5, but we'll use -6 for simplicity)
                    // Check if we're in CDT (roughly March-November)
                    var isDST = month >= 2 && month <= 10; // Rough approximation
                    if (isDST) cstOffsetMs = 5 * 60 * 60 * 1000;

                    return new Date(dLocal.getTime() + cstOffsetMs);
                }
            }
        }

        // Fallback to regular parsing
        return parseServerDate(val);
    } catch (e) {
        return null;
    }
}

function taskHub_parseDueDate_(val) {
    if (!val) return new Date('invalid');
    if (val instanceof Date) return val;

    var s = String(val).trim();
    var ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
        // Parse date-only values as local calendar dates to avoid UTC day shift.
        return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    }

    var d = new Date(s);
    return isNaN(d.getTime()) ? new Date('invalid') : d;
}

function formatDateTimeLocal(val) {
    // If no value provided, return placeholder
    if (!val) return '—';

    try {
        // Parse the input date (ensuring it's treated as UTC if it comes from the sheet)
        var d = val instanceof Date ? val : parseServerDate(val);
        if (!d) return '—';

        // Format explicitly in CST/CDT to avoid any browser TZ quirks
        var opts = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            timeZone: 'America/Chicago'
        };

        // Return the date formatted in CST/CDT without timezone abbreviation
        var result = d.toLocaleString('en-US', opts);

        return result;
    } catch (e) {
        return '—';
    }
}

// New: date-only formatter for inputs and date-only displays
function formatDateLocalDateOnly(val) {
    var d = val instanceof Date ? val : parseServerDate(val);
    if (!d) return '';
    return d.toLocaleDateString();
}

// Helper to update parent story/epic badge count when a child changes
function updateParentBadge(parentId) {
    if (!parentId) return;

    // Find parent row
    var allRows = $$('#list-body tr');
    var parentRow = null;
    var searchId = (parentId || '').toLowerCase();

    for (var i = 0; i < allRows.length; i++) {
        if (allRows[i].dataset.jiraId === searchId) {
            parentRow = allRows[i];
            break;
        }
    }

    if (!parentRow) return;

    // Find all child bugs
    var needsAttentionCount = 0;
    for (var i = 0; i < allRows.length; i++) {
        var row = allRows[i];
        // Check for bugs nested under this story (parentEpic points to Story ID for bugs)
        if (row.classList.contains('row-bug-child') && row.dataset.parentEpic === parentId) {
            var val = row.dataset.validation; // This should be up to date
            if (val === 'Needs Review' || val === 'Past Due') {
                needsAttentionCount++;
            }
        }
    }

    // Update badge
    var pillWrap = parentRow.querySelector('.validation-pill-container');
    if (pillWrap) {
        var badge = pillWrap.querySelector('.validation-badge');
        if (needsAttentionCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'validation-badge';
                pillWrap.appendChild(badge);
            }
            badge.textContent = needsAttentionCount;
        } else {
            if (badge) {
                badge.remove();
            }
        }
    }
}

// --- UPDATE ROW HELPERS ---
function updateRowTimestamp(jiraId, newTimestampISO) {
    var allRows = $$('#list-body tr');
    var searchId = (jiraId || '').toLowerCase();
    var matchingRows = [];

    for (var i = 0; i < allRows.length; i++) {
        if (allRows[i].dataset.jiraId === searchId) {
            matchingRows.push(allRows[i]);
        } else {
            // Look for the Jira ID in the first cell (td:nth-child(1)) which contains the link
            var link = allRows[i].querySelector('td:nth-child(1) a');
            if (link && link.textContent.trim() === jiraId) {
                matchingRows.push(allRows[i]);
            }
        }
    }

    if (matchingRows.length === 0) {
        return;
    }

    // Persist canonical ISO and recompute validation
    var checkedIso = normalizeUtcString(newTimestampISO);

    matchingRows.forEach(function (rowToUpdate) {
        rowToUpdate.dataset.checkedIso = checkedIso || '';
        // Store the original CST format for validation
        rowToUpdate.dataset.checkedCst = newTimestampISO || '';

        var planningStage = (rowToUpdate.dataset.planningStage || '');
        var updatedStr = rowToUpdate.dataset.updatedIso || null;
        var projectStageSelect = rowToUpdate.querySelector('select[data-field="Project Stage"]');
        var projectStage = projectStageSelect ? projectStageSelect.value : (rowToUpdate.dataset.projectStage || '');

        // Get Target Date from the row (Column 13, index 12)
        // Note: Target Date is currently rendered as text, not an input
        var targetDateCell = rowToUpdate.cells[12];
        var targetDate = targetDateCell ? targetDateCell.textContent.trim() : '';
        if (targetDate === '—') targetDate = '';

        // Use original CST format for Last Checked validation
        var checkedStr = rowToUpdate.dataset.checkedCst || checkedIso;
        var validation = getValidationStatus(planningStage, updatedStr, checkedStr, projectStage, targetDate);

        // Update Last Checked cell text and class (19th column, index 18) showing raw value
        var checkedCell = rowToUpdate.cells[18];
        if (checkedCell) {
            var displayValue = (newTimestampISO !== undefined && newTimestampISO !== null) ? newTimestampISO : 'Never';
            checkedCell.textContent = displayValue;
            checkedCell.className = validation.checkedClassName || 'recent-check';
        }

        // Update Last Updated cell class (18th column, index 17) without changing raw display
        var updatedCell = rowToUpdate.cells[17];
        if (updatedCell) {
            updatedCell.className = validation.updatedClassName || '';
        }

        // Update validation pill (preserve any existing badge)
        var pillWrap = rowToUpdate.querySelector('.validation-pill-container');
        if (pillWrap) {
            var statusPill = pillWrap.querySelector('.status-pill');
            if (!statusPill) {
                statusPill = document.createElement('span');
                statusPill.className = 'status-pill ' + validation.className;
                statusPill.textContent = validation.text;
                pillWrap.insertBefore(statusPill, pillWrap.firstChild || null);
            } else {
                statusPill.className = 'status-pill ' + validation.className;
                statusPill.textContent = validation.text;
            }
        }

        // Update row dataset for filtering
        rowToUpdate.dataset.validation = validation.text;

        // If this is a child bug, update the parent story's badge
        if (rowToUpdate.classList.contains('row-bug-child') && rowToUpdate.dataset.parentEpic) {
            updateParentBadge(rowToUpdate.dataset.parentEpic);
        }
    });

    // Update local state for KPI calculations
    // Keep Last Checked in its original server/display format so KPI validation
    // uses the same CST-aware parsing path as row-level validation.
    if (APP_STATE.allData && APP_STATE.allData.projects) {
        var project = APP_STATE.allData.projects.find(function (p) {
            return (p['Jira #'] || '').toLowerCase() === (jiraId || '').toLowerCase();
        });

        if (project) {
            project['Last Checked'] = (newTimestampISO !== undefined && newTimestampISO !== null && String(newTimestampISO).trim() !== '')
                ? newTimestampISO
                : checkedIso;
        }
    }

    // Update validation badges for parent epics
    updateEpicValidationBadges();

    // Update KPIs
    if (typeof updateKPICards === 'function') {
        updateKPICards();
    }
}

// New helper: Recompute and refresh a row's validation/sync classes without changing timestamps
function updateRowValidation(jiraId) {
    var allRows = $$('#list-body tr');
    var searchId = (jiraId || '').toLowerCase();
    var matchingRows = [];

    for (var i = 0; i < allRows.length; i++) {
        // Prefer dataset lookup
        if (allRows[i].dataset.jiraId === searchId) {
            matchingRows.push(allRows[i]);
        } else {
            // Fallback to link text lookup
            var link = allRows[i].querySelector('td:nth-child(1) a');
            if (link && link.textContent.trim() === jiraId) {
                matchingRows.push(allRows[i]);
            }
        }
    }

    if (matchingRows.length === 0) return;

    matchingRows.forEach(function (row) {
        // Gather current values from dataset/DOM
        var planningStage = (row.dataset.planningStage || '');
        var updatedStr = row.dataset.updatedIso || null;
        // Use CST format for Last Checked validation
        var checkedStr = row.dataset.checkedCst || row.dataset.checkedIso || null;

        // Find Project Stage select more robustly
        var stageSelect = row.querySelector('select[data-field="Project Stage"]');
        var projectStage = stageSelect ? stageSelect.value : (row.dataset.projectStage || '');

        // Get Target Date from the row (Column 13, index 12)
        var targetDateCell = row.cells[12];
        var targetDate = targetDateCell ? targetDateCell.textContent.trim() : '';
        if (targetDate === '—') targetDate = '';

        // Persist dataset.projectStage so filters/search use latest value
        row.dataset.projectStage = projectStage;

        // Recalculate validation
        var validation = getValidationStatus(planningStage, updatedStr, checkedStr, projectStage, targetDate);

        // Update row dataset validation
        row.dataset.validation = validation.text;

        // Update validation pill
        var pillWrap = row.querySelector('.validation-pill-container');
        if (pillWrap) {
            var statusPill = pillWrap.querySelector('.status-pill');
            if (!statusPill) {
                statusPill = document.createElement('span');
                statusPill.className = 'status-pill validation-clickable ' + validation.className;
                statusPill.setAttribute('data-jira-id', jiraId);
                statusPill.setAttribute('data-clickable', 'true');
                statusPill.textContent = validation.text;
                pillWrap.insertBefore(statusPill, pillWrap.firstChild || null);
            } else {
                // Preserve validation-clickable class if it exists
                var isClickable = statusPill.classList.contains('validation-clickable');
                statusPill.className = 'status-pill ' + (isClickable ? 'validation-clickable ' : '') + validation.className;
                statusPill.textContent = validation.text;
                // Ensure data attributes are present if clickable
                if (isClickable) {
                    statusPill.setAttribute('data-jira-id', jiraId);
                    statusPill.setAttribute('data-clickable', 'true');
                }
            }
        }

        // Update dataset used by filters
        row.dataset.validation = validation.text;

        // If this is a child bug, update the parent story's badge
        if (row.classList.contains('row-bug-child') && row.dataset.parentEpic) {
            updateParentBadge(row.dataset.parentEpic);
        }

        // Update date cell classes without altering raw display values
        var updatedCell = row.cells[17];
        if (updatedCell) {
            updatedCell.className = validation.updatedClassName || '';
        }
        var checkedCell = row.cells[18];
        if (checkedCell) {
            checkedCell.className = validation.checkedClassName || '';
        }
    });

    // Update epic badges since a child may have changed validation
    updateEpicValidationBadges();

    // Keep KPI header in sync with row-level validation changes.
    if (typeof updateKPICards === 'function') {
        updateKPICards();
    }
}

// Add message listener for real-time sync indicator updates
window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'mappingChanged') {
        // Trigger a re-render of the app to update sync indicators
        try {
            if (typeof renderApp === 'function') {
                renderApp();
            }
        } catch (e) { }
    }
});

// --- SYNC INDICATOR & EPIC BADGE HELPERS ---
function updateRowSyncIndicator(jiraId) {
    try {
        var rows = $$('#list-body tr');
        var searchId = (jiraId || '').toLowerCase();
        var matchingRows = [];

        for (var i = 0; i < rows.length; i++) {
            if (rows[i].dataset.jiraId === searchId) {
                matchingRows.push(rows[i]);
            } else {
                var link = rows[i].querySelector('td:nth-child(1) a');
                if (link && link.textContent.trim() === jiraId) {
                    matchingRows.push(rows[i]);
                }
            }
        }

        if (matchingRows.length === 0) return;

        matchingRows.forEach(function (row) {
            // Read latest values
            var statusText = (row.dataset.status || '').toString();
            var stageSelect = row.querySelector('select[data-field="Project Stage"]');
            var projectStage = stageSelect ? stageSelect.value : (row.dataset.projectStage || '');

            // Persist stage into dataset for filters and future reads
            row.dataset.projectStage = projectStage;

            // Only applicable for Jira items (epic/story/bug-child). If not, do nothing.
            var isJiraItem = row.classList.contains('row-epic') || row.classList.contains('row-story') || row.classList.contains('row-bug-child');
            if (!isJiraItem) return;

            // Empty/blank stage -> show warning dot
            var statusCell = row.cells[4];
            if (!statusCell) return;

            var stageIsEmpty = !projectStage || String(projectStage).trim() === '';
            if (stageIsEmpty) {
                var dotEmpty = '<span title="Project Stage is empty - this should be set" style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:#f59e0b;margin-left:6px;vertical-align:middle;"></span>';
                statusCell.innerHTML = (statusText || '—') + dotEmpty;
                return;
            }

            // Build mapping from config
            var cfg = (APP_STATE && APP_STATE.allData && APP_STATE.allData.config) || {};
            var maps = getClosedMappings();
            var stageMap = {};
            (cfg.stageStatusMappings || []).forEach(function (m) {
                if (m && m.stage) {
                    var expectedStatuses = (m.expectedStatuses || []).map(function (x) { return (x || '').toLowerCase().trim(); });
                    stageMap[(m.stage + '').toLowerCase().trim()] = expectedStatuses;
                }
            });

            var s = String(statusText).toLowerCase().trim();
            var stg = String(projectStage).toLowerCase().trim();
            var expectedStatuses = stageMap[stg] || [];
            var statusAligned = false;
            var matchedStatus = '';

            if (expectedStatuses.length > 0) {
                if (s) {
                    for (var si = 0; si < expectedStatuses.length; si++) {
                        if (expectedStatuses[si] && s === expectedStatuses[si]) { matchedStatus = expectedStatuses[si]; statusAligned = true; break; }
                    }
                } else {
                    statusAligned = false;
                }
            } else {
                // No mapping defined for this stage -> flag mismatch to draw attention
                statusAligned = false;
            }

            if (statusAligned) {
                statusCell.textContent = statusText || '—';
            } else {
                var tooltip = 'Status ("' + (statusText || '') + '") and Project Stage ("' + (projectStage || '') + '") may be out of sync' + (expectedStatuses.length ? ('\nExpected Status: ' + expectedStatuses.join(', ') + (matchedStatus ? ('\nCurrent matches: ' + matchedStatus) : '\nNo match found')) : '\nNo stage-specific mapping configured');
                var dot = '<span title="' + tooltip.replace(/\"/g, '&quot;') + '" style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:#f59e0b;margin-left:6px;vertical-align:middle;"></span>';
                statusCell.innerHTML = (statusText || '—') + dot;
            }
        });
    } catch (e) {
        console.error('Error updating sync indicator:', e);
    }
}

function updateEpicValidationBadges() {
    try {
        // For each epic row, count children requiring review and update its badge
        var allRows = $$('#list-body tr');
        var epicRows = [];

        // First pass: collect all epic rows
        for (var i = 0; i < allRows.length; i++) {
            if (allRows[i].classList.contains('row-epic')) {
                epicRows.push(allRows[i]);
            }
        }

        for (var i = 0; i < epicRows.length; i++) {
            var epicRow = epicRows[i];
            var epicId = epicRow.dataset.id;
            if (!epicId) continue;

            var count = 0;

            // Second pass: count children for this epic
            // We iterate all rows again or use a more efficient lookup if possible
            // Since we need to check dataset.parentEpic which might not be in DOM attributes for querySelectorAll
            for (var j = 0; j < allRows.length; j++) {
                var r = allRows[j];
                // Check if it's a story or task belonging to this epic
                if ((r.classList.contains('row-story') || r.classList.contains('row-task')) && r.dataset.parentEpic === epicId) {
                    var v = (r.dataset.validation || '').trim();
                    if (v === 'Needs Review' || v === 'Past Due') count++;
                }
            }

            var cell = epicRow.cells[3];
            if (!cell) continue;
            var container = cell.querySelector('.validation-pill-container');
            if (!container) continue;
            var badge = container.querySelector('.validation-badge');

            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'validation-badge';
                    container.appendChild(badge);
                }
                badge.textContent = String(count);
            } else {
                if (badge) badge.remove();
            }

            // Keep faux "UNASSIGNED" epic header status pill in sync with its computed count.
            if (epicId === 'UNASSIGNED') {
                var statusPill = container.querySelector('.status-pill');
                if (statusPill) {
                    if (count > 0) {
                        statusPill.className = 'status-pill status-review';
                        statusPill.textContent = APP_CONSTANTS.VALIDATION.NEEDS_REVIEW;
                        epicRow.dataset.validation = APP_CONSTANTS.VALIDATION.NEEDS_REVIEW;
                    } else {
                        statusPill.className = 'status-pill status-ok';
                        statusPill.textContent = APP_CONSTANTS.VALIDATION.UP_TO_DATE;
                        epicRow.dataset.validation = APP_CONSTANTS.VALIDATION.UP_TO_DATE;
                    }
                }
            }
        }
    } catch (e) { console.error('Error updating epic badges:', e); }
}
