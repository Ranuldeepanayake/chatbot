# AI Chatbot

A small Node.js and Express web application with one chat endpoint and provider-specific adapters:

- AWS Bedrock uses the Converse API for GPT-6 Luna and Claude Haiku 5.5.
- Ollama uses its OpenAI-compatible Chat Completions API with Qwen 2.5 Coder 7B.
- OpenAI uses the Responses API with an OpenAI API key.

## Requirements

- Node.js 20 or later and npm (for local development)
- An AWS Bedrock-compatible endpoint and bearer access token (Bedrock only)
- Ollama running locally or on a reachable host (Ollama only)
- An OpenAI API key (OpenAI only)
- Docker and Docker Compose (optional)

## Configure

Set the provider and its connection settings as environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `AI_PROVIDER` | No | `bedrock` | Default provider: `bedrock`, `openai`, or `ollama` |
| `BEDROCK_URL` | No | `https://bedrock-runtime.us-east-1.amazonaws.com` | Bedrock Runtime base URL used for Converse |
| `BEDROCK_MODEL` | Bedrock only | `global.openai.gpt-6-luna` | `global.openai.gpt-6-luna` or `global.anthropic.claude-haiku-5-5` |
| `ACCESS_TOKEN` | Bedrock only | — | Bearer token used to authenticate Bedrock |
| `OLLAMA_URL` | No | `http://localhost:11434/v1` | Ollama OpenAI-compatible base URL |
| `OLLAMA_MODEL` | No | `qwen2.5-coder:7b` | Model name installed in Ollama |
| `OPENAI_URL` | No | `https://api.openai.com/v1` | OpenAI API base URL |
| `OPENAI_MODEL` | No | `gpt-6-luna` | OpenAI model ID |
| `OPENAI_API_KEY` | OpenAI only | — | OpenAI API key |
| `PORT` | No | `4000` | Port on which the application listens |
| `HOST_PORT` | No | `4000` | Host port exposed by Docker Compose |

The browser always calls `POST /chat`. Bedrock requests use Converse JSON with `messages[].content[].text`; Ollama requests use OpenAI-compatible JSON with `model` and `messages[].content`; OpenAI requests use the Responses API. Do not commit real credentials.

### Supported models

The Bedrock model selector is intentionally limited to these two model IDs:

| Display name | Bedrock model ID | Request format |
| --- | --- | --- |
| GPT-6 Luna | `global.openai.gpt-6-luna` | Bedrock Converse |
| Claude Haiku 5.5 | `global.anthropic.claude-haiku-5-5` | Bedrock Converse |

The Ollama model is `qwen2.5-coder:7b` by default. The selected model is sent with each request. Bedrock model IDs are validated server-side; an unsupported Bedrock model falls back to the configured default.

The OpenAI selector includes `gpt-6-astra`, `gpt-6.1-sol`, and `gpt-6-luna`. Set `OPENAI_MODEL` to choose the initial default. The model can also be changed from the UI.

This split is intentional: Bedrock Converse supports both required Bedrock models, while Claude Haiku 5.5 is not supported by Bedrock Chat Completions. Ollama is not a Bedrock service, so it uses Ollama's OpenAI-compatible endpoint. OpenAI uses the official Responses API. See the [Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html), [Bedrock model compatibility table](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html), [Ollama OpenAI compatibility documentation](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx), and [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text).

## Run locally

```sh
npm ci
```

For Bedrock, set `ACCESS_TOKEN`, `BEDROCK_MODEL`, and, if needed, `BEDROCK_URL`. For Ollama, make sure the model is available (`ollama pull qwen2.5-coder:7b`) and configure the variables for your shell:

PowerShell with Ollama (temporary for the current terminal):

```powershell
$env:AI_PROVIDER = "ollama"
$env:OLLAMA_MODEL = "qwen2.5-coder:7b"
npm start
```

PowerShell with OpenAI:

```powershell
$env:AI_PROVIDER = "openai"
$env:OPENAI_MODEL = "gpt-6-luna"
$env:OPENAI_API_KEY = "your-openai-api-key"
npm start
```

PowerShell with Bedrock:

```powershell
$env:AI_PROVIDER = "bedrock"
$env:BEDROCK_URL = "https://bedrock-runtime.us-east-1.amazonaws.com"
$env:BEDROCK_MODEL = "global.openai.gpt-6-luna"
$env:ACCESS_TOKEN = "your-bedrock-access-token"
npm start
```

