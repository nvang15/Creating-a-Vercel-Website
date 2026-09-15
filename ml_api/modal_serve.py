"""Modal deployment wrapper for the Legendary Pokemon FastAPI app."""

from __future__ import annotations

from pathlib import Path

import modal


LOCAL_DIR = Path(__file__).resolve().parent
REMOTE_DIR = "/root/ml_api"

app = modal.App("pokemon-legendary-predictor-api")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "pandas==3.0.5",
        "joblib==1.6.0",
        "scikit-learn==1.9.1",
        "fastapi==0.141.1",
        "uvicorn==0.53.0",
    )
    .add_local_file(LOCAL_DIR / "serve.py", f"{REMOTE_DIR}/serve.py", copy=True)
    .add_local_file(
        LOCAL_DIR / "pipeline_def.py",
        f"{REMOTE_DIR}/pipeline_def.py",
        copy=True,
    )
    .add_local_file(
        LOCAL_DIR / "pipeline.joblib",
        f"{REMOTE_DIR}/pipeline.joblib",
        copy=True,
    )
)


@app.function(image=image)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def fastapi_app():
    """Return the existing FastAPI app; all prediction logic stays in serve.py."""
    import sys

    if REMOTE_DIR not in sys.path:
        sys.path.insert(0, REMOTE_DIR)

    from serve import app as fastapi_application

    return fastapi_application
