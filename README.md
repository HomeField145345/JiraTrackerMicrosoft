# ProjectHub

The static preview is separate from the private Excel tracker. The Excel tracker reads Jira issues and tasks from `ProjectHub.xlsx`, imports Jira CSV files, and saves new tasks back to the workbook. It does not migrate browser data or connect the legacy Apps Script dashboard.

## Set up private Microsoft 365 storage

1. In Microsoft Entra, register a **single-tenant** application. Add a **Single-page application** redirect URI for the hosted `excel-auth.html`, such as `http://localhost:8000/excel-auth.html` for a local test. Do not create a client secret. If your organization manages access through enterprise app assignments, require assignment and assign only the workbook owner.
2. Add the Microsoft Graph **delegated** `Files.ReadWrite` permission for the owner's work OneDrive, or `Files.ReadWrite.All` for a SharePoint document library. Obtain consent as required by your tenant. For a SharePoint destination, set the library drive ID and the existing destination folder's drive-item ID (use the root folder's item ID to store it at the library root). The workbook inherits the folder's permissions: choose a folder only the owner can access. The app does not change SharePoint sharing or permissions.
3. Create `excel-config.json` in the repository root using this format. Fill in the app's client and tenant IDs and the owner's Entra user **Object ID**. Omit `target` to use the root of the owner's work OneDrive.

   ```json
   {
     "clientId": "APPLICATION-CLIENT-ID",
     "tenantId": "DIRECTORY-TENANT-ID",
     "ownerObjectId": "ENTRA-USER-OBJECT-ID",
     "target": {
       "driveId": "SHAREPOINT-LIBRARY-DRIVE-ID",
       "folderId": "DESTINATION-FOLDER-ITEM-ID"
     }
   }
   ```

4. Run `npm ci` and `npm run build`. Serve `dist/` over HTTPS (or localhost); for example, run `python -m http.server 8000 --bind 127.0.0.1 --directory dist`. Do not serve the sign-in callback with a `Cross-Origin-Opener-Policy` header, which prevents Microsoft's popup callback from communicating with the tracker.
5. Open **Excel tracker**, then select **Sign in**. On the first connection it creates the workbook with the Jira, manual data, configuration, tasks, users, sessions, and admin configuration tabs and their required headers. It does not put passwords or session tokens in the workbook. Subsequent connections load the existing file. An unrelated workbook of the same name is not overwritten.

Use the workbook as an app-managed file: keep its name, tabs and headers unchanged, and close Excel before saving changes from the tracker. If you want custom formulas or formatting, use a copy. Writes replace the workbook and check its Microsoft revision before committing; the tracker is intended for one writer, not simultaneous Excel editing or concurrent use across devices. The Excel workbook limit is 20 MiB.

Run `npm test` to check workbook provisioning and persistence with a simulated Microsoft Graph service.
