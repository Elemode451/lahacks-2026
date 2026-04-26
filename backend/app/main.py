"""SeraTune API server entry point."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from app.rate_limit import limiter

from app.config import settings
from app.routers import agent_chat, analyses, auth, clusters, creator, friends, recommend, spotify_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    description=(
        "Music discovery through predicted brain-response similarity. "
        "Powered by TRIBE v2."
    ),
    version="0.1.0",
)

# Rate limiting — use exception handler instead of SlowAPIMiddleware.
# SlowAPIMiddleware (BaseHTTPMiddleware) buffers the entire response,
# which breaks SSE streaming on /clusters/analyze/stream.
# Individual endpoints use @limiter.limit() decorators; this handler
# converts RateLimitExceeded into a proper 429 JSON response.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    logger.error("Validation error on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# CORS — restrict to known origins (added AFTER rate limiter so CORS
# middleware wraps everything and 429 responses include CORS headers)
_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    # Add your production domain here, e.g.:
    # "https://seratune.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (brain visualization frames, etc.)
app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")

# Routers
app.include_router(auth.router)
app.include_router(spotify_router.router)
app.include_router(creator.router)
app.include_router(clusters.router)
app.include_router(analyses.router)
app.include_router(recommend.router)
app.include_router(friends.router)
app.include_router(agent_chat.router)


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "version": "0.1.0",
        "description": "Music discovery through predicted brain-response similarity",
        "docs": "/docs",
        "mock_mode": settings.use_mock_tribe,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "mock_tribe": settings.use_mock_tribe}
