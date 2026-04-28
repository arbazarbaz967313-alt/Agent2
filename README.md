# TikTok Finder Backend

Agent 2 backend for your AI Automation System. This FastAPI service searches TikTok content, returns realistic mock data when live TikTok access is unavailable, and prepares selected videos for Agent 3.

## Features

- FastAPI API for TikTok content search
- CORS enabled for GitHub Pages frontend
- In-memory rate limiting
- In-memory request caching
- Live TikTok attempt using `TikTokApi`
- Safe mock fallback when session cookie or live scraping is unavailable
- Trending hashtag endpoint
- Agent 3 batch preparation endpoint

## Files

- `main.py`
- `requirements.txt`
- `.env.example`

## Render Deployment

### 1) Create the private GitHub repo

Upload the contents of this folder into a repo named something like:

` tiktok-finder-backend `

### 2) Create a new Render Web Service

Use these values:

- **Environment**: Python 3
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

Render recommends a Uvicorn start command with dynamic port binding for FastAPI services [Render](https://render.com/templates/fastapi)

### 3) Add environment variables

In Render dashboard → Environment:

- `TIKTOK_SESSION_ID` = your TikTok session cookie (optional but recommended)
- `USE_MOCK_DATA` = `false`

If you want guaranteed testing without TikTok access, set:

- `USE_MOCK_DATA` = `true`

### 4) Deploy

After deploy, you will get a URL like:

`https://tiktok-finder.onrender.com`

Use that URL inside the frontend backend URL input.

## API Endpoints

### `GET /api/health`
Returns backend status and whether live or mock mode is active.

### `POST /api/search-tiktok`
Search request body example:

```json
{
  "keywords": "science, facts, amazing",
  "time_filter": "7d",
  "sort_by": "most_viral",
  "min_views": 50000,
  "count": 12,
  "language": "any",
  "under_60s": false
}
```

Optional request header for live mode override:

`x-tiktok-session-id: your_session_cookie_here`

### `POST /api/get-trending-hashtags`
Body example:

```json
{
  "niche": "science facts",
  "language": "any"
}
```

### `POST /api/prepare-for-agent3`
Saves selected videos and returns a `batch_id`.

## Notes about live TikTok access

`TikTokApi` live behavior can be brittle because TikTok frequently changes anti-bot protections and session handling. Community discussions show session-related tokens and scraping behavior can change often, which is why this backend is designed to fail gracefully into mock mode when live access is unavailable [GitHub Discussion](https://github.com/davidteather/TikTok-Api/discussions/1101)

## Local Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Open:

- Swagger docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/api/health`

## Recommended production behavior

- Keep mock fallback enabled through code for reliability
- Add your session cookie when you want to attempt live TikTok results
- Connect frontend only to your deployed Render URL
