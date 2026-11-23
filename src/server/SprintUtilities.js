/**
 * @file SprintUtilities.js
 * @description Sprint parsing and formatting utilities for project management.
 */

// --- SPRINT LOGIC HELPER ---

/**
 * Parses individual sprint entries from a sprint field value.
 * Handles:
 *   - Jira verbose format: com.atlassian.greenhopper...Sprint@hash[id=N,state=ACTIVE,name=Sprint N,startDate=ISO,endDate=ISO,...]
 *   - Simple names: "Sprint 93, Sprint 110"
 *   - Legacy date format: "Sprint 93 M/DD - M/DD"
 * @param {string} sprintString
 * @returns {Array<{name:string, state:string, startDate:Date|null, endDate:Date|null}>}
 */
function parseSprintEntries_(sprintString) {
  var entries = [];
  if (!sprintString || typeof sprintString !== 'string') return entries;
  var s = sprintString.trim();

  // --- Jira verbose format detection ---
  var isJiraVerbose = s.indexOf('com.atlassian') !== -1 ||
    (s.indexOf('state=') !== -1 && s.indexOf('[id=') !== -1);

  if (isJiraVerbose) {
    // Split on sprint object boundaries (each sprint starts with com.atlassian or appears after ],)
    var parts = s.split(/,?\s*(?=com\.atlassian)/);
    parts.forEach(function (part) {
      if (!part) return;
      // Extract name= field (e.g. name=Sprint 110)
      var nameMatch = part.match(/[,\[]name=([^,\]]+)/);
      var name = nameMatch ? nameMatch[1].trim() : '';
      // Fall back to first "Sprint N" in the block
      if (!name) {
        var sprintMatch = part.match(/Sprint\s*\d+/i);
        name = sprintMatch ? sprintMatch[0].trim() : '';
      }
      if (!name) return;

      // Extract state= field
      var stateMatch = part.match(/[,\[]state=([^,\]]+)/);
      var state = stateMatch ? stateMatch[1].trim().toUpperCase() : '';

      // Extract ISO dates (startDate=YYYY-MM-DD, endDate=YYYY-MM-DD)
      var startIso = part.match(/startDate=(\d{4}-\d{2}-\d{2})/);
      var endIso = part.match(/endDate=(\d{4}-\d{2}-\d{2})/);
      var startDate = startIso ? new Date(startIso[1] + 'T00:00:00') : null;
      var endDate = endIso ? new Date(endIso[1] + 'T23:59:59') : null;

      entries.push({ name: name, state: state, startDate: startDate, endDate: endDate });
    });

    if (entries.length > 0) return entries;
  }

  // Parse each legacy sprint label independently so date ranges survive in
  // fields that contain multiple comma-separated sprints.
  var sprintPattern = /(Sprint\s*\d+)(?:\s+(\d{1,2})[/.](\d{1,2})\s*-\s*(\d{1,2})[/.](\d{1,2}))?/ig;
  var sprintMatch;
  while ((sprintMatch = sprintPattern.exec(s)) !== null) {
    var sprintName = sprintMatch[1].trim();
    var startDate = null;
    var endDate = null;
    if (sprintMatch[2]) {
      var startMonth = parseInt(sprintMatch[2], 10);
      var startDay = parseInt(sprintMatch[3], 10);
      var endMonth = parseInt(sprintMatch[4], 10);
      var endDay = parseInt(sprintMatch[5], 10);
      var year = new Date().getFullYear();
      if (startMonth >= 1 && startMonth <= 12 && endMonth >= 1 && endMonth <= 12) {
        startDate = new Date(year, startMonth - 1, startDay);
        endDate = new Date(year, endMonth - 1, endDay);
        if (startDate > endDate) endDate.setFullYear(year + 1);
        endDate.setHours(23, 59, 59, 999);
      }
    }
    entries.push({ name: sprintName, state: '', startDate: startDate, endDate: endDate });
  }
  if (entries.length > 0) return entries;

  // --- Legacy M/DD - M/DD date range format ---
  var dateMatch = s.match(/(\d{1,2})[/.](\d{1,2})\s*-\s*(\d{1,2})[/.](\d{1,2})/);
  if (dateMatch) {
    var sm = parseInt(dateMatch[1], 10), sd = parseInt(dateMatch[2], 10);
    var em = parseInt(dateMatch[3], 10), ed = parseInt(dateMatch[4], 10);
    var year = new Date().getFullYear();
    var sprintNameM = s.match(/Sprint\s*\d+/i);
    var mName = sprintNameM ? sprintNameM[0].trim() : s.trim();
    // Only use dates if months are valid (1-12); otherwise just store the name
    if (sm >= 1 && sm <= 12 && em >= 1 && em <= 12) {
      var startDate2 = new Date(year, sm - 1, sd);
      var endDate2 = new Date(year, em - 1, ed);
      if (startDate2 > endDate2) endDate2.setFullYear(year + 1);
      endDate2.setHours(23, 59, 59, 999);
      entries.push({ name: mName, state: '', startDate: startDate2, endDate: endDate2 });
    } else if (mName) {
      entries.push({ name: mName, state: '', startDate: null, endDate: null });
    }
    return entries;
  }

  // --- Last resort: whole string as name ---
  if (s) entries.push({ name: s, state: '', startDate: null, endDate: null });
  return entries;
}

