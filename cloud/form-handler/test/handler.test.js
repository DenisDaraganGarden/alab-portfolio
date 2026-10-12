'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createHandler } = require('../index');
const {
  CONSENT_REVISION,
  FORM_NAME,
  MAIL_SUBJECT,
  MAX_BODY_BYTES,
  MAX_ENCODED_BODY_BYTES,
  SMTP_TIMEOUTS,
  TELEGRAM_TEXT,
  loadConfig,
} = require('../lib/config');
const { buildPlainText, sendEmail } = require('../lib/email');
const { sendTelegram } = require('../lib/telegram');

const ORIGIN = 'https://alabspace.com';
const FIXED_DATE = new Date('2026-10-04T12:34:56.000Z');

function validPayload(overrides = {}) {
  return {
    name: 'Иван',
    email: 'person@example.test',
    phone: '+7 000 000-00-00',
    messenger: '@person',
    industry: 'Дизайн',
    message: 'Тестовая заявка',
    consent: true,
    consentRevision: CONSENT_REVISION,
    formName: FORM_NAME,
    ...overrides,
  };
}

function eventFor(payload = validPayload(), overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
    requestContext: {
      identity: { sourceIp: '203.0.113.10' },
      requestId: 'request-123',
    },
    ...overrides,
  };
}

function testConfig() {
  return {
    allowedOrigins: new Set([ORIGIN]),
    smtp: {
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      user: 'placeholder-user',
      password: 'placeholder-password',
      ...SMTP_TIMEOUTS,
    },
    mail: {
      from: 'sender@example.test',
      to: 'receiver@example.test',
      subject: MAIL_SUBJECT,
    },
    telegram: {
      botToken: 'placeholder-token',
      chatId: 'placeholder-chat',
      timeoutMs: 100,
    },
  };
}

function harness(overrides = {}) {
  const logs = [];
  const calls = { email: [], telegram: [] };
  const handler = createHandler({
    loadConfig: () => testConfig(),
    now: () => FIXED_DATE,
    logger: { info: (line) => logs.push(line) },
    sendEmail: async (args) => calls.email.push(args),
    sendTelegram: async (args) => {
      calls.telegram.push(args);
      return true;
    },
    ...overrides,
  });
  return { calls, handler, logs };
}

function parsedBody(response) {
  return response.body ? JSON.parse(response.body) : null;
}

test('OPTIONS возвращает корректный preflight без wildcard', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(undefined, { httpMethod: 'OPTIONS', body: '' }));
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['Access-Control-Allow-Origin'], ORIGIN);
  assert.equal(response.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
  assert.notEqual(response.headers['Access-Control-Allow-Origin'], '*');
});

test('метод, отличный от POST/OPTIONS, возвращает 405', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(undefined, { httpMethod: 'GET', body: '' }));
  assert.equal(response.statusCode, 405);
  assert.equal(parsedBody(response).code, 'METHOD_NOT_ALLOWED');
});

test('неразрешённый Origin отклоняется', async () => {
  const { handler } = harness();
  const request = eventFor();
  request.headers.Origin = 'https://evil.example';
  const response = await handler(request);
  assert.equal(response.statusCode, 403);
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
});

test('сломанный JSON возвращает безопасную ошибку', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(undefined, { body: '{broken' }));
  assert.equal(response.statusCode, 400);
  assert.deepEqual(parsedBody(response), { ok: false, code: 'INVALID_JSON' });
});

test('base64 JSON декодируется и принимается', async () => {
  const { handler } = harness();
  const body = Buffer.from(JSON.stringify(validPayload()), 'utf8').toString('base64');
  const response = await handler(eventFor(undefined, { body, isBase64Encoded: true }));
  assert.equal(response.statusCode, 200);
});

test('пустой payload отклоняется', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(undefined, { body: '' }));
  assert.equal(response.statusCode, 400);
  assert.equal(parsedBody(response).code, 'VALIDATION_ERROR');
});

test('отсутствие согласия отклоняется', async () => {
  const payload = validPayload();
  delete payload.consent;
  const { handler } = harness();
  const response = await handler(eventFor(payload));
  assert.equal(response.statusCode, 400);
});

test('неверная редакция согласия отклоняется', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload({ consentRevision: '01.01.2000' })));
  assert.equal(response.statusCode, 400);
});

test('невалидный email отклоняется', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload({ email: 'not-an-email' })));
  assert.equal(response.statusCode, 400);
});

