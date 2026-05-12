"""Jira integration service — creates issues and syncs status."""
import logging
from base64 import b64encode

import httpx

logger = logging.getLogger(__name__)


class JiraService:
    """Async Jira REST API v3 client.
    Configuration is loaded lazily from app.config.settings so it picks up
    values set at startup without requiring a module-level import cycle.
    """

    @property
    def _settings(self):
        from app.config import settings
        return settings

    @property
    def base_url(self) -> str:
        return self._settings.jira_base_url

    @property
    def email(self) -> str:
        return self._settings.jira_email

    @property
    def api_token(self) -> str:
        return self._settings.jira_api_token

    @property
    def project_key(self) -> str:
        return self._settings.jira_project_key

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url and self.email and self.api_token and self.project_key)

    def _auth_header(self) -> dict[str, str]:
        token = b64encode(f"{self.email}:{self.api_token}".encode()).decode()
        return {
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_issue(
        self,
        title: str,
        description: str,
        issue_type: str = "Story",
        priority: str = "medium",
    ) -> dict:
        if not self.is_configured:
            raise ValueError("Jira is not configured. Set JIRA_* environment variables.")

        priority_map = {
            "critical": "Highest",
            "high": "High",
            "medium": "Medium",
            "low": "Low",
        }
        jira_priority = priority_map.get(priority.lower(), "Medium")

        payload = {
            "fields": {
                "project": {"key": self.project_key},
                "summary": title,
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": description}],
                        }
                    ],
                },
                "issuetype": {"name": issue_type},
                "priority": {"name": jira_priority},
            }
        }

        url = f"{self.base_url.rstrip('/')}/rest/api/3/issue"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url, json=payload, headers=self._auth_header(), timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            jira_key = data.get("key", "")
            return {
                "key": jira_key,
                "url": f"{self.base_url.rstrip('/')}/browse/{jira_key}",
                "id": data.get("id"),
            }

    async def get_issue_status(self, jira_key: str) -> str | None:
        if not self.is_configured:
            return None
        url = f"{self.base_url.rstrip('/')}/rest/api/3/issue/{jira_key}?fields=status"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url, headers=self._auth_header(), timeout=15.0
                )
                response.raise_for_status()
                data = response.json()
                return data.get("fields", {}).get("status", {}).get("name")
        except Exception as e:
            logger.error(f"Failed to get Jira issue status for {jira_key}: {e}")
            return None

    def get_config_status(self) -> dict:
        return {
            "configured": self.is_configured,
            "base_url": self.base_url or None,
            "email": self.email or None,
            "project_key": self.project_key or None,
        }


jira_service = JiraService()
