import asyncio
import hashlib
import json
import os
import random
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from TikTokApi import TikTokApi  # type: ignore
except Exception:
    TikTokApi = None


app = FastAPI(title="TikTok Finder Backend", version="1.0.0")

# Yeh CORS development aur GitHub Pages frontend dono ko allow karta hai.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

USE_MOCK_DATA = os.getenv("USE_MOCK_DATA", "false").lower() == "true"
ENV_TIKTOK_SESSION_ID = os.getenv("TIKTOK_SESSION_ID", "")
CACHE_TTL_SECONDS = 300
RATE_LIMIT_PER_MINUTE = 45
BATCH_STORE_TTL_SECONDS = 60 * 60 * 24

request_cache: Dict[str, Dict[str, Any]] = {}
rate_limit_store: Dict[str, deque] = defaultdict(deque)
batch_store: Dict[str, Dict[str, Any]] = {}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def cleanup_cache() -> None:
    # Yeh expired cache items hataata hai taaki memory control mein rahe.
    current_time = time.time()
    expired_keys = [key for key, value in request_cache.items() if value["expires_at"] < current_time]
    for key in expired_keys:
        request_cache.pop(key, None)


def cleanup_batches() -> None:
    # Yeh purane batch data ko auto-clean karta hai.
    current_time = time.time()
    expired_keys = [key for key, value in batch_store.items() if value["expires_at"] < current_time]
    for key in expired_keys:
        batch_store.pop(key, None)


