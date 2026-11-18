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

Use an existing blank workbook (a blank `Sheet1` is fine) or a workbook with only tracker tabs that are blank or already have the exact tracker headers. Setup keeps matching literal cell data and removes the blank starter tab. It rewrites the workbook in the tracker layout and does not preserve custom formatting or other Excel features, so keep a backup. Setup refuses unrelated populated sheets, mismatched headers, and formulas rather than overwriting them. It does not seed passwords or session tokens.

Use the workbook as an app-managed file: keep its name, tabs and headers unchanged, and close Excel before saving changes from the tracker. If you want custom formulas or formatting, use a copy. Writes replace the workbook and check its Microsoft revision before committing; the tracker is intended for one writer, not simultaneous Excel editing or concurrent use across devices. The Excel workbook limit is 20 MiB.

Run `npm test` to check workbook provisioning and persistence with a simulated Microsoft Graph service.
If setup fails, open the browser developer console before selecting **Sign in**. Filter for `[Excel tracker]` to see the requested scope and whether authentication, owner verification, or the workbook operation failed. Authentication errors may include an MSAL error code, an AADSTS code, and a correlation ID; workbook errors may include an HTTP status. A Microsoft permission prompt that remains open has not yet returned an error to the app. Diagnostics do not print account IDs, tokens, file contents, or raw authentication error messages. Do not share tokens, account details, or other sensitive information when sharing logs.

## Deploy to GitHub Pages

In the repository's **Settings > Pages**, set **Build and deployment > Source** to **GitHub Actions**. The **Deploy ProjectHub to GitHub Pages** workflow builds the site and publishes `dist/` on pushes to `main`. You can also run it from the **Actions** tab after switching the source. Publishing directly from the branch skips the build, so the Excel page's JavaScript files return 404.

To enable Microsoft sign-in on Pages, register `https://homefield145345.github.io/JiraTrackerMicrosoft/excel-auth.html` as a **Single-page application** redirect URI in Entra. Set the repository Actions variable `EXCEL_CONFIG` to the same JSON format as `excel-config.json` above, then rerun the workflow. The deployed configuration is public: never include credentials, tokens, or other sensitive values. If the identifiers cannot be published, leave the variable unset and use a private host for the Excel tracker.
