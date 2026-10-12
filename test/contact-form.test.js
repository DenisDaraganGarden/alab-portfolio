import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
    buildContactPayload,
    createContactSubmissionController,
    FORM_ENDPOINT,
    SUBMISSION_STATUS
} from '../js/utils/contact-form.js';
import { hasAnalyticsConsent, isYandexMetricaEnabled } from '../js/utils/cookie-consent.js';
import { classifyLinkGoal, METRICA_GOALS, trackMetricaGoal } from '../js/utils/metrica-goals.js';

const payload = Object.freeze({
    name: 'Иван',
    email: 'person@example.test',
    phone: '',
    messenger: '@person',
    industry: 'Дизайн',
    message: 'Тест',
    consent: true,
    consentRevision: '12.10.2026',
    formName: 'contact'
});

const response = (body, ok = true) => ({ ok, json: async () => body });

const createStorage = (initial = {}) => {
    const values = new Map(Object.entries(initial));
    return {
        get length() { return values.size; },
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        key: (index) => [...values.keys()][index] ?? null
    };
};

test('production-предохранители по умолчанию отключают отправку и Метрику', () => {
    assert.equal(FORM_ENDPOINT, '');
    assert.equal(isYandexMetricaEnabled(), false);
});

test('cookie consent принимает только актуальный положительный выбор', () => {
    const storage = createStorage({
        alab_cookie_consent: JSON.stringify({ status: 'accepted', selectedAt: new Date().toISOString() })
    });
    globalThis.window = { localStorage: storage };
    assert.equal(hasAnalyticsConsent(), true);

    storage.setItem('alab_cookie_consent', JSON.stringify({ status: 'rejected', selectedAt: new Date().toISOString() }));
    assert.equal(hasAnalyticsConsent(), false);

    storage.setItem('alab_cookie_consent', JSON.stringify({
        status: 'accepted',
        selectedAt: new Date(Date.now() - (366 * 24 * 60 * 60 * 1000)).toISOString()
    }));
    assert.equal(hasAnalyticsConsent(), false);
    assert.equal(storage.getItem('alab_cookie_consent'), null);
    delete globalThis.window;
});

test('форма и cookie-баннер содержат согласованные элементы без автосогласия', async () => {
    const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const cookieModule = await readFile(new URL('../js/utils/cookie-consent.js', import.meta.url), 'utf8');
    assert.match(indexHtml, /id="personal-data-consent"[^>]*required/);
    assert.doesNotMatch(indexHtml, /id="personal-data-consent"[^>]*checked/);
    assert.match(indexHtml, /<button type="submit" class="submit-btn" disabled>/);
    assert.match(indexHtml, /мессенджер, сфера деятельности, текст обращения, IP-адрес/);
    assert.match(indexHtml, /href="\/consent\/"[^>]*target="_blank"/);
    assert.match(indexHtml, /href="\/privacy-policy\/"[^>]*target="_blank"/);
    assert.match(cookieModule, /data-consent-choice="accepted">Принять</);
    assert.match(cookieModule, /data-consent-choice="rejected">Отклонить</);
    assert.match(cookieModule, /href="\/cookie-consent\/"[^>]*target="_blank"/);
});

test('payload формы включает подтверждённые поля и актуальную редакцию согласия', () => {
    const formData = new FormData();
    formData.set('name', ' Иван ');
    formData.set('email', 'person@example.test');
    formData.set('phone', '');
    formData.set('messenger', ' @person ');
    formData.set('industry', ' Дизайн ');
    formData.set('message', ' Тестовая заявка ');
    formData.set('personalDataConsent', 'on');

    assert.deepEqual(buildContactPayload(formData), {
        name: 'Иван',
        email: 'person@example.test',
        phone: '',
        messenger: '@person',
        industry: 'Дизайн',
        message: 'Тестовая заявка',
        consent: true,
        consentRevision: '12.10.2026',
        formName: 'contact'
    });
});

for (const telegramNotified of [true, false]) {
    test(`accepted:true + telegramNotified:${telegramNotified} считается success`, async () => {
        const controller = createContactSubmissionController({
            endpoint: 'https://function.example.test',
            fetchImpl: async () => response({ ok: true, accepted: true, telegramNotified })
        });
        const result = await controller.submit(payload);
        assert.equal(result.status, SUBMISSION_STATUS.SUCCESS);
        assert.equal(result.accepted, true);
        assert.equal(result.telegramNotified, telegramNotified);
    });
}

test('DELIVERY_FAILED сохраняет retryable failure', async () => {
    const controller = createContactSubmissionController({
        endpoint: 'https://function.example.test',
        fetchImpl: async () => response({
            ok: false,
            accepted: false,
            code: 'DELIVERY_FAILED',
            retryable: true
        }, false)
    });
    const result = await controller.submit(payload);
    assert.deepEqual(result, { status: 'failure', code: 'DELIVERY_FAILED', retryable: true });
});

test('network failure возвращает безопасный retryable failure', async () => {
    const controller = createContactSubmissionController({
        endpoint: 'https://function.example.test',
        fetchImpl: async () => { throw new Error('private network details'); }
    });
    const result = await controller.submit(payload);
    assert.equal(result.code, 'NETWORK_ERROR');
    assert.equal(result.retryable, true);
});

test('malformed response не считается success', async () => {
    const controller = createContactSubmissionController({
        endpoint: 'https://function.example.test',
        fetchImpl: async () => response({ ok: true, accepted: 'yes' })
    });
    const result = await controller.submit(payload);
    assert.equal(result.code, 'MALFORMED_RESPONSE');
});

test('double submit выполняет один fetch', async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const controller = createContactSubmissionController({
        endpoint: 'https://function.example.test',
        fetchImpl: async () => {
            calls += 1;
            await gate;
            return response({ ok: true, accepted: true, telegramNotified: true });
        }
    });
    const first = controller.submit(payload);
    const second = controller.submit(payload);
    assert.equal(calls, 1);
    release();
    assert.deepEqual(await second, await first);
    assert.equal(calls, 1);
});

test('endpoint missing не вызывает fetch и не имитирует success', async () => {
    let calls = 0;
    const controller = createContactSubmissionController({
        endpoint: '',
        fetchImpl: async () => { calls += 1; }
    });
    const result = await controller.submit(payload);
    assert.equal(result.code, 'ENDPOINT_MISSING');
    assert.equal(result.status, SUBMISSION_STATUS.FAILURE);
    assert.equal(calls, 0);
});

test('click goals классифицируются без двойного external события', () => {
    const base = 'https://alabspace.com/';
    assert.equal(classifyLinkGoal('https://t.me/ALEXANDRALARI', base), METRICA_GOALS.TELEGRAM_CLICK);
    assert.equal(classifyLinkGoal('tel:+70000000000', base), METRICA_GOALS.PHONE_CLICK);
    assert.equal(classifyLinkGoal('mailto:test@example.test', base), METRICA_GOALS.EMAIL_CLICK);
    assert.equal(classifyLinkGoal('https://example.test/', base), METRICA_GOALS.EXTERNAL_LINK_CLICK);
    assert.equal(classifyLinkGoal('/privacy-policy/', base), null);
});

test('goal code безопасен, если Метрика не загружена', () => {
    globalThis.window = {};
    assert.equal(trackMetricaGoal(METRICA_GOALS.FORM_SUCCESS), false);
    delete globalThis.window;
});
