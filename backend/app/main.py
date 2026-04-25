"""SeraTune API server entry point."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import analyses, auth, clusters, creator, recommend, spotify_router

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

# CORS — allow all origins during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
