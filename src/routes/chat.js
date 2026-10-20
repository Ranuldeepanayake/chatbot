const axios = require('axios');
const express = require('express');

const router = express.Router();
const defaultBedrockUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';
const defaultOllamaUrl = 'http://localhost:11434/v1';
const defaultOllamaModel = 'qwen2.5-coder:7b';
const defaultBedrockModel = 'global.amazon.nova-2-lite-v1:0';
const defaultOpenaiUrl = 'https://api.openai.com/v1';
const defaultOpenaiModel = 'gpt-6-luna';
const maxResponseChars = getPositiveInteger(process.env.MAX_RESPONSE_CHARS, 200000, 1000000);
const maxUpstreamResponseBytes = 8 * 1024 * 1024;
const bedrockModels = [
  { id: 'global.openai.gpt-6-luna', label: 'GPT-6 Luna' },
  { id: 'global.anthropic.claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'global.amazon.nova-2-lite-v1:0', label: 'Amazon Nova 2 Lite' }
];
const openaiModels = [
  { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna' }
];

function getPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function getProviderConfig() {
  const provider = (process.env.AI_PROVIDER || 'bedrock').toLowerCase();
  const requestedBedrockModel = process.env.BEDROCK_MODEL || defaultBedrockModel;
  const bedrockModel = bedrockModels.some((item) => item.id === requestedBedrockModel)
    ? requestedBedrockModel
    : defaultBedrockModel;

  return {
    provider: ['ollama', 'openai'].includes(provider) ? provider : 'bedrock',
    bedrockUrl: process.env.BEDROCK_URL || defaultBedrockUrl,
    bedrockModel,
    openaiUrl: process.env.OPENAI_URL || defaultOpenaiUrl,
    openaiModel: openaiModels.some((item) => item.id === process.env.OPENAI_MODEL)
      ? process.env.OPENAI_MODEL
      : defaultOpenaiModel,
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
    data && data.output_text,
    data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content,
    data && data.choices && data.choices[0] && data.choices[0].text,
    data && data.output && data.output.message && Array.isArray(data.output.message.content) &&
      data.output.message.content.map((item) => item && typeof item.text === 'string' ? item.text : '').filter(Boolean).join(''),
    data && Array.isArray(data.output) && data.output
      .flatMap((item) => Array.isArray(item && item.content) ? item.content : [])
      .map((item) => item && typeof item.text === 'string' ? item.text : '')
      .filter(Boolean).join('')
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
}

function limitResponse(text) {
  if (text.length <= maxResponseChars) {
    return { response: text, truncated: false };
  }

  return {
    response: `${text.slice(0, maxResponseChars)}\n\n[Output truncated to keep the chat responsive.]`,
    truncated: true
  };
}

function getModelForRequest(config, provider, requestedModel) {
  if (provider === 'openai') {
    return openaiModels.some((item) => item.id === requestedModel)
      ? requestedModel
      : config.openaiModel;
  }
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
    model: config.provider === 'ollama'
      ? config.ollamaModel
      : config.provider === 'openai' ? config.openaiModel : config.bedrockModel,
    models: {
      bedrock: bedrockModels,
      openai: openaiModels,
      ollama: [{ id: config.ollamaModel, label: config.ollamaModel }]
    },
    ollama: {
      configured: Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL),
      model: config.ollamaModel
    },
    bedrock: {
      configured: Boolean(process.env.ACCESS_TOKEN),
      model: config.bedrockModel
    },
    openai: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: config.openaiModel
    },
    limits: { maxResponseChars }
  });
});

// Bedrock uses Converse, OpenAI uses Responses, and Ollama uses its
// OpenAI-compatible Chat Completions endpoint.
router.post('/', async (req, res) => {
  const prompt = req.body && req.body.prompt;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt must be a non-empty string' });
  }

  const config = getProviderConfig();
  const requestedProvider = req.body && req.body.provider;
  const provider = requestedProvider === 'ollama' || requestedProvider === 'bedrock' || requestedProvider === 'openai'
    ? requestedProvider
    : config.provider;
  const requestedModel = req.body && typeof req.body.model === 'string'
    ? req.body.model.trim()
    : '';
  const model = getModelForRequest(config, provider, requestedModel);
  const accessToken = process.env.ACCESS_TOKEN;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (provider === 'bedrock' && !accessToken) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'bedrock_configuration_error',
      message: 'ACCESS_TOKEN is not configured'
    }));
    return res.status(500).json({ error: 'Chat service is not configured' });
  }

  if (provider === 'openai' && !openaiApiKey) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'openai_configuration_error',
      message: 'OPENAI_API_KEY is not configured'
    }));
    return res.status(500).json({ error: 'OpenAI chat service is not configured' });
  }

  const startedAt = Date.now();

  try {
    const isBedrock = provider === 'bedrock';
    const isOpenai = provider === 'openai';
    const url = isBedrock
      ? getConverseUrl(config.bedrockUrl, model)
      : isOpenai ? `${config.openaiUrl.replace(/\/$/, '')}/responses` : getChatCompletionsUrl(config.ollamaUrl);
    const body = isBedrock
      ? {
        messages: [{ role: 'user', content: [{ text: prompt }] }]
      }
      : isOpenai
      ? { model, input: prompt, store: false }
      : {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      };

    const upstreamResponse = await axios.post(url, body, {
      timeout: 120000,
      maxContentLength: maxUpstreamResponseBytes,
      maxBodyLength: maxUpstreamResponseBytes,
      headers: {
        'Content-Type': 'application/json',
        ...(isBedrock ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(isOpenai ? { Authorization: `Bearer ${openaiApiKey}` } : {})
      }
    });

    const assistantText = getAssistantText(upstreamResponse.data);
    if (!assistantText) {
      console.error(JSON.stringify({
        level: 'error',
        event: `${provider}_invalid_response`,
        model,
        status: upstreamResponse.status,
        durationMs: Date.now() - startedAt
      }));
      return res.status(502).json({ error: `${isBedrock ? 'Bedrock Converse' : isOpenai ? 'OpenAI Responses' : 'Ollama'} returned an unexpected response format` });
    }

    const { response, truncated } = limitResponse(assistantText);
    console.info(JSON.stringify({
      level: 'info',
      event: 'chat_completed',
      provider,
      model,
      status: upstreamResponse.status,
      outputChars: assistantText.length,
      truncated,
      durationMs: Date.now() - startedAt
    }));
    return res.json({ response, truncated });
  } catch (error) {
    const upstreamBody = error.response && error.response.data;
    console.error(JSON.stringify({
      level: 'error',
      event: `${provider}_request_failed`,
      model,
      status: error.response && error.response.status,
      code: error.code,
      upstreamMessage: upstreamBody && (upstreamBody.message || upstreamBody.Message || upstreamBody.error),
      message: error.response
        ? `${provider === 'bedrock' ? 'Bedrock Converse' : provider === 'openai' ? 'OpenAI Responses' : 'Ollama'} returned an error response`
        : 'Network or timeout error',
      durationMs: Date.now() - startedAt
    }));
    return res.status(502).json({ error: `Failed to get a response from ${provider === 'bedrock' ? 'Bedrock Converse' : provider === 'openai' ? 'OpenAI Responses' : 'Ollama'}` });
  }
});

module.exports = router;
