'use strict';

const PRODUCTION_ORIGIN = 'https://alabspace.com';
const CONSENT_REVISION = '12.10.2026';
const FORM_NAME = 'contact';
const FORM_LABEL = 'Форма обратной связи';
const MAIL_SUBJECT = 'Новая заявка с сайта A.LAB';
const TELEGRAM_TEXT = 'Новая заявка с сайта A.LAB. Проверьте почту.';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_ENCODED_BODY_BYTES = Math.ceil(MAX_BODY_BYTES / 3) * 4;
const SMTP_TIMEOUTS = Object.freeze({
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

const USER_FIELDS = Object.freeze(['name', 'email', 'phone', 'messenger', 'industry', 'message']);
const META_FIELDS = Object.freeze(['consent', 'consentRevision', 'formName']);
const ALLOWED_PAYLOAD_FIELDS = Object.freeze([...USER_FIELDS, ...META_FIELDS]);

const FIELD_LIMITS = Object.freeze({
  name: 120,
  email: 254,
  phone: 40,
  messenger: 120,
  industry: 200,
  message: 5000,
});

function parseAllowedOrigins(rawValue) {
  const values = (rawValue || PRODUCTION_ORIGIN)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0 || values.includes('*')) {
    throw new Error('ALLOWED_ORIGINS must contain an explicit origin allowlist');
  }

  return new Set(values.map((value) => {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== value) {
      throw new Error('ALLOWED_ORIGINS contains an invalid origin');
    }
    return url.origin;
  }));
}

function parsePort(value) {
  const port = Number(value || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT is invalid');
  }
  return port;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Boolean environment value is invalid');
}

function loadConfig(env = process.env) {
  const smtpPort = parsePort(env.SMTP_PORT);
  const smtpSecure = parseBoolean(env.SMTP_SECURE, true);
  if (smtpPort !== 465 || smtpSecure !== true) {
    throw new Error('SMTP must use port 465 with implicit TLS');
  }

  return {
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    smtp: {
      host: env.SMTP_HOST || 'smtp.yandex.ru',
      port: smtpPort,
      secure: smtpSecure,
      user: env.SMTP_USER || '',
      password: env.SMTP_PASSWORD || '',
      ...SMTP_TIMEOUTS,
    },
    mail: {
      from: env.MAIL_FROM || '',
      to: env.MAIL_TO || 'work@alabspace.ru',
      subject: MAIL_SUBJECT,
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || '',
      chatId: env.TELEGRAM_CHAT_ID || '',
      timeoutMs: 5000,
    },
  };
}

module.exports = {
  ALLOWED_PAYLOAD_FIELDS,
  CONSENT_REVISION,
  FIELD_LIMITS,
  FORM_LABEL,
  FORM_NAME,
  MAIL_SUBJECT,
  MAX_BODY_BYTES,
  MAX_ENCODED_BODY_BYTES,
  META_FIELDS,
  PRODUCTION_ORIGIN,
  SMTP_TIMEOUTS,
  TELEGRAM_TEXT,
  USER_FIELDS,
  loadConfig,
};
