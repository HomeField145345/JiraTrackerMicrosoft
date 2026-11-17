/**
 * @file TimerManager.js
 * @description Centralized manager for handling setTimeout and setInterval calls to prevent memory leaks
 */

var TimerManager = (function() {
  // Private timer collections
  var timeouts = {};
  var intervals = {};
  var timerIdCounter = 0;
  
  return {
    /**
     * Sets a timeout and tracks it for later cleanup
     * @param {Function} callback - Function to execute after delay
     * @param {number} delay - Delay in milliseconds
     * @param {string} [name] - Optional name to identify this timer
     * @returns {string} Unique ID for this timer
     */
    setTimeout: function(callback, delay, name) {
      var id = name || 'timeout_' + (++timerIdCounter);
      
      timeouts[id] = window.setTimeout(function() {
        // Auto-remove reference when timer executes
        delete timeouts[id];
        callback();
      }, delay);
      
      return id;
    },
    
    /**
     * Sets an interval and tracks it for later cleanup
     * @param {Function} callback - Function to execute repeatedly
     * @param {number} delay - Delay between executions in milliseconds
     * @param {string} [name] - Optional name to identify this timer
     * @returns {string} Unique ID for this timer
     */
    setInterval: function(callback, delay, name) {
      var id = name || 'interval_' + (++timerIdCounter);
      intervals[id] = window.setInterval(callback, delay);
      return id;
    },
    
    /**
     * Clears a specific timeout by ID
     * @param {string} id - Timer ID to clear
     */
    clearTimeout: function(id) {
      if (timeouts[id]) {
        window.clearTimeout(timeouts[id]);
        delete timeouts[id];
      }
    },
    
    /**
     * Clears a specific interval by ID
     * @param {string} id - Timer ID to clear
     */
    clearInterval: function(id) {
      if (intervals[id]) {
        window.clearInterval(intervals[id]);
        delete intervals[id];
      }
    },
    
    /**
     * Clears all tracked timeouts
     */
    clearAllTimeouts: function() {
      for (var id in timeouts) {
        if (timeouts.hasOwnProperty(id)) {
          window.clearTimeout(timeouts[id]);
        }
      }
      timeouts = {};
    },
    
    /**
     * Clears all tracked intervals
     */
    clearAllIntervals: function() {
      for (var id in intervals) {
        if (intervals.hasOwnProperty(id)) {
          window.clearInterval(intervals[id]);
        }
      }
      intervals = {};
    },
    
    /**
     * Clears all tracked timers (both timeouts and intervals)
     */
    clearAll: function() {
      this.clearAllTimeouts();
      this.clearAllIntervals();
    }
  };
})();
