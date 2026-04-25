"""Supabase client factory.

Provides two clients:
- get_supabase(): uses the anon key, RLS policies are enforced.
- get_supabase_admin(): uses the service role key, bypasses RLS.
  Only use for admin operations (e.g., profile creation on signup).
"""

from supabase import Client, create_client

from app.config import settings

_client: Client | None = None
_admin_client: Client | None = None


def get_supabase() -> Client:
    """Get a Supabase client using the anon/public key (RLS enforced)."""
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set in environment / .env"
            )
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def get_supabase_admin() -> Client:
    """Get a Supabase client using the service role key (bypasses RLS).

    Only use for admin operations like creating profiles on signup.
    """
    global _admin_client
    if _admin_client is None:
        key = settings.supabase_service_key or settings.supabase_key
        if not settings.supabase_url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for admin operations"
            )
        _admin_client = create_client(settings.supabase_url, key)
    return _admin_client
