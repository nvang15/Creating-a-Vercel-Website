# Pokemon Battle Dashboard with ML Legendary Predictor

## Overview

This project began as a Supabase-powered Pokemon Battle Dashboard and was extended for Assignment 4 into a full-stack machine-learning application. The original dashboard functionality is still powered by Supabase, while the new Legendary Predictor uses a deployed machine-learning API.

The architecture is split across several services:

- Vercel hosts the Next.js frontend.
- Supabase provides the Pokemon dataset for browsing, filtering, sorting, and dashboard views.
- scikit-learn provides the fitted machine-learning Pipeline.
- FastAPI exposes the trained model as an HTTP API.
- Modal hosts the FastAPI backend.
- Postman is used to test the deployed API.

## Features

The dashboard includes the original Assignment 3 features:

- Pokemon search by name
- Type filtering
- Generation filtering
- Legendary filtering
- Attack and Speed threshold filtering
- Sortable stat columns
- Pagination
- Pokemon detail modal
- Pokemon sprites/images
- Supabase-backed live data

Assignment 4 adds the machine-learning features:

- Legendary Predictor section in the dashboard
- Predictor form inputs for:
  - Type1
  - Type2
  - HP
  - Attack
  - Defense
  - SpAtk
  - SpDef
  - Speed
  - Generation
- Live `POST /predict` request to the deployed Modal FastAPI backend
- Returned Legendary or Non-Legendary prediction
- Displayed Legendary and Non-Legendary probabilities
- Probability bar for the Legendary estimate
- `Analyze with ML` button in the Pokemon detail view that fills the predictor form from the selected Pokemon

## Machine Learning Pipeline

The model is a real fitted scikit-learn Pipeline. It is defined and built in the `ml_api/` folder.

Pipeline steps:

1. `PokemonFeatureEngineer`
2. `ColumnTransformer` preprocessing
3. `StandardScaler` for numeric features
4. `OneHotEncoder(handle_unknown="ignore")` for `Type1` and `Type2`
5. `LogisticRegression` classifier

`PokemonFeatureEngineer` is a custom transformer in `ml_api/pipeline_def.py`. It inherits `BaseEstimator` and `TransformerMixin`, works with pandas DataFrames, and creates row-level derived battle features:

- `BaseStatTotal`
- `Offense`
- `Bulk`
- `AverageStat`

The custom transformer does not scale, encode, classify, or learn dataset-wide statistics. Those responsibilities belong to later Pipeline steps.

The model is trained once by `ml_api/build_pipeline.py` and serialized into `ml_api/pipeline.joblib`. The FastAPI app does not retrain the model when it starts.

## Dataset

The model was trained from the same Supabase `pokemon` table used by the dashboard.

Training/build results:

- Rows: 800
- Training rows: 640
- Testing rows: 160
- Non-Legendary: 735
- Legendary: 65

Input features:

- `Type1`
- `Type2`
- `HP`
- `Attack`
- `Defense`
- `SpAtk`
- `SpDef`
- `Speed`
- `Generation`

Target:

- `Legendary`

## Model Results

Evaluation results from the train/test split:

- Accuracy: 0.9125
- Precision: 0.4783
- Recall: 0.8462
- F1 Score: 0.6111

Confusion matrix:

```text
[[135, 12],
 [2, 11]]
```

These results are useful for an educational model, but they should not be oversold. The dataset is imbalanced because Legendary Pokemon are much rarer than Non-Legendary Pokemon. That helps explain why the model has high recall but lower precision: it catches most Legendary examples in the test set, but it also produces some false positives.

## Serialized Artifact

`ml_api/pipeline.joblib` stores a dictionary bundle, not a bare Pipeline. The bundle contains:

- fitted pipeline
- metadata

The metadata includes:

- `model_type`
- `purpose`
- `steps`
- `built_at`
- `sklearn_version`
- `feature_names`
- `target`
- `training_rows`

The learned state in the artifact includes:

- `StandardScaler` means and scales
- `OneHotEncoder` learned categories
- `LogisticRegression` coefficients, intercept, and classes

