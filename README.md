# TikTok Finder Frontend

Pure HTML, CSS, and JavaScript frontend for Agent 2 of your AI Automation System.

## Files

- `index.html`
- `style.css`
- `script.js`

No React, no Vue, no Angular, no npm, no build tools.

## Deploy on GitHub Pages

1. Create a public GitHub repo named something like `tiktok-finder-frontend`
2. Upload these 3 frontend files and this README
3. Open **Settings → Pages**
4. Set source to your main branch root folder
5. Save and wait for GitHub Pages URL

## How to use

1. Open your GitHub Pages URL
2. Paste your Render backend URL in the **Backend URL** field
3. Click **Connect**
4. Optionally add your TikTok session cookie for live data attempts
5. Choose topics and filters
6. Click **Search**
7. Select videos and click **Send to Agent 3**

## Local use

Because this is fully static, you can also double-click `index.html` and open it directly in the browser.

## Saved browser data

The frontend stores these items in `localStorage`:

- `backendUrl`
- `tiktokSession`
- `systemSessionId`
- `selectedVideos`
- `searchHistory`
- `filters`
- `agent3BatchId`

## Notes

- If the backend is unreachable, the UI will show offline status.
- If the backend returns mock data, the frontend displays a warning banner.
- The app is mobile responsive and GitHub Pages compatible.
