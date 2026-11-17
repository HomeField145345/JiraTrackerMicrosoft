/**
 * @file worker.js
 * @description Web Worker entry point that hosts the server modules in the browser.
 * The page talks to it through src/client/ProjectHubApi.js.
 */

importScripts('manifest.js');
importScripts.apply(self, SERVER_SCRIPTS);
importScripts('platform/IndexedDbStorage.js');

ProjectHubServer.configure(new IndexedDbStorage('projecthub'));

self.onmessage = function (event) {
  var message = event.data || {};
  ProjectHubServer.call(message.method, message.args).then(function (result) {
    self.postMessage({ id: message.id, ok: true, result: result });
  }, function (error) {
    self.postMessage({
      id: message.id,
      ok: false,
      error: {
        name: (error && error.name) || 'Error',
        message: (error && error.message) ? error.message : String(error)
      }
    });
  });
};
