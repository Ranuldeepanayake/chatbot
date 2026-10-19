const path = require('path');
const express = require('express');
const chatRouter = require('./routes/chat');

const app = express();

// Parse JSON requests with a size limit before routing chat prompts.
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/chat', chatRouter);

// Handle malformed JSON and other middleware errors in a consistent format.
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(JSON.stringify({
    level: 'error',
    event: 'request_error',
    method: req.method,
    path: req.path,
    message: error.message
  }));

  res.status(error.status || 500).json({ error: 'Invalid request' });
});

// Export the app separately so it can be started or tested by different entry points.
module.exports = app;
