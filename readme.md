# AI Chatbot

A small Node.js and Express web application that sends prompts to AWS Bedrock or a local Ollama model and displays the generated reply.

## Requirements

- Node.js 20 or later and npm (for local development)
- An AWS Bedrock-compatible endpoint and bearer access token (Bedrock only)
- Ollama running locally or on a reachable host (Ollama only)
- Docker and Docker Compose (optional)

## Configure

Set the provider and its connection settings as environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `AI_PROVIDER` | No | `bedrock` | Default provider: `bedrock` or `ollama` |
| `POST_REQUEST_URL` | No | `https://bedrock-mantle.ap-southeast-1.api.aws/v1` | Bedrock URL receiving `{ "inputText": "..." }` |
| `ACCESS_TOKEN` | Bedrock only | — | Bearer token used to authenticate Bedrock |
| `OLLAMA_URL` | No | `http://localhost:11434/api/generate` | Ollama generate endpoint |
| `OLLAMA_MODEL` | No | `llama3.2` | Model name installed in Ollama |
| `PORT` | No | `4000` | Port on which the application listens |
| `HOST_PORT` | No | `4000` | Host port exposed by Docker Compose |

The example endpoint expects a compatible service that accepts the `inputText` payload. Set `POST_REQUEST_URL` to the exact invocation URL required by your model/service. Do not commit real credentials.

## Run locally

```sh
npm ci
```

For Bedrock, set `ACCESS_TOKEN` and, if needed, `POST_REQUEST_URL`. For Ollama, make sure the model is available (`ollama pull llama3.2`) and configure:

```sh
# PowerShell
$env:AI_PROVIDER = "ollama"
$env:OLLAMA_MODEL = "llama3.2"
npm start
```

Open <http://localhost:4000>. The provider can also be changed in the UI. The browser sends prompts to `POST /chat`; successful replies are returned as `{ "response": "..." }`.

## Run with Docker Compose

Create a local `.env` file from the example and edit its Bedrock settings:

```sh
cp .env.example .env
```

Then build and start the app:

```sh
docker compose up --build
```

If Ollama runs on the host while the app runs in Docker, set `OLLAMA_URL=http://host.docker.internal:11434/api/generate` in `.env`.

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

The server writes structured JSON logs to stdout/stderr with event names, provider, upstream status, and request duration. Prompts and access tokens are not logged. Invalid prompts receive `400`; provider request failures or unrecognized response formats receive a clear `502` error shown in the chat UI.
