const axios = require('axios');
const express = require('express');

const router = express.Router();
const defaultBedrockUrl = 'https://bedrock-runtime.ap-southeast-1.amazonaws.com';
const defaultOllamaUrl = 'http://localhost:11434/v1';
const defaultOllamaModel = 'qwen2.5-coder:7b';
const defaultBedrockModel = 'global.openai.gpt-6-luna';
const bedrockModels = [
  { id: 'global.openai.gpt-6-luna', label: 'GPT-6 Luna' },
  { id: 'global.anthropic.claude-haiku-5-5', label: 'Claude Haiku 5.5' }
];

function getProviderConfig() {
  const provider = (process.env.AI_PROVIDER || 'bedrock').toLowerCase();
  const requestedBedrockModel = process.env.BEDROCK_MODEL || defaultBedrockModel;
  const bedrockModel = bedrockModels.some((item) => item.id === requestedBedrockModel)
    ? requestedBedrockModel
    : defaultBedrockModel;

  return {
    provider: provider === 'ollama' ? 'ollama' : 'bedrock',
    bedrockUrl: process.env.BEDROCK_URL || defaultBedrockUrl,
    bedrockModel,
    ollamaUrl: process.env.OLLAMA_URL || defaultOllamaUrl,
    ollamaModel: process.env.OLLAMA_MODEL || defaultOllamaModel
  };
}

function getChatCompletionsUrl(baseUrl) {
  const normalizedUrl = baseUrl.replace(/\/$/, '');
  return normalizedUrl.endsWith('/chat/completions')
    ? normalizedUrl
    : `${normalizedUrl}/chat/completions`;
}

function getConverseUrl(baseUrl, model) {
  const normalizedUrl = baseUrl.replace(/\/$/, '');
  const modelPath = encodeURIComponent(model);
  return normalizedUrl.endsWith('/converse')
    ? normalizedUrl
    : `${normalizedUrl}/model/${modelPath}/converse`;
}

// Normalize Converse and OpenAI-compatible responses to one frontend shape.
function getAssistantText(data) {
  const candidates = [
    data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content,
    data && data.choices && data.choices[0] && data.choices[0].text,
    data && data.output && data.output.message && Array.isArray(data.output.message.content) &&
      data.output.message.content.map((item) => item && typeof item.text === 'string' ? item.text : '').filter(Boolean).join('')
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
}

function getModelForRequest(config, provider, requestedModel) {
  if (provider === 'ollama') {
    return requestedModel || config.ollamaModel;
  }

  return bedrockModels.some((item) => item.id === requestedModel)
    ? requestedModel
    : config.bedrockModel;
}

router.get('/config', (req, res) => {
  const config = getProviderConfig();
  res.json({
    provider: config.provider,
    model: config.provider === 'ollama' ? config.ollamaModel : config.bedrockModel,
    models: {
      bedrock: bedrockModels,
      ollama: [{ id: config.ollamaModel, label: config.ollamaModel }]
    },
    ollama: {
      configured: Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL),
      model: config.ollamaModel
    },
    bedrock: {
      configured: Boolean(process.env.ACCESS_TOKEN),
      model: config.bedrockModel
    }
  });
});

// Bedrock uses Converse for both configured models. Ollama uses its
// OpenAI-compatible Chat Completions endpoint.
router.post('/', async (req, res) => {
  const prompt = req.body && req.body.prompt;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt must be a non-empty string' });
  }

  const config = getProviderConfig();
  const requestedProvider = req.body && req.body.provider;
  const provider = requestedProvider === 'ollama' || requestedProvider === 'bedrock'
    ? requestedProvider
    : config.provider;
  const requestedModel = req.body && typeof req.body.model === 'string'
    ? req.body.model.trim()
    : '';
  const model = getModelForRequest(config, provider, requestedModel);
  const accessToken = process.env.ACCESS_TOKEN;

  if (provider === 'bedrock' && !accessToken) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'bedrock_configuration_error',
      message: 'ACCESS_TOKEN is not configured'
    }));
    return res.status(500).json({ error: 'Chat service is not configured' });
  }

  const startedAt = Date.now();

  try {
    const isBedrock = provider === 'bedrock';
    const url = isBedrock
      ? getConverseUrl(config.bedrockUrl, model)
      : getChatCompletionsUrl(config.ollamaUrl);
    const body = isBedrock
      ? {
        messages: [{ role: 'user', content: [{ text: prompt }] }]
      }
      : {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      };

    const upstreamResponse = await axios.post(url, body, {
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
        ...(isBedrock ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    });

    const response = getAssistantText(upstreamResponse.data);
    if (!response) {
      console.error(JSON.stringify({
        level: 'error',
        event: `${provider}_invalid_response`,
        model,
        status: upstreamResponse.status,
        durationMs: Date.now() - startedAt
      }));
      return res.status(502).json({ error: `${isBedrock ? 'Bedrock Converse' : 'Ollama'} returned an unexpected response format` });
    }

    console.info(JSON.stringify({
      level: 'info',
      event: 'chat_completed',
      provider,
      model,
      status: upstreamResponse.status,
      durationMs: Date.now() - startedAt
    }));
    return res.json({ response });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: `${provider}_request_failed`,
      model,
      status: error.response && error.response.status,
      code: error.code,
      message: error.response
        ? `${provider === 'bedrock' ? 'Bedrock Converse' : 'Ollama'} returned an error response`
        : 'Network or timeout error',
      durationMs: Date.now() - startedAt
    }));
    return res.status(502).json({ error: `Failed to get a response from ${provider === 'bedrock' ? 'Bedrock Converse' : 'Ollama'}` });
  }
});

module.exports = router;
