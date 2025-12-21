/**
 * @file SprintUtilities.js
 * @description Sprint parsing and formatting utilities for project management.
 */

// --- SPRINT LOGIC HELPER ---
function parseSprintDates(sprintString) {
  try {
    var dateMatch = sprintString.match(/(\d{1,2}\.\d{1,2})\s*-\s*(\d{1,2}\.\d{1,2})/);
    if (!dateMatch) return { start: null, end: null };
    var today = new Date();
    var currentYear = today.getFullYear();
    var startDateParts = dateMatch[1].split('.');
    var endDateParts = dateMatch[2].split('.');
    var startDate = new Date(currentYear, parseInt(startDateParts[0]) - 1, parseInt(startDateParts[1]));
    var endDate = new Date(currentYear, parseInt(endDateParts[0]) - 1, parseInt(endDateParts[1]));
    if (startDate > endDate) endDate.setFullYear(currentYear + 1);
    endDate.setHours(23, 59, 59, 999);
    return { start: startDate, end: endDate };
  } catch (e) {
    return { start: null, end: null };
  }
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
  var stats = {};
  var now = new Date();

  items.forEach(function(item) {
    var sprint = item.sprint || item.Sprint;
    if (!sprint) return;
    
    // Normalize sprint name
    var sprintName = formatSprint(sprint);
    
    if (!stats[sprintName]) {
      var dates = parseSprintDates(sprint);
      stats[sprintName] = {
        name: sprintName,
        startDate: dates.start,
        endDate: dates.end,
        isActive: dates.start && dates.end && now >= dates.start && now <= dates.end,
        totalItems: 0,
        completedItems: 0,
        totalPoints: 0,
        completedPoints: 0,
        items: []
      };
    }
    
    var s = stats[sprintName];
    s.totalItems++;
    s.items.push(item);
    
    var points = parseFloat(item['Story Points'] || item.storyPoints || 0);
    if (!isNaN(points)) {
      s.totalPoints += points;
    }
    
    // Check completion (simplified logic, ideally should use config)
    // Checking for common "Done" statuses
    var status = (item.Status || item.status || '').toLowerCase();
    var stage = (item['Project Stage'] || item.projectStage || '').toLowerCase();
    
    var isClosed = 
        status === 'done' || 
        status === 'closed' || 
        status === 'resolved' || 
        status === 'fixed' ||
        stage === 'production' ||
        stage === 'in production' ||
        stage === 'canceled';
        
    if (isClosed) {
      s.completedItems++;
      if (!isNaN(points)) {
        s.completedPoints += points;
      }
    }
  });
  
  return stats;
}