def get_cache_key(prefix: str, payload: Dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return f"{prefix}:{hashlib.sha256(serialized.encode('utf-8')).hexdigest()}"


def get_from_cache(cache_key: str) -> Optional[Dict[str, Any]]:
    cleanup_cache()
    cached = request_cache.get(cache_key)
    if not cached:
        return None
    return cached["value"]


def set_cache(cache_key: str, value: Dict[str, Any]) -> None:
    request_cache[cache_key] = {
        "value": value,
        "expires_at": time.time() + CACHE_TTL_SECONDS,
    }


def format_compact_number(value: int) -> str:
    if value >= 1_000_000_000:
        return f"{value / 1_000_000_000:.1f}B"
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{value / 1_000:.1f}K"
    return str(value)


def humanize_time_ago(posted_at_iso: str) -> str:
    try:
        posted_at = datetime.fromisoformat(posted_at_iso.replace("Z", "+00:00"))
    except Exception:
        return "recently"

    delta = now_utc() - posted_at
    if delta.total_seconds() < 3600:
        hours = max(1, int(delta.total_seconds() // 3600) or 1)
        if hours <= 1:
            minutes = max(1, int(delta.total_seconds() // 60) or 1)
            return f"{minutes} minutes ago"
        return f"{hours} hours ago"
    if delta.days < 1:
        hours = max(1, int(delta.total_seconds() // 3600))
        return f"{hours} hours ago"
    if delta.days == 1:
        return "1 day ago"
    return f"{delta.days} days ago"


def format_duration(seconds: int) -> str:
    minutes, remaining = divmod(max(seconds, 0), 60)
    return f"{minutes}:{remaining:02d}"


def first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def safe_get(data: Any, path: List[Any], default: Any = None) -> Any:
    current = data
    try:
        for key in path:
            if isinstance(current, list) and isinstance(key, int):
                current = current[key]
            elif isinstance(current, dict):
                current = current.get(key)
            else:
                return default
        return default if current is None else current
    except Exception:
        return default


def calculate_engagement_rate(stats: Dict[str, int]) -> float:
    views = max(int(stats.get("views", 0)), 1)
    total_actions = int(stats.get("likes", 0)) + int(stats.get("comments", 0)) + int(stats.get("shares", 0))
    return round((total_actions / views) * 100, 2)


def extract_hashtags(text: str) -> List[str]:
    hashtags = []
    for token in text.split():
        if token.startswith("#"):
            cleaned = "#" + "".join(ch for ch in token[1:] if ch.isalnum() or ch == "_")
            if len(cleaned) > 1:
                hashtags.append(cleaned.lower())
    seen = set()
    unique = []
    for tag in hashtags:
        if tag not in seen:
            unique.append(tag)
            seen.add(tag)
    return unique


def parse_keywords(keyword_string: str) -> List[str]:
    items = []
    for raw in keyword_string.replace("|", ",").split(","):
        cleaned = raw.strip()
        if cleaned:
            items.append(cleaned)
    return items or [keyword_string.strip() or "viral content"]


class SearchTikTokRequest(BaseModel):
    keywords: str = Field(..., min_length=1)
    time_filter: str = Field(default="7d")
    sort_by: str = Field(default="most_viral")
    min_views: int = Field(default=50000, ge=0)
    count: int = Field(default=12, ge=1, le=50)
    language: str = Field(default="any")
    under_60s: bool = Field(default=False)


class TrendingHashtagsRequest(BaseModel):
    niche: str = Field(..., min_length=1)
    language: str = Field(default="any")


class VideoItem(BaseModel):
    id: str
    url: str
    title: str
    thumbnail: str
    creator_username: str
    music_name: str
    duration_seconds: int
    duration_label: str
    views: int
    views_label: str
    likes: int
    likes_label: str
    comments: int
    comments_label: str
    shares: int
    shares_label: str
    engagement_rate: float
    hashtags: List[str]
    posted_at: str
    posted_label: str
    is_viral: bool
    is_trending: bool
    language: str
    source_keyword: str


class PrepareForAgent3Request(BaseModel):
    session_id: Optional[str] = None
    videos: List[VideoItem]


@app.middleware("http")
async def apply_rate_limit(request: Request, call_next):
    # Yeh basic in-memory rate limit abuse ko reduce karta hai.
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    window = rate_limit_store[client_ip]
    current_time = time.time()

    while window and current_time - window[0] > 60:
        window.popleft()

    if len(window) >= RATE_LIMIT_PER_MINUTE:
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Too many requests. Please wait and try again.",
                "retry_after_seconds": 60,
            },
        )

    window.append(current_time)
    response = await call_next(request)
    return response


async def extract_live_video_dict(video: Any) -> Dict[str, Any]:
    # Yeh helper TikTokApi ke alag-alag object shapes ko normalize karne ki koshish karta hai.
    if isinstance(video, dict):
        return video

    for method_name in ["as_dict", "dict", "model_dump"]:
        method = getattr(video, method_name, None)
        if callable(method):
            try:
                payload = method()
                if isinstance(payload, dict):
                    return payload
            except Exception:
                pass

    info_method = getattr(video, "info", None)
    if callable(info_method):
        try:
            payload = info_method()
            if asyncio.iscoroutine(payload):
                payload = await payload
            if isinstance(payload, dict):
                return payload
        except Exception:
            pass

    if hasattr(video, "__dict__"):
        return dict(video.__dict__)

    return {}


def normalize_live_video(raw: Dict[str, Any], keyword: str, language: str) -> Optional[Dict[str, Any]]:
    desc = first_non_empty(
        safe_get(raw, ["desc"]),
        safe_get(raw, ["title"]),
        safe_get(raw, ["caption"]),
        f"{keyword} viral TikTok"
    )
    video_id = str(first_non_empty(safe_get(raw, ["id"]), safe_get(raw, ["aweme_id"]), uuid.uuid4().hex))
    username = first_non_empty(
        safe_get(raw, ["author", "uniqueId"]),
        safe_get(raw, ["author", "unique_id"]),
        safe_get(raw, ["author", "nickname"]),
        f"creator_{video_id[-5:]}"
    )
    thumbnail = first_non_empty(
        safe_get(raw, ["video", "cover"]),
        safe_get(raw, ["video", "originCover"]),
        safe_get(raw, ["video", "dynamicCover"]),
        safe_get(raw, ["image_post_info", "images", 0, "display_image", "url_list", 0]),
        f"https://picsum.photos/seed/{video_id}/400/700"
    )
    music_name = first_non_empty(
        safe_get(raw, ["music", "title"]),
        safe_get(raw, ["music", "original"]),
        safe_get(raw, ["music", "playUrl"]),
        "Original Sound"
    )
    stats = {
        "views": int(first_non_empty(safe_get(raw, ["stats", "playCount"]), safe_get(raw, ["stats", "play_count"]), safe_get(raw, ["stats", "views"]), 0) or 0),
        "likes": int(first_non_empty(safe_get(raw, ["stats", "diggCount"]), safe_get(raw, ["stats", "digg_count"]), safe_get(raw, ["stats", "likes"]), 0) or 0),
        "comments": int(first_non_empty(safe_get(raw, ["stats", "commentCount"]), safe_get(raw, ["stats", "comment_count"]), safe_get(raw, ["stats", "comments"]), 0) or 0),
        "shares": int(first_non_empty(safe_get(raw, ["stats", "shareCount"]), safe_get(raw, ["stats", "share_count"]), safe_get(raw, ["stats", "shares"]), 0) or 0),
    }
    duration_seconds = int(first_non_empty(safe_get(raw, ["video", "duration"]), safe_get(raw, ["duration"]), 0) or 0)
    create_time = first_non_empty(safe_get(raw, ["createTime"]), safe_get(raw, ["create_time"]))

    if isinstance(create_time, str) and create_time.isdigit():
        create_time = int(create_time)

    if isinstance(create_time, (int, float)):
        posted_at = datetime.fromtimestamp(create_time, tz=timezone.utc).isoformat()
    else:
        posted_at = now_utc().isoformat()

    hashtags = extract_hashtags(desc)
    if not hashtags:
        hashtags = [f"#{word.lower()}" for word in keyword.split()[:3] if word.strip()]

    engagement_rate = calculate_engagement_rate(stats)
    posted_label = humanize_time_ago(posted_at)
    is_recent = (now_utc() - datetime.fromisoformat(posted_at.replace("Z", "+00:00"))).total_seconds() <= 24 * 3600

    return {
        "id": video_id,
        "url": f"https://www.tiktok.com/@{username}/video/{video_id}",
        "title": desc[:160],
        "thumbnail": thumbnail,
        "creator_username": f"@{username.lstrip('@')}",
        "music_name": str(music_name)[:120],
        "duration_seconds": duration_seconds,
        "duration_label": format_duration(duration_seconds),
        "views": stats["views"],
        "views_label": format_compact_number(stats["views"]),
        "likes": stats["likes"],
        "likes_label": format_compact_number(stats["likes"]),
        "comments": stats["comments"],
        "comments_label": format_compact_number(stats["comments"]),
        "shares": stats["shares"],
        "shares_label": format_compact_number(stats["shares"]),
        "engagement_rate": engagement_rate,
        "hashtags": hashtags[:8],
        "posted_at": posted_at,
        "posted_label": posted_label,
        "is_viral": stats["views"] >= 1_000_000,
        "is_trending": is_recent and engagement_rate >= 8,
        "language": language,
        "source_keyword": keyword,
    }


async def try_tiktok_api_search(keywords: str, count: int, session_id: str, language: str) -> List[Dict[str, Any]]:
    # Yeh real TikTokApi path hai; failure par caller mock data use karega.
    if TikTokApi is None:
        raise RuntimeError("TikTokApi library is not available.")

    query = keywords.strip()
    videos: List[Dict[str, Any]] = []

    async with TikTokApi() as api:  # type: ignore
        create_session = getattr(api, "create_sessions", None)
        if callable(create_session):
            created = False
            try:
                await create_session(sessionid=session_id, num_sessions=1, sleep_after=3)
                created = True
            except TypeError:
                pass
            except Exception:
                pass

            if not created:
                try:
                    await create_session(ms_tokens=[session_id], num_sessions=1, sleep_after=3)
                    created = True
                except Exception:
                    pass

            if not created:
                try:
                    await create_session(num_sessions=1, sleep_after=3)
                except Exception:
                    pass

        search_client = getattr(api, "search", None)
        video_iterator = None

        if search_client and hasattr(search_client, "videos"):
            for attempt in [
                {"query": query, "count": count},
                {"keywords": query, "count": count},
                {"search_term": query, "count": count},
                {"query": query},
            ]:
                try:
                    video_iterator = search_client.videos(**attempt)
                    break
                except TypeError:
                    continue
                except Exception:
                    continue

        if video_iterator is None and hasattr(api, "trending") and hasattr(api.trending, "videos"):
            video_iterator = api.trending.videos(count=count)

        if video_iterator is None:
            raise RuntimeError("Could not create TikTok video iterator.")

        async for item in video_iterator:
            raw = await extract_live_video_dict(item)
            normalized = normalize_live_video(raw, query, language)
            if normalized:
                videos.append(normalized)
            if len(videos) >= count:
                break

    return videos


async def try_public_scrape_for_hashtags(niche: str) -> List[str]:
    # Yeh lightweight public scraping attempt hai; fail hone par mock hashtags use honge.
    url = f"https://www.tiktok.com/tag/{niche.replace(' ', '')}"
    headers = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
    }
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        text = soup.get_text(" ", strip=True)
        tags = [token.lower() for token in text.split() if token.startswith("#") and len(token) > 2]

    cleaned = []
    seen = set()
    for tag in tags:
        tag = "#" + "".join(ch for ch in tag[1:] if ch.isalnum() or ch == "_")
        if tag not in seen and len(tag) > 2:
            cleaned.append(tag)
            seen.add(tag)
        if len(cleaned) >= 12:
            break
    return cleaned


def generate_mock_video(keyword: str, index: int, language: str) -> Dict[str, Any]:
    seed = f"{keyword}-{index}"
    rng = random.Random(seed)
    viral_multiplier = rng.choice([1, 1, 1, 2, 4, 8, 12])
    views = rng.randint(12_000, 980_000) * viral_multiplier
    likes = int(views * rng.uniform(0.02, 0.18))
    comments = int(views * rng.uniform(0.002, 0.03))
    shares = int(views * rng.uniform(0.001, 0.05))
    duration_seconds = rng.randint(12, 95)
    posted_at = now_utc() - timedelta(hours=rng.randint(1, 96), minutes=rng.randint(0, 59))
    creators = [
        "viral.lab", "factspark", "trenddecode", "mindblown.daily", "science.byte",
        "desi.discover", "growthpulse", "hookfactory", "brainybits", "wow.finder"
    ]
    creator_username = rng.choice(creators) + str(rng.randint(10, 99))
    hashtag_pool = [
        f"#{keyword.lower().replace(' ', '')}", "#viral", "#fyp", "#trending", "#explore",
        "#mindblown", "#facts", "#science", "#learnontiktok", "#amazing"
    ]
    rng.shuffle(hashtag_pool)
    hashtags = hashtag_pool[: rng.randint(3, 6)]
    music_name = rng.choice([
        "Original Sound", "Trending Remix", "Cinematic Hook", "Beat Drop Loop", "Viral Voiceover"
    ])
    engagement_rate = calculate_engagement_rate({
        "views": views,
        "likes": likes,
        "comments": comments,
        "shares": shares,
    })
    is_recent = (now_utc() - posted_at).total_seconds() <= 24 * 3600
    video_id = f"mock_{hashlib.md5(seed.encode()).hexdigest()[:12]}"

    return {
        "id": video_id,
        "url": f"https://www.tiktok.com/@{creator_username}/video/{video_id}",
        "title": f"{keyword.title()} idea #{index + 1} that is pulling strong attention with a sharp hook and fast payoff.",
        "thumbnail": f"https://picsum.photos/seed/{video_id}/400/700",
        "creator_username": f"@{creator_username}",
        "music_name": music_name,
        "duration_seconds": duration_seconds,
        "duration_label": format_duration(duration_seconds),
        "views": views,
        "views_label": format_compact_number(views),
        "likes": likes,
        "likes_label": format_compact_number(likes),
        "comments": comments,
        "comments_label": format_compact_number(comments),
        "shares": shares,
        "shares_label": format_compact_number(shares),
        "engagement_rate": engagement_rate,
        "hashtags": hashtags,
        "posted_at": posted_at.isoformat(),
        "posted_label": humanize_time_ago(posted_at.isoformat()),
        "is_viral": views >= 1_000_000,
        "is_trending": is_recent and engagement_rate >= 8,
        "language": language,
        "source_keyword": keyword,
    }


def build_mock_videos(request_data: SearchTikTokRequest) -> List[Dict[str, Any]]:
    # Yeh mock generator testing ke liye realistic TikTok-style records banata hai.
    keywords = parse_keywords(request_data.keywords)
    output: List[Dict[str, Any]] = []
    for index in range(request_data.count * 2):
        keyword = keywords[index % len(keywords)]
        output.append(generate_mock_video(keyword, index, request_data.language))

    filtered = [video for video in output if video["views"] >= request_data.min_views]
    if request_data.under_60s:
        filtered = [video for video in filtered if video["duration_seconds"] <= 60]
    if request_data.language == "hi":
        for item in filtered:
            item["hashtags"] = list(dict.fromkeys(item["hashtags"] + ["#hindi", "#india"]))[:8]

    sort_map = {
        "most_viral": lambda item: (item["views"], item["engagement_rate"]),
        "recent": lambda item: item["posted_at"],
        "engaging": lambda item: item["engagement_rate"],
    }
    filtered.sort(key=sort_map.get(request_data.sort_by, sort_map["most_viral"]), reverse=True)
    return filtered[: request_data.count]


def build_mock_hashtags(niche: str, language: str) -> List[str]:
    base = niche.lower().replace(" ", "")
    hashtags = [
        f"#{base}", f"#{base}facts", f"#{base}tok", "#viral", "#fyp", "#trending",
        "#explore", "#mindblown", "#creatorsearch", "#contentideas", "#hook", "#storytelling"
    ]
    if language == "hi":
        hashtags.extend(["#hindi", "#india", "#hindicontent"])
    deduped = []
    seen = set()
    for tag in hashtags:
        if tag not in seen:
            deduped.append(tag)
            seen.add(tag)
    return deduped[:12]


def apply_search_filters(videos: List[Dict[str, Any]], request_data: SearchTikTokRequest) -> List[Dict[str, Any]]:
    filtered = [video for video in videos if video.get("views", 0) >= request_data.min_views]
    if request_data.under_60s:
        filtered = [video for video in filtered if video.get("duration_seconds", 0) <= 60]

    if request_data.language == "hi":
        filtered = [video for video in filtered if video.get("language") in ["hi", "any", ""] or any(tag in ["#hindi", "#india"] for tag in video.get("hashtags", []))]

    sort_map = {
        "most_viral": lambda item: (item.get("views", 0), item.get("engagement_rate", 0)),
        "recent": lambda item: item.get("posted_at", ""),
        "engaging": lambda item: item.get("engagement_rate", 0),
    }
    filtered.sort(key=sort_map.get(request_data.sort_by, sort_map["most_viral"]), reverse=True)
    return filtered[: request_data.count]


@app.get("/")
async def root() -> Dict[str, Any]:
    return {"message": "TikTok Finder backend is running."}


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    # Yeh frontend ko batata hai ki backend online hai aur kis mode mein kaam kar raha hai.
    live_possible = bool(ENV_TIKTOK_SESSION_ID and not USE_MOCK_DATA and TikTokApi is not None)
    return {
        "status": "online",
        "data_source": "live" if live_possible else "mock",
        "tiktok_api_available": TikTokApi is not None,
        "has_session_configured": bool(ENV_TIKTOK_SESSION_ID),
        "timestamp": now_utc().isoformat(),
    }


@app.post("/api/search-tiktok")
async def search_tiktok(
    payload: SearchTikTokRequest,
    x_tiktok_session_id: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    # Yeh main search endpoint hai jo pehle live try karta hai, warna safe mock fallback deta hai.
    cache_key = get_cache_key(
        "search",
        {
            **payload.model_dump(),
            "has_session": bool(x_tiktok_session_id or ENV_TIKTOK_SESSION_ID),
        },
    )
    cached = get_from_cache(cache_key)
    if cached:
        return {**cached, "cached": True}

    session_id = x_tiktok_session_id or ENV_TIKTOK_SESSION_ID
    live_error = None
    videos: List[Dict[str, Any]] = []
    data_source = "mock"

    if session_id and not USE_MOCK_DATA:
        try:
            live_videos = await try_tiktok_api_search(payload.keywords, payload.count, session_id, payload.language)
            filtered_live_videos = apply_search_filters(live_videos, payload)
            if filtered_live_videos:
                videos = filtered_live_videos
                data_source = "live"
        except Exception as exc:
            live_error = str(exc)

    if not videos:
        videos = build_mock_videos(payload)
        data_source = "mock"

    response = {
        "data_source": data_source,
        "keywords": payload.keywords,
        "count": len(videos),
        "videos": videos,
        "warning": "Using demo data - Add TikTok Session ID for live data" if data_source == "mock" else None,
        "live_error": live_error if data_source == "mock" and live_error else None,
        "cached": False,
    }
    set_cache(cache_key, response)
    return response


@app.post("/api/get-trending-hashtags")
async def get_trending_hashtags(payload: TrendingHashtagsRequest) -> Dict[str, Any]:
    # Yeh niche ke liye trending hashtags provide karta hai.
    cache_key = get_cache_key("hashtags", payload.model_dump())
    cached = get_from_cache(cache_key)
    if cached:
        return {**cached, "cached": True}

    hashtags: List[str] = []
    data_source = "mock"
    error_message = None

    if not USE_MOCK_DATA:
        try:
            hashtags = await try_public_scrape_for_hashtags(payload.niche)
            if hashtags:
                data_source = "live"
        except Exception as exc:
            error_message = str(exc)

    if not hashtags:
        hashtags = build_mock_hashtags(payload.niche, payload.language)

    response = {
        "data_source": data_source,
        "niche": payload.niche,
        "hashtags": hashtags,
        "warning": "Using demo hashtags - public TikTok scrape was unavailable" if data_source == "mock" else None,
        "error": error_message if data_source == "mock" and error_message else None,
        "cached": False,
    }
    set_cache(cache_key, response)
    return response


@app.post("/api/prepare-for-agent3")
async def prepare_for_agent3(payload: PrepareForAgent3Request) -> Dict[str, Any]:
    # Yeh selected videos ko next agent ke liye temporary batch mein save karta hai.
    cleanup_batches()
    batch_id = f"batch_{uuid.uuid4().hex[:12]}"
    created_at = now_utc().isoformat()
    batch_store[batch_id] = {
        "session_id": payload.session_id,
        "videos": [video.model_dump() for video in payload.videos],
        "created_at": created_at,
        "expires_at": time.time() + BATCH_STORE_TTL_SECONDS,
    }
    return {
        "success": True,
        "batch_id": batch_id,
        "video_count": len(payload.videos),
        "created_at": created_at,
        "message": f"{len(payload.videos)} videos are ready for Agent 3.",
    }


@app.get("/api/batches/{batch_id}")
async def get_batch(batch_id: str) -> Dict[str, Any]:
    # Yeh optional helper Agent 3 integration aur testing ko easy banata hai.
    cleanup_batches()
    batch = batch_store.get(batch_id)
    if not batch:
        return {"success": False, "message": "Batch not found or expired."}
    return {
        "success": True,
        "batch_id": batch_id,
        "session_id": batch.get("session_id"),
        "video_count": len(batch.get("videos", [])),
        "videos": batch.get("videos", []),
        "created_at": batch.get("created_at"),
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
