const app = require('./app');

const port = Number(process.env.PORT) || 4000;

// Keep HTTP startup separate from app setup to make the Express app reusable.
const server = app.listen(port, () => {
  console.info(JSON.stringify({
    level: 'info',
    event: 'server_started',
    port
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
