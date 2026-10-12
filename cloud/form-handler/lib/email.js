'use strict';

const nodemailer = require('nodemailer');

function ensureEmailConfig(config) {
  const required = [
    config.smtp.host,
    config.smtp.user,
    config.smtp.password,
    config.mail.from,
    config.mail.to,
  ];
  if (required.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error('EMAIL_CONFIGURATION_ERROR');
  }
}

function buildPlainText(fields, evidence) {
  return [
    'Новая заявка с сайта A.LAB',
    '',
    'Имя:',
    fields.name,
    '',
    'Email:',
    fields.email || 'Не указан',
    '',
    'Телефон:',
    fields.phone || 'Не указан',
    '',
    'Мессенджер:',
    fields.messenger || 'Не указан',
    '',
    'Сфера деятельности:',
    fields.industry || 'Не указана',
    '',
    'Сообщение:',
    fields.message,
    '',
    '---',
    `Пользователь выразил согласие на обработку персональных данных. Дата и время отправки (серверное): (${evidence.serverTimestamp}) (${evidence.timezone}). IP-адрес: ${evidence.sourceIp}. Редакция текста согласия: ${evidence.consentRevision}. Форма: ${evidence.formName}`,
  ].join('\n');
}

async function sendEmail({ fields, evidence, config, transportFactory = nodemailer.createTransport }) {
  ensureEmailConfig(config);
  const transport = transportFactory({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    connectionTimeout: config.smtp.connectionTimeout,
    greetingTimeout: config.smtp.greetingTimeout,
    socketTimeout: config.smtp.socketTimeout,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password,
    },
  });

  const mailOptions = {
    from: config.mail.from,
    to: config.mail.to,
    subject: config.mail.subject,
    text: buildPlainText(fields, evidence),
  };
  if (fields.email) mailOptions.replyTo = fields.email;

  await transport.sendMail(mailOptions);
}

module.exports = { buildPlainText, ensureEmailConfig, sendEmail };
