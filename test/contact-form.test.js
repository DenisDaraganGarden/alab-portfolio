import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createContactSubmissionController,
    SUBMISSION_STATUS
} from '../js/utils/contact-form.js';
import { classifyLinkGoal, METRICA_GOALS, trackMetricaGoal } from '../js/utils/metrica-goals.js';

const payload = Object.freeze({
    name: 'Иван',
    email: 'person@example.test',
    phone: '',
    message: 'Тест',
    consent: true,
    consentRevision: '25.09.2026',
    formName: 'contact'
});

const response = (body, ok = true) => ({ ok, json: async () => body });

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
