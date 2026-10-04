'use strict';

const { loadConfig } = require('./lib/config');
const { createConsentEvidence } = require('./lib/consent');
const { corsHeaders, evaluateOrigin, getHeader } = require('./lib/cors');
const email = require('./lib/email');
const { emptyResponse, jsonResponse } = require('./lib/response');
const telegram = require('./lib/telegram');
const { RequestError, decodeBody, validatePayload } = require('./lib/validation');

function safeRequestId(event) {
  const value = event.requestContext?.requestId;
  return typeof value === 'string' ? value.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100) : '';
}

function createTechnicalLogger(logger = console) {
  return (record) => {
    if (typeof logger.info === 'function') logger.info(JSON.stringify(record));
  };
}

function createHandler(dependencies = {}) {
  const sendEmail = dependencies.sendEmail || email.sendEmail;
  const sendTelegram = dependencies.sendTelegram || telegram.sendTelegram;
  const now = dependencies.now || (() => new Date());
  const loadRuntimeConfig = dependencies.loadConfig || loadConfig;
  const log = createTechnicalLogger(dependencies.logger);

  return async function handler(event = {}, context) {
    void context;
    const startedAt = Date.now();
    const requestId = safeRequestId(event);
    const method = typeof event.httpMethod === 'string' ? event.httpMethod.toUpperCase() : '';
    let config;

    try {
      config = loadRuntimeConfig();
    } catch {
      log({ requestId, status: 'configuration_failed', durationMs: Date.now() - startedAt });
      return jsonResponse(500, { ok: false, code: 'INTERNAL_ERROR' });
    }

    const originResult = evaluateOrigin(event.headers, config.allowedOrigins);
    if (!originResult.allowed) {
      log({ requestId, status: 'origin_rejected', durationMs: Date.now() - startedAt });
      return jsonResponse(403, { ok: false, code: 'ORIGIN_NOT_ALLOWED' });
    }
    const headers = corsHeaders(originResult.origin);

    if (method === 'OPTIONS') {
      log({ requestId, status: 'preflight_ok', durationMs: Date.now() - startedAt });
      return emptyResponse(204, headers);
    }

    if (method !== 'POST') {
      log({ requestId, status: 'method_rejected', durationMs: Date.now() - startedAt });
      return jsonResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED' }, { ...headers, Allow: 'POST, OPTIONS' });
    }

    const contentType = getHeader(event.headers, 'content-type');
    const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      log({ requestId, status: 'content_type_rejected', durationMs: Date.now() - startedAt });
      return jsonResponse(415, { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' }, headers);
    }

    let fields;
    try {
      fields = validatePayload(decodeBody(event));
    } catch (error) {
      const knownError = error instanceof RequestError;
      log({ requestId, status: 'request_rejected', durationMs: Date.now() - startedAt });
      return jsonResponse(
        knownError ? error.statusCode : 400,
        { ok: false, code: knownError ? error.code : 'VALIDATION_ERROR' },
        headers,
      );
    }

    const evidence = createConsentEvidence(event, now);

    try {
      await sendEmail({ fields, evidence, config });
    } catch {
      log({
        requestId,
        status: 'delivery_failed',
        email: 'failed',
        telegram: 'not_attempted',
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse(
        503,
        { ok: false, accepted: false, code: 'DELIVERY_FAILED', retryable: true },
        headers,
      );
    }

    let telegramNotified = false;
    try {
      telegramNotified = await sendTelegram({ config, requestId });
    } catch {
      telegramNotified = false;
    }

    log({
      requestId,
      status: 'accepted',
      email: 'success',
      telegram: telegramNotified ? 'success' : 'failed_or_disabled',
      durationMs: Date.now() - startedAt,
    });
    return jsonResponse(200, { ok: true, accepted: true, telegramNotified }, headers);
  };
}

module.exports.handler = createHandler();
module.exports.createHandler = createHandler;
