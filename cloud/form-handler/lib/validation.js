'use strict';

const {
  ALLOWED_PAYLOAD_FIELDS,
  CONSENT_REVISION,
  FIELD_LIMITS,
  FORM_NAME,
  MAX_BODY_BYTES,
  MAX_ENCODED_BODY_BYTES,
} = require('./config');

class RequestError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'RequestError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function decodeBody(event) {
  if (typeof event.body !== 'string' || event.body.length === 0) {
    throw new RequestError('VALIDATION_ERROR', 400);
  }

  const rawSize = Buffer.byteLength(event.body, 'utf8');
  const rawLimit = event.isBase64Encoded === true ? MAX_ENCODED_BODY_BYTES : MAX_BODY_BYTES;
  if (rawSize > rawLimit) {
    throw new RequestError('PAYLOAD_TOO_LARGE', 413);
  }

  let decoded;
  if (event.isBase64Encoded === true) {
    const compact = event.body.replace(/\s/g, '');
    if (compact.length === 0 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
      throw new RequestError('INVALID_JSON', 400);
    }
    const decodedBuffer = Buffer.from(compact, 'base64');
    if (decodedBuffer.byteLength > MAX_BODY_BYTES) {
      throw new RequestError('PAYLOAD_TOO_LARGE', 413);
    }
    decoded = decodedBuffer.toString('utf8');
  } else {
    decoded = event.body;
  }

  if (event.isBase64Encoded !== true && Buffer.byteLength(decoded, 'utf8') > MAX_BODY_BYTES) {
    throw new RequestError('PAYLOAD_TOO_LARGE', 413);
  }

  try {
    return JSON.parse(decoded);
  } catch {
    throw new RequestError('INVALID_JSON', 400);
  }
}

function normalizeString(value, { required, maxLength }) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (required && normalized.length === 0) return null;
  if (normalized.length > maxLength) return null;
  return normalized;
}

function isValidEmail(value) {
  if (value.length > FIELD_LIMITS.email || /[\s\r\n,<>()]/.test(value)) return false;
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value);
}

function isValidPhone(value) {
  if (!/^[+\d\s().-]+$/.test(value)) return false;
  const digitCount = value.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 15;
}

function validatePayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RequestError('VALIDATION_ERROR', 400);
  }

  const keys = Object.keys(payload);
  if (keys.some((key) => !ALLOWED_PAYLOAD_FIELDS.includes(key))) {
    throw new RequestError('VALIDATION_ERROR', 400);
  }

  const name = normalizeString(payload.name, { required: true, maxLength: FIELD_LIMITS.name });
  const email = payload.email === undefined || payload.email === ''
    ? ''
    : normalizeString(payload.email, { required: false, maxLength: FIELD_LIMITS.email });
  const phone = payload.phone === undefined || payload.phone === ''
    ? ''
    : normalizeString(payload.phone, { required: false, maxLength: FIELD_LIMITS.phone });
  const message = normalizeString(payload.message, { required: true, maxLength: FIELD_LIMITS.message });

  if (
    name === null
    || email === null
    || (email !== '' && (email !== payload.email || !isValidEmail(email)))
    || phone === null
    || (phone !== '' && (phone !== payload.phone || !isValidPhone(phone)))
    || (email === '' && phone === '')
    || message === null
    || payload.consent !== true
    || payload.consentRevision !== CONSENT_REVISION
    || payload.formName !== FORM_NAME
  ) {
    throw new RequestError('VALIDATION_ERROR', 400);
  }

  return Object.freeze({ name, email, phone, message });
}

module.exports = { RequestError, decodeBody, isValidEmail, isValidPhone, validatePayload };
