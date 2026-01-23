# Python Backend

This directory contains the Python backend for the Link Downloader App.

## Structure

- **app/**: Main application package.
  - **api/**: FastAPI server endpoints (`server.py`).
  - **core/**: Core logic (Downloader, Logger, Utilities).
  - **schemas.py**: Pydantic data models.
- **tests/**: Test scripts.
- **cli.py**: Command-line interface tool.
- **backend.spec**: PyInstaller specification for building the executable.

## Usage

### Run CLI
```bash
python cli.py <URL>
```

### Run Server
```bash
python -m app.api.server
```