test('phone only принимается', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor(validPayload({ email: '', phone: '+7 (981) 834-32-86' })));
  assert.equal(response.statusCode, 200);
  assert.equal(calls.email[0].fields.email, '');
});

test('email only принимается', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor(validPayload({ phone: '' })));
  assert.equal(response.statusCode, 200);
  assert.equal(calls.email[0].fields.phone, '');
});

test('phone + email принимаются', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload()));
  assert.equal(response.statusCode, 200);
});

test('ни phone, ни email не принимаются', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor(validPayload({ email: '', phone: '' })));
  assert.equal(response.statusCode, 400);
  assert.equal(calls.email.length, 0);
});

test('переданный невалидный email отклоняется даже при валидном phone', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor(validPayload({ email: 'not-an-email' })));
  assert.equal(response.statusCode, 400);
  assert.equal(calls.email.length, 0);
});

test('слишком длинное поле отклоняется', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload({ name: 'x'.repeat(121) })));
  assert.equal(response.statusCode, 400);
});

test('object вместо ожидаемой строки отклоняется', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload({ name: { polluted: true } })));
  assert.equal(response.statusCode, 400);
});

test('messenger и industry принимаются и передаются только в email', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 200);
  assert.equal(calls.email[0].fields.messenger, '@person');
  assert.equal(calls.email[0].fields.industry, 'Дизайн');
  assert.deepEqual(Object.keys(calls.telegram[0]).sort(), ['config', 'requestId']);
});

test('неожиданные поля отклоняются', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload({ unexpected: 'value' })));
  assert.equal(response.statusCode, 400);
});

test('body больше лимита отклоняется до доставки', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor(undefined, { body: `"${'x'.repeat(MAX_BODY_BYTES)}"` }));
  assert.equal(response.statusCode, 413);
  assert.equal(calls.email.length, 0);
});

test('сырой base64 body больше transport-лимита отклоняется до decode', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor(undefined, {
    body: 'A'.repeat(MAX_ENCODED_BODY_BYTES + 1),
    isBase64Encoded: true,
  }));
  assert.equal(response.statusCode, 413);
  assert.equal(calls.email.length, 0);
});

test('base64 whitespace bypass больше 1 MiB отклоняется до decode', async () => {
  const { handler, calls } = harness();
  const encoded = Buffer.from(JSON.stringify(validPayload()), 'utf8').toString('base64');
  const response = await handler(eventFor(undefined, {
    body: `${encoded}${' '.repeat((1024 * 1024) + 1)}`,
    isBase64Encoded: true,
  }));
  assert.equal(response.statusCode, 413);
  assert.equal(calls.email.length, 0);
});

test('decoded base64 больше 16 KiB отклоняется', async () => {
  const { handler, calls } = harness();
  const body = Buffer.alloc(MAX_BODY_BYTES + 1, 0x78).toString('base64');
  assert.ok(Buffer.byteLength(body, 'utf8') <= MAX_ENCODED_BODY_BYTES);
  const response = await handler(eventFor(undefined, { body, isBase64Encoded: true }));
  assert.equal(response.statusCode, 413);
  assert.equal(calls.email.length, 0);
});

test('malformed base64 отклоняется как INVALID_JSON', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(undefined, { body: '%%%=', isBase64Encoded: true }));
  assert.equal(response.statusCode, 400);
  assert.equal(parsedBody(response).code, 'INVALID_JSON');
});

for (const [label, body] of [
  ['null body', null],
  ['undefined body', undefined],
]) {
  test(`${label} отклоняется`, async () => {
    const { handler } = harness();
    const response = await handler(eventFor(undefined, { body }));
    assert.equal(response.statusCode, 400);
    assert.equal(parsedBody(response).code, 'VALIDATION_ERROR');
  });
}

for (const [label, body] of [
  ['JSON null', 'null'],
  ['JSON array', '[]'],
]) {
  test(`${label} отклоняется`, async () => {
    const { handler } = harness();
    const response = await handler(eventFor(undefined, { body }));
    assert.equal(response.statusCode, 400);
    assert.equal(parsedBody(response).code, 'VALIDATION_ERROR');
  });
}

test('валидный payload даёт стабильный success contract', async () => {
  const { handler } = harness();
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsedBody(response), { ok: true, accepted: true, telegramNotified: true });
});

