from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    gemini_api_key: str = ""
    backboard_api_key: str = ""
    backboard_project_id: str = ""
    backboard_base_url: str = "https://api.backboard.io"
    mongodb_uri: str = ""
    mongodb_db_name: str = "promptimize"
    cors_origins: str = "http://localhost:3000"
    port: int = 8000
    default_monthly_calls: int = 10000
    default_output_token_estimate: int = 700

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def has_backboard(self) -> bool:
        return bool(self.backboard_api_key)

    @property
    def has_mongodb(self) -> bool:
        return bool(self.mongodb_uri)

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
