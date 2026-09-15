"""Reusable scikit-learn pipeline pieces for the Pokemon predictor."""

from __future__ import annotations

from typing import Iterable

import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


class PokemonFeatureEngineer(BaseEstimator, TransformerMixin):
    """Add Pokemon stat features without learning dataset-level state.

    This transformer is intentionally limited to row-by-row feature creation.
    Scaling, encoding, and classification belong in later Pipeline steps.
    """

    def __init__(self, required_columns: Iterable[str] | None = None):
        self.required_columns = required_columns

    def fit(self, X, y=None):
        """No fitting is needed; return self for sklearn Pipeline compatibility."""
        return self

    def transform(self, X):
        """Return a DataFrame with original columns plus derived battle stats."""
        pokemon = self._validate_dataframe(X).copy()

        pokemon["BaseStatTotal"] = (
            pokemon["HP"]
            + pokemon["Attack"]
            + pokemon["Defense"]
            + pokemon["SpAtk"]
            + pokemon["SpDef"]
            + pokemon["Speed"]
        )
        pokemon["Offense"] = pokemon["Attack"] + pokemon["SpAtk"]
        pokemon["Bulk"] = pokemon["HP"] + pokemon["Defense"] + pokemon["SpDef"]
        pokemon["AverageStat"] = pokemon["BaseStatTotal"] / 6

        return pokemon

    def _validate_dataframe(self, X):
        if not isinstance(X, pd.DataFrame):
            raise ValueError("PokemonFeatureEngineer requires a pandas DataFrame input.")

        required_columns = list(self.required_columns or self._default_required_columns())
        missing_columns = [column for column in required_columns if column not in X.columns]

        if missing_columns:
            missing = ", ".join(missing_columns)
            raise ValueError(f"Missing required Pokemon column(s): {missing}")

        return X

    @staticmethod
    def _default_required_columns():
        return [
            "Type1",
            "Type2",
            "Generation",
            "HP",
            "Attack",
            "Defense",
            "SpAtk",
            "SpDef",
            "Speed",
        ]
