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
    // Preserve the face-value time as seen in the sheet's timezone (script timezone).
    // Example: cell shows 06/12/2025 18:16 (entered as UTC); we emit "06/12/2025 18:16:00".
    // The client treats this string as UTC and renders CST/CDT correctly.
    var tz = Platform.timeZone();
    var formatted = Platform.formatDate(value, tz, "MM/dd/yyyy HH:mm:ss");
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
    console.log('[DATE COMPARE] Field: "' + header + '"');
    console.log('  Existing raw: "' + existingRaw + '" (type: ' + typeof existingRaw + ')');
    console.log('  Uploaded raw: "' + uploadedRaw + '" (type: ' + typeof uploadedRaw + ')');
    console.log('  Normalized A: "' + a + '"');
    console.log('  Normalized B: "' + b + '"');
    
    // Check if both look like ISO dates (which normalizeValue_ produces)
    var isoDateRegex = /^\d{4}-\d{2}-\d{2}T/;
    if (isoDateRegex.test(a) && isoDateRegex.test(b)) {
      var datePartA = a.split('T')[0];
      var datePartB = b.split('T')[0];
      console.log('  ISO Date Part A: "' + datePartA + '"');
      console.log('  ISO Date Part B: "' + datePartB + '"');
      if (datePartA === datePartB) {
        console.log('  RESULT: EQUAL (by ISO date part)');
        return true;
      }
    } else {
      console.log('  Not both ISO dates (A matches: ' + isoDateRegex.test(a) + ', B matches: ' + isoDateRegex.test(b) + ')');
    }
    
    // Try parsing both as dates and comparing just the date part
    var dateA = new Date(a);
    var dateB = new Date(b);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      var yearMatch = dateA.getFullYear() === dateB.getFullYear();
      var monthMatch = dateA.getMonth() === dateB.getMonth();
      var dayMatch = dateA.getDate() === dateB.getDate();
      if (yearMatch && monthMatch && dayMatch) {
        return true;
      }
    }
    
    return false;
  }
  
  // Special handling for timestamp fields (Updated, Created, Resolved)
  // Compare by date and time, ignoring seconds and milliseconds
  if (h.indexOf('updated') !== -1 || h.indexOf('created') !== -1 || h.indexOf('resolved') !== -1) {
    console.log('[TIMESTAMP COMPARE] Field: "' + header + '"');
    console.log('  Existing raw: "' + existingRaw + '" (type: ' + typeof existingRaw + ')');
    console.log('  Uploaded raw: "' + uploadedRaw + '" (type: ' + typeof uploadedRaw + ')');
    console.log('  Normalized A: "' + a + '"');
    console.log('  Normalized B: "' + b + '"');
    
    // Try to parse both as dates and compare by minute precision
    var dateA = new Date(a);
    var dateB = new Date(b);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      console.log('  Parsed Date A: ' + dateA.toISOString());
      console.log('  Parsed Date B: ' + dateB.toISOString());
      
      // Compare year, month, day, hour, minute only (ignore seconds)
      var matchYear = dateA.getFullYear() === dateB.getFullYear();
      var matchMonth = dateA.getMonth() === dateB.getMonth();
      var matchDay = dateA.getDate() === dateB.getDate();
      var matchHour = dateA.getHours() === dateB.getHours();
      var matchMinute = dateA.getMinutes() === dateB.getMinutes();
      
      console.log('  Match components: year=' + matchYear + ', month=' + matchMonth + ', day=' + matchDay + ', hour=' + matchHour + ', min=' + matchMinute);
      
      if (matchYear && matchMonth && matchDay && matchHour && matchMinute) {
        console.log('  RESULT: EQUAL (by date comparison)');
        return true;
      }
    } else {
      console.log('  Could not parse as dates (A valid: ' + !isNaN(dateA.getTime()) + ', B valid: ' + !isNaN(dateB.getTime()) + ')');
    }
    
    // Also try direct string comparison on formatted values (MM/dd/yyyy HH:mm:ss)
    // Strip seconds if present for comparison
    var stripSeconds = function(str) {
      // Match MM/dd/yyyy HH:mm:ss and return MM/dd/yyyy HH:mm
      var match = String(str).match(/^(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})/);
      return match ? match[1] : str;
    };
    
    var strippedA = stripSeconds(a);
    var strippedB = stripSeconds(b);
    console.log('  Stripped A: "' + strippedA + '"');
    console.log('  Stripped B: "' + strippedB + '"');
    
    if (strippedA === strippedB) {
      console.log('  RESULT: EQUAL (by string comparison)');
      return true;
    }
    
    console.log('  RESULT: NOT EQUAL');
  }
  
  // Log differences for debugging only if they're significant
  if (a !== b) {
    console.log('FIELD DIFFERENCE [' + header + ']: "' + a + '" vs "' + b + '"');
  }
  
  // Default string equality after normalization already handled
  return false;
}
