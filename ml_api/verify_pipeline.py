"""Verify that pipeline.joblib contains an already-fitted sklearn Pipeline."""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd


MODEL_PATH = Path(__file__).resolve().parent / "pipeline.joblib"


def main() -> int:
    bundle = joblib.load(MODEL_PATH)

    if not isinstance(bundle, dict):
        raise TypeError("Expected pipeline.joblib to contain a dictionary bundle.")

    metadata = bundle.get("metadata", {})
    pipeline = bundle.get("pipeline")

    if pipeline is None:
        raise KeyError("The bundle does not contain a 'pipeline' entry.")

    print("Bundle type: dictionary")
    print("Metadata:")
    print(f"  model_type: {metadata.get('model_type')}")
    print(f"  purpose: {metadata.get('purpose')}")
    print(f"  built_at: {metadata.get('built_at')}")
    print(f"  sklearn_version: {metadata.get('sklearn_version')}")
    print(f"  training_rows: {metadata.get('training_rows')}")
    print(f"  target: {metadata.get('target')}")
    print(f"  pipeline steps: {metadata.get('steps')}")

    preprocessor = pipeline.named_steps["preprocessing"]
    scaler = preprocessor.named_transformers_["numeric"]
    encoder = preprocessor.named_transformers_["categorical"]
    classifier = pipeline.named_steps["classifier"]

    print("\nLearned StandardScaler state:")
    print(f"  mean_ first 5: {scaler.mean_[:5].round(4).tolist()}")
    print(f"  scale_ first 5: {scaler.scale_[:5].round(4).tolist()}")

    print("\nLearned OneHotEncoder state:")
    for feature_name, categories in zip(["Type1", "Type2"], encoder.categories_):
        print(f"  {feature_name}: {categories.tolist()}")

    print("\nLearned LogisticRegression state:")
    print(f"  classes_: {classifier.classes_.tolist()}")
    print(f"  coef_ shape: {classifier.coef_.shape}")
    print(f"  intercept_: {classifier.intercept_.round(4).tolist()}")

    example = pd.DataFrame(
        [
            {
                "Type1": "Dragon",
                "Type2": "Flying",
                "HP": 105,
                "Attack": 150,
                "Defense": 90,
                "SpAtk": 150,
                "SpDef": 90,
                "Speed": 95,
                "Generation": 3,
            }
        ]
    )

    predicted_class = pipeline.predict(example)[0]
    probabilities = pipeline.predict_proba(example)[0]
    non_legendary_probability = probabilities[0]
    legendary_probability = probabilities[1]

    print("\nExample prediction:")
    print(f"  predicted class: {predicted_class}")
    print(f"  Non-Legendary probability: {non_legendary_probability:.4f}")
    print(f"  Legendary probability: {legendary_probability:.4f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
