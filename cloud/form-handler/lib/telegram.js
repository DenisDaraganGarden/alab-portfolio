'use strict';

const { TELEGRAM_TEXT } = require('./config');

function buildTelegramText(requestId) {
  const safeRequestId = typeof requestId === 'string' ? requestId.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100) : '';
  return safeRequestId ? `${TELEGRAM_TEXT}\nRequest ID: ${safeRequestId}` : TELEGRAM_TEXT;
}

async function sendTelegram({ config, requestId, fetchImpl = globalThis.fetch }) {
  if (!config.telegram.botToken || !config.telegram.chatId) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.telegram.timeoutMs);

  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegram.chatId,
          text: buildTelegramText(requestId),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) throw new Error('TELEGRAM_DELIVERY_ERROR');
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error('TELEGRAM_INVALID_RESPONSE');
    }
    if (result === null || typeof result !== 'object' || Array.isArray(result) || result.ok !== true) {
      throw new Error('TELEGRAM_DELIVERY_ERROR');
    }
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { buildTelegramText, sendTelegram };
