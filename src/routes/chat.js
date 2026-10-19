const axios = require('axios');
const express = require('express');

const router = express.Router();
const defaultPostUrl = 'https://bedrock-mantle.ap-southeast-1.api.aws/v1';
const defaultOllamaUrl = 'http://localhost:11434/api/generate';
const defaultOllamaModel = 'llama3.2';

function getProviderConfig() {
  const provider = (process.env.AI_PROVIDER || 'bedrock').toLowerCase();
  const ollamaUrl = process.env.OLLAMA_URL || defaultOllamaUrl;
  const ollamaModel = process.env.OLLAMA_MODEL || defaultOllamaModel;

  return {
    provider: provider === 'ollama' ? 'ollama' : 'bedrock',
    bedrockUrl: process.env.POST_REQUEST_URL || defaultPostUrl,
    ollamaUrl,
    ollamaModel
  };
}

// Bedrock models return different response shapes; normalize supported formats
// to one string so the browser always receives { response: "..." }.
function getAssistantText(data) {
  const candidates = [
    data && data.outputText,
    data && data.generation,
    data && data.completion,
    data && data.results && data.results[0] && data.results[0].outputText,
    data && data.outputs && data.outputs[0] && data.outputs[0].text,
    data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content,
    data && data.choices && data.choices[0] && data.choices[0].text,
    data && data.output && data.output.message && Array.isArray(data.output.message.content) &&
      data.output.message.content.map((item) => item && typeof item.text === 'string' ? item.text : '').filter(Boolean).join('')
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
}

router.get('/config', (req, res) => {
  const config = getProviderConfig();
  res.json({
    provider: config.provider,
    model: config.provider === 'ollama' ? config.ollamaModel : null,
    ollama: {
      configured: Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL),
      model: config.ollamaModel
    },
    bedrock: {
      configured: Boolean(process.env.ACCESS_TOKEN)
    }
  });
});

// POST /chat validates the browser request, invokes the configured provider, and
// translates its response into the stable API shape expected by the frontend.
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
  const accessToken = process.env.ACCESS_TOKEN;

  // Bedrock needs a token; Ollama is local and intentionally does not.
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
    const upstreamResponse = provider === 'ollama'
      ? await axios.post(config.ollamaUrl, {
        model: config.ollamaModel,
        prompt,
        stream: false
      }, {
        timeout: 120000,
        headers: { 'Content-Type': 'application/json' }
      })
      : await axios.post(config.bedrockUrl, {
        inputText: prompt
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });

    const response = provider === 'ollama'
      ? upstreamResponse.data && upstreamResponse.data.response
      : getAssistantText(upstreamResponse.data);

    // A successful HTTP status is not enough; ensure the model actually returned text.
    if (!response) {
      console.error(JSON.stringify({
        level: 'error',
        event: `${provider}_invalid_response`,
        status: upstreamResponse.status,
        durationMs: Date.now() - startedAt
      }));
      return res.status(502).json({ error: `${provider === 'ollama' ? 'Ollama' : 'Bedrock'} returned an unexpected response format` });
    }

    console.info(JSON.stringify({
      level: 'info',
      event: 'chat_completed',
      provider,
      status: upstreamResponse.status,
      durationMs: Date.now() - startedAt
    }));
    return res.json({ response });
  } catch (error) {
    // Log operational details without including the prompt, token, or upstream body.
    console.error(JSON.stringify({
      level: 'error',
      event: `${provider}_request_failed`,
      status: error.response && error.response.status,
      code: error.code,
      message: error.response
        ? `${provider === 'ollama' ? 'Ollama' : 'Bedrock'} returned an error response`
        : 'Network or timeout error',
      durationMs: Date.now() - startedAt
    }));
    return res.status(502).json({ error: `Failed to get a response from ${provider === 'ollama' ? 'Ollama' : 'Bedrock'}` });
  }
});

module.exports = router;
