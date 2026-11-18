import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

if (location.hash) {
  broadcastResponseToMainFrame().catch(() => {
    document.body.textContent = 'Microsoft sign-in could not finish. Close this window and try again.';
  });
}
