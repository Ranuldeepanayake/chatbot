const app = require('./app');

const port = Number(process.env.PORT) || 4000;
const provider = (process.env.AI_PROVIDER || 'bedrock').toLowerCase() === 'ollama'
  ? 'ollama'
  : 'bedrock';
const bedrockEndpoint = process.env.BEDROCK_URL || 'https://bedrock-runtime.us-east-1.amazonaws.com';
const bedrockModel = process.env.BEDROCK_MODEL || 'global.openai.gpt-6-luna';
const ollamaEndpoint = process.env.OLLAMA_URL || 'http://localhost:11434/v1';
const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

// Log where requests are sent without leaking credentials embedded in a URL.
function safeEndpoint(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid endpoint]';
  }
}

// Keep HTTP startup separate from app setup to make the Express app reusable.
const server = app.listen(port, () => {
  console.info(JSON.stringify({
    level: 'info',
    event: 'server_started',
    port,
    provider,
    models: {
      bedrock: {
        endpoint: safeEndpoint(bedrockEndpoint),
        model: bedrockModel || '[not configured]',
        availableModels: [
          'global.openai.gpt-6-luna',
          'global.anthropic.claude-haiku-5-5'
        ],
        accessTokenConfigured: Boolean(process.env.ACCESS_TOKEN)
      },
      ollama: {
        endpoint: safeEndpoint(ollamaEndpoint),
        model: ollamaModel,
        accessTokenConfigured: false
      }
    }
  }));
});

// Surface bind/listener failures instead of leaving the service apparently healthy.
server.on('error', (error) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'server_error',
    message: error.message
  }));
  process.exitCode = 1;
});
