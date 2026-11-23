/**
 * @file dashboard-init.js
 * @description Deferred asset loader, user profile accessor, and Configuration modal wiring.
 */

window.__deferredDashboardAssets = window.__deferredDashboardAssets || {};

window.getStoredProjectHubUser = function () {
  return (window.ProjectHubExcel && window.ProjectHubExcel.user()) || {};
};

function loadDeferredDashboardAsset(filename) {
  if (!/^(gantt|Config)\.js$/.test(filename)) {
    return Promise.reject(new Error('Asset not allowed: ' + filename));
  }
  if (!window.__deferredDashboardAssets[filename]) {
    window.__deferredDashboardAssets[filename] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = './src/client/' + filename + (window.__PROJECTHUB_ASSET_VERSION ? '?v=' + window.__PROJECTHUB_ASSET_VERSION : '?v=20261123');
      script.onload = function () { resolve(); };
      script.onerror = function () {
        delete window.__deferredDashboardAssets[filename];
        reject(new Error('Could not load ' + filename + '.'));
      };
      document.body.appendChild(script);
    });
  }
  return window.__deferredDashboardAssets[filename];
}

document.addEventListener('DOMContentLoaded', function () {
  var configBtn = document.getElementById('configBtn');
  var configModal = document.getElementById('config-modal');
  var closeConfigBtn = document.getElementById('closeConfigBtn');
  var closeConfigBtnFooter = document.getElementById('closeConfigBtnFooter');
  var overlay = document.getElementById('config-modal-overlay');

  function openConfig() {
    if (configModal) configModal.classList.remove('hidden');
    loadDeferredDashboardAsset('Config.js')
      .then(function () {
        if (typeof loadConfigData === 'function') {
          loadConfigData();
        }
      })
      .catch(function (error) {
        alert('Failed to load configuration tools: ' + (error && error.message ? error.message : error));
      });
  }

  function closeConfig() {
    if (configModal) configModal.classList.add('hidden');
  }

  if (configBtn) {
    configBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openConfig();
    });
  }

  if (closeConfigBtn) closeConfigBtn.addEventListener('click', closeConfig);
  if (closeConfigBtnFooter) closeConfigBtnFooter.addEventListener('click', closeConfig);
  if (overlay) overlay.addEventListener('click', closeConfig);

  var developerCapacityForm = document.getElementById('developer-capacity-form');
  if (developerCapacityForm) {
    developerCapacityForm.addEventListener('submit', function (event) {
      if (typeof saveDeveloperCapacity === 'function') {
        saveDeveloperCapacity(event);
      }
    });
  }
});
