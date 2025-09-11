/**
 * @file EventManager.js
 * @description Centralized manager for handling event listeners to prevent memory leaks
 * @deprecated Not used directly by the web UI. Use the client include file `EventManager.js.html` via Apps Script include.
 */

var EventManager = (function() {
  // Private collection of events for tracking
  var listeners = {};
  var listenerIdCounter = 0;
  
  return {
    /**
     * Adds an event listener and tracks it for later cleanup
     * @param {Element|Window|Document} element - The DOM element to attach the listener to
     * @param {string} eventType - The event type (e.g., 'click', 'change')
     * @param {Function} callback - The event handler function
     * @param {boolean|Object} [options] - Event listener options or useCapture boolean
     * @param {string} [name] - Optional name to identify this listener
     * @returns {string} Unique ID for this listener
     */
    addEventListener: function(element, eventType, callback, options, name) {
      if (!element || !eventType || !callback) {
        console.error('Invalid arguments for addEventListener');
        return null;
      }
      
      var id = name || 'listener_' + (++listenerIdCounter);
      
      element.addEventListener(eventType, callback, options);
      
      listeners[id] = {
        element: element,
        eventType: eventType,
        callback: callback,
        options: options
      };
      
      return id;
    },
    
    /**
     * Removes a specific event listener by ID
     * @param {string} id - Listener ID to remove
     */
    removeEventListener: function(id) {
      if (listeners[id]) {
        var listener = listeners[id];
        listener.element.removeEventListener(
          listener.eventType,
          listener.callback,
          listener.options
        );
        delete listeners[id];
      }
    },
    
    /**
     * Removes all event listeners from a specific element
     * @param {Element} element - The element to clean up
     */
    removeAllEventListenersFromElement: function(element) {
      for (var id in listeners) {
        if (listeners.hasOwnProperty(id) && listeners[id].element === element) {
          this.removeEventListener(id);
        }
      }
    },
    
    /**
     * Removes all tracked event listeners
     */
    removeAllEventListeners: function() {
      for (var id in listeners) {
        if (listeners.hasOwnProperty(id)) {
          this.removeEventListener(id);
        }
      }
    },
    
    /**
     * Gets count of active listeners for debugging
     * @returns {number} Count of active listeners
     */
    getActiveListenerCount: function() {
      return Object.keys(listeners).length;
    }
  };
})();