test('IP берётся из server event, а не из пользовательских данных', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 200);
  assert.equal(calls.email[0].evidence.sourceIp, '203.0.113.10');
  assert.equal(Object.hasOwn(calls.email[0].fields, 'sourceIp'), false);
});

test('timestamp создаётся на сервере в однозначном UTC-формате', async () => {
  const { handler, calls } = harness();
  await handler(eventFor());
  assert.equal(calls.email[0].evidence.serverTimestamp, '2026-10-04 12:34:56');
  assert.equal(calls.email[0].evidence.timezone, 'UTC');
});

test('SMTP success приводит к accepted=true', async () => {
  let smtpCalls = 0;
  const { handler } = harness({ sendEmail: async () => { smtpCalls += 1; } });
  const response = await handler(eventFor());
  assert.equal(smtpCalls, 1);
  assert.equal(parsedBody(response).accepted, true);
});

test('Nodemailer получает фиксированные headers и plain text', async () => {
  let transportOptions;
  let mailOptions;
  const config = testConfig();
  await sendEmail({
    fields: {
      name: 'Иван',
      email: 'person@example.test',
      phone: '',
      message: 'Тестовая заявка',
    },
    evidence: {
      serverTimestamp: '2026-10-04 12:34:56',
      timezone: 'UTC',
      sourceIp: '203.0.113.10',
      consentRevision: CONSENT_REVISION,
      formName: 'Форма обратной связи',
    },
    config,
    transportFactory: (options) => {
      transportOptions = options;
      return {
        sendMail: async (optionsToSend) => { mailOptions = optionsToSend; },
      };
    },
  });
  assert.equal(transportOptions.host, 'smtp.example.test');
  assert.equal(transportOptions.connectionTimeout, SMTP_TIMEOUTS.connectionTimeout);
  assert.equal(transportOptions.greetingTimeout, SMTP_TIMEOUTS.greetingTimeout);
  assert.equal(transportOptions.socketTimeout, SMTP_TIMEOUTS.socketTimeout);
  assert.equal(mailOptions.subject, MAIL_SUBJECT);
  assert.equal(mailOptions.replyTo, 'person@example.test');
  assert.match(mailOptions.text, /Тестовая заявка/);
  assert.equal(mailOptions.html, undefined);
});

test('phone-only заявка не устанавливает Reply-To', async () => {
  let mailOptions;
  await sendEmail({
    fields: { name: 'Иван', email: '', phone: '+7 (981) 834-32-86', message: 'Тест' },
    evidence: {
      serverTimestamp: '2026-10-04 12:34:56',
      timezone: 'UTC',
      sourceIp: '203.0.113.10',
      consentRevision: CONSENT_REVISION,
      formName: 'Форма обратной связи',
    },
    config: testConfig(),
    transportFactory: () => ({
      sendMail: async (optionsToSend) => { mailOptions = optionsToSend; },
    }),
  });
  assert.equal(Object.hasOwn(mailOptions, 'replyTo'), false);
  assert.match(mailOptions.text, /Email:\nНе указан/);
});

test('ошибка Nodemailer пробрасывается в email-first оркестрацию', async () => {
  const config = testConfig();
  await assert.rejects(
    sendEmail({
      fields: { name: 'Иван', email: 'person@example.test', phone: '', message: 'Сообщение' },
      evidence: {
        serverTimestamp: '2026-10-04 12:34:56',
        timezone: 'UTC',
        sourceIp: '203.0.113.10',
        consentRevision: CONSENT_REVISION,
        formName: 'Форма обратной связи',
      },
      config,
      transportFactory: () => ({ sendMail: async () => { throw new Error('smtp failure'); } }),
    }),
    /smtp failure/,
  );
});

test('SMTP fail возвращает retryable DELIVERY_FAILED', async () => {
  const { handler } = harness({ sendEmail: async () => { throw new Error('sensitive smtp details'); } });
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 503);
  assert.deepEqual(parsedBody(response), {
    ok: false,
    accepted: false,
    code: 'DELIVERY_FAILED',
    retryable: true,
  });
  assert.doesNotMatch(response.body, /sensitive smtp details/);
});

test('email success + Telegram success отражается в contract', async () => {
  const { handler } = harness({ sendTelegram: async () => true });
  const response = await handler(eventFor());
  assert.equal(parsedBody(response).telegramNotified, true);
});

