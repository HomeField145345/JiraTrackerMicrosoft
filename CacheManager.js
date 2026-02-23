/**
 * @file CacheManager.js
 * @description Handles all caching operations for the application including chunked cache storage for large datasets.
 */

// --- LOGGING UTILITY (console) ---
// Lightweight logging to the execution logs for timestamp debugging.
function logTimestampOperation(operation, details) {
  try {
    var payload;
    try {
      payload = JSON.stringify(details);
    } catch (serr) {
      payload = String(details);
    }
    if (payload && payload.length > 4000) {
      payload = payload.substring(0, 4000) + '...';
    }
  } catch (e) {
    // swallow logging errors
  }
}

// --- CACHING FUNCTIONS ---
function setCacheInChunks(cache, key, value, expirationInSeconds) {
  var CHUNK_SIZE = 90000;
  var chunks = [];
  for (var i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.substring(i, i + CHUNK_SIZE));
  }
  var cacheData = {};
  for (var j = 0; j < chunks.length; j++) {
    cacheData[key + '_chunk_' + j] = chunks[j];
  }
  cacheData[key + '_chunkCount'] = chunks.length.toString();
  cache.putAll(cacheData, expirationInSeconds);
}

// NEW: retrieve cached value stored in chunks
function getCacheInChunks(cache, key) {
  try {
    var chunkCountStr = cache.get(key + '_chunkCount');
    if (!chunkCountStr) return null;
    var count = parseInt(chunkCountStr, 10);
    if (isNaN(count) || count <= 0) return null;
    var parts = [];
    for (var i = 0; i < count; i++) {
      var part = cache.get(key + '_chunk_' + i);
      if (part == null) return null; // incomplete cache
      parts.push(part);
    }
    return parts.join('');
  } catch (e) {
    return null;
  }
}

// NEW: clear cached project data chunks
function clearProjectCache(username) {
  try {
    var cache = CacheService.getScriptCache();
    // If username is provided, clear that specific cache.
    // If not, we default to 'global' (though usually username should be provided)
    var keyBase = 'project_data_' + (username ? username : 'global');
    
    var chunkCountStr = cache.get(keyBase + '_chunkCount');
    if (!chunkCountStr) return; // nothing to clear
    var count = parseInt(chunkCountStr, 10);
    var keys = [];
    if (!isNaN(count) && count > 0) {
      for (var i = 0; i < count; i++) {
        keys.push(keyBase + '_chunk_' + i);
      }
    }
    keys.push(keyBase + '_chunkCount');
    cache.removeAll(keys);
  } catch (e) {
    // ignore cache clear failures
  }
}
