# A.LAB form handler

Изолированный транзитный backend формы обратной связи для обычного HTTP-вызова Yandex Cloud Functions. Заявки не сохраняются в БД, файлы или локальные журналы. Email — основной канал доставки; Telegram получает только техническое уведомление после успешной отправки email.

## Runtime и entry point

- Runtime: Node.js 22; production package ограничен диапазоном `>=22 <23`.
- Entry point: `index.handler`.
- Экспорт: `module.exports.handler = async function(event, context) { ... }` (созданный обработчик имеет совместимую сигнатуру и игнорирует неиспользуемый `context`).
- HTTP integration: обычный event Yandex Cloud Functions, без `integration=raw`.

## Переменные окружения

Имена переменных приведены в `.env.example`; значения и секреты в Git не хранятся:

- `ALLOWED_ORIGINS` — разделённый запятыми строгий allowlist; по умолчанию только `https://alabspace.com`. Для локальной разработки можно явно указать `https://alabspace.com,http://localhost:5173`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. Допустим только
  согласованный режим Yandex 360: порт `465` и `SMTP_SECURE=true`; несовместимая
  конфигурация завершается configuration error до отправки.
- `MAIL_FROM`, `MAIL_TO` (по умолчанию получатель `work@alabspace.ru`).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Реальные SMTP credentials и Telegram token/chat ID должны передаваться только через окружение или секретное хранилище при последующем deployment.

## Локальная проверка

Из каталога `cloud/form-handler` под Node.js 22:

```powershell
npm ci
npm test
```

Тесты используют `node:test`; все внешние вызовы замоканы и не отправляют email или Telegram-сообщения.
12 октября 2026 года локальный прогон выполнен: `86 PASS / 0 FAIL`.

## Предполагаемая настройка Yandex Cloud Function

1. Создать Function в аккаунте и каталоге Заказчика, регион `ru-central1`.
2. Выбрать runtime Node.js 22.
3. Загрузить содержимое этого каталога вместе с production dependencies.
4. Указать entry point `index.handler`.
5. Добавить переменные окружения/секреты и разрешить HTTP-вызов по согласованной схеме доступа.
6. После получения URL задать frontend-переменные `VITE_FORM_ENDPOINT` и `VITE_FORM_DELIVERY_ENABLED=true`, затем выполнить production smoke test.

Deployment пока не выполнялся. Frontend архитектурно готов к реальному endpoint, но текущая production-сборка принудительно оставляет `VITE_FORM_DELIVERY_ENABLED=false`: ожидаются реальные секреты, доступ к Yandex Cloud и production Function URL. Поля `messenger` и `industry` подтверждены Заказчиком и подготовлены для передачи в полный email после штатного запуска backend.

## Защита и ограничения

- Принимаются только `OPTIONS` и JSON `POST` со строгого Origin allowlist. Media type
  сравнивается точно с `application/json`; параметры наподобие `charset` разрешены,
  а `application/jsonp` отклоняется.
- Размер сырого `event.body` проверяется до удаления whitespace, base64 decode и
  `JSON.parse`. Для обычного body лимит равен 16 KiB, для base64 transport — 21 848
  байт с учётом base64 overhead. После decode полезный JSON повторно ограничен 16 KiB.
- Production-поля пользователя централизованы в `lib/config.js`: `name`, `email`, `phone`, `messenger`, `industry`, `message`. Для контакта обязателен хотя бы один из `phone` или `email`; `Reply-To` не устанавливается у phone-only заявки.
- `messenger` и `industry` включаются только в email; Telegram получает лишь технический текст и request ID.
- Согласие проверяется по редакции `12.10.2026`; время и IP берутся только из серверного event.
- В логи попадают только request ID, технический результат и длительность; содержимое формы, IP и секреты не логируются.
- SMTP использует централизованные таймауты: connection 5 s, greeting 5 s и socket
  10 s. Ошибка или timeout email возвращает `503 DELIVERY_FAILED`, `accepted:false`
  и не запускает Telegram.
- Telegram считается доставленным только при успешном HTTP-ответе, корректном JSON
  object и `ok:true`. Его failure после успешного email не отменяет принятие заявки.
- In-memory rate limit не применяется. При необходимости отдельно согласуются CAPTCHA и/или rate limit на API gateway.

Backend остаётся stateless: отдельный повторный POST может создать повторное письмо;
хранилище idempotency в эту версию не входит. Повторное использование SMTP transporter
не требуется для release и пока не внедрено.

## Открытые блокеры клиента

- реальные SMTP credentials;
- Telegram bot token и chat ID;
- доступ и folder в Yandex Cloud;
- production Function URL.
