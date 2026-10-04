'use strict';

const { CONSENT_REVISION, FORM_LABEL } = require('./config');

function formatUtc(date) {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function createConsentEvidence(event, now = () => new Date()) {
  const sourceIp = event.requestContext?.identity?.sourceIp;
  return Object.freeze({
    consent: true,
    serverTimestamp: formatUtc(now()),
    timezone: 'UTC',
    sourceIp: typeof sourceIp === 'string' && sourceIp.length > 0 ? sourceIp : 'не определён',
    consentRevision: CONSENT_REVISION,
    formName: FORM_LABEL,
  });
}

module.exports = { createConsentEvidence, formatUtc };
