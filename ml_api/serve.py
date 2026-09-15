"""FastAPI service for the fitted Legendary Pokemon predictor."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

# Importing this module before joblib.load lets Python resolve the custom
# PokemonFeatureEngineer class stored inside the serialized sklearn Pipeline.
from pipeline_def import PokemonFeatureEngineer  # noqa: F401


API_VERSION = "0.1.0"
MODEL_PATH = CURRENT_DIR / "pipeline.joblib"
FEATURE_NAMES = [
    "Type1",
    "Type2",
    "HP",
    "Attack",
    "Defense",
    "SpAtk",
    "SpDef",
    "Speed",
    "Generation",
]


def _load_artifact() -> tuple[dict[str, Any] | None, str | None]:
    try:
        loaded = joblib.load(MODEL_PATH)

        if not isinstance(loaded, dict):
            raise TypeError("pipeline.joblib must contain a dictionary bundle.")

        pipeline = loaded.get("pipeline")
        metadata = loaded.get("metadata")

        if pipeline is None:
            raise KeyError("Artifact bundle is missing the 'pipeline' entry.")

        if not isinstance(metadata, dict):
            raise TypeError("Artifact bundle is missing a valid 'metadata' dictionary.")

        return loaded, None
    except Exception as exc:  # Store startup problems for clean 503 responses.
        return None, f"{type(exc).__name__}: {exc}"


ARTIFACT_BUNDLE, ARTIFACT_ERROR = _load_artifact()

app = FastAPI(
    title="Legendary Pokemon Predictor API",
    description=(
        "FastAPI service that uses a pre-fitted scikit-learn Pipeline to "
        "estimate whether a Pokemon is Legendary from type, generation, and stats."
    ),
    version=API_VERSION,
)

allowed_origins = [
    "http://localhost:3000",
    "https://vervelhw3.vercel.app",
]
frontend_origin = os.environ.get("FRONTEND_ORIGIN")

if frontend_origin:
    allowed_origins.append(frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class PokemonPredictionRequest(BaseModel):
    Type1: str = Field(..., min_length=3, max_length=20)
    Type2: str | None = Field(default=None, min_length=3, max_length=20)
    HP: int = Field(..., ge=1, le=255)
    Attack: int = Field(..., ge=1, le=255)
    Defense: int = Field(..., ge=1, le=255)
    SpAtk: int = Field(..., ge=1, le=255)
    SpDef: int = Field(..., ge=1, le=255)
    Speed: int = Field(..., ge=1, le=255)
    Generation: int = Field(..., ge=1, le=9)


def _require_artifact() -> dict[str, Any]:
    if ARTIFACT_BUNDLE is None:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unavailable",
                "artifact_loaded": False,
                "error": ARTIFACT_ERROR,
            },
        )

    return ARTIFACT_BUNDLE


def _classifier_classes(pipeline) -> list[Any]:
    classifier = pipeline.named_steps["classifier"]
    return list(classifier.classes_)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "api_name": "Legendary Pokemon Predictor API",
        "version": API_VERSION,
        "description": (
            "Predicts whether a Pokemon is Legendary using a fitted "
            "scikit-learn Pipeline."
        ),
        "endpoints": {
            "health": "/health",
            "pipeline": "/pipeline",
            "predict": "/predict",
            "docs": "/docs",
        },
    }


@app.get("/health")
def health() -> dict[str, Any]:
    _require_artifact()
    return {"status": "ok", "artifact_loaded": True}


@app.get("/pipeline")
def pipeline_info() -> dict[str, Any]:
    bundle = _require_artifact()
    metadata = bundle["metadata"]

    return {
        "model_type": metadata.get("model_type"),
        "purpose": metadata.get("purpose"),
        "steps": metadata.get("steps"),
        "built_at": metadata.get("built_at"),
        "sklearn_version": metadata.get("sklearn_version"),
        "feature_names": metadata.get("feature_names"),
        "target": metadata.get("target"),
        "training_rows": metadata.get("training_rows"),
    }


@app.post("/predict")
def predict(request: PokemonPredictionRequest) -> dict[str, Any]:
    bundle = _require_artifact()
    pipeline = bundle["pipeline"]

    input_row = request.model_dump()
    input_row["Type2"] = input_row["Type2"] or "None"
    example = pd.DataFrame([input_row], columns=FEATURE_NAMES)

    predicted_class = bool(pipeline.predict(example)[0])
    probabilities = pipeline.predict_proba(example)[0]
    classes = _classifier_classes(pipeline)

    try:
        legendary_index = classes.index(True)
        non_legendary_index = classes.index(False)
    except ValueError as exc:
        raise HTTPException(
            status_code=503,
            detail="Fitted classifier classes do not include both False and True.",
        ) from exc

    legendary_probability = float(probabilities[legendary_index])
    non_legendary_probability = float(probabilities[non_legendary_index])

    return {
        "prediction": "Legendary" if predicted_class else "Non-Legendary",
        "is_legendary": predicted_class,
        "legendary_probability": round(legendary_probability, 4),
        "non_legendary_probability": round(non_legendary_probability, 4),
    }
