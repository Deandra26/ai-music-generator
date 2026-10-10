from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from datetime import datetime
import json
import uuid

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
METADATA_FILE = DATA_DIR / "gallery.json"

UPLOAD_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

if not METADATA_FILE.exists():
    METADATA_FILE.write_text("[]", encoding="utf-8")

app = FastAPI(title="Local AI Music & Image Gallery")

# Serve the website UI files
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/static", StaticFiles(directory=str(BASE_DIR)), name="static")


def load_assets():
    try:
        return json.loads(METADATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_assets(items):
    METADATA_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")


@app.get("/")
async def index():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/api/assets")
async def list_assets():
    return load_assets()


@app.post("/api/upload")
async def upload_asset(
    file: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    content_type = file.content_type or ""
    if not (content_type.startswith("image/") or content_type.startswith("audio/")):
        raise HTTPException(status_code=400, detail="Only image or audio files are allowed")

    asset_id = uuid.uuid4().hex
    file_ext = Path(file.filename).suffix.lower() or ".bin"
    storage_name = f"{asset_id}{file_ext}"
    storage_path = UPLOAD_DIR / storage_name

    data = await file.read()
    storage_path.write_bytes(data)

    item = {
        "id": asset_id,
        "type": "image" if content_type.startswith("image/") else "audio",
        "title": title.strip() or Path(file.filename).stem,
        "description": description.strip(),
        "fileName": file.filename,
        "date": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "size": round(len(data) / (1024 * 1024), 2),
        "src": f"/uploads/{storage_name}",
    }

    assets = load_assets()
    assets.append(item)
    save_assets(assets)

    return {"success": True, "asset": item}


@app.delete("/api/assets/{asset_id}")
async def delete_asset(asset_id: str):
    assets = load_assets()
    for idx, item in enumerate(assets):
        if item["id"] == asset_id:
            file_path = UPLOAD_DIR / Path(item["src"]).name
            if file_path.exists():
                file_path.unlink()
            del assets[idx]
            save_assets(assets)
            return {"success": True, "deleted": asset_id}

    raise HTTPException(status_code=404, detail="Asset not found")


@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Local gallery server is running"}
