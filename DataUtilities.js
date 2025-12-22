/**
 * @file DataUtilities.js
 * @description Data transformation and validation utilities for CSV import and sheet operations.
 */

// Helper function to decode HTML entities
function decodeHtmlEntities_(str) {
  if (!str || typeof str !== 'string') return str;
  
  // Common HTML entities mapping
  var htmlEntities = {
    '&#39;': "'",      // apostrophe
    '&apos;': "'",     // apostrophe
    '&quot;': '"',     // quote
    '&lt;': '<',       // less than
    '&gt;': '>',       // greater than
    '&amp;': '&',      // ampersand (should be last)
    '&#x27;': "'",     // apostrophe hex
    '&#x22;': '"',     // quote hex
    '&#34;': '"',      // quote decimal
    '&#60;': '<',      // less than decimal
    '&#62;': '>',      // greater than decimal
    '&#38;': '&'       // ampersand decimal
  };
  
  var result = str;
  for (var entity in htmlEntities) {
    var regex = new RegExp(entity, 'g');
    result = result.replace(regex, htmlEntities[entity]);
  }
  
  // Handle numeric HTML entities (&#decimal; and &#xhex;)
  result = result.replace(/&#(\d+);/g, function(match, dec) {
    try {
      var code = parseInt(dec, 10);
      if (code >= 32 && code <= 126) { // printable ASCII range
        return String.fromCharCode(code);
      }
    } catch (e) {}
    return match; // keep original if conversion fails
  });
  
  result = result.replace(/&#x([0-9a-fA-F]+);/g, function(match, hex) {
    try {
      var code = parseInt(hex, 16);
      if (code >= 32 && code <= 126) { // printable ASCII range
        return String.fromCharCode(code);
      }
    } catch (e) {}
    return match; // keep original if conversion fails
  });
  
  return result;
}

