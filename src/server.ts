import Fastify from 'fastify';
import stat from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closeDb,
  health,
  initDb,
  latestState,
  memory,
  recentMemory,
  saveState,
} from './db.js';
import { dashboard, deep, optionContext } from './engine.js';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

const dir = path.dirname(fileURLToPath(import.meta.url));

function requestIdValue(request: { id: string }): string {
  return request.id;
}

function safeError(
  requestIdValue: string,
  code: string,
  message: string,
) {
  return {
    ok: false,
    requestId: requestIdValue,
    error: {
      code,
      message,
    },
  };
}

function normalizeSymbol(value: unknown): string | null {
  const symbol = String(value || '').trim().toUpperCase();

  if (!/^[A-Z]{1,10}$/.test(symbol)) {
    return null;
  }

  return symbol;
}

app.get('/health', async (request) => {
  const id = request.id; 

  return {
    ok: true,
    requestId: id,
    service: 'nani-pro-x-v3',
    status: 'ok',
    liveTrading: false,
    executionAllowed: false,
    database: {
      connected: await health(),
    },
    timestamp: new Date().toISOString(),
  };
});

app.get('/api/dashboard', async (request, reply) => {
  const id = request.id; 
  const data = await dashboard();

  try {
    await saveState(data);
  } catch (error) {
    request.log.warn(
      { requestId: id, error },
      'Dashboard state could not be saved',
    );

    return {
      ...data,
      requestId: id,
      warnings: [
        ...data.reasons,
        'Current dashboard response is available, but persistent state could not be saved.',
      ],
      persistence: {
        saved: false,
      },
    };
  }

  reply.header('x-request-id', id);

  return {
    ...data,
    requestId: id,
    persistence: {
      saved: true,
    },
  };
});

app.get('/api/state', async (request, reply) => {
  const id = request.id; 

  try {
    const state = await latestState();

    reply.header('x-request-id', id);

    return {
      ok: true,
      requestId: id,
      state,
    };
  } catch (error) {
    request.log.error({ requestId: id, error }, 'State read failed');

    return reply.code(500).send(
      safeError(
        id,
        'STATE_READ_FAILED',
        'Persistent market state could not be loaded.',
      ),
    );
  }
});

app.get('/api/deep/:symbol', async (request, reply) => {
  const id = request.id; 
  const symbol = normalizeSymbol((request.params as { symbol?: string }).symbol);

  if (!symbol) {
    return reply
      .code(400)
      .send(safeError(id, 'INVALID_SYMBOL', 'A valid symbol is required.'));
  }

  reply.header('x-request-id', id);

  return {
    ...(await deep(symbol)),
    requestId: id,
  };
});

app.get('/api/options/:symbol', async (request, reply) => {
  const id = request.id; 
  const symbol = normalizeSymbol((request.params as { symbol?: string }).symbol);

  if (!symbol) {
    return reply
      .code(400)
      .send(safeError(id, 'INVALID_SYMBOL', 'A valid symbol is required.'));
  }

  reply.header('x-request-id', id);

  return {
    ...(await optionContext(symbol)),
    requestId: id,
  };
});

app.get('/api/memory', async (request, reply) => {
  const id = request.id; 

  try {
    const items = await recentMemory();

    reply.header('x-request-id', id);

    return {
      ok: true,
      requestId: id,
      items,
    };
  } catch (error) {
    request.log.error({ requestId: id, error }, 'Memory read failed');

    return reply.code(500).send(
      safeError(
        id,
        'MEMORY_READ_FAILED',
        'Persistent memory could not be loaded.',
      ),
    );
  }
});

app.post('/api/memory', async (request, reply) => {
  const id = request.id; 
  const body = (request.body || {}) as {
    kind?: unknown;
    content?: unknown;
    payload?: unknown;
  };

  const kind = String(body.kind || 'NOTE').trim().slice(0, 100);
  const content = String(body.content || '').trim();

  if (!content) {
    return reply
      .code(400)
      .send(safeError(id, 'MEMORY_CONTENT_REQUIRED', 'Memory content is required.'));
  }

  try {
    const item = await memory(kind || 'NOTE', content, body.payload);

    reply.header('x-request-id', id);

    return {
      ok: true,
      requestId: id,
      saved: true,
      item,
    };
  } catch (error) {
    request.log.error({ requestId: id, error }, 'Memory write failed');

    return reply.code(500).send(
      safeError(
        id,
        'MEMORY_WRITE_FAILED',
        'Memory could not be saved.',
      ),
    );
  }
});

app.post('/api/command', async (request, reply) => {
  const id = request.id; 
  const body = (request.body || {}) as { text?: unknown };
  const text = String(body.text || '').trim();

  if (!text) {
    return reply
      .code(400)
      .send(
        safeError(
          id,
          'COMMAND_TEXT_REQUIRED',
          'Enter a question for NANI before sending.',
        ),
      );
  }

  const data = await dashboard();

  const state = data.dataIntegrity.state;
  const decision = data.finalDecision.action;

  const answer =
    state === 'LIVE'
      ? [
          `Market regime: ${data.marketPulse.regime}.`,
          `SPY: ${data.marketPulse.spy.quote.price ?? 'Unavailable'}.`,
          `QQQ: ${data.marketPulse.qqq.quote.price ?? 'Unavailable'}.`,
          `NANI decision: ${decision}.`,
          ...data.reasons,
        ].join(' ')
      : [
          'NANI cannot validate the current SPY and QQQ market state.',
          `Market-data status: ${state}.`,
          'NANI decision: NO_TRADE.',
          ...data.reasons,
        ].join(' ');

  let saved = false;
  let memoryWarning: string | null = null;

  try {
    await memory('QUESTION', text, {
      answer,
      dataStatus: state,
      decision,
      generatedAt: data.generatedAt,
    });
    saved = true;
  } catch (error) {
    request.log.warn(
      { requestId: id, error },
      'Command answer could not be saved to memory',
    );
    memoryWarning = 'Answer is available, but it could not be saved to memory.';
  }

  reply.header('x-request-id', id);

  return {
    ok: true,
    requestId: id,
    answer,
    data,
    memory: {
      saved,
      warning: memoryWarning,
    },
  };
});

app.all('/api/execution/*', async (request, reply) => {
  const id = request.id; 

  return reply.code(403).send(
    safeError(
      id,
      'LIVE_TRADING_DISABLED',
      'Live trading is permanently disabled.',
    ),
  );
});

app.setErrorHandler((error, request, reply) => {
  const id = request.id;

  request.log.error(
    {
      requestId: id,
      route: request.routeOptions?.url,
      method: request.method,
      error,
    },
    'Unhandled NANI request error',
  );

  reply.header('x-request-id', id);

  return reply.code((error as { statusCode?: number }).statusCode || 500).send(
    safeError(
      id,
      'INTERNAL_SERVER_ERROR',
      'NANI could not complete this request.',
    ),
  );
});

app.register(stat, {
  root: path.join(dir, '../../dist/web'),
  prefix: '/',
});

app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith('/api/')) {
    return reply.code(404).send({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'API route not found.',
      },
    });
  }

  return reply.sendFile('index.html');
});

await initDb();

await app.listen({
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 10000),
});

process.on('SIGTERM', async () => {
  await app.close();
  await closeDb();
});
