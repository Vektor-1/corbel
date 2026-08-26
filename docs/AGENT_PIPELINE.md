# Agent Pipeline: Gemini 3.1 + GPT 5.6 Luna via Rodium AI & AgentRouter

## Overview

Corbel's import pipeline now supports intelligent routing between Gemini 3.1 and GPT 5.6 Luna models via two orchestration platforms:

- **AgentRouter** — Intelligent model routing with fallback chains and cost optimization
- **Rodium AI** — Centralized inference orchestration with load balancing and metrics

Both replace the previous Claude-only architecture and improve detail extraction from 2D floor plan images.

## Stage Allocation

| Stage | Task | Primary Model | Fallback | Rationale |
|-------|------|--------------|----------|-----------|
| P1 | Image metadata (orientation, quality, scale hints) | GPT 5.6 Luna | Gemini 3.1 | Detailed visual analysis |
| P2 | Wall detection (YOLOv8) | Local ONNX | — | Fast, deterministic |
| P3 | Wall graph refinement (axis-snap, junctions) | Local algorithm | — | Deterministic |
| P4 | OCR (room labels, dimensions) | Gemini 3.1 | GPT 5.6 Luna | Excellent text extraction |
| P5 | Scale calibration (pixels-per-metre reasoning) | GPT 5.6 Luna | Gemini 3.1 | Reasoning task |
| P6 | Validate + lift to canonical | Local algorithm | — | Deterministic |

## Provider Options

### 1. AgentRouter (Recommended)

**What it does**: Routes each request to the optimal model based on:
- Real-time latency/cost metrics
- Model specialization (Luna for reasoning, Gemini for OCR)
- Automatic fallback on failure

**Setup**:
```bash
export VISION_PROVIDER=agent-router
export AGENT_ROUTER_API_KEY=your_key_here
export AGENT_ROUTER_BASE_URL=https://api.agentrouter.org/v1  # optional
```

**Benefits**:
- ✅ Intelligent fallback (if Luna timeout, auto-tries Gemini)
- ✅ Cost tracking per stage (enables beta testing metrics)
- ✅ Latency optimization (picks fastest model)
- ✅ Request-level telemetry

**Routing logic** (in `src/lib/plan-import/agent-router.ts`):
- **P1 (image analysis)**: Tries Luna → Gemini
- **P4 (OCR)**: Tries Gemini → Luna
- **P5 (scale calibration)**: Tries Luna → Gemini

### 2. Rodium AI

**What it does**: Orchestrates inference across regions and quota limits:
- Load balancing across multiple inference endpoints
- Automatic scaling and failover
- Cost and latency monitoring

**Setup**:
```bash
export VISION_PROVIDER=rodium-ai
export RODIUM_AI_API_KEY=your_key_here
export RODIUM_AI_BASE_URL=https://api.rodiumai.io/v1  # optional
```

**Benefits**:
- ✅ High availability (geographic load balancing)
- ✅ Quota management (queue requests if limit exceeded)
- ✅ Unified metrics dashboard
- ✅ Fine-grained cost allocation

**Usage** (in `src/lib/plan-import/rodium-ai.ts`):
```typescript
// Specify model per call
await runRodiumDetection(source, 'gpt-5.6-luna');
await runRodiumOcrAndScale(source, 'gemini-3.1');
```

### 3. Legacy Providers (Fallback)

If neither AgentRouter nor Rodium is configured, reverts to:

1. Claude Holistic (full detection)
2. Claude API (OCR only)
3. Gemini
4. Claude Agent
5. Worker/RunPod

## Configuration Precedence

```
AgentRouter (if AGENT_ROUTER_API_KEY set)
  ↓
Rodium AI (if RODIUM_AI_API_KEY set)
  ↓
Claude Holistic (if ANTHROPIC_API_KEY set)
  ↓
Claude API (if ANTHROPIC_API_KEY set)
  ↓
Gemini (if GOOGLE_GENERATIVE_AI_API_KEY set)
  ↓
Claude Agent
  ↓
Worker/RunPod
```

Override with `VISION_PROVIDER` env var:
```bash
export VISION_PROVIDER=agent-router  # explicit selection
```

## Performance Characteristics

### Latency (typical)
- **P1 (image analysis)**: 2–4s (Luna) vs 1–2s (Gemini)
- **P4 (OCR)**: 1–3s (Gemini) vs 2–4s (Luna)
- **P5 (scale calibration)**: 1–2s (Luna) vs 1–2s (Gemini)
- **Total P1–P6**: 8–15s (AgentRouter with parallel P1+P4)

### Cost (estimated per plan)
- **Gemini 3.1 vision call**: $0.005–0.01
- **GPT 5.6 Luna vision call**: $0.01–0.03
- **Full pipeline**: $0.03–0.05

## Beta Testing Integration

Both AgentRouter and Rodium AI provide metrics for feature validation:

```typescript
import { getMetrics } from '@/lib/plan-import/agent-router';

// Collect metrics per upload
const metrics = getMetrics();
metrics.forEach(m => {
  console.log(`${m.stage}: ${m.modelUsed} took ${m.latencyMs}ms, cost $${m.costUsd}`);
});
```

**Metrics available**:
- `stage`: P1, P4, P5, etc.
- `modelUsed`: 'gpt-5.6-luna' or 'gemini-3.1'
- `latencyMs`: Round-trip time
- `costUsd`: API cost
- `success`: Pass/fail flag

Use these to:
- Compare model performance on real plans
- Identify slow stages (bottleneck analysis)
- Budget API spend
- A/B test routing strategies

## Error Handling

Both providers support graceful degradation:

### AgentRouter
```typescript
const response = await makeAgentRouterRequest({
  task: 'ocr',
  image_url,
  prompt,
  preferred_models: ['gemini-3.1', 'gpt-5.6-luna'],
  fallback_enabled: true,  // auto-retry on failure
  timeout_ms: 30_000,
});

if (!response.success) {
  console.warn(`OCR failed: ${response.error}`);
  // Gracefully degrade to fixed scale or skip OCR
}
```

### Rodium AI
```typescript
try {
  await runRodiumDetection(source, 'gpt-5.6-luna');
} catch (error) {
  console.warn(`Detection failed: ${error.message}`);
  // Fallback to Gemini, then local fallback
  await runRodiumDetection(source, 'gemini-3.1');
}
```

## Switching Providers at Runtime

Use the provider dispatcher for unified access:

```typescript
import { runDetection, runOcrAndScale, resolveProvider } from '@/lib/plan-import';

// Auto-detect provider based on env vars
const provider = resolveProvider(); // returns 'agent-router', 'rodium-ai', etc.

// Run with auto-selected provider
const result = await runDetection(source);
const { labels, scale } = await runOcrAndScale(source);

// Or explicit override
const result = await runDetection(source, 'rodium-ai');
```

## Monitoring & Debugging

### Enable debug logs
```bash
export DEBUG=corbel:plan-import
```

### Log sample
```
[provider-dispatcher] Running detection with agent-router
[agent-router] Routing P1 image-analysis to gpt-5.6-luna
[rodium-ai] Routing P4 OCR to gemini-3.1 (preferred)
[agent-router] P5 scale-calibration succeeded (1.2s, $0.003)
```

## Future Extensions

1. **Cost optimization**: Dynamically switch models based on spend vs quality
2. **Caching**: Save successful analysis results, reuse on re-upload
3. **Multi-region**: Route to nearest provider endpoint
4. **Custom models**: Add support for other vision models (Claude 4, new OpenAI releases)
5. **Parallel inference**: Run P1 + P4 + P5 concurrently (not sequentially)