Windows Command Prompt with OpenAI:

```bat
set AI_PROVIDER=openai
set OPENAI_MODEL=gpt-6-luna
set OPENAI_API_KEY=your-openai-api-key
npm start
```

Windows Command Prompt with Ollama (temporary for the current terminal):

```bat
set AI_PROVIDER=ollama
set OLLAMA_MODEL=qwen2.5-coder:7b
npm start
```

Linux/macOS Bash or Zsh with OpenAI:

```bash
export AI_PROVIDER=openai
export OPENAI_MODEL=gpt-6-luna
export OPENAI_API_KEY=your-openai-api-key
npm start
```

Windows Command Prompt with Bedrock:

```bat
set AI_PROVIDER=bedrock
set BEDROCK_URL=https://bedrock-runtime.us-east-1.amazonaws.com
set BEDROCK_MODEL=global.openai.gpt-6-luna
set ACCESS_TOKEN=your-bedrock-access-token
npm start
```

Linux/macOS Bash or Zsh with Ollama (temporary for the current terminal):

```bash
export AI_PROVIDER=ollama
export OLLAMA_MODEL=qwen2.5-coder:7b
npm start
```

Linux/macOS Bash or Zsh with Bedrock:

```bash
export AI_PROVIDER=bedrock
export BEDROCK_URL=https://bedrock-runtime.us-east-1.amazonaws.com
export BEDROCK_MODEL=global.openai.gpt-6-luna
export ACCESS_TOKEN=your-bedrock-access-token
npm start
```

The variables only affect the terminal session in which they are set. They are cleared when that terminal is closed. Avoid placing real tokens in shell history when possible.

Open <http://localhost:4000>. The provider can also be changed in the UI. The browser sends prompts to `POST /chat`; successful replies are returned as `{ "response": "..." }`.

The model selector is populated by `GET /chat/config`. Select `GPT-6 Luna` or `Claude Haiku 5.5` for Bedrock, an OpenAI GPT model for OpenAI, or `qwen2.5-coder:7b` for Ollama. Changing the provider updates the available model list.

## Run with Docker Compose

Create a local `.env` file from the example and edit its Bedrock settings:

```sh
cp .env.example .env
```

Then build and start the app:

```sh
docker compose up --build
```

If Ollama runs on the host while the app runs in Docker, set `OLLAMA_URL=http://host.docker.internal:11434/v1` in `.env`. The container must be able to reach the host Ollama service.

Open <http://localhost:4000>. Use `docker compose logs -f` to follow server logs and `docker compose down` to stop the container. The `.env` file is excluded from the Docker build context.

## Layout

```text
src/
  app.js           Express app and middleware
  server.js        HTTP server entry point
  routes/
    chat.js        Chat endpoint and provider integrations
public/
  index.html       Browser client
compose.yaml       Docker Compose service
Dockerfile         Container image definition
```

## Logging and errors

At startup, the server writes a structured `server_started` log containing the selected provider, port, sanitized Bedrock/Ollama/OpenAI endpoints, configured model names, and credential-presence booleans. It never logs token values. Runtime logs include provider, model, upstream status, and request duration; prompts and credentials are not logged. Invalid prompts receive `400`; provider request failures or unrecognized response formats receive a clear `502` error shown in the chat UI.

## Request formats

The application keeps the frontend contract stable:

```http
POST /chat
Content-Type: application/json
```

```json
{
  "provider": "bedrock",
  "model": "global.anthropic.claude-haiku-5-5",
  "prompt": "Write a short greeting."
}
```

For Bedrock, the server translates this to Converse:

```json
{
  "messages": [
    {
      "role": "user",
      "content": [{ "text": "Write a short greeting." }]
    }
  ]
}
```

For Ollama, the server translates it to `/v1/chat/completions`:

```json
{
  "model": "qwen2.5-coder:7b",
  "messages": [
    { "role": "user", "content": "Write a short greeting." }
  ],
  "stream": false
}
```

For OpenAI, the server translates it to `/v1/responses`:

```json
{
  "model": "gpt-6-luna",
  "input": "Write a short greeting.",
  "store": false
}
```

All upstream response formats are normalized to:

```json
{ "response": "..." }
```