function formatSprint(sprintString) {
  if (!sprintString || typeof sprintString !== 'string') return '—';
  var match = sprintString.match(/(Sprint\s?\d+)/i);
  return match ? match[1].trim() : '—';
}

/**
 * Analyzes project data to generate sprint statistics.
 * @param {Array<Object>} items - Combined list of projects and independent tasks
 * @returns {Object} Sprint statistics map
 */
function analyzeSprintData(items) {
  var stats = {
    currentSprintName: 'None',
    currentSprintStart: null,
    currentSprintEnd: null
  };
  var now = new Date();
  var activeSprint = null;       // best candidate found via state/date
  var highestSprintNumber = -1;  // fallback: highest sprint number seen
  var highestSprintEntry = null;

  items.forEach(function (item) {
    var sprint = item.sprint || item.Sprint;
    if (!sprint) return;

    // Parse ALL individual sprint entries from this field value
    var entries = parseSprintEntries_(sprint);

    entries.forEach(function (entry) {
      // Normalise sprint name (e.g. "Sprint 110")
      var sprintName = formatSprint(entry.name);
      if (!sprintName || sprintName === '—') sprintName = entry.name;
      if (!sprintName) return;

      // Track highest sprint number for fallback
      var numMatch = sprintName.match(/Sprint\s*(\d+)/i);
      if (numMatch) {
        var num = parseInt(numMatch[1], 10);
        if (num > highestSprintNumber) {
          highestSprintNumber = num;
          highestSprintEntry = entry;
          highestSprintEntry.name = sprintName;
        }
      }

      var s = stats[sprintName];
      if (!s) {
        s = stats[sprintName] = {
          name: sprintName,
          state: entry.state,
          startDate: entry.startDate,
          endDate: entry.endDate,
          isActive: false,
          totalItems: 0,
          completedItems: 0,
          totalPoints: 0,
          completedPoints: 0
        };
      } else {
        if (entry.state === 'ACTIVE' || !s.state) s.state = entry.state;
        if (entry.startDate && (!s.startDate || entry.startDate < s.startDate)) s.startDate = entry.startDate;
        if (entry.endDate && (!s.endDate || entry.endDate > s.endDate)) s.endDate = entry.endDate;
      }

      var isClosed = entry.state === 'CLOSED' || entry.state === 'COMPLETE' || entry.state === 'COMPLETED';
      var isActive = entry.state === 'ACTIVE' ||
        (!isClosed && entry.startDate && entry.endDate && now >= entry.startDate && now <= entry.endDate);
      if (isActive) {
        s.isActive = true;
        if (!activeSprint ||
          (s.state === 'ACTIVE' && activeSprint.state !== 'ACTIVE') ||
          (s.state === activeSprint.state && s.endDate && activeSprint.endDate && s.endDate > activeSprint.endDate)) {
          activeSprint = s;
        }
      }

      s.totalItems++;

      var points = parseFloat(item['Story Points'] || item.storyPoints || 0);
      if (!isNaN(points)) s.totalPoints += points;

      var status = (item.Status || item.status || '').toLowerCase();
      var stage = (item['Project Stage'] || item.projectStage || '').toLowerCase();
      var isClosed =
        status === 'done' || status === 'closed' ||
        status === 'resolved' || status === 'fixed' ||
        stage === 'production' || stage === 'in production' || stage === 'canceled';

      if (isClosed) {
        s.completedItems++;
        if (!isNaN(points)) s.completedPoints += points;
      }
    });
  });

  // If no sprint was identified as active via state/dates, fall back to
  // the highest-numbered sprint (most recent in Jira numbering).
  if (!activeSprint && highestSprintEntry) {
    var fallbackName = highestSprintEntry.name;
    if (!stats[fallbackName]) {
      stats[fallbackName] = {
        name: fallbackName,
        state: '',
        startDate: highestSprintEntry.startDate,
        endDate: highestSprintEntry.endDate,
        isActive: true,
        totalItems: 0,
        completedItems: 0,
        totalPoints: 0,
        completedPoints: 0
      };
    }
    activeSprint = stats[fallbackName];
  }

  if (activeSprint) {
    stats.currentSprintName = activeSprint.name || 'None';
    stats.currentSprintStart = activeSprint.startDate ? activeSprint.startDate.toISOString() : null;
    stats.currentSprintEnd = activeSprint.endDate ? activeSprint.endDate.toISOString() : null;
  }

  return stats;
}

  var DEFAULT_CLOSED_STATUSES_ = [
    'done', 'closed', 'resolved', 'fixed', 'complete', 'completed',
    'ready for production', 'in production', 'canceled', 'cancelled'
  ];
  var DEFAULT_CLOSED_STAGES_ = [
    'done', 'production', 'in production', 'prod', 'fixed', 'canceled', 'cancelled'
  ];
  var DEFAULT_NOT_STARTED_STATUSES_ = [
    '', 'to do', 'todo', 'open', 'new', 'backlog', 'not started', 'ready',
    'ready for dev', 'ready for development', 'groomed', 'refined',
    'selected for development', 'intake', 'triage'
  ];

  function classifyIssueWorkState_(item, config) {
    var status = String((item && (item.Status !== undefined ? item.Status : item.status)) || '').trim().toLowerCase();
    var stage = String((item && (item['Project Stage'] !== undefined ? item['Project Stage'] : item.projectStage)) || '').trim().toLowerCase();
    var closedStatuses = DEFAULT_CLOSED_STATUSES_.slice();
    var closedStages = DEFAULT_CLOSED_STAGES_.slice();
    var notStartedStatuses = DEFAULT_NOT_STARTED_STATUSES_.slice();

    if (config) {
      if (Array.isArray(config.closedStatuses)) {
        config.closedStatuses.forEach(function (s) {
          var norm = String(s || '').trim().toLowerCase();
          if (norm && closedStatuses.indexOf(norm) === -1) closedStatuses.push(norm);
        });
      }
      if (Array.isArray(config.closedProjectStages)) {
        config.closedProjectStages.forEach(function (s) {
          var norm = String(s || '').trim().toLowerCase();
          if (norm && closedStages.indexOf(norm) === -1) closedStages.push(norm);
        });
      }
      if (Array.isArray(config.notInProgressStatuses)) {
        config.notInProgressStatuses.forEach(function (s) {
          var norm = String(s || '').trim().toLowerCase();
          if (norm && notStartedStatuses.indexOf(norm) === -1) notStartedStatuses.push(norm);
        });
      }
    }

    if (closedStatuses.indexOf(status) !== -1 || (stage && closedStages.indexOf(stage) !== -1)) {
      return 'completed';
    }
    if (notStartedStatuses.indexOf(status) !== -1) {
      return 'notStarted';
    }
    return 'inProgress';
  }

  function calculateWorkdayProgress_(startDate, endDate, now) {
    var startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    var endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    var totalWorkdays = 0;
    var elapsedWorkdays = 0;
    var remainingWorkdays = 0;
    var cursor = new Date(startDay.getTime());
    var guard = 0;

    while (cursor <= endDay && guard < 400) {
      guard++;
      var dayOfWeek = cursor.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        totalWorkdays++;
        var dayStart = cursor.getTime();
        var dayEnd = dayStart + 86400000;
        if (now.getTime() >= dayEnd) {
          elapsedWorkdays += 1;
        } else if (now.getTime() > dayStart) {
          var fraction = Math.max(0, Math.min(1, (now.getTime() - dayStart) / 86400000));
          elapsedWorkdays += fraction;
          remainingWorkdays += (1 - fraction);
        } else {
          remainingWorkdays += 1;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (totalWorkdays > 0) {
      return {
        timeElapsedPct: Math.max(0, Math.min(1, elapsedWorkdays / totalWorkdays)),
        totalDays: totalWorkdays,
        daysElapsed: Math.min(totalWorkdays, Math.max(0, Math.ceil(elapsedWorkdays))),
        daysRemaining: Math.max(0, Math.ceil(remainingWorkdays - 0.01)),
        unit: 'workdays'
      };
    }

    var totalMs = Math.max(1, endDate.getTime() - startDate.getTime());
    var elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - startDate.getTime()));
    var totalCalDays = Math.max(1, Math.round(totalMs / 86400000));
    return {
      timeElapsedPct: elapsedMs / totalMs,
      totalDays: totalCalDays,
      daysElapsed: Math.min(totalCalDays, Math.max(0, Math.ceil(elapsedMs / 86400000))),
      daysRemaining: now > endDate ? 0 : Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000)),
      unit: 'days'
    };
  }

  function calculateSprintPace_(startDate, endDate, metrics, nowDate) {
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
      return {
        status: 'no_work',
        label: 'No work',
        timeElapsedPct: null,
        timeRemainingPct: null,
        completedPct: 0,
        activePct: 0,
        delta: null,
        remainingPoints: 0,
        remainingIssues: 0,
        requiredPointsPerDay: null,
        expectedPointsPerDay: null,
        totalDays: null,
        daysElapsed: null,
        daysRemaining: null,
        unit: null,
        metricBasis: metricBasis
      };
    }

    var start = startDate instanceof Date && !isNaN(startDate.getTime()) ? startDate : (startDate ? new Date(startDate) : null);
    var end = endDate instanceof Date && !isNaN(endDate.getTime()) ? endDate : (endDate ? new Date(endDate) : null);
    if (start && isNaN(start.getTime())) start = null;
    if (end && isNaN(end.getTime())) end = null;

    if (!start || !end || end < start) {
      return {
        status: completedPct >= 1 ? 'completed' : 'no_dates',
        label: completedPct >= 1 ? 'Completed' : 'Dates unavailable',
        timeElapsedPct: null,
        timeRemainingPct: null,
        completedPct: completedPct,
        activePct: activePct,
        delta: null,
        remainingPoints: remainingPoints,
        remainingIssues: remainingIssues,
        requiredPointsPerDay: null,
        expectedPointsPerDay: null,
        totalDays: null,
        daysElapsed: null,
        daysRemaining: null,
        unit: null,
        metricBasis: metricBasis
      };
    }

    var now = nowDate instanceof Date && !isNaN(nowDate.getTime()) ? nowDate : new Date();
    var timing = calculateWorkdayProgress_(start, end, now);
    var timeRemainingPct = Math.max(0, Math.min(1, 1 - timing.timeElapsedPct));
    var delta = completedPct - timing.timeElapsedPct;
    var remainingWork = usePoints ? remainingPoints : remainingIssues;
    var totalWork = usePoints ? totalPoints : totalIssues;
    var requiredPointsPerDay = remainingWork <= 0 ? 0 : (timing.daysRemaining > 0 ? remainingWork / timing.daysRemaining : null);
    var expectedPointsPerDay = timing.totalDays > 0 ? totalWork / timing.totalDays : null;
    var status;
    var label;

    if (completedPct >= 1) {
      status = 'completed';
      label = 'Completed';
    } else if (now < start) {
      status = 'upcoming';
      label = 'Upcoming';
    } else if (now > end) {
      status = 'behind';
      label = 'Behind';
    } else if (timing.timeElapsedPct <= 0.2) {
      if (completedPct >= timing.timeElapsedPct || activePct >= timing.timeElapsedPct) {
        status = 'on_track';
        label = 'On track';
      } else {
        status = 'at_risk';
        label = 'At risk';
      }
    } else if (delta >= -0.1) {
      status = 'on_track';
      label = 'On track';
    } else if (delta >= -0.25) {
      status = 'at_risk';
      label = 'At risk';
    } else {
      status = 'behind';
      label = 'Behind';
    }

    return {
      status: status,
      label: label,
      timeElapsedPct: timing.timeElapsedPct,
      timeRemainingPct: timeRemainingPct,
      completedPct: completedPct,
      activePct: activePct,
      delta: delta,
      remainingPoints: remainingPoints,
      remainingIssues: remainingIssues,
      requiredPointsPerDay: requiredPointsPerDay,
      expectedPointsPerDay: expectedPointsPerDay,
      totalDays: timing.totalDays,
      daysElapsed: timing.daysElapsed,
      daysRemaining: timing.daysRemaining,
      unit: timing.unit,
      metricBasis: metricBasis
    };
  }

  function analyzeSprintCapacity(items, currentSprintName, capacityEntries, options) {
    var opts = options || {};
    var sprintName = String(currentSprintName || '').trim();
    var capacityByDeveloper = new Map();
    var totalIssues = 0;
    var totalStoryPoints = 0;
    var totalCompletedPoints = 0;
    var totalInProgressPoints = 0;
    var totalNotStartedPoints = 0;
    var totalCompletedIssues = 0;
    var totalInProgressIssues = 0;
    var totalUnestimatedIssues = 0;
    var hasSprint = Boolean(sprintName && sprintName !== 'None' && sprintName !== '—');
    var sprintStart = opts.startDate ? new Date(opts.startDate) : null;
    var sprintEnd = opts.endDate ? new Date(opts.endDate) : null;
    if (sprintStart && isNaN(sprintStart.getTime())) sprintStart = null;
    if (sprintEnd && isNaN(sprintEnd.getTime())) sprintEnd = null;

    var createDeveloperEntry = function (developer) {
      return {
        developer: developer,
        storyPoints: 0,
        completedPoints: 0,
        inProgressPoints: 0,
        notStartedPoints: 0,
        completedIssues: 0,
        inProgressIssues: 0,
        notStartedIssues: 0,
        unestimatedCount: 0,
        issues: []
      };
    };

    // Configured capacity per developer (from the DeveloperCapacity sheet), keyed case-insensitively.
    var configuredCapacity = new Map();
    (capacityEntries || []).forEach(function (config) {
      if (!config || !config.developer) return;
      var name = String(config.developer).trim();
      if (!name) return;
      var points = config.capacity;
      configuredCapacity.set(name.toLowerCase(), {
        developer: name,
        capacity: typeof points === 'number' && Number.isFinite(points) && points >= 0 ? points : null
      });
    });

    (items || []).forEach(function (item) {
      var developer = String(item.Assignee || item.assignee || item['Assigned Dev'] || '').trim();
      if (developer && developer.toLowerCase() !== 'unassigned' && !capacityByDeveloper.has(developer.toLowerCase())) {
        capacityByDeveloper.set(developer.toLowerCase(), createDeveloperEntry(developer));
      }
      if (!hasSprint) return;
      var issueType = String(item['Issue Type'] || '').trim();
      if (issueType.toLowerCase() === 'epic') return;

      var sprintEntries = parseSprintEntries_(item.sprint || item.Sprint);
      var matchedSprintEntry = null;
      var belongsToCurrentSprint = sprintEntries.some(function (entry) {
        var entryName = formatSprint(entry.name);
        var matches = (entryName === '—' ? entry.name : entryName).toLowerCase() === sprintName.toLowerCase();
        if (matches && !matchedSprintEntry) matchedSprintEntry = entry;
        return matches;
      });
      if (!belongsToCurrentSprint) return;

      if (matchedSprintEntry) {
        if (matchedSprintEntry.startDate && (!sprintStart || matchedSprintEntry.startDate < sprintStart)) {
          sprintStart = matchedSprintEntry.startDate;
        }
        if (matchedSprintEntry.endDate && (!sprintEnd || matchedSprintEntry.endDate > sprintEnd)) {
          sprintEnd = matchedSprintEntry.endDate;
        }
      }

      developer = developer && developer.toLowerCase() !== 'unassigned' ? developer : 'Unassigned';
      var pointsValue = item['Story Points'] !== undefined ? item['Story Points'] : item.storyPoints;
      var rawPoints = String(pointsValue == null ? '' : pointsValue).trim();
      var points = parseFloat(rawPoints);
      var isUnestimated = rawPoints === '' || !Number.isFinite(points) || points <= 0;
      if (!Number.isFinite(points)) points = 0;

      var workState = classifyIssueWorkState_(item, opts.config);
      var key = developer.toLowerCase();
      var entry = capacityByDeveloper.get(key);
      if (!entry) {
        entry = createDeveloperEntry(developer);
        capacityByDeveloper.set(key, entry);
      }
      entry.storyPoints += points;
      if (workState === 'completed') {
        entry.completedPoints += points;
        entry.completedIssues++;
        totalCompletedPoints += points;
        totalCompletedIssues++;
      } else if (workState === 'inProgress') {
        entry.inProgressPoints += points;
        entry.inProgressIssues++;
        totalInProgressPoints += points;
        totalInProgressIssues++;
      } else {
        entry.notStartedPoints += points;
        entry.notStartedIssues++;
        totalNotStartedPoints += points;
      }
      if (isUnestimated) {
        entry.unestimatedCount++;
        totalUnestimatedIssues++;
      }
      entry.issues.push({
        jiraKey: String(item['Jira #'] || '').trim(),
        summary: String(item.Summary || '').trim(),
        issueType: issueType,
        status: String(item.Status || '').trim(),
      storyPoints: points,
        workState: workState
      });
      totalIssues++;
      totalStoryPoints += points;
    });

    var totalCapacity = 0;
    var hasConfiguredCapacity = false;
    var developers = Array.from(capacityByDeveloper.values()).map(function (entry) {
      var config = entry.developer === 'Unassigned' ? null : configuredCapacity.get(entry.developer.toLowerCase());
      var capacity = config && config.capacity != null ? config.capacity : null;
      if (capacity != null) {
        totalCapacity += capacity;
        hasConfiguredCapacity = true;
      }
      entry.issueCount = entry.issues.length;
      entry.capacity = capacity;
      entry.remaining = capacity == null || !hasSprint ? null : capacity - entry.storyPoints;
      entry.pace = hasSprint && entry.issueCount > 0 && sprintStart && sprintEnd ?
        calculateSprintPace_(sprintStart, sprintEnd, {
          totalStoryPoints: entry.storyPoints,
          completedPoints: entry.completedPoints,
          inProgressPoints: entry.inProgressPoints,
          totalIssues: entry.issueCount,
          completedIssues: entry.completedIssues,
          inProgressIssues: entry.inProgressIssues
        }, opts.now) : null;
      return entry;
    }).sort(function (a, b) {
      return b.storyPoints - a.storyPoints || a.developer.localeCompare(b.developer);
    });

    var pace = hasSprint ? calculateSprintPace_(sprintStart, sprintEnd, {
      totalStoryPoints: totalStoryPoints,
      completedPoints: totalCompletedPoints,
      inProgressPoints: totalInProgressPoints,
      totalIssues: totalIssues,
      completedIssues: totalCompletedIssues,
      inProgressIssues: totalInProgressIssues
    }, opts.now) : null;

    return {
      sprintName: hasSprint ? sprintName : 'None',
      sprintStart: sprintStart ? sprintStart.toISOString() : null,
      sprintEnd: sprintEnd ? sprintEnd.toISOString() : null,
      totalIssues: totalIssues,
      totalStoryPoints: totalStoryPoints,
      completedPoints: totalCompletedPoints,
      inProgressPoints: totalInProgressPoints,
      notStartedPoints: totalNotStartedPoints,
      completedIssues: totalCompletedIssues,
      unestimatedIssues: totalUnestimatedIssues,
      totalCapacity: hasConfiguredCapacity ? totalCapacity : null,
      pace: pace,
      developers: developers
    };
  }

  function analyzeNoSprintCapacity_(projects, config) {
    var byDeveloper = new Map();
    var totalIssues = 0;
    var totalStoryPoints = 0;
    var unestimatedIssues = 0;

    (projects || []).forEach(function (item) {
      var issueType = String(item['Issue Type'] || '').trim();
      if (issueType.toLowerCase() === 'epic') return;

      var sprintEntries = parseSprintEntries_(item.sprint || item.Sprint).filter(function (entry) {
        var name = formatSprint(entry.name);
        var resolved = name === '—' ? String(entry.name || '').trim() : name;
        return Boolean(resolved && resolved !== '—');
      });
      if (sprintEntries.length > 0) return;

      var workState = classifyIssueWorkState_(item, config);
      if (workState === 'completed') return;

      var developer = String(item.Assignee || item.assignee || item['Assigned Dev'] || '').trim();
      developer = developer && developer.toLowerCase() !== 'unassigned' ? developer : 'Unassigned';

      var pointsValue = item['Story Points'] !== undefined ? item['Story Points'] : item.storyPoints;
      var rawPoints = String(pointsValue == null ? '' : pointsValue).trim();
      var points = parseFloat(rawPoints);
      var isUnestimated = rawPoints === '' || !Number.isFinite(points) || points <= 0;
      if (!Number.isFinite(points)) points = 0;

      var key = developer.toLowerCase();
      var entry = byDeveloper.get(key);
      if (!entry) {
        entry = {
          developer: developer,
          storyPoints: 0,
          completedPoints: 0,
          inProgressPoints: 0,
          notStartedPoints: 0,
          unestimatedCount: 0,
          issues: []
        };
        byDeveloper.set(key, entry);
      }
      entry.storyPoints += points;
      if (workState === 'inProgress') entry.inProgressPoints += points;
      else entry.notStartedPoints += points;
      if (isUnestimated) {
        entry.unestimatedCount++;
        unestimatedIssues++;
      }
      entry.issues.push({
        jiraKey: String(item['Jira #'] || '').trim(),
        summary: String(item.Summary || '').trim(),
        issueType: issueType,
        status: String(item.Status || '').trim(),
        storyPoints: points,
        workState: workState
      });
      totalIssues++;
      totalStoryPoints += points;
    });

    var developers = Array.from(byDeveloper.values()).map(function (entry) {
      entry.issueCount = entry.issues.length;
      return entry;
    }).sort(function (a, b) {
      if (a.developer === 'Unassigned' && b.developer !== 'Unassigned') return 1;
      if (b.developer === 'Unassigned' && a.developer !== 'Unassigned') return -1;
      return b.storyPoints - a.storyPoints || b.issueCount - a.issueCount || a.developer.localeCompare(b.developer);
    });

    return {
      totalIssues: totalIssues,
      totalStoryPoints: totalStoryPoints,
      unestimatedIssues: unestimatedIssues,
      developers: developers
    };
  }

  function analyzePastSprintOpen_(projects, sprints, currentName, futureKeySet, config, now) {
    var currentKey = String(currentName || '').toLowerCase();
    var currentNumberMatch = String(currentName || '').match(/^Sprint\s*(\d+)$/i);
    var currentNumber = currentNumberMatch ? Number(currentNumberMatch[1]) : null;
    var pastClosedStages = new Set(
      ((config && Array.isArray(config.pastSprintClosedStages)) ? config.pastSprintClosedStages : [])
        .map(function (s) { return String(s || '').trim().toLowerCase(); })
        .filter(Boolean)
    );

    var isPastSprintKey = function (key) {
      if (!key || key === currentKey || futureKeySet.has(key)) return false;
      var sprint = sprints.get(key);
      if (!sprint) return false;
      if (sprint.states.has('ACTIVE') || sprint.states.has('FUTURE')) return false;
      if (sprint.states.has('CLOSED') || sprint.states.has('COMPLETE') || sprint.states.has('COMPLETED')) return true;
      if (sprint.endDate && sprint.endDate < now) return true;
      if (currentNumber !== null) {
        var numMatch = sprint.name.match(/^Sprint\s*(\d+)$/i);
        if (numMatch && Number(numMatch[1]) < currentNumber) return true;
      }
      return false;
    };

    var issues = [];
    var totalStoryPoints = 0;
    var unestimatedIssues = 0;

    (projects || []).forEach(function (item) {
      var issueType = String(item['Issue Type'] || '').trim();
      if (issueType.toLowerCase() === 'epic') return;

      var workState = classifyIssueWorkState_(item, config);
      if (workState === 'completed') return;
      var stage = String(item['Project Stage'] || '').trim().toLowerCase();
      if (stage && pastClosedStages.has(stage)) return;

      var sprintNames = [];
      var sprintKeys = [];
      parseSprintEntries_(item.sprint || item.Sprint).forEach(function (entry) {
        var formatted = formatSprint(entry.name);
        var name = formatted === '—' ? String(entry.name || '').trim() : formatted;
        if (!name || name === '—') return;
        var key = name.toLowerCase();
        if (sprintKeys.indexOf(key) === -1) {
          sprintKeys.push(key);
          sprintNames.push(name);
        }
      });
      if (!sprintKeys.length) return;

      var inCurrentOrFuture = sprintKeys.some(function (key) {
        return key === currentKey || futureKeySet.has(key);
      });
      if (inCurrentOrFuture) return;

      var pastNames = sprintNames.filter(function (name) {
        return isPastSprintKey(name.toLowerCase());
      });
      if (!pastNames.length) return;

      var pointsValue = item['Story Points'] !== undefined ? item['Story Points'] : item.storyPoints;
      var rawPoints = String(pointsValue == null ? '' : pointsValue).trim();
      var points = parseFloat(rawPoints);
      var isUnestimated = rawPoints === '' || !Number.isFinite(points) || points <= 0;
      if (!Number.isFinite(points)) points = 0;
      if (isUnestimated) unestimatedIssues++;

      var assignee = String(item.Assignee || item.assignee || item['Assigned Dev'] || '').trim();
      assignee = assignee && assignee.toLowerCase() !== 'unassigned' ? assignee : 'Unassigned';

      totalStoryPoints += points;
      issues.push({
        jiraKey: String(item['Jira #'] || '').trim(),
        summary: String(item.Summary || '').trim(),
        issueType: issueType,
        status: String(item.Status || '').trim(),
        assignee: assignee,
        sprintName: pastNames[pastNames.length - 1],
        storyPoints: points,
        workState: workState
      });
    });

    issues.sort(function (a, b) {
      return b.storyPoints - a.storyPoints || a.sprintName.localeCompare(b.sprintName, undefined, { numeric: true }) || a.jiraKey.localeCompare(b.jiraKey);
    });

    return {
      totalIssues: issues.length,
      totalStoryPoints: totalStoryPoints,
      unestimatedIssues: unestimatedIssues,
      issues: issues
    };
  }

    function analyzeSprintCapacityPlan(projects, sprintItems, sprintStats, capacityEntries, options) {
      var opts = options || {};
      var now = opts.now instanceof Date && !isNaN(opts.now.getTime()) ? opts.now : new Date();
      var sprints = new Map();
      (sprintItems || []).forEach(function (item) {
        parseSprintEntries_(item.sprint || item.Sprint).forEach(function (entry) {
          var name = formatSprint(entry.name);
          if (name === '—') name = entry.name;
          if (!name) return;
          var key = name.toLowerCase();
          var sprint = sprints.get(key);
          if (!sprint) {
            sprint = { name: name, states: new Set(), startDate: null, endDate: null };
            sprints.set(key, sprint);
          }
          if (entry.state) sprint.states.add(entry.state);
          if (entry.startDate && (!sprint.startDate || entry.startDate < sprint.startDate)) {
            sprint.startDate = entry.startDate;
          }
          if (entry.endDate && (!sprint.endDate || entry.endDate > sprint.endDate)) {
            sprint.endDate = entry.endDate;
          }
        });
      });

      var currentName = String((sprintStats && sprintStats.currentSprintName) || 'None');
      var current = sprints.get(currentName.toLowerCase());
      var isClosed = function (sprint) {
        return sprint.states.has('CLOSED') || sprint.states.has('COMPLETE') || sprint.states.has('COMPLETED');
      };
      if (current && !current.states.has('ACTIVE') && !isClosed(current) &&
        (current.states.has('FUTURE') || (current.startDate && current.startDate > now))) {
        currentName = 'None';
        current = null;
      }
      var currentNumber = currentName.match(/^Sprint\s*(\d+)$/i);
      var future = Array.from(sprints.values()).filter(function (sprint) {
        if (sprint.name.toLowerCase() === currentName.toLowerCase() ||
          sprint.states.has('ACTIVE') || isClosed(sprint)) return false;
        if (sprint.states.has('FUTURE')) return true;
        if (sprint.startDate) return sprint.startDate > now;
        var number = sprint.name.match(/^Sprint\s*(\d+)$/i);
        return Boolean(currentNumber && number && Number(number[1]) > Number(currentNumber[1]));
      }).sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      var futureKeySet = new Set(future.map(function (sprint) { return sprint.name.toLowerCase(); }));
      var currentStart = (current && current.startDate) || (sprintStats && sprintStats.currentSprintStart) || null;
      var currentEnd = (current && current.endDate) || (sprintStats && sprintStats.currentSprintEnd) || null;

      return {
        current: analyzeSprintCapacity(projects, currentName, capacityEntries, {
          startDate: currentStart,
          endDate: currentEnd,
          config: opts.config,
          now: now
        }),
        future: future.map(function (sprint) {
          return analyzeSprintCapacity(projects, sprint.name, capacityEntries, {
            startDate: sprint.startDate,
            endDate: sprint.endDate,
            config: opts.config,
            now: now
          });
        }),
        noSprint: analyzeNoSprintCapacity_(projects, opts.config),
        pastOpen: analyzePastSprintOpen_(projects, sprints, currentName, futureKeySet, opts.config, now)
      };
    }