test('email success + Telegram fail не отменяет принятие заявки', async () => {
  const { handler } = harness({ sendTelegram: async () => { throw new Error('telegram failure'); } });
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsedBody(response), { ok: true, accepted: true, telegramNotified: false });
});

test('email fail не вызывает Telegram', async () => {
  let telegramCalls = 0;
  const { handler } = harness({
    sendEmail: async () => { throw new Error('smtp failure'); },
    sendTelegram: async () => { telegramCalls += 1; return true; },
  });
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 503);
  assert.equal(telegramCalls, 0);
});

test('SMTP timeout/error возвращает 503 и не вызывает Telegram', async () => {
  let telegramCalls = 0;
  const timeoutError = Object.assign(new Error('socket timeout for private@example.test'), { code: 'ETIMEDOUT' });
  const { handler } = harness({
    sendEmail: async () => { throw timeoutError; },
    sendTelegram: async () => { telegramCalls += 1; return true; },
  });
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 503);
  assert.deepEqual(parsedBody(response), {
    ok: false,
    accepted: false,
    code: 'DELIVERY_FAILED',
    retryable: true,
  });
  assert.equal(telegramCalls, 0);
  assert.doesNotMatch(response.body, /private@example|ETIMEDOUT|socket timeout/);
});

test('Telegram payload содержит только техническое уведомление', async () => {
  let outgoing;
  const config = testConfig();
  const notified = await sendTelegram({
    config,
    requestId: 'request-123',
    fetchImpl: async (url, options) => {
      outgoing = { url, options };
      return { ok: true, text: async () => '{"ok":true,"result":{}}' };
    },
  });
  const body = JSON.parse(outgoing.options.body);
  assert.equal(notified, true);
  assert.match(body.text, new RegExp(TELEGRAM_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(body.text, /request-123/);
  assert.doesNotMatch(body.text, /Иван|person@example|203\.0\.113|Тестовая заявка/);
  assert.equal(outgoing.options.signal instanceof AbortSignal, true);
});

test('plain text email включает evidence и все подтверждённые поля', () => {
  const text = buildPlainText(
    {
      name: 'Иван',
      email: 'person@example.test',
      phone: '',
      messenger: '@person',
      industry: 'Дизайн',
      message: 'Тестовая заявка',
    },
    {
      serverTimestamp: '2026-10-04 12:34:56',
      timezone: 'UTC',
      sourceIp: '203.0.113.10',
      consentRevision: CONSENT_REVISION,
      formName: 'Форма обратной связи',
    },
  );
  assert.match(text, /Пользователь выразил согласие/);
  assert.match(text, /12\.10\.2026/);
  assert.match(text, /Мессенджер:\n@person/);
  assert.match(text, /Сфера деятельности:\nДизайн/);
  assert.match(text, /Дата и время отправки \(серверное\): \(2026-10-04 12:34:56\) \(UTC\)/);
});

test('ответы не отражают персональные данные', async () => {
  const secretValue = 'PRIVATE_UNIQUE_VALUE';
  const { handler } = harness({ sendEmail: async () => { throw new Error(secretValue); } });
  const response = await handler(eventFor(validPayload({ message: secretValue })));
  assert.doesNotMatch(response.body, new RegExp(secretValue));
  assert.doesNotMatch(response.body, /person@example\.test|203\.0\.113\.10/);
});

test('логи не содержат body, IP, email или сообщение', async () => {
  const { handler, logs } = harness();
  await handler(eventFor());
  const combined = logs.join('\n');
  assert.match(combined, /request-123/);
  assert.match(combined, /accepted/);
  assert.doesNotMatch(combined, /Иван|person@example|203\.0\.113|Тестовая заявка/);
});

test('неверный Content-Type отклоняется', async () => {
  const { handler } = harness();
  const request = eventFor();
  request.headers['Content-Type'] = 'text/plain';
  const response = await handler(request);
  assert.equal(response.statusCode, 415);
  assert.equal(parsedBody(response).code, 'UNSUPPORTED_MEDIA_TYPE');
});

for (const contentType of [
  'application/json',
  'application/json; charset=utf-8',
  'application/json;charset=UTF-8',
  'Application/JSON; Charset=UTF-8',
]) {
  test(`Content-Type ${contentType} принимается`, async () => {
    const { handler } = harness();
    const request = eventFor();
    request.headers['Content-Type'] = contentType;
    const response = await handler(request);
    assert.equal(response.statusCode, 200);
  });
}

for (const [label, contentType] of [
  ['application/jsonp', 'application/jsonp'],
  ['application/json-evil', 'application/json-evil'],
  ['text/plain', 'text/plain'],
  ['missing Content-Type', null],
]) {
  test(`${label} отклоняется как unsupported media type`, async () => {
    const { handler } = harness();
    const request = eventFor();
    if (contentType === null) delete request.headers['Content-Type'];
    else request.headers['Content-Type'] = contentType;
    const response = await handler(request);
    assert.equal(response.statusCode, 415);
    assert.equal(parsedBody(response).code, 'UNSUPPORTED_MEDIA_TYPE');
  });
}

test('точный production Origin принимается', async () => {
  const { handler } = harness();
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Access-Control-Allow-Origin'], ORIGIN);
});

for (const [label, origin] of [
  ['поддомен-подделка', 'https://alabspace.com.evil.com'],
  ['HTTP origin', 'http://alabspace.com'],
  ['Origin null', 'null'],
  ['missing Origin', null],
]) {
  test(`${label} отклоняется CORS`, async () => {
    const { handler } = harness();
    const request = eventFor();
    if (origin === null) delete request.headers.Origin;
    else request.headers.Origin = origin;
    const response = await handler(request);
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
  });
}

for (const email of [
  'a@b.com>',
  'a@b.com,foo',
  'foo@example.com\r\nBcc:other@example.com',
  'foo @example.com',
  ' foo@example.com',
  '<foo@example.com>',
  'foo@example.com,bcc@example.com',
]) {
  test(`опасный email отклоняется: ${JSON.stringify(email)}`, async () => {
    const { handler } = harness();
    const response = await handler(eventFor(validPayload({ email })));
    assert.equal(response.statusCode, 400);
  });
}

test('обычный email с точкой и plus-tag принимается', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload({ email: 'name.surname+tag@example.co.uk' })));
  assert.equal(response.statusCode, 200);
});

