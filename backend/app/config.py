"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""  # anon/public key
    supabase_service_key: str = ""  # service role key for admin ops

    # Spotify
    spotify_client_id: str = ""
    spotify_client_secret: str = ""

    # TRIBE v2 inference worker
    tribe_worker_url: str = "http://localhost:8001"
    use_mock_tribe: bool = True  # Use mock responses until TRIBE worker is ready

    # App
    app_name: str = "SeraTune"
    debug: bool = True
    static_dir: str = "./app/static"
    audio_cache_dir: str = "/tmp/seratune_audio"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
