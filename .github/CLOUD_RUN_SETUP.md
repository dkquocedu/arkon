# Cloud Run Deployment Setup

This guide walks through the one-time GCP infrastructure setup required before
the GitHub Actions workflow (`.github/workflows/deploy.yml`) can run successfully.

---

## Prerequisites

- GCP project with billing enabled
- `gcloud` CLI installed and authenticated
- Repository variables and secrets configured (see sections below)

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-southeast1"   # change to your preferred region
gcloud config set project $PROJECT_ID
```

---

## 1. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

---

## 2. Artifact Registry

```bash
gcloud artifacts repositories create arkon \
  --repository-format=docker \
  --location=$REGION \
  --description="Arkon container images"
```

---

## 3. VPC Network

Cloud Run needs a VPC connector to reach Cloud Memorystore (Redis).

```bash
# Create VPC connector (if you don't have one)
gcloud compute networks vpc-access connectors create arkon-vpc \
  --region=$REGION \
  --range=10.8.0.0/28

# Note the full resource name for the GCP_VPC_CONNECTOR variable:
# projects/$PROJECT_ID/locations/$REGION/connectors/arkon-vpc
```

---

## 4. Cloud SQL (PostgreSQL + pgvector)

```bash
# Create instance  (db-g1-small is fine for dev; use db-custom for prod)
gcloud sql instances create arkon-db \
  --database-version=POSTGRES_16 \
  --tier=db-g1-small \
  --region=$REGION \
  --network=default \
  --no-assign-ip          # private IP only

# Create database
gcloud sql databases create arkon --instance=arkon-db

# Create user
gcloud sql users create arkon \
  --instance=arkon-db \
  --password=CHANGE_ME_STRONG_PASSWORD

# Enable pgvector extension (connect via Cloud SQL Studio or psql)
# Once connected: CREATE EXTENSION IF NOT EXISTS vector;

# CLOUD_SQL_INSTANCE value:
echo "$PROJECT_ID:$REGION:arkon-db"
```

---

## 5. Cloud Memorystore (Redis)

```bash
gcloud redis instances create arkon-redis \
  --size=1 \
  --region=$REGION \
  --network=default

# Get the private IP — use this as REDIS_HOST
gcloud redis instances describe arkon-redis \
  --region=$REGION \
  --format='value(host)'
```

---

## 6. Cloud Storage (replaces MinIO)

```bash
# Create bucket
gcloud storage buckets create gs://arkon-files \
  --location=$REGION \
  --uniform-bucket-level-access

# Create HMAC keys (S3-compatible access for the MinIO client SDK)
gcloud storage hmac create arkon-storage@$PROJECT_ID.iam.gserviceaccount.com
# → Copy the Access ID (→ GCS_HMAC_ACCESS_KEY) and Secret (→ GCS_HMAC_SECRET_KEY)
#
# Note: you'll need a service account for storage. Either reuse the deployer SA
# or create a dedicated one and grant it roles/storage.objectAdmin.
```

---

## 7. Service Account & Workload Identity Federation

```bash
# Create deployer service account
gcloud iam service-accounts create arkon-deployer \
  --display-name="Arkon GitHub Actions Deployer"

SA_EMAIL="arkon-deployer@$PROJECT_ID.iam.gserviceaccount.com"

# Grant required roles
for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/cloudsql.client \
  roles/iam.serviceAccountUser \
  roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE"
done

# Create Workload Identity Pool
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions"

# Create OIDC provider
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == 'dkquocedu/arkon'"

# Allow the GitHub repo to impersonate the service account
POOL_ID=$(gcloud iam workload-identity-pools describe github \
  --location=global --format='value(name)')

gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$POOL_ID/attribute.repository/dkquocedu/arkon"

# Get the provider resource name (→ WIF_PROVIDER secret)
gcloud iam workload-identity-pools providers describe github \
  --location=global \
  --workload-identity-pool=github \
  --format='value(name)'
# → projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
```

---

## 8. GitHub Repository Variables & Secrets

Go to **Settings → Secrets and variables → Actions** in the GitHub repository.

### Variables (non-sensitive)

| Name | Example value |
|------|---------------|
| `GCP_PROJECT_ID` | `my-gcp-project` |
| `GCP_REGION` | `asia-southeast1` |
| `CLOUD_SQL_INSTANCE` | `my-gcp-project:asia-southeast1:arkon-db` |
| `VPC_CONNECTOR` | `projects/my-gcp-project/locations/asia-southeast1/connectors/arkon-vpc` |
| `DB_USER` | `arkon` |
| `DB_NAME` | `arkon` |
| `REDIS_HOST` | `10.10.0.3` |
| `GCS_BUCKET` | `arkon-files` |
| `GCS_HMAC_ACCESS_KEY` | *(from step 6)* |
| `CORS_ORIGINS` | `https://arkon.example.com` |
| `DEFAULT_ADMIN_EMAIL` | `admin@yourcompany.com` |
| `NEXT_PUBLIC_API_URL` | `https://arkon-api-xxx-an.a.run.app` (or custom domain) |
| `INTERNAL_API_URL` | *(optional)* stable custom domain for API, e.g. `https://api.arkon.internal` |

### Secrets (encrypted)

| Name | Description |
|------|-------------|
| `WIF_PROVIDER` | Workload Identity provider resource name (from step 7) |
| `WIF_SERVICE_ACCOUNT` | `arkon-deployer@PROJECT.iam.gserviceaccount.com` |
| `DB_PASSWORD` | Cloud SQL user password |
| `SECRET_KEY` | JWT signing key (`python -c "import secrets; print(secrets.token_urlsafe(32))"`) |
| `REDIS_PASSWORD` | Memorystore auth string (leave empty if auth is disabled) |
| `GCS_HMAC_SECRET_KEY` | HMAC secret key (from step 6) |
| `DEFAULT_ADMIN_PASSWORD` | Initial admin account password |

---

## 9. First Deployment

Push to `main` — the workflow will:
1. Authenticate via Workload Identity Federation
2. Build and push `arkon/api` image → Artifact Registry
3. Deploy `arkon-api` Cloud Run service (includes Alembic migrations via `entrypoint.sh`)
4. Capture the API URL, build `arkon/frontend` image with it baked in
5. Deploy `arkon-frontend` Cloud Run service
6. Print both service URLs in the GitHub Actions summary

---

## 10. Background Workers (optional)

The `docker-compose.yml` includes `worker` and `worker_skills` services (arq workers).
These are not deployed by this workflow. To run them on Cloud Run, create a
separate Cloud Run Job or a third Cloud Run service using the same API image
with command override:

```bash
gcloud run jobs create arkon-worker \
  --image=REGION-docker.pkg.dev/PROJECT/arkon/api:latest \
  --region=$REGION \
  --command=python \
  --args="-m,app.workers.main" \
  ...
```

Or consider **Cloud Run Services** with `--no-cpu-throttling` for persistent workers.

---

## Estimated GCP Costs (asia-southeast1)

| Service | Tier | Est. monthly |
|---------|------|--------------|
| Cloud Run API (1 min instance) | 1 vCPU / 1 GB | ~$15-30 |
| Cloud Run Frontend (0 min instances) | 1 vCPU / 512 MB | ~$0-5 |
| Cloud SQL | db-g1-small | ~$25 |
| Cloud Memorystore | 1 GB Basic | ~$30 |
| Artifact Registry | storage + egress | ~$1-5 |
| Cloud Storage | standard + ops | ~$1-3 |
