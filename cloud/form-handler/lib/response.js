'use strict';

function jsonResponse(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

function emptyResponse(statusCode, headers = {}) {
  return {
    statusCode,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
    body: '',
  };
}

module.exports = { emptyResponse, jsonResponse };
