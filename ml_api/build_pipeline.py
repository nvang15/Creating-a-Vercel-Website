"""Build and serialize the fitted Legendary Pokemon prediction pipeline."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import joblib
import pandas as pd
import sklearn
from pipeline_def import PokemonFeatureEngineer
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT_DIR = Path(__file__).resolve().parents[1]
ML_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = ML_DIR / "pipeline.joblib"

FEATURE_COLUMNS = [
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
TARGET_COLUMN = "Legendary"

NUMERIC_FEATURES = [
    "HP",
    "Attack",
    "Defense",
    "SpAtk",
    "SpDef",
    "Speed",
    "Generation",
    "BaseStatTotal",
    "Offense",
    "Bulk",
    "AverageStat",
]
CATEGORICAL_FEATURES = ["Type1", "Type2"]


def load_project_env() -> None:
    """Load .env.local for local builds without adding a runtime dependency."""
    env_path = ROOT_DIR / ".env.local"

    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        cleaned = line.strip()

        if not cleaned or cleaned.startswith("#") or "=" not in cleaned:
            continue

        key, value = cleaned.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def fetch_pokemon_from_supabase() -> pd.DataFrame:
    """Fetch the same public/read-only columns used by the Vercel frontend."""
    load_project_env()

    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_anon_key:
        raise RuntimeError(
            "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY "
            "before building the model."
        )

    select_columns = [*FEATURE_COLUMNS, TARGET_COLUMN]
    query = urlencode(
        {
            "select": ",".join(select_columns),
            "order": "Num.asc",
        },
        quote_via=quote,
        safe=",.",
    )
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/pokemon?{query}"
    request = Request(
        endpoint,
        headers={
            "apikey": supabase_anon_key,
            "Authorization": f"Bearer {supabase_anon_key}",
            "Accept": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase request failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach Supabase: {exc.reason}") from exc

    if not isinstance(payload, list):
        raise RuntimeError("Supabase returned an unexpected response shape.")

    return pd.DataFrame(payload)


def normalize_dataset(data: pd.DataFrame) -> pd.DataFrame:
    """Prepare row values while preserving the original feature columns."""
    required_columns = [*FEATURE_COLUMNS, TARGET_COLUMN]
    missing_columns = [column for column in required_columns if column not in data.columns]

    if missing_columns:
        missing = ", ".join(missing_columns)
        raise ValueError(f"Missing required training column(s): {missing}")

    pokemon = data.loc[:, required_columns].copy()
    pokemon["Type2"] = pokemon["Type2"].fillna("None").replace("", "None")

    for column in NUMERIC_FEATURES[:7]:
        pokemon[column] = pd.to_numeric(pokemon[column], errors="raise")

    pokemon[TARGET_COLUMN] = pokemon[TARGET_COLUMN].astype(bool)

    return pokemon


def make_one_hot_encoder() -> OneHotEncoder:
    """Support sklearn versions before and after sparse_output was introduced."""
    try:
        return OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    except TypeError:
        return OneHotEncoder(handle_unknown="ignore", sparse=False)


def make_pipeline() -> Pipeline:
    """Create the full sklearn Pipeline; fitting happens only in main()."""
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", StandardScaler(), NUMERIC_FEATURES),
            ("categorical", make_one_hot_encoder(), CATEGORICAL_FEATURES),
        ]
    )

    return Pipeline(
        steps=[
            ("feature_engineering", PokemonFeatureEngineer()),
            ("preprocessing", preprocessor),
            (
                "classifier",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=1000,
                    random_state=42,
                ),
            ),
        ]
    )


def print_metrics(y_test, predictions, row_count, train_count, test_count, target_distribution):
    """Print educational model diagnostics for the assignment report."""
    print(f"Rows: {row_count}")
    print(f"Training rows: {train_count}")
    print(f"Testing rows: {test_count}")
    print(f"Target distribution: {target_distribution}")
    print(f"Accuracy: {accuracy_score(y_test, predictions):.4f}")
    print(f"Precision: {precision_score(y_test, predictions, zero_division=0):.4f}")
    print(f"Recall: {recall_score(y_test, predictions, zero_division=0):.4f}")
    print(f"F1: {f1_score(y_test, predictions, zero_division=0):.4f}")
    print("Confusion matrix:")
    print(confusion_matrix(y_test, predictions))
    print(f"sklearn version: {sklearn.__version__}")


def main() -> int:
    raw_data = fetch_pokemon_from_supabase()
    pokemon = normalize_dataset(raw_data)

    X = pokemon[FEATURE_COLUMNS]
    y = pokemon[TARGET_COLUMN]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    evaluation_pipeline = make_pipeline()
    evaluation_pipeline.fit(X_train, y_train)
    predictions = evaluation_pipeline.predict(X_test)

    target_distribution = {
        str(label): int(count) for label, count in y.value_counts().sort_index().items()
    }
    print_metrics(
        y_test=y_test,
        predictions=predictions,
        row_count=len(pokemon),
        train_count=len(X_train),
        test_count=len(X_test),
        target_distribution=target_distribution,
    )

    deployment_pipeline = make_pipeline()
    deployment_pipeline.fit(X, y)

    bundle = {
        "pipeline": deployment_pipeline,
        "metadata": {
            "model_type": "LogisticRegression",
            "purpose": "Predict whether a Pokemon is Legendary",
            "steps": [name for name, _ in deployment_pipeline.steps],
            "built_at": datetime.now(timezone.utc).isoformat(),
            "sklearn_version": sklearn.__version__,
            "feature_names": FEATURE_COLUMNS,
            "numeric_features": NUMERIC_FEATURES,
            "categorical_features": CATEGORICAL_FEATURES,
            "target": TARGET_COLUMN,
            "training_rows": len(pokemon),
            "target_distribution": target_distribution,
            "input_source": "Supabase public REST API pokemon table",
        },
    }

    joblib.dump(bundle, OUTPUT_PATH)
    print(f"Saved fitted pipeline bundle to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
