'use strict';

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === target);
  const value = key ? headers[key] : '';
  return typeof value === 'string' ? value.trim() : '';
}

function evaluateOrigin(headers, allowedOrigins) {
  const origin = getHeader(headers, 'origin');
  return {
    origin,
    allowed: origin !== '' && allowedOrigins.has(origin),
  };
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

module.exports = { corsHeaders, evaluateOrigin, getHeader };
