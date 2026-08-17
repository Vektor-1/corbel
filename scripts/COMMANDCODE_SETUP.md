# Using CommandCode for DeepSeek V4 Pro Benchmarking

CommandCode is a unified API that abstracts multiple LLM providers (DeepSeek, Claude, GPT, etc.). Use it to simplify model switching and reduce API key management.

## What is CommandCode?

- **Unified API**: Single endpoint for 50+ models
- **Model Format**: `provider/model-name` (e.g., `deepseek/deepseek-v4-pro`)
- **Authentication**: Single `COMMAND_CODE_API_KEY` for all providers
- **Benefits**: Easy A/B testing, no vendor lock-in

## Setup

### 1. Get API Key

Visit https://commandcode.ai and sign up for an account.
Get your API key from: https://commandcode.ai/account/keys

### 2. Export Key

```bash
export COMMAND_CODE_API_KEY=your_key_here
```

Or add to `~/.bashrc` or `~/.zshrc`:

```bash
echo 'export COMMAND_CODE_API_KEY=your_key_here' >> ~/.bashrc
source ~/.bashrc
```

### 3. Install CommandCode CLI

```bash
# macOS (recommended)
brew install commandcode

# Or download from: https://commandcode.ai/download
# Or build from source: https://github.com/commandcode/cli
```

### 4. Authenticate

```bash
# Interactive login (creates ~/.commandcode/auth.json)
cmd /login

# OR set API key directly
export COMMAND_CODE_API_KEY=your_key_here
```

### 5. Run DeepSeek Benchmark

```bash
scripts/.venv/bin/python scripts/benchmark_deepseek_commandcode.py --n 10 --seed 13
```

This uses the `cmd` CLI tool to call DeepSeek V4 Pro. No separate API key management.

## Available Models via CommandCode

```bash
# DeepSeek Models
deepseek/deepseek-v4-pro        # Recommended for reasoning
deepseek/deepseek-v4-flash      # Faster, cheaper

# Claude Models
anthropic/claude-3-5-sonnet
anthropic/claude-3-opus

# OpenAI Models
openai/gpt-4-vision
openai/gpt-4-turbo

# Other
meta/llama-2
mistral/mistral-medium
```

## Benchmark Output

Results saved to `scripts/.bench-cache/deepseek_v4pro.json`:

```json
{
  "config": {
    "model": "deepseek/deepseek-v4-pro",
    "provider": "CommandCode",
    "n": 10,
    "seed": 13
  },
  "summary": {
    "overall_f1": 0.85,
    "per_class": {
      "wall": { "f1": 0.88, "precision": 0.91, "recall": 0.85 },
      "door": { "f1": 0.81, "precision": 0.83, "recall": 0.79 },
      "window": { "f1": 0.85, "precision": 0.87, "recall": 0.83 }
    }
  },
  "images": [...]
}
```

## Comparison: Direct API vs CommandCode

| Approach | Pros | Cons |
|----------|------|------|
| **Direct DeepSeek API** | Native support | Need DEEPSEEK_API_KEY, vendor-specific |
| **CommandCode** | Unified keys, easy switching | One more abstraction layer |

For Corbel FYP: **Use CommandCode** to easily compare multiple models without managing separate API keys.

## Troubleshooting

**API Key Not Working**
```bash
# Verify key is set
echo $COMMAND_CODE_API_KEY

# Check CommandCode docs
curl -H "x-api-key: $COMMAND_CODE_API_KEY" \
  https://api.commandcode.ai/v1/models
```

**Models Not Found**
```bash
# List available models
scripts/.venv/bin/python -c "
import os
import httpx
api_key = os.environ.get('COMMAND_CODE_API_KEY')
r = httpx.get(
  'https://api.commandcode.ai/v1/models',
  headers={'x-api-key': api_key}
)
print(r.json())
"
```

**Timeout Issues**
- Increase timeout in script: `timeout=60` instead of `timeout=30`
- Check internet connection
- Verify API key is active

## References

- CommandCode Docs: https://commandcode.ai/docs
- Available Models: https://commandcode.ai/docs/reference/cli/models
- Pricing: https://commandcode.ai/pricing
