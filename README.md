# Corbel ML backend

Researcher-managed backend for private plan uploads, durable GPU jobs and an
opt-in correction-data loop. It deliberately does not manage general Corbel
accounts or projects.

## Start a pilot

1. Copy `.env.example` to `.env` and replace every development secret.
2. Place immutable model artifacts in `./model-artifacts` and update
   `models/manifest.json` with their SHA-256 checksums.
3. Run `docker compose up --build` on a host with Docker Compose and an NVIDIA
   runtime. The API is exposed at `http://localhost:8080`.
4. Create an expiring participant link with `POST /v1/study-sessions` using
   `X-Researcher-Key`. Its returned `participantToken` is sent as
   `Authorization: Bearer …` for participant endpoints.

The worker refuses to claim a successful reconstruction when a manifest
artifact is missing. Model promotion is an explicit researcher action and
never changes an already-submitted job's pinned manifest.

## Services

- **api**: FastAPI, access control, private object lifecycle and durable jobs.
- **worker**: Redis/RQ consumer. G0 is the wall authority; YOLO contributes
  opening proposals, and the fusion stage returns the existing editor schema.
- **postgres**: job, upload, study-session, correction and model-manifest data.
- **minio**: private S3-compatible object storage.
- **redis**: queue transport only; PostgreSQL remains the source of truth.

## Data handling

Participant uploads are private and expire according to `UPLOAD_RETENTION_DAYS`.
Only a separately supplied `trainingConsent=true` correction is eligible for
researcher review. Approval creates a training candidate; it does not retrain
or promote a model automatically.
