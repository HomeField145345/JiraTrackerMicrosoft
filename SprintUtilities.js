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
