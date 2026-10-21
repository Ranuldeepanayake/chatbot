'use strict';

// Centralize structured logging so every application log has timestamp and module
// context for troubleshooting across the HTTP and provider layers.
function write(level, module, fields) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    module,
    ...fields
  };
  const writer = level === 'error' ? console.error : console.info;
  writer(JSON.stringify(payload));
}

module.exports = { write };
