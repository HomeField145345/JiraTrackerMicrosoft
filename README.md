# ProjectHub

The static preview is separate from the private Excel tracker. The Excel tracker reads Jira issues and tasks from a Microsoft 365 workbook, imports Jira CSV files, and saves new tasks back to the workbook. It does not migrate browser data or connect the legacy Apps Script dashboard.

## Set up private Microsoft 365 storage

1. In Microsoft Entra, register a **single-tenant** application. Add a **Single-page application** redirect URI for the hosted `excel-auth.html`, such as `http://localhost:8000/excel-auth.html` for a local test. Do not create a client secret. If your organization manages access through enterprise app assignments, require assignment and assign only the workbook owner.
2. Add the Microsoft Graph **delegated** `Files.ReadWrite` permission for the owner's work OneDrive, or `Files.ReadWrite.All` for a SharePoint document library. Obtain consent as required by your tenant. For a SharePoint destination, set the library drive ID and the existing destination folder's drive-item ID (use the root folder's item ID to store it at the library root). The workbook inherits the folder's permissions: choose a folder only the owner can access. The app does not change SharePoint sharing or permissions.
3. Create `excel-config.json` in the repository root using this format. Fill in the app's client and tenant IDs and the owner's Entra user **Object ID**. Omit `target` to use the root of the owner's work OneDrive.

   ```json
   {
     "clientId": "72bd4fd7-8964-4d83-bf34-adaa27a5d264",
     "tenantId": "e741d71c-c6b6-47b0-803c-0f3b32b07556",
     "ownerObjectId": "701dad25-b25b-42f6-b787-09f78541279f",
     "target": {
       "driveId": "b!f-BDej4rLk6BaMq9gw3hEqGrohYq9idLjYJzrtuGfu7TZUUOHGERTLDwaDKPqanl",
       "folderId": "01423ZPGN6Y2GOVW7725BZO354PWSELRRZ"
     }
   }
   ```

4. To connect an existing workbook, open its folder in OneDrive or SharePoint and copy the exact filename, including `.xlsx`. Use the filename only, not a path or sharing link. For SharePoint, add `target.fileName` alongside the library `driveId` and the target folder's `folderId`. For the owner's work OneDrive, omit both IDs and use `"target": { "fileName": "Team Tracker.xlsx" }` to look in the root. For a OneDrive subfolder, add its relative path: `"target": { "folderPath": "Documents/Tracking", "fileName": "Team Tracker.xlsx" }`. If you omit `fileName` and `folderPath`, the tracker still opens or creates `ProjectHub.xlsx` as before.
5. Run `npm ci` and `npm run build`. Serve `dist/` over HTTPS (or localhost); for example, run `python -m http.server 8000 --bind 127.0.0.1 --directory dist`. Do not serve the sign-in callback with a `Cross-Origin-Opener-Policy` header, which prevents Microsoft's popup callback from communicating with the tracker.
6. Open **Excel tracker**, then select **Sign in**. When `fileName` is set, sign-in does not create or modify any workbook. Use **Open in Excel** to confirm the file, then close it in Excel. If it needs initialization, select **Set up workbook** to add the Jira, manual data, configuration, tasks, users, sessions, and admin configuration tabs and headers.

Use an existing blank workbook (a blank `Sheet1` is fine) or a workbook with only tracker tabs that are blank or already have the exact tracker headers. **Set up workbook** uses Microsoft Graph's Excel worksheet APIs to add missing tabs and write headers into empty tracker sheets in the existing file. It does not create an upload session or replace the workbook. Existing matching data, formatting, and the blank starter tab are retained. Setup refuses unrelated populated sheets, mismatched headers, and formulas rather than overwriting them. It does not seed passwords or session tokens. Setup uses a persistent Excel session, not a transaction; if a request fails after some tabs were added, refresh and retry to finish without duplicating them.

Use the workbook as an app-managed file: keep its name, tabs and headers unchanged, and close Excel before saving changes from the tracker. Although setup preserves existing formatting, later task saves and CSV imports still replace the workbook and do not preserve custom formatting or other Excel features; keep a backup or use a copy for those features. These writes check its Microsoft revision before committing; the tracker is intended for one writer, not simultaneous Excel editing or concurrent use across devices. In-place setup does not enable live sync. The Excel workbook limit is 20 MiB.

## Developer capacity

Admins can open **Developers** to set a non-negative story-point capacity for each distinct JiraData assignee. Leave a value blank if it is unknown; zero is a valid capacity. These are recurring per-sprint values, not sprint-specific history. The **Capacity** view subtracts all assigned current-sprint story points, including completed issues, from capacity; a negative result indicates over-allocation. Epics are excluded, and unestimated issues count as zero points. The existing sprint detection selects an active sprint or, if none is detected, the highest numbered sprint.

Capacity settings are stored in the `DeveloperCapacity` worksheet (`Developer`, `Capacity`, `Notes`, `Updated`). Settings for assignees no longer present in JiraData are retained. For older tracker workbooks without this tab, the tab is added on the next successful tracker save; connecting alone does not require a separate migration. As with other tracker saves, keep a backup if the workbook contains custom formatting.

An HTTP 423 or `nameAlreadyExists` response mentioning an upload can indicate a pending upload session, not just an open Excel window. Failed uploads are cancelled by the tracker to release temporary data. If an earlier version left an upload pending, close Excel and other tracker tabs and wait for Microsoft's session expiration and cleanup before refreshing and retrying. Do not rename or delete the source workbook to bypass the lock. If cancellation fails, the tracker reports it; do not repeatedly submit new uploads while the old session is pending.

Run `npm test` to check workbook provisioning and persistence with a simulated Microsoft Graph service. The storage tests also verify that requests use `fetch` with the worker's global context, as browsers require.
If setup fails, open the browser developer console before selecting **Sign in**. Filter for `[Excel tracker]` to see the requested scope and whether authentication, owner verification, or the workbook operation failed. Authentication errors may include an MSAL error code, an AADSTS code, and a correlation ID; workbook errors may include an HTTP status. A Microsoft permission prompt that remains open has not yet returned an error to the app. Diagnostics do not print account IDs, tokens, file contents, or raw authentication error messages. Do not share tokens, account details, or other sensitive information when sharing logs.

If Microsoft does not return a secure workbook download URL, try downloading the workbook in OneDrive or SharePoint using the same account. If it is blocked there as well, check with your Microsoft 365 administrator. Do not share download URLs from the Network panel; they can grant temporary access to the workbook.

## Deploy to GitHub Pages

In the repository's **Settings > Pages**, set **Build and deployment > Source** to **GitHub Actions**. The **Deploy ProjectHub to GitHub Pages** workflow builds the site and publishes `dist/` on pushes to `main`. You can also run it from the **Actions** tab after switching the source. Publishing directly from the branch skips the build, so the Excel page's JavaScript files return 404.

To enable Microsoft sign-in on Pages, register `https://homefield145345.github.io/JiraTrackerMicrosoft/excel-auth.html` as a **Single-page application** redirect URI in Entra. Set the repository Actions variable `EXCEL_CONFIG` to the same JSON format as `excel-config.json` above, then rerun the workflow. The deployed configuration is public: never include credentials, tokens, or other sensitive values. If the identifiers cannot be published, leave the variable unset and use a private host for the Excel tracker.
