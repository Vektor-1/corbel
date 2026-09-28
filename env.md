# Environment variables

Names and purposes only; values belong in the deployment environment.

| Variable | Purpose | Noticed in |
| --- | --- | --- |
| AGENT_ROUTER_API_KEY | Authenticates Agent Router requests | frontend/src/lib/plan-import/agent-router.ts |
| AGENT_ROUTER_BASE_URL | Optional Agent Router API base URL | frontend/src/lib/plan-import/agent-router.ts |
| RODIUM_AI_API_KEY | Authenticates Rodium AI requests | frontend/src/lib/plan-import/rodium-ai.ts |
| RODIUM_AI_BASE_URL | Optional Rodium AI API base URL | frontend/src/lib/plan-import/rodium-ai.ts |
| RODIUM_AI_MODEL | Optional Rodium AI model override | frontend/src/lib/plan-import/rodium-ai.ts |
| VISION_PROVIDER | Optional provider precedence override | frontend/src/lib/plan-import/provider.ts |
| PLAN_IMPORT_ENABLED | Enables hosted plan import routes | frontend/src/app/api/plan-import |
| NEXT_PUBLIC_BLOB_ENABLED | Selects hosted blob uploads in the browser | frontend/src/lib/uploads/planUpload.ts |
| ML_BACKEND_URL | Self-hosted ML backend base URL | frontend/src/lib/services/mlBackendImport.ts |
| ML_BACKEND_PARTICIPANT_TOKEN | Authenticates self-hosted ML backend requests | frontend/src/lib/services/mlBackendImport.ts |
