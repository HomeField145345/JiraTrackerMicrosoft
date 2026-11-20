/**
 * @file ui.js
 * @description Handles all UI rendering and DOM manipulation.
 */

// --- HELPER FUNCTION ---
function getClosedMappings() {
    var cfg = (APP_STATE && APP_STATE.allData && APP_STATE.allData.config) || {};
    var stages = Array.isArray(cfg.closedProjectStages) ? cfg.closedProjectStages : ['In Production','Production','Prod','Fixed','Done','Canceled'];
    var statuses = Array.isArray(cfg.closedStatuses) ? cfg.closedStatuses : ['Fixed','Closed','Done','Resolved','Ready for Production','In Production'];
    // Normalize for comparison
    return {
        stages: stages.map(function(s){ return (s||'').toLowerCase().trim(); }),
        statuses: statuses.map(function(s){ return (s||'').toLowerCase().trim(); })
    };
}

function getPastDueExemptStages() {
    var cfg = (APP_STATE && APP_STATE.allData && APP_STATE.allData.config) || {};
    var stages = Array.isArray(cfg.pastDueExemptStages) ? cfg.pastDueExemptStages : [];
    return stages.map(function(s){ return (s||'').toLowerCase().trim(); });
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
    html = html.replace(/\{color:([^\}]+)\}([\s\S]*?)\{color\}/gi, function(_, colorValue, content) {
        var safeColor = sanitizeCssColor_(colorValue);
        if (!safeColor) return content;
        return '<span style="color:' + safeColor + ';">' + content + '</span>';
    });

    // Jira bold variant: {*}Text{*}
    html = html.replace(/\{\*\}([\s\S]*?)\{\*\}/g, '<strong>$1</strong>');

    // Jira quote block: {quote}...{quote}
    html = html.replace(/\{quote\}([\s\S]*?)\{quote\}/gi, function(_, content) {
        return '<blockquote>' + String(content || '').replace(/\n/g, '<br>') + '</blockquote>';
    });

    // Jira headings: h1. Heading / h1 Heading (allow leading spaces)
    html = html.replace(/^\s*h([1-6])\.?\s+(.+)$/gmi, function(_, level, content) {
        return '<div class="jira-wiki-h' + level + '">' + content + '</div>';
    });

    // Support escaped HTML headings from imports: &lt;h2&gt;Title&lt;/h2&gt;
    html = html.replace(/&lt;h([1-6])(?:\s+[^&]*)&gt;([\s\S]*?)&lt;\/h\1&gt;/gi, function(_, level, content) {
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
        var parts = line.split(delimiter).map(function(part) {
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
            headerHtml = '<thead><tr>' + rows[0].cells.map(function(cell) {
                return '<th>' + cell + '</th>';
            }).join('') + '</tr></thead>';
            bodyStart = 1;
        }

        var bodyRows = rows.slice(bodyStart).map(function(row) {
            return '<tr>' + row.cells.map(function(cell) {
                return '<td>' + cell + '</td>';
            }).join('') + '</tr>';
        }).join('');

        if (!bodyRows && hasHeader) {
            bodyRows = '<tr>' + rows[0].cells.map(function() { return '<td>—</td>'; }).join('') + '</tr>';
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
    raw.replace(/name\s*=\s*("[^"]+"|'[^']+'|[^,;\]\}\n]+)/ig, function(_, namePart) {
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
        .map(function(part) { return String(part || '').trim(); })
        .filter(Boolean)
        .forEach(function(v) {
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
    matches.forEach(function(m) {
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
    var displayFormatter = options.displayFormatter || function(v) { return v; };
    var label = options.historyLabel || 'Other values';

    var latestDisplay = displayFormatter(latestRaw || '') || '—';
    var others = values.filter(function(v) { return v !== latestRaw; });

    if (!others.length) {
        return escapeHtml_(latestDisplay);
    }

    var historyLines = others.map(function(v) { return '• ' + displayFormatter(v); });
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
  TimerManager.setTimeout(function() {
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
    story = APP_STATE.allData.projects.find(function(p) {
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
    var labelList = String(rawLabels).split(/[,;]+/).map(function(l) { return l.trim(); }).filter(function(l) { return l !== ''; });
    labelsEl.innerHTML = labelList.map(function(l) {
      return '<span style="display:inline-block;background:#e0e7ff;color:#3730a3;border-radius:4px;padding:1px 8px;margin:2px 3px 2px 0;font-size:0.8em;font-weight:500;">' + l.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
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
  var formatDate = function(dateStr) {
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
        TimerManager.setTimeout(function() {
            modal.classList.add('is-open');
        }, 0, 'story_info_open_anim');
    }
  modal.setAttribute('aria-hidden', 'false');
}

function closeStoryInfoModal() {
  var modal = $('#storyInfoModal');
    TimerManager.clearTimeout('story_info_open_anim');
    modal.classList.remove('is-open');
    TimerManager.setTimeout(function() {
        modal.style.display = 'none';
    }, 230, 'story_info_close_anim');
  modal.setAttribute('aria-hidden', 'true');
}

// ═══════════════════════════════════════════════
// PROJECT ARTIFACTS CHECKLIST (Epic-level)
// ═══════════════════════════════════════════════

var DEFAULT_ARTIFACTS = [
    { key: 'project_folder',     label: 'Project Folder',         icon: '\uD83D\uDCC1' },
    { key: 'e2e_deck',           label: 'E2E Project Deck',       icon: '\uD83D\uDCCA' },
    { key: 'acceptance_criteria',label: 'Acceptance Criteria',     icon: '\u2705' },
    { key: 'business_signoff',   label: 'Business Signoff',       icon: '\u270D\uFE0F' },
    { key: 'test_plan',          label: 'Test Plan',               icon: '\uD83E\uDDEA' },
    { key: 'release_notes',      label: 'Release Notes',          icon: '\uD83D\uDCDD' },
    { key: 'meeting_notes',      label: 'Meeting / Call Notes',   icon: '\uD83D\uDCDE' },
    { key: 'design_docs',        label: 'Design Documents',       icon: '\uD83C\uDFA8' }
];

var ARTIFACT_STATUSES = ['Not Started', 'In Progress', 'Complete', 'Signed Off', 'N/A'];

function populateArtifactsChecklist_(jiraId, story) {
    var tbody = document.getElementById('artifactsTableBody');
    if (!tbody) return;

    // Load saved artifacts from ManualData (stored as JSON string)
    var savedRaw = story['Artifacts'] || '';
    var saved = {};
    if (savedRaw) {
        try { saved = JSON.parse(savedRaw); } catch(e) { saved = {}; }
    }

    var html = '';
    var complete = 0;
    var total = 0;

    DEFAULT_ARTIFACTS.forEach(function(art) {
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
                    ARTIFACT_STATUSES.map(function(s) {
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
        saveTimer = setTimeout(function() { saveArtifacts_(jiraId); }, 800);
    }

    tbody.querySelectorAll('.artifact-status-select').forEach(function(sel) {
        sel.addEventListener('change', function() {
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

    tbody.querySelectorAll('.artifact-link-input, .artifact-notes-input').forEach(function(inp) {
        inp.addEventListener('input', scheduleArtifactSave);
    });
}

function saveArtifacts_(jiraId) {
    var tbody = document.getElementById('artifactsTableBody');
    if (!tbody) return;

    var artifacts = {};
    DEFAULT_ARTIFACTS.forEach(function(art) {
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
    DEFAULT_ARTIFACTS.forEach(function(art) {
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
    callServer('saveManualData', [jiraId, 'Artifacts', jsonStr]).then(function() {
            // Update local data so reopening the modal shows latest
            if (APP_STATE.allData && APP_STATE.allData.projects) {
                var story = APP_STATE.allData.projects.find(function(p) { return p['Jira #'] === jiraId; });
                if (story) story['Artifacts'] = jsonStr;
            }
        }, function(err) {
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
        jiraCellHtml = '<div class="flex items-center gap-2">' + expanderHtml + syncStatusHtml + '<a href="https://onejira.verizon.com/browse/' + item['Jira #'] + '" target="_blank" class="text-blue-600 hover:underline font-medium">' + item['Jira #'] + '</a><button class="info-icon-btn" data-jira-id="' + item['Jira #'] + '" title="View Story Details">' + infoIconSvg + '</button></div>';
    } else if (type === 'bug-child') {
        row.dataset.parentEpic = parentEpicId; // Actually parent Story ID
        var infoIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>';
        var syncStatusHtml = item['Sync Status'] ? '<span class="text-xs font-bold mr-1" title="Sync Status: ' + item['Sync Status'] + '">' + item['Sync Status'] + '</span>' : '';
        jiraCellHtml = '<div class="flex items-center gap-2">' + syncStatusHtml + '<a href="https://onejira.verizon.com/browse/' + item['Jira #'] + '" target="_blank" class="text-blue-600 hover:underline font-medium">' + item['Jira #'] + '</a><button class="info-icon-btn" data-jira-id="' + item['Jira #'] + '" title="View Bug Details">' + infoIconSvg + '</button></div>';
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
    
    var createCellWithDropdown = function(options, value, jiraId, field, className) {
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
        displayFormatter: function(v) {
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
    
    var formatDateTime = function(dateStr) {
      return formatDateTimeLocal(dateStr);
    };
    
    var createDateInputCell = function(dateStr, jiraId, field, className) {
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
      (function(){
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
            (function(){
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
                    (cfg.stageStatusMappings || []).forEach(function(m){ 
                        if (m && m.stage) {
                            var expectedStatuses = (m.expectedStatuses || []).map(function(x){ return (x||'').toLowerCase().trim(); });
                            stageMap[(m.stage+'').toLowerCase().trim()] = expectedStatuses;
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
                    } catch (e) {}
            if (!mismatch) {
                return '<td class="col-status">' + statusText + '</td>';
            }
                    var tooltip = 'Status ("' + item.Status + '") and Project Stage ("' + item['Project Stage'] + '") may be out of sync' + (expectedStatuses.length ? ('\nExpected Status: ' + expectedStatuses.join(', ') + (matchedStatus ? ('\nCurrent matches: ' + matchedStatus) : '\nNo match found')) : '\nNo stage-specific mapping configured');
                    var dot = '<span title="' + tooltip.replace(/\"/g, '&quot;') + '" style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:#f59e0b;margin-left:6px;vertical-align:middle;"></span>';
                    return '<td class="col-status">' + statusText + dot + '</td>';
      })() +
    (function() {
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
    '<td class="col-target-date">' + (function() {
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
        currentStages.forEach(function(v){ if ((v || '').toString().trim()) unionMap[(v + '').trim()] = true; });
        Object.keys(derivedStages).forEach(function(v){ unionMap[v] = true; });
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
                .then(function() {
                    renderApp();
                })
                .catch(function(error) {
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
    if(ganttControls) ganttControls.style.display = isGanttView ? 'flex' : 'none';
    
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

function renderCapacityView() {
    var capacity = APP_STATE.allData.sprintCapacity || {
        sprintName: 'None', totalIssues: 0, totalStoryPoints: 0, developers: []
    };
    var sprintName = document.getElementById('capacity-sprint-name');
    var totalPoints = document.getElementById('capacity-total-points');
    var totalIssues = document.getElementById('capacity-total-issues');
    var body = document.getElementById('capacity-table-body');
    if (!body) return;

    var numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    if (sprintName) sprintName.textContent = capacity.sprintName && capacity.sprintName !== 'None' ? capacity.sprintName : 'No current sprint detected';
    if (totalPoints) totalPoints.textContent = numberFormat.format(capacity.totalStoryPoints || 0);
    if (totalIssues) totalIssues.textContent = numberFormat.format(capacity.totalIssues || 0);
    renderCapacityRows_(body, capacity.developers, numberFormat, 'current');

    var futureContainer = document.getElementById('future-sprint-capacities');
    if (!futureContainer) return;
    futureContainer.replaceChildren();
    var futureSprints = APP_STATE.allData.futureSprintCapacity || [];
    if (!futureSprints.length) return;

    var futureHeading = document.createElement('h2');
    futureHeading.className = 'text-xl font-normal text-black mt-8 mb-4';
    futureHeading.textContent = 'Future sprints';
    futureContainer.appendChild(futureHeading);
    futureSprints.forEach(function(sprint, index) {
        var section = document.createElement('section');
        section.className = 'mb-8';
        var heading = document.createElement('h3');
        heading.className = 'text-lg font-normal text-black';
        heading.textContent = sprint.sprintName;
        section.appendChild(heading);
        var summary = document.createElement('p');
        summary.className = 'text-sm text-[#6F7171] mt-1 mb-4';
        summary.textContent = numberFormat.format(sprint.totalStoryPoints) + ' story points · ' +
            numberFormat.format(sprint.totalIssues) + (sprint.totalIssues === 1 ? ' issue' : ' issues');
        section.appendChild(summary);
        var tableWrapper = document.createElement('div');
        tableWrapper.className = 'overflow-x-auto';
        var table = document.createElement('table');
        table.className = 'w-full text-sm';
        var header = table.createTHead().insertRow();
        header.className = 'bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-600';
        ['Developer', 'Issues', 'Story points', 'Capacity', 'Remaining', 'Workload'].forEach(function(label, index) {
            var cell = document.createElement('th');
            cell.scope = 'col';
            cell.className = 'px-3 py-2' + (index > 0 && index < 5 ? ' text-right' : '');
            cell.textContent = label;
            header.appendChild(cell);
        });
        var futureBody = table.createTBody();
        renderCapacityRows_(futureBody, sprint.developers, numberFormat, 'future-' + index);
        tableWrapper.appendChild(table);
        section.appendChild(tableWrapper);
        futureContainer.appendChild(section);
    });
}

function renderCapacityRows_(body, developers, numberFormat, sectionId) {
    body.replaceChildren();
    if (!developers || developers.length === 0) {
        var emptyRow = body.insertRow();
        var emptyCell = emptyRow.insertCell();
        emptyCell.colSpan = 6;
        emptyCell.className = 'px-3 py-8 text-center text-gray-500';
        emptyCell.textContent = 'No developers found.';
        return;
    }

    var percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
    developers.forEach(function(developer, index) {
        var row = body.insertRow();
        row.className = 'border-b border-gray-200';
        var nameCell = row.insertCell();
        nameCell.className = 'px-3 py-3 text-black';
        var name = document.createElement('span');
        name.className = 'block';
        name.textContent = developer.developer;
        nameCell.appendChild(name);
        var unassigned = developer.developer === 'Unassigned';
        var assignments = (unassigned && developer.unassignedIssues) || developer.stories || [];
        var detailsLabel = unassigned ? 'Unassigned sprint issues' : developer.developer + ' sprint stories';
        if (!unassigned || assignments.length) {
            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'mt-1 inline-flex items-center justify-between gap-2 whitespace-nowrap rounded-xl border border-black bg-white px-2 py-1 text-xs text-black hover:bg-[#F6F6F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
            var toggleText = (unassigned ? 'Issues' : 'Stories') + ' (' + numberFormat.format(assignments.length) + ')';
            toggle.setAttribute('aria-label', toggleText + ' — ' + detailsLabel);
            toggle.setAttribute('aria-expanded', 'false');
            var detailsId = 'capacity-stories-' + sectionId + '-' + index;
            toggle.setAttribute('aria-controls', detailsId);
            var label = document.createElement('span');
            label.textContent = toggleText;
            toggle.appendChild(label);
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
            detailsCell.colSpan = 6;
            detailsCell.className = 'px-4 py-3';
            if (assignments.length) {
                renderCapacityAssignments_(detailsCell, assignments, detailsLabel, unassigned, numberFormat);
            } else {
                detailsCell.textContent = 'No stories assigned for this sprint.';
            }
            toggle.addEventListener('click', function() {
                var expand = detailsRow.hidden;
                detailsRow.hidden = !expand;
                toggle.setAttribute('aria-expanded', String(expand));
                arrow.textContent = expand ? '▾' : '▸';
            });
        }
        var issueCell = row.insertCell();
        issueCell.className = 'px-3 py-3 text-right tabular-nums text-gray-700';
        issueCell.textContent = numberFormat.format(developer.issueCount);
        var pointsCell = row.insertCell();
        pointsCell.className = 'px-3 py-3 text-right tabular-nums font-medium text-gray-900';
        pointsCell.textContent = numberFormat.format(developer.storyPoints);
        [developer.capacity, developer.remaining].forEach(function(value) {
            var cell = row.insertCell();
            cell.className = 'px-3 py-3 text-right tabular-nums text-gray-900';
            cell.textContent = value == null ? '—' : numberFormat.format(value);
        });
        renderCapacityWorkload_(row.insertCell(), developer, unassigned, percentFormat);
    });
}

function renderCapacityWorkload_(cell, developer, unassigned, percentFormat) {
    cell.className = 'px-3 py-3 min-w-[144px] text-xs text-[#6F7171] whitespace-nowrap';
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
        percent.textContent = percentFormat.format(ratio);
        cell.appendChild(percent);
    }
    if (overCapacity || ratio === null) {
        var status = document.createElement('span');
        status.className = overCapacity ? 'inline-block rounded-full bg-[#FFF9DE] px-2 py-1 text-black' : '';
        if (ratio !== null) status.className += ' ml-2';
        status.textContent = overCapacity ? 'Over capacity' : 'Zero capacity';
        cell.appendChild(status);
    }
    if (ratio !== null) {
        var track = document.createElement('div');
        track.className = 'mt-1 h-2 overflow-hidden rounded-full bg-[#F6F6F6]';
        track.setAttribute('aria-hidden', 'true');
        var fill = document.createElement('div');
        fill.className = overCapacity ? 'h-full bg-[#FED60E]' : 'h-full bg-[#006FC1]';
        fill.style.width = (Math.min(ratio, 1) * 100) + '%';
        track.appendChild(fill);
        cell.appendChild(track);
    }
}

function renderCapacityAssignments_(container, assignments, label, showIssueType, numberFormat) {
    var table = document.createElement('table');
    table.className = 'w-full text-sm text-black';
    table.setAttribute('aria-label', label);
    var header = table.createTHead().insertRow();
    header.className = 'border-b border-[#D8DADA] text-xs text-[#6F7171]';
    var columns = ['Jira key', 'Summary', 'Status', 'Story points'];
    if (showIssueType) columns.splice(2, 0, 'Type');
    columns.forEach(function(label, index) {
        var cell = document.createElement('th');
        cell.scope = 'col';
        cell.className = 'px-3 py-2 font-normal ' + (index === columns.length - 1 ? 'text-right' : 'text-left');
        cell.textContent = label;
        header.appendChild(cell);
    });
    var body = table.createTBody();
    assignments.forEach(function(issue) {
        var row = body.insertRow();
        var keyCell = row.insertCell();
        keyCell.className = 'px-3 py-2 whitespace-nowrap';
        if (/^[A-Z][A-Z0-9_]*-\d+$/i.test(issue.jiraKey)) {
            var link = document.createElement('a');
            link.href = 'https://onejira.verizon.com/browse/' + issue.jiraKey;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'underline';
            link.textContent = issue.jiraKey;
            keyCell.appendChild(link);
        } else {
            keyCell.textContent = issue.jiraKey || '—';
        }
        var values = [issue.summary || 'Untitled', issue.status || '—', numberFormat.format(issue.storyPoints)];
        if (showIssueType) values.splice(1, 0, issue.issueType || '—');
        values.forEach(function(value, index) {
            var cell = row.insertCell();
            cell.className = 'px-3 py-2' + (index === values.length - 1 ? ' text-right tabular-nums' : '');
            cell.textContent = value;
        });
    });
    container.appendChild(table);
}

function renderDeveloperCapacityConfig() {
    var body = document.getElementById('developer-capacity-body');
    if (!body) return;
    body.replaceChildren();
    var names = new Map();
    (APP_STATE.allData.projects || []).forEach(function(project) {
        var name = String(project.Assignee || '').trim();
        if (name && name.toLowerCase() !== 'unassigned' && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    });
    var capacities = new Map((APP_STATE.allData.developerCapacity || []).map(function(entry) {
        return [entry.developer.toLowerCase(), entry.capacity];
    }));
    var developers = Array.from(names.values()).sort(function(a, b) { return a.localeCompare(b); });
    if (!developers.length) {
        var empty = body.insertRow().insertCell();
        empty.colSpan = 2;
        empty.className = 'px-3 py-8 text-gray-600';
        empty.textContent = 'No Jira assignees found.';
    }
    developers.forEach(function(name, index) {
        var row = body.insertRow();
        row.className = 'hover:bg-[#F6F6F6] transition-colors';
        var nameCell = row.insertCell();
        nameCell.className = 'px-4 py-3';
        var label = document.createElement('label');
        label.htmlFor = 'developer-capacity-' + index;
        label.className = 'text-black font-normal';
        label.textContent = name;
        nameCell.appendChild(label);
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
    });
}

function saveDeveloperCapacity(event) {
    event.preventDefault();
    if (!checkAuth()) return;
    var status = document.getElementById('developer-capacity-status');
    var button = document.getElementById('save-developer-capacity');
    var inputs = Array.from(document.querySelectorAll('#developer-capacity-body input'));
    var invalid = inputs.find(function(input) {
        return !input.validity.valid || (input.value !== '' && (!Number.isFinite(Number(input.value)) || Number(input.value) < 0));
    });
    if (invalid) {
        status.textContent = 'Enter a non-negative number or leave capacity blank.';
        status.classList.remove('config-status-neutral', 'config-status-success');
        status.classList.add('config-status-error');
        invalid.focus();
        return;
    }
    var entries = inputs.map(function(input) {
        return { developer: input.dataset.developer, capacity: input.value };
    });
    button.disabled = true;
    inputs.forEach(function(input) { input.disabled = true; });
    status.textContent = 'Saving capacity...';
    status.classList.remove('config-status-error', 'config-status-success');
    status.classList.add('config-status-neutral');
    callServer('saveDeveloperCapacity', [entries]).then(function(response) {
        if (!response || response.status !== 'success') {
            throw new Error(response && response.message ? response.message : 'Could not save capacity.');
        }
        return callServer('getProjectData', []).then(function(data) {
            if (!handleDataLoaded(data)) throw new Error('Capacity saved, but refresh failed. Reload the page.');
            status.textContent = 'Capacity saved.';
            status.classList.remove('config-status-neutral', 'config-status-error');
            status.classList.add('config-status-success');
        }, function(error) {
            throw new Error('Capacity saved, but refresh failed: ' + getErrorMessage_(error));
        });
    }).catch(function(error) {
        status.textContent = getErrorMessage_(error);
        status.classList.remove('config-status-neutral', 'config-status-success');
        status.classList.add('config-status-error');
    }).finally(function() {
        button.disabled = false;
        inputs.forEach(function(input) { input.disabled = false; });
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
    
    var linksHtml = helpfulLinks.map(function(link) {
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
        fixVersions.forEach(function(v) {
            if (v && v !== '—' && v.toLowerCase() !== 'none' && v.toLowerCase() !== 'n/a') allFixVersions[v] = true;
        });
        
        var validationText = getValidationStatus(item['Planning Stage'], item['Updated'], item['Last Checked'], item['Project Stage'], item['Target Date']).text;
        allValidations[validationText] = true;
        if (item.sprint) {
            var sprintParts = item.sprint.split(',');
            sprintParts.forEach(function(part) {
                var formatted = formatSprint(part.trim());
                if (formatted) allSprints[formatted] = true;
            });
        }
    }

    var sortedSprints = Object.keys(allSprints).sort(function(a, b) {
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
        statusOptions.forEach(function(opt){
            statusHtml += '<option value="' + opt + '">' + opt + '</option>';
        });
        tStatus.innerHTML = statusHtml;
    }
    
    // Populate the task modal priority dropdown from configuration
    var tPriority = $('#t-priority');
    if (tPriority && APP_STATE.allData && APP_STATE.allData.config && APP_STATE.allData.config.priorityOptions) {
        var priorityOptions = APP_STATE.allData.config.priorityOptions;
        var priorityHtml = '';
        priorityOptions.forEach(function(opt){
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
    options.forEach(function(option) {
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
        checkbox.addEventListener('change', function() {
            // When an individual checkbox changes, update the "Select All" checkbox
            updateSelectAllCheckbox(filterType);
            updateFilterSelection(filterType);
        });
    });
    
    // Add event listener for "Select All" checkbox
    selectAllCheckbox.addEventListener('change', function() {
        var isChecked = this.checked;
        var checkboxes = optionsList.querySelectorAll('.filter-checkbox');
        
        // Update all checkboxes to match the "Select All" state
        checkboxes.forEach(function(cb) {
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
    var selectedValues = Array.from(checkboxes).map(function(cb) { return cb.value; });
    
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
        switch(filterType) {
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
    var epics = projects.filter(function(p) { return p['Issue Type'] === 'Epic'; });
    var allChildren = projects.filter(function(p) { return p['Issue Type'] !== 'Epic'; });
    
    var stories = allChildren;
    var storyBugsMap = {};
    var bugs = [];
    
    if (APP_STATE.nestBugs) {
        bugs = allChildren.filter(function(p) { return p['Issue Type'] === 'Bug'; });
        var nonBugs = allChildren.filter(function(p) { return p['Issue Type'] !== 'Bug'; });
        
        // Create lookups for bidirectional linking
        var storyLookup = {};
        nonBugs.forEach(function(s) { storyLookup[s['Jira #']] = s; });
        
        var bugLookup = {};
        bugs.forEach(function(b) { bugLookup[b['Jira #']] = b; });

        // 1. Check Bug Links (Child -> Parent)
        bugs.forEach(function(bug) {
            var links = (bug['Links'] || bug['Linked Issues'] || '').split(',');
            links.forEach(function(link) {
                var parentKey = link.trim();
                if (parentKey && storyLookup[parentKey]) {
                    var parentStory = storyLookup[parentKey];
                    // Nest regardless of Epic Link
                    if (!storyBugsMap[parentKey]) storyBugsMap[parentKey] = [];
                    // Avoid duplicates
                    if (!storyBugsMap[parentKey].some(function(b) { return b['Jira #'] === bug['Jira #']; })) {
                        storyBugsMap[parentKey].push(bug);
                    }
                }
            });
        });

        // 2. Check Story Links (Parent -> Child)
        nonBugs.forEach(function(story) {
            var links = (story['Links'] || story['Linked Issues'] || '').split(',');
            links.forEach(function(link) {
                var childKey = link.trim();
                if (childKey && bugLookup[childKey]) {
                    var bug = bugLookup[childKey];
                    // Nest regardless of Epic Link
                    var storyKey = story['Jira #'];
                    if (!storyBugsMap[storyKey]) storyBugsMap[storyKey] = [];
                    
                    // Avoid duplicates
                    if (!storyBugsMap[storyKey].some(function(b) { return b['Jira #'] === bug['Jira #']; })) {
                        storyBugsMap[storyKey].push(bug);
                    }
                }
            });
        });
        
        stories = nonBugs;
    }
    
    var epicSummaries = {};
    epics.forEach(function(epic) { epicSummaries[normalizeString(epic.Summary)] = true; });
    
    var epicIds = {};
    epics.forEach(function(epic) { if(epic['Jira #']) epicIds[epic['Jira #']] = true; });

    var orphanStories = stories.filter(function(p) { 
        // Check Epic Link
        if (epicSummaries[normalizeString(p['Epic Link'])]) return false;
        
        // Check Linked Issues
        var links = (p['Links'] || p['Linked Issues'] || '').split(',');
        var hasEpicLink = links.some(function(link) { return epicIds[link.trim()]; });
        if (hasEpicLink) return false;
        
        return true;
    });
    
    var orphanBugs = [];
    if (APP_STATE.nestBugs) {
        orphanBugs = bugs.filter(function(p) {
            // Check Epic Link
            if (epicSummaries[normalizeString(p['Epic Link'])]) return false;
            
            // Check Linked Issues
            var links = (p['Links'] || p['Linked Issues'] || '').split(',');
            var hasEpicLink = links.some(function(link) { return epicIds[link.trim()]; });
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
        APP_STATE.allData.config.priorityOptions.forEach(function(priority, index) {
            sortOrders.priority[priority.toLowerCase().trim()] = index + 1;
        });
    }
    var sortEpics = function(a, b) {
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

    var sortChildren = function(a, b) {
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
        var childStories = stories.filter(function(story) { 
            // 1. Check standard Epic Link (matches by Summary/Name)
            if (normalizeString(story['Epic Link']) === normalizeString(epic.Summary)) return true;
            
            // 2. Check Linked Issues (matches by Key) - allows stories to appear under multiple Epics
            var links = (story['Links'] || story['Linked Issues'] || '').split(',');
            var epicId = epic['Jira #'];
            return links.some(function(link) { return link.trim() === epicId; });
        });
        
        // Find direct bugs for this epic if nestBugs is true
        var directBugs = [];
        if (APP_STATE.nestBugs) {
            directBugs = bugs.filter(function(bug) {
                // Check Epic Link
                if (normalizeString(bug['Epic Link']) === normalizeString(epic.Summary)) return true;
                // Check Linked Issues
                var links = (bug['Links'] || bug['Linked Issues'] || '').split(',');
                var epicId = epic['Jira #'];
                return links.some(function(link) { return link.trim() === epicId; });
            });
        }
        
        var needsAttentionCount = 0;
        childStories.forEach(function(story) {
            var status = getValidationStatus(story['Planning Stage'], story['Updated'], story['Last Checked'], story['Project Stage'], story['Target Date']).text;
            if (status === 'Needs Review' || status === 'Past Due') {
                needsAttentionCount++;
            }
        });
        
        // Add attention count from direct bugs
        directBugs.forEach(function(bug) {
             var status = getValidationStatus(bug['Planning Stage'], bug['Updated'], bug['Last Checked'], bug['Project Stage'], bug['Target Date']).text;
             if (status === 'Needs Review' || status === 'Past Due') {
                 needsAttentionCount++;
             }
        });
        
        body.appendChild(createRow(epic, 'epic', null, needsAttentionCount));
        
        if (epic.tasks) {
            epic.tasks.forEach(function(task){
                if (!task['Associated Story']) {
                    body.appendChild(createRow(task, 'task', epic['Jira #']));
                }
            });
        }
        
        var renderedBugIds = {};
        
        childStories.sort(sortChildren);
        childStories.forEach(function(story) { 
            var openBugCount = 0;
            var needsAttentionCount = 0;
            var childBugs = [];
            if (APP_STATE.nestBugs && storyBugsMap[story['Jira #']]) {
                childBugs = storyBugsMap[story['Jira #']];
                childBugs.forEach(function(b) {
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
                childBugs.forEach(function(bug, index) {
                    var isLast = index === childBugs.length - 1;
                    body.appendChild(createRow(bug, 'bug-child', story['Jira #'], null, false, isLast));
                });
            }

            if (story.tasks) {
                story.tasks.forEach(function(task){
                    body.appendChild(createRow(task, 'task', epic['Jira #']));
                });
            }
        });
        
        // Render Direct Bugs (that weren't rendered as nested bugs)
        if (APP_STATE.nestBugs && directBugs.length > 0) {
            directBugs.sort(sortChildren);
            directBugs.forEach(function(bug) {
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
        orphanStories.forEach(function(story) {
            var status = getValidationStatus(story['Planning Stage'], story['Updated'], story['Last Checked'], story['Project Stage'], story['Target Date']).text;
            if (status === 'Needs Review') {
                unassignedNeedsReviewCount++;
            }
        });

        orphanBugs.forEach(function(bug) {
            var status = getValidationStatus(bug['Planning Stage'], bug['Updated'], bug['Last Checked'], bug['Project Stage'], bug['Target Date']).text;
            if (status === 'Needs Review') {
                unassignedNeedsReviewCount++;
            }
        });
        
        var unassignedEpicRow = createRow(unassignedEpic, 'epic', null, unassignedNeedsReviewCount);
        body.prepend(unassignedEpicRow);
        
        var orphanStoryRows = [];
        var renderedOrphanBugIds = {};
        
        orphanStories.sort(sortChildren).forEach(function(story) {
            var openBugCount = 0;
            var needsAttentionCount = 0;
            var childBugs = [];
            if (APP_STATE.nestBugs && storyBugsMap[story['Jira #']]) {
                childBugs = storyBugsMap[story['Jira #']];
                childBugs.forEach(function(b) {
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
                childBugs.forEach(function(bug, index) {
                    var isLast = index === childBugs.length - 1;
                    orphanStoryRows.push(createRow(bug, 'bug-child', 'UNASSIGNED', null, false, isLast));
                });
            }
        });
        
        if (APP_STATE.nestBugs && orphanBugs.length > 0) {
            orphanBugs.sort(sortChildren);
            orphanBugs.forEach(function(bug) {
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
        
        if(orphanStoryRows.length > 0) {
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

    var filtered = allTasks.filter(function(t) {
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

    filtered.forEach(function(t) {
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
    buckets.forEach(function(b) {
        b.tasks.sort(function(a, bb) {
            var da = a.Due ? taskHub_parseDueDate_(a.Due).getTime() : 8640000000000000;
            var db = bb.Due ? taskHub_parseDueDate_(bb.Due).getTime() : 8640000000000000;
            if (da !== db) return da - db;
            return (prioOrder[a.Priority] || 2) - (prioOrder[bb.Priority] || 2);
        });
    });

    var html = '';
    buckets.forEach(function(bucket) {
        if (bucket.tasks.length === 0) return;
        html += '<tr class="' + bucket.cls + '"><td colspan="5" class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">' + bucket.label + ' <span class="font-normal opacity-70">(' + bucket.tasks.length + ')</span></td></tr>';
        bucket.tasks.forEach(function(task) {
            html += buildTaskRow_(task);
        });
    });

    tbody.innerHTML = html;

    // Wire click handlers
    tbody.querySelectorAll('.task-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            taskHub_toggleComplete_(btn.getAttribute('data-task-id'));
        });
    });
    tbody.querySelectorAll('.task-row-click').forEach(function(row) {
        row.addEventListener('click', function() {
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
        if (!isNaN(d.getTime())) dueLabel = (d.getMonth()+1) + '/' + d.getDate();
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
        statusFilter.addEventListener('change', function() { renderTasksView(); });
    }

    var refreshBtn = document.getElementById('refresh-tasks-btn');
    if (refreshBtn && !refreshBtn._wired) {
        refreshBtn._wired = true;
        refreshBtn.addEventListener('click', function() { taskHub_refreshFromWorkbook_(); });
    }

    var addBtn = document.getElementById('add-task-btn');
    if (addBtn && !addBtn._wired) {
        addBtn._wired = true;
        addBtn.addEventListener('click', function() {
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
        quickSave.addEventListener('click', function() { taskHub_quickAdd_(); });
    }

    var quickCancel = document.getElementById('quick-add-cancel');
    if (quickCancel && !quickCancel._wired) {
        quickCancel._wired = true;
        quickCancel.addEventListener('click', function() {
            document.getElementById('quick-add-bar').classList.add('hidden');
        });
    }

    var quickTitle = document.getElementById('quick-add-title');
    if (quickTitle && !quickTitle._wired) {
        quickTitle._wired = true;
        quickTitle.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') taskHub_quickAdd_();
        });
    }

    var descToggle = document.getElementById('drawer-task-desc-toggle');
    if (descToggle && !descToggle._wired) {
        descToggle._wired = true;
        descToggle.addEventListener('click', function() { taskHub_toggleDescriptionEditor_(); });
    }

    var descField = document.getElementById('drawer-task-desc');
    if (descField && !descField._wired) {
        descField._wired = true;
        descField.addEventListener('input', function() {
            if (descField.classList.contains('hidden')) return;
            taskHub_renderDescriptionPreview_();
        });
    }

    var drawerClose = document.getElementById('drawer-close-btn');
    if (drawerClose && !drawerClose._wired) {
        drawerClose._wired = true;
        drawerClose.addEventListener('click', function() { taskHub_closeDrawer_(); });
    }
    var drawerOverlay = document.getElementById('task-drawer-overlay');
    if (drawerOverlay && !drawerOverlay._wired) {
        drawerOverlay._wired = true;
        drawerOverlay.addEventListener('click', function() { taskHub_closeDrawer_(); });
    }

    var drawerSave = document.getElementById('drawer-save-btn');
    if (drawerSave && !drawerSave._wired) {
        drawerSave._wired = true;
        drawerSave.addEventListener('click', function() { taskHub_saveFromDrawer_(); });
    }

    var drawerDelete = document.getElementById('drawer-delete-btn');
    if (drawerDelete && !drawerDelete._wired) {
        drawerDelete._wired = true;
        drawerDelete.addEventListener('click', function() { taskHub_deleteFromDrawer_(); });
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
    callServer('getProjectData', []).then(function(data) {
            if (data) {
                if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) { console.error('[TaskHub] parse error', e); if (onComplete) onComplete(); return; } }
                APP_STATE.allData = data;
                renderTasksView();
            }
            if (onComplete) onComplete();
        }, function(err) {
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
    taskHub_refreshData_({ preserveRows: true, onComplete: function() {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = originalLabel || 'Refresh';
        }
    } });
}

function taskHub_toggleComplete_(taskId) {
    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token || !taskId) return;

    var allTasks = (APP_STATE.allData && APP_STATE.allData.independentTasks) || [];
    var task = allTasks.find(function(t) { return t.ID === taskId; });
    if (task) {
        task.Status = (task.Status === 'Done') ? 'Open' : 'Done';
        renderTasksView();
    }

    callServer('toggleTaskComplete', [taskId]).then(function() { taskHub_refreshData_({ preserveRows: true }); }, function(err) {
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

    callServer('createTaskAndSync', [taskData]).then(function(res) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Add'; }
            if (titleEl) titleEl.value = '';
            document.getElementById('quick-add-due').value = '';
            document.getElementById('quick-add-priority').value = 'Medium';
            document.getElementById('quick-add-recurrence').value = '';
            if (typeof showToast === 'function') showToast(res.message || 'Task created');
            taskHub_refreshData_({ preserveRows: true });
        }, function(err) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Add'; }
            if (typeof showToast === 'function') showToast('Failed: ' + (err && err.message ? err.message : err));
        });
}

/* ─── TASK DETAIL DRAWER ─── */

function taskHub_openDrawer_(taskId) {
    var allTasks = (APP_STATE.allData && APP_STATE.allData.independentTasks) || [];
    var task = allTasks.find(function(t) { return t.ID === taskId; });
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
                dueInput.value = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
            } else { dueInput.value = ''; }
        } catch(e) { dueInput.value = ''; }
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

    callServer('updateTaskAndSync', [taskData]).then(function() {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save changes'; }
            if (typeof showToast === 'function') showToast('Task updated');
            taskHub_closeDrawer_();
            taskHub_refreshData_({ preserveRows: true });
        }, function(err) {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save changes'; }
            if (typeof showToast === 'function') showToast('Save failed: ' + (err && err.message ? err.message : err));
        });
}

function taskHub_deleteFromDrawer_() {
    if (!APP_STATE._editingTaskId) return;
    if (!confirm('Delete this task?')) return;

    var token = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!token) return;

    callServer('deleteTaskAndSync', [APP_STATE._editingTaskId]).then(function() {
            if (typeof showToast === 'function') showToast('Task deleted');
            taskHub_closeDrawer_();
            taskHub_refreshData_({ preserveRows: true });
        }, function(err) {
            if (typeof showToast === 'function') showToast('Delete failed: ' + (err && err.message ? err.message : err));
        });
}

function renderBoard() {
    var wrapper = $('#content-wrapper');
    wrapper.innerHTML = '<div id="kanban-board" class="kanban-board-container"></div>';
    var board = $('#kanban-board');
    var tasks = APP_STATE.allData.independentTasks;
    var statusMap = {};
    tasks.forEach(function(task) { if(task.Status) statusMap[task.Status] = true; });
    var statuses = Object.keys(statusMap).sort();
    
    if (statuses.length === 0) {
        board.innerHTML = '<p class="p-8 text-center text-gray-500">No independent tasks to display.</p>';
        return;
    }

    statuses.forEach(function(status) {
        var column = document.createElement('div');
        column.className = 'kanban-column';
        column.innerHTML = '<h3 class="kanban-column-title">' + status + '</h3><div class="kanban-cards"></div>';
        board.appendChild(column);
        var cardsContainer = column.querySelector('.kanban-cards');
        tasks.filter(function(task) { return task.Status === status; })
             .forEach(function(task) {
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
    
    matchingRows.forEach(function(rowToUpdate) {
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
        var project = APP_STATE.allData.projects.find(function(p) {
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

    matchingRows.forEach(function(row) {
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
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'mappingChanged') {
        // Trigger a re-render of the app to update sync indicators
        try {
            if (typeof renderApp === 'function') {
                renderApp();
            }
        } catch (e) {}
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

        matchingRows.forEach(function(row) {
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
            (cfg.stageStatusMappings || []).forEach(function(m){
                if (m && m.stage) {
                    var expectedStatuses = (m.expectedStatuses || []).map(function(x){ return (x||'').toLowerCase().trim(); });
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