test('слишком длинная industry отклоняется', async () => {
  const { handler } = harness();
  const response = await handler(eventFor(validPayload({ industry: 'x'.repeat(201) })));
  assert.equal(response.statusCode, 400);
});

test('sourceIp из body отклоняется и не может подменить server event', async () => {
  const { handler, calls } = harness();
  const response = await handler(eventFor(validPayload({ sourceIp: '198.51.100.99' })));
  assert.equal(response.statusCode, 400);
  assert.equal(calls.email.length, 0);
});

for (const [label, payload] of [
  ['own constructor field', validPayload({ constructor: { prototype: { polluted: true } } })],
  ['nested message object', validPayload({ message: { text: 'abuse' } })],
  ['numeric email type', validPayload({ email: 42 })],
]) {
  test(`${label} отклоняется`, async () => {
    const { handler } = harness();
    const response = await handler(eventFor(payload));
    assert.equal(response.statusCode, 400);
  });
}

test('SMTP config принимает только 465 + secure true и добавляет таймауты', () => {
  const config = loadConfig({ SMTP_PORT: '465', SMTP_SECURE: 'true' });
  assert.equal(config.smtp.port, 465);
  assert.equal(config.smtp.secure, true);
  assert.equal(config.smtp.connectionTimeout, SMTP_TIMEOUTS.connectionTimeout);
  assert.equal(config.smtp.greetingTimeout, SMTP_TIMEOUTS.greetingTimeout);
  assert.equal(config.smtp.socketTimeout, SMTP_TIMEOUTS.socketTimeout);
});

for (const env of [
  { SMTP_PORT: '465', SMTP_SECURE: 'false' },
  { SMTP_PORT: '587', SMTP_SECURE: 'true' },
]) {
  test(`несовместимый SMTP config отклоняется: ${JSON.stringify(env)}`, () => {
    assert.throws(() => loadConfig(env), /port 465 with implicit TLS/);
  });
}

test('несовместимый SMTP config завершает request до отправки', async () => {
  let emailCalls = 0;
  const { handler } = harness({
    loadConfig: () => loadConfig({ SMTP_PORT: '465', SMTP_SECURE: 'false' }),
    sendEmail: async () => { emailCalls += 1; },
  });
  const response = await handler(eventFor());
  assert.equal(response.statusCode, 500);
  assert.deepEqual(parsedBody(response), { ok: false, code: 'INTERNAL_ERROR' });
  assert.equal(emailCalls, 0);
});

