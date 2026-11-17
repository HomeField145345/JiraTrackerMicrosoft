/**
 * @file CacheManager.js
 * @description Handles all caching operations for the application including chunked cache storage for large datasets.
 */

var USERS_CACHE_KEY = 'users_list_v1';
var USERS_CACHE_TTL_SECONDS = 300;
var CONFIG_CACHE_KEY = 'config_data_v1';
var CONFIG_CACHE_TTL_SECONDS = 600;

// Timestamp diagnostics helper used by data read/merge flows.
function logTimestampOperation(operation, details) {
  try {
    var payload = '';
    try {
      payload = JSON.stringify(details || {});
    } catch (serializeError) {
      payload = String(details);
    }
    if (payload && payload.length > 4000) {
      payload = payload.substring(0, 4000) + '...';
    }
    Logger.log('[Timestamp] %s | %s', operation || 'unknown', payload || '');
  } catch (e) {
    // Never fail runtime code because diagnostics logging fails.
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

function clearProjectCacheByKeyBase_(cache, keyBase) {
  var chunkCountStr = cache.get(keyBase + '_chunkCount');
  if (!chunkCountStr) return;

  var count = parseInt(chunkCountStr, 10);
  var keys = [];
  if (!isNaN(count) && count > 0) {
    for (var i = 0; i < count; i++) {
      keys.push(keyBase + '_chunk_' + i);
    }
  }
  keys.push(keyBase + '_chunkCount');
  cache.removeAll(keys);
}

// NEW: clear cached project data chunks
function clearProjectCache(username) {
  try {
    var cache = CacheService.getScriptCache();
    if (username) {
      clearProjectCacheByKeyBase_(cache, 'project_data_' + username);
      return;
    }

    // Broad clear: clear legacy global cache plus all known user-scoped caches.
    clearProjectCacheByKeyBase_(cache, 'project_data_global');

    var users = [];
    try {
      if (typeof getUsers === 'function') {
        users = getUsers() || [];
      }
    } catch (eUsers) {
      users = [];
    }

    for (var u = 0; u < users.length; u++) {
      var uname = users[u] && users[u].username ? String(users[u].username).trim() : '';
      if (uname) {
        clearProjectCacheByKeyBase_(cache, 'project_data_' + uname);
      }
    }
  } catch (e) {
    // ignore cache clear failures
  }
}

function clearUsersCache() {
  try {
    CacheService.getScriptCache().remove(USERS_CACHE_KEY);
  } catch (e) {
    // ignore cache clear failures
  }
}

function clearConfigCache() {
  try {
    CacheService.getScriptCache().remove(CONFIG_CACHE_KEY);
  } catch (e) {
    // ignore cache clear failures
  }
}
