"""Protocol constants for the local Generals Helper HTTP bridge."""

API_VERSION = "v1"
HEALTH_PATH = "/healthz"
INGEST_PATH = f"/{API_VERSION}/ingest"
LATEST_PATH = f"/{API_VERSION}/latest"
ANALYSIS_LATEST_PATH = f"/{API_VERSION}/analysis/latest"
HISTORY_PATH = f"/{API_VERSION}/history"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_HISTORY_LIMIT = 25
DEFAULT_MAX_RECORDS = 200