// Helper function to normalize values for comparison (handles Excel conversion differences)
function normalizeValue_(value) {
  if (value == null || value === undefined) {
    return '';
  }
  
  // Handle Date objects from sheet data
  if (value instanceof Date) {
    // Format using GMT to ensure we get the UTC representation.
    // Example: Sheet has 10:00 AM (stored as 16:00 UTC).
    // We send "16:00:00".
    // Client treats "16:00:00" as UTC.
    // Client converts 16:00 UTC -> 10:00 AM Local.
    var tz = "GMT";
    var formatted = Utilities.formatDate(value, tz, "MM/dd/yyyy HH:mm:ss");
    logTimestampOperation("Date to String", {
      sourceDate: value.toString(),
      formatted: formatted,
      usedTimeZone: tz,
      scriptTimeZone: Session.getScriptTimeZone(),
      sourceType: "Date object"
    });
    return formatted;
  }
  
  var strValue = String(value);
  
  // Decode HTML entities first (before other normalization)
  strValue = decodeHtmlEntities_(strValue);
  
  // Normalize unicode whitespace & invisible characters
  // Remove BOM / zero-width, convert NBSP to normal space, collapse spaces
  strValue = strValue
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width & BOM
    .replace(/\u00A0/g, ' ') // NBSP to space
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
  
  // Remove wrapping quotes that CSV conversion might add
  if (strValue.startsWith('"') && strValue.endsWith('"')) {
    strValue = strValue.slice(1, -1).trim();
  }
  
  // Date/datetime normalization for string dates
  var datePatterns = [
    /^\d{1,2}\/\d{1,2}\/\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?)?$/i, // MM/dd/yy or MM/dd/yyyy
    /^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/i, // yyyy-MM-dd
    /^\d{1,2}[\/-][A-Za-z]{3}[\/-]\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?)?$/i // dd/MMM/yy or dd-MMM-yy format from Jira
  ];
  var isDateLike = datePatterns.some(function(pattern) { return pattern.test(strValue); });
  if (isDateLike) {
    try {
      var dateStr = strValue;
      var originalDateStr = dateStr;
      var formatIdentified = "unknown";
      
      // Handle Jira format: "30/Apr/25" or "30-Apr-25" -> "Apr 30, 2025"
      if (/^\d{1,2}[\/-][A-Za-z]{3}[\/-]\d{2,4}/.test(dateStr)) {
        formatIdentified = "Jira dd/MMM/yy";
        var parts = dateStr.match(/^(\d{1,2})[\/-]([A-Za-z]{3})[\/-](\d{2,4})(.*)$/);
        if (parts) {
          var day = parts[1];
          var month = parts[2];
          var year = parts[3];
          var timeAndPeriod = parts[4] || '';
          
          // Convert 2-digit year to 4-digit
          if (year.length === 2) {
            year = '20' + year; // assume 2000-2099
          }
          
          dateStr = month + ' ' + day + ', ' + year + timeAndPeriod;
        }
      }
      
      // Convert 2-digit years to 20xx for MM/dd/yy format
      if (/\d{1,2}\/\d{1,2}\/\d{2}(\s|$)/.test(dateStr)) {
        formatIdentified = "MM/dd/yy";
        dateStr = dateStr.replace(/(\/)\s*(\d{2})(?=\s|$)/, function(match, slash, yy) {
          return '/' + '20' + yy; // assume 2000-2099
        });
      } else if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        formatIdentified = "ISO yyyy-MM-dd";
      }
      
      var date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        var isoString = date.toISOString();
        
        logTimestampOperation("String Date to ISO", {
          sourceDate: originalDateStr,
          normalizedDateStr: dateStr,
          formatIdentified: formatIdentified,
          convertedToISO: isoString,
          sourceType: "String"
        });
        
        return isoString;
      }
    } catch (e) { /* keep original */ }
  }
  
  // Number normalization
  if (/^[\d.,]+$/.test(strValue)) {
    try {
      var num = parseFloat(strValue.replace(/,/g, ''));
      if (!isNaN(num)) return String(num);
    } catch (e) { /* keep original */ }
  }
  
  return strValue;
}

// NEW: Strict UTC parser for sheet timestamp strings (avoids double conversion)
function parseUtcTimestampString_(val) {
  try {
    if (val == null) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
    var s = String(val).trim();
    if (!s) return null;

    // If already ISO with timezone info, trust it
    if (/Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
      var dIso = new Date(s);
      return isNaN(dIso.getTime()) ? null : dIso.toISOString();
    }

    // Jira-style: dd/MMM/yy[yy][ HH:mm[:ss] [AM|PM]]
    var jiraRe = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i;
    var jm = s.match(jiraRe);
    if (jm) {
      var day = parseInt(jm[1], 10);
      var monStr = jm[2].toLowerCase();
      var year = parseInt(jm[3], 10);
      if (year < 100) year += 2000;
      var hh = jm[4] ? parseInt(jm[4], 10) : 0;
      var mi = jm[5] ? parseInt(jm[5], 10) : 0;
      var ss = jm[6] ? parseInt(jm[6], 10) : 0;
      var ampm = jm[7] ? jm[7].toUpperCase() : '';
      var months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      var mm = months[monStr];
      if (mm == null) return null;
      if (ampm) {
        if (ampm === 'AM') { if (hh === 12) hh = 0; }
        else if (ampm === 'PM') { if (hh !== 12) hh += 12; }
      }
      var utcMsJ = Date.UTC(year, mm, day, hh, mi, ss);
      return new Date(utcMsJ).toISOString();
    }

    // US slash date: M/D/YYYY[ HH:mm[:ss][ AM|PM]]
    var slashRe = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i;
    var m = s.match(slashRe);
    if (m) {
      var mm = parseInt(m[1], 10);
      var dd = parseInt(m[2], 10);
      var yy = parseInt(m[3], 10);
      if (yy < 100) yy += 2000;
      var h = m[4] ? parseInt(m[4], 10) : 0;
      var mi2 = m[5] ? parseInt(m[5], 10) : 0;
      var ss2 = m[6] ? parseInt(m[6], 10) : 0;
      var ap = m[7] ? m[7].toUpperCase() : '';
      if (ap) {
        if (ap === 'AM') { if (h === 12) h = 0; }
        else if (ap === 'PM') { if (h !== 12) h += 12; }
      }
      var ms = Date.UTC(yy, mm - 1, dd, h, mi2, ss2);
      return new Date(ms).toISOString();
    }

    // Date-only 'YYYY-MM-DD' -> UTC midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-');
      var msOnly = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0);
      return new Date(msOnly).toISOString();
    }

    // 'YYYY-MM-DD HH:mm:ss' without TZ -> treat as UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) {
      var d2 = new Date(s.replace(' ', 'T') + 'Z');
      return isNaN(d2.getTime()) ? null : d2.toISOString();
    }

    // Fallback: attempt as-is; if no TZ info, append Z
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      if (!(/[+-]\d{2}:?\d{2}$|Z$/).test(s)) {
        var dZ = new Date(s + 'Z');
        if (!isNaN(dZ.getTime())) return dZ.toISOString();
      }
      return d.toISOString();
    }
    return null;
  } catch (e) {
    logTimestampOperation('UTC Parser Error', { input: val, error: e.toString() });
    return null;
  }
}

