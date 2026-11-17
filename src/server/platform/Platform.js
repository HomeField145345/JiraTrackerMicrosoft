/**
 * @file Platform.js
 * @description Runtime services used by the server modules (IDs, dates, CSV, cache, locks).
 * Replaces Utilities, Session, CacheService, and LockService from Google Apps Script.
 */

var Platform = (function () {
  var cacheEntries = new Map();
  var DEFAULT_CACHE_TTL_SECONDS = 600;

  function uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function (b) { return (b + 256).toString(16).slice(1); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function timeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }

  function getDateParts_(date, tz) {
    var formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || timeZone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    var parts = {};
    formatter.formatToParts(date).forEach(function (part) {
      if (part.type !== 'literal') parts[part.type] = part.value;
    });
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
      second: Number(parts.second),
      millisecond: date.getMilliseconds()
    };
  }

  function pad_(value, length) {
    var text = String(value);
    while (text.length < length) text = '0' + text;
    return text;
  }

  /**
   * Formats a date using the Java SimpleDateFormat subset used by this app
   * (yyyy, yy, MM, M, dd, d, HH, H, hh, h, mm, m, ss, s, SSS, a, and quoted literals).
   */
  function formatDate(date, tz, pattern) {
    var value = date instanceof Date ? date : new Date(date);
    if (isNaN(value.getTime())) throw new Error('Invalid date value.');
    var p = getDateParts_(value, tz);
    var hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
    return String(pattern).replace(/''|'([^']*)'|yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|a/g, function (token, literal) {
      if (token === "''") return "'";
      if (literal !== undefined) return literal;
      switch (token) {
        case 'yyyy': return pad_(p.year, 4);
        case 'yy': return pad_(p.year % 100, 2);
        case 'MM': return pad_(p.month, 2);
        case 'M': return String(p.month);
        case 'dd': return pad_(p.day, 2);
        case 'd': return String(p.day);
        case 'HH': return pad_(p.hour, 2);
        case 'H': return String(p.hour);
        case 'hh': return pad_(hour12, 2);
        case 'h': return String(hour12);
        case 'mm': return pad_(p.minute, 2);
        case 'm': return String(p.minute);
        case 'ss': return pad_(p.second, 2);
        case 's': return String(p.second);
        case 'SSS': return pad_(p.millisecond, 3);
        case 'a': return p.hour < 12 ? 'AM' : 'PM';
        default: return token;
      }
    });
  }

  /**
   * Parses RFC 4180 CSV text, including quoted delimiters, escaped quotes, and embedded newlines.
   * @returns {string[][]}
   */
  function parseCsv(text, delimiter) {
    var source = String(text || '');
    var separator = delimiter || ',';
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var fieldStarted = false;

    for (var i = 0; i < source.length; i++) {
      var ch = source.charAt(i);

      if (inQuotes) {
        if (ch === '"') {
          if (source.charAt(i + 1) === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"' && field === '') {
        inQuotes = true;
        fieldStarted = true;
      } else if (ch === separator) {
        row.push(field);
        field = '';
        fieldStarted = false;
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && source.charAt(i + 1) === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        fieldStarted = false;
      } else {
        field += ch;
        fieldStarted = true;
      }
    }

    if (fieldStarted || field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function decodeBase64Text(base64Data) {
    var binary = atob(String(base64Data || ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  var cache = {
    get: function (key) {
      var entry = cacheEntries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        cacheEntries.delete(key);
        return null;
      }
      return entry.value;
    },
    put: function (key, value, expirationInSeconds) {
      var ttl = Number(expirationInSeconds) > 0 ? Number(expirationInSeconds) : DEFAULT_CACHE_TTL_SECONDS;
      cacheEntries.set(key, { value: String(value), expiresAt: Date.now() + ttl * 1000 });
    },
    putAll: function (values, expirationInSeconds) {
      Object.keys(values || {}).forEach(function (key) {
        cache.put(key, values[key], expirationInSeconds);
      });
    },
    remove: function (key) {
      cacheEntries.delete(key);
    },
    removeAll: function (keys) {
      (keys || []).forEach(function (key) { cacheEntries.delete(key); });
    },
    clear: function () {
      cacheEntries.clear();
    }
  };

  // Server calls run one at a time inside ProjectHubServer's cross-tab lock,
  // so the in-call lock only has to preserve the original lock API.
  var lock = {
    waitLock: function () {},
    tryLock: function () { return true; },
    hasLock: function () { return true; },
    releaseLock: function () {}
  };

  return {
    uuid: uuid,
    timeZone: timeZone,
    formatDate: formatDate,
    parseCsv: parseCsv,
    decodeBase64Text: decodeBase64Text,
    cache: function () { return cache; },
    lock: function () { return lock; }
  };
}());
