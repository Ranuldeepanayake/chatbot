const path = require('path');
const express = require('express');
const chatRouter = require('./routes/chat');
const { write: log } = require('./logger');

const app = express();

// Parse JSON requests with a size limit before routing chat prompts.
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/chat', chatRouter);

// Build the public origin per request so deployments behind a reverse proxy do not
// need generated files. PUBLIC_BASE_URL can override forwarded host/protocol values.
function getPublicOrigin(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

// Advertise the only crawlable application page using the current request origin.
app.get('/sitemap.xml', (req, res) => {
  const homepage = new URL('/', `${getPublicOrigin(req)}/`).toString();
  res.type('application/xml').send([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${homepage}</loc>`,
    '  </url>',
    '</urlset>'
  ].join('\n'));
});

// Keep robots.txt dynamic so its sitemap URL always matches the public origin.
app.get('/robots.txt', (req, res) => {
  const sitemap = new URL('/sitemap.xml', `${getPublicOrigin(req)}/`).toString();
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /chat',
    `Sitemap: ${sitemap}`
  ].join('\n'));
});

// Handle malformed JSON and other middleware errors in a consistent format.
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  log('error', 'app', {
    event: 'request_error',
    method: req.method,
    path: req.path,
    message: error.message
  });

  res.status(error.status || 500).json({ error: 'Invalid request' });
});

// Export the app separately so it can be started or tested by different entry points.
module.exports = app;
