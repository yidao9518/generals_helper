# Generals Helper Python Bridge

A minimal local HTTPS-first service for the browser extension, with HTTP as an optional fallback.

## HTTPS certificate helper

Windows users can start the bridge with a single helper script:

```powershell
Set-Location "D:\code\generals_helper"
.\start_https_bridge.ps1
```

If `cryptography` is not installed yet, you can install dependencies and start the bridge in one step:

```powershell
Set-Location "D:\code\generals_helper"
.\start_https_bridge.ps1 -InstallDeps
```

Or install the bridge package dependencies first:

```powershell
Set-Location "D:\code\generals_helper"
python -m pip install -e .\python_bridge
```

The helper reuses the existing `certs\localhost.crt` / `certs\localhost.key` pair when present, so you can keep one long-lived local certificate instead of regenerating it on every launch.

On first setup it trusts `localhost.crt` in the Windows Current User root store by default so Chromium-based browsers stop showing `ERR_CERT_AUTHORITY_INVALID`.
If that same certificate is already trusted, the helper now detects it and skips the repeat import.

If you prefer to trust manually or skip trust, use the cert generator directly:

```powershell
Set-Location "D:\code\generals_helper"
python .\tools\generate_local_https_cert.py --trust --serve
```

## Run (HTTPS default)

```powershell
Set-Location "D:\code\generals_helper"
python -m python_bridge.server --host 127.0.0.1 --port 8765 --certfile .\certs\localhost.crt --keyfile .\certs\localhost.key
```

HTTP fallback example:

```powershell
Set-Location "D:\code\generals_helper"
python -m python_bridge.server --host 127.0.0.1 --port 8765
```

> Note: browsers usually require the localhost certificate to be trusted by the OS/browser when using HTTPS.

## Endpoints

- `GET /healthz`
- `POST /v1/ingest`
- `GET /v1/latest`
- `GET /v1/analysis/latest`
- `GET /v1/history?limit=25`

See `PROTOCOL.md` for the full request/response contract.