The API loads this artifact once when `ml_api/serve.py` is imported. Request handlers use the already-fitted Pipeline.

## FastAPI

The FastAPI service is implemented in `ml_api/serve.py`.

Endpoints:

- `GET /`
- `GET /health`
- `GET /pipeline`
- `POST /predict`

Endpoint behavior:

- `/` returns basic API information.
- `/health` confirms that the serialized artifact loaded successfully.
- `/pipeline` returns safe metadata about the fitted artifact.
- `/predict` runs new input through the already-fitted Pipeline.
- Invalid request data returns HTTP 422 through Pydantic validation.
- Missing or unloadable model artifacts return HTTP 503 instead of an unhandled HTTP 500.

## Modal Deployment

The Modal deployment wrapper is implemented in `ml_api/modal_serve.py`.

Modal ships these files into the container:

- `serve.py`
- `pipeline_def.py`
- `pipeline.joblib`

`pipeline_def.py` must be present because `pipeline.joblib` contains a serialized Pipeline with the custom `PokemonFeatureEngineer` class. During `joblib.load(...)`, Python needs to import that class so the artifact can be deserialized.

The Modal image pins scikit-learn exactly to:

```text
1.9.1
```

Modal uses the already-fitted serialized artifact. It does not train the model, rebuild `pipeline.joblib`, or fetch Supabase training data at runtime.

## Vercel Integration

The frontend uses:

```text
NEXT_PUBLIC_MODAL_API_URL
```

The dashboard calls the live Modal API from the Legendary Predictor form. The production frontend does not use localhost for predictions and does not use fake prediction data. Supabase still powers the dashboard data, filtering, sorting, detail modal, and Pokemon sprites.

## Postman Testing

The Postman collection is stored at:

```text
postman/Assignment4_Pokemon_API.postman_collection.json
```

It includes:

1. Health
2. Pipeline Info
3. Valid Prediction -> 200
4. Invalid Prediction -> 422

The collection targets the deployed Modal URL, not localhost.

## Live URLs

Vercel:

```text
https://vervelhw3.vercel.app
```

Modal API:

```text
https://nvang15--pokemon-legendary-predictor-api-fastapi-app.modal.run
```

FastAPI Docs:

```text
https://nvang15--pokemon-legendary-predictor-api-fastapi-app.modal.run/docs
```

## Tech Stack

Frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/base-ui components
- lucide-react icons

Backend/API:

- FastAPI
- Modal

Machine Learning:

- scikit-learn 1.9.1
- pandas
- joblib

Database:

- Supabase

Testing:

- Postman

Deployment:

- Vercel
- Modal

## Project Structure

```text
src/
  app/
    page.tsx              # Dashboard and Legendary Predictor UI
    layout.tsx            # App layout and metadata
    globals.css           # Global styling
  components/ui/          # UI primitives
  lib/
    supabase.ts           # Supabase client

ml_api/
  pipeline_def.py         # Custom PokemonFeatureEngineer transformer
  build_pipeline.py       # Trains and serializes the fitted Pipeline
  pipeline.joblib         # Fitted model artifact bundle
  verify_pipeline.py      # Verifies learned state after deserialization
  serve.py                # FastAPI app
  modal_serve.py          # Modal deployment wrapper
  requirements.txt        # Python runtime/build dependencies

postman/
  Assignment4_Pokemon_API.postman_collection.json
```

## Running Locally

Install frontend dependencies:

```bash
npm install
```

Create `.env.local` in the project root:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_MODAL_API_URL=...
```

Run the Next.js frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build the ML artifact if needed:

```bash
cd ml_api
python build_pipeline.py
```

Run the FastAPI app locally if needed:

```bash
cd ml_api
uvicorn serve:app --reload --port 8000
```

Verify the serialized artifact:

```bash
cd ml_api
python verify_pipeline.py
```

## Assignment 4 Summary

This project demonstrates how to fit and serialize a real scikit-learn Pipeline, including a custom transformer. It serves the trained model through FastAPI, deploys that API with Modal, and connects a live Vercel frontend to the deployed prediction service. The API is validated with a Postman collection that tests health, pipeline metadata, valid predictions, and invalid request validation.