function telegramHttpResponse({ httpOk = true, body = '{"ok":true}' } = {}) {
  return {
    ok: httpOk,
    text: async () => body,
  };
}

test('Telegram HTTP non-2xx считается failure', async () => {
  await assert.rejects(sendTelegram({
    config: testConfig(),
    requestId: 'request-telegram-non2xx',
    fetchImpl: async () => telegramHttpResponse({ httpOk: false, body: '{"ok":false}' }),
  }), /TELEGRAM_DELIVERY_ERROR/);
});

test('Telegram timeout считается failure', async () => {
  const config = testConfig();
  config.telegram.timeoutMs = 5;
  await assert.rejects(sendTelegram({
    config,
    requestId: 'request-telegram-timeout',
    fetchImpl: async (_url, options) => new Promise((resolve, reject) => {
      void resolve;
      options.signal.addEventListener('abort', () => reject(new Error('aborted private data')));
    }),
  }), /aborted private data/);
});

test('Telegram network error считается failure', async () => {
  await assert.rejects(sendTelegram({
    config: testConfig(),
    requestId: 'request-telegram-network',
    fetchImpl: async () => { throw new Error('network private details'); },
  }), /network private details/);
});

for (const [label, body] of [
  ['ok:false', '{"ok":false,"description":"private"}'],
  ['invalid JSON', '{not-json'],
  ['empty body', ''],
  ['JSON array', '[]'],
  ['unexpected object', '{"result":{}}'],
]) {
  test(`Telegram HTTP 200 + ${label} считается failure`, async () => {
    await assert.rejects(sendTelegram({
      config: testConfig(),
      requestId: 'request-telegram-invalid',
      fetchImpl: async () => telegramHttpResponse({ body }),
    }));
  });
}

test('Telegram HTTP 200 + ok:true считается success', async () => {
  const notified = await sendTelegram({
    config: testConfig(),
    requestId: 'request-telegram-success',
    fetchImpl: async () => telegramHttpResponse({ body: '{"ok":true,"result":{}}' }),
  });
  assert.equal(notified, true);
});

test('Telegram failure после email не раскрывает PII и не отменяет accepted', async () => {
  const privateValue = 'private.person@example.test';
  const { handler, logs } = harness({
    sendTelegram: async () => { throw new Error(`Telegram rejected ${privateValue} token-secret`); },
  });
  const response = await handler(eventFor(validPayload({ email: privateValue })));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parsedBody(response), { ok: true, accepted: true, telegramNotified: false });
  assert.doesNotMatch(response.body, /private\.person|token-secret|Telegram rejected/);
  assert.doesNotMatch(logs.join('\n'), /private\.person|token-secret|Telegram rejected/);
});

test('SMTP failure log не содержит PII, secrets или exception details', async () => {
  const privateValue = 'private.person@example.test';
  const { handler, logs } = harness({
    sendEmail: async () => { throw new Error(`SMTP ${privateValue} password-secret`); },
  });
  const response = await handler(eventFor(validPayload({ email: privateValue })));
  assert.equal(response.statusCode, 503);
  const combined = `${response.body}\n${logs.join('\n')}`;
  assert.doesNotMatch(combined, /private\.person|password-secret|SMTP/);
});

test('параллельные вызовы не смешивают request-specific данные', async () => {
  const deliveries = [];
  const { handler } = harness({
    sendEmail: async ({ fields, evidence }) => {
      await new Promise((resolve) => setImmediate(resolve));
      deliveries.push({ email: fields.email, sourceIp: evidence.sourceIp });
    },
  });
  const first = eventFor(validPayload({ email: 'first@example.com' }));
  first.requestContext.identity.sourceIp = '203.0.113.1';
  first.requestContext.requestId = 'parallel-first';
  const second = eventFor(validPayload({ email: 'second@example.com' }));
  second.requestContext.identity.sourceIp = '203.0.113.2';
  second.requestContext.requestId = 'parallel-second';

  const responses = await Promise.all([handler(first), handler(second)]);
  assert.deepEqual(responses.map((response) => response.statusCode), [200, 200]);
  assert.deepEqual(deliveries.sort((a, b) => a.email.localeCompare(b.email)), [
    { email: 'first@example.com', sourceIp: '203.0.113.1' },
    { email: 'second@example.com', sourceIp: '203.0.113.2' },
  ]);
});
