from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def load_local_env() -> None:
    """Load simple KEY=VALUE pairs without overwriting real environment values."""
    env_file = Path(__file__).resolve().parents[1] / ".env"
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()


@dataclass(frozen=True)
class Settings:
    user_id: str | None
    token: str | None
    store_id: str | None
    channel_no: str
    app_version: str
    client_type: str
    origin: str
    referer: str
    user_agent: str
    cors_origins: list[str]
    timeout_seconds: float

    @classmethod
    def from_environment(cls) -> "Settings":
        origins = os.getenv("CORS_ORIGINS", "http://127.0.0.1:4173,http://localhost:4173")
        return cls(
            user_id=os.getenv("MAGICANGLE_USER_ID") or None,
            token=os.getenv("MAGICANGLE_TOKEN") or None,
            store_id=os.getenv("MAGICANGLE_STORE_ID") or None,
            channel_no=os.getenv("MAGICANGLE_CHANNEL_NO", "web"),
            app_version=os.getenv("MAGICANGLE_APP_VERSION", "1.0.0-web"),
            client_type=os.getenv("MAGICANGLE_CLIENT_TYPE", "web"),
            origin=os.getenv("MAGICANGLE_ORIGIN", "https://hfive.cfgsdok.com"),
            referer=os.getenv("MAGICANGLE_REFERER", "https://hfive.cfgsdok.com/"),
            user_agent=os.getenv("MAGICANGLE_USER_AGENT", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1"),
            cors_origins=[item.strip() for item in origins.split(",") if item.strip()],
            timeout_seconds=float(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "15")),
        )

    def headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": self.origin,
            "Referer": self.referer,
            "User-Agent": self.user_agent,
        }
        if self.user_id:
            headers["userid"] = self.user_id
        if self.token:
            headers["token"] = self.token
        return headers

    def base_payload(self) -> dict[str, str]:
        payload = {
            "systemVersion": "unknown",
            "phoneType": "Web Browser",
            "channelNo": self.channel_no,
            "appVersion": self.app_version,
            "resource": "web|web-browser",
            "clientType": self.client_type,
            "token": self.token or "",
        }
        if self.store_id:
            payload["storeId"] = self.store_id
        return payload