// Field-aware equality to avoid false positives (e.g., Sprint lists)
function equalFieldValues_(header, existingRaw, uploadedRaw) {
  // Normalize first
  var a = normalizeValue_(existingRaw);
  var b = normalizeValue_(uploadedRaw);
  
  if (a === b) return true;
  
  var h = String(header || '').toLowerCase();
  
  // Special handling for sprint columns: compare as normalized sets
  if (h === 'sprint' || h.indexOf('sprint') !== -1) {
    function toSprintSet(val) {
      if (!val) return new Set();
      var parts = String(val)
        .replace(/[\[\]()]/g, ' ') // drop brackets
        .split(/[,;]+/)
        .map(function(s){ return String(s).trim(); })
        .filter(function(s){ return s.length > 0; })
        .map(function(s){ try { return formatSprint ? formatSprint(s) : s; } catch (e) { return s; } })
        .map(function(s){ return s.replace(/\s+/g, ' ').trim(); });
      return new Set(parts);
    }
    var setA = toSprintSet(a);
    var setB = toSprintSet(b);
    if (setA.size !== setB.size) return false;
    for (var v of setA) { if (!setB.has(v)) return false; }
    return true;
  }
  
  // Normalize common name fields by collapsing spaces
  if (h.indexOf('assignee') !== -1 || h.indexOf('pm lead') !== -1) {
    var na = a.replace(/\s+/g, ' ');
    var nb = b.replace(/\s+/g, ' ');
    return na === nb;
  }

  // Special handling for Date-only fields (Target Date, Due Date, Start Date, End Date)
  // Ignore time/timezone differences if the date part (YYYY-MM-DD) matches
  if (h.indexOf('target date') !== -1 || h.indexOf('due date') !== -1 || h.indexOf('start date') !== -1 || h.indexOf('end date') !== -1) {
    // Check if both look like ISO dates (which normalizeValue_ produces)
    var isoDateRegex = /^\d{4}-\d{2}-\d{2}T/;
    if (isoDateRegex.test(a) && isoDateRegex.test(b)) {
      var datePartA = a.split('T')[0];
      var datePartB = b.split('T')[0];
      if (datePartA === datePartB) {
        return true;
      }
    }
  }
  
  // Log differences for debugging only if they're significant
  if (a !== b) {
    console.log('FIELD DIFFERENCE [' + header + ']: "' + a + '" vs "' + b + '"');
  }
  
  // Default string equality after normalization already handled
  return false;
}
