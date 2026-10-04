export const FORM_ENDPOINT = import.meta.env?.VITE_FORM_ENDPOINT?.trim() || '';

export const FORM_META = Object.freeze({
    consentRevision: '25.09.2026',
    formName: 'contact'
});

export const SUBMISSION_STATUS = Object.freeze({
    IDLE: 'idle',
    SENDING: 'sending',
    SUCCESS: 'success',
    FAILURE: 'failure'
});

export const buildContactPayload = (formData) => ({
    name: String(formData.get('name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    message: String(formData.get('message') || '').trim(),
    consent: formData.get('personalDataConsent') === 'on',
    ...FORM_META
});

export const isValidPhone = (value) => {
    const normalized = String(value || '').trim();
    if (!/^[+\d\s().-]+$/.test(normalized)) return false;
    const digitCount = normalized.replace(/\D/g, '').length;
    return digitCount >= 7 && digitCount <= 15;
};

const failure = (code, retryable = true) => ({
    status: SUBMISSION_STATUS.FAILURE,
    code,
    retryable
});

export const createContactSubmissionController = ({
    endpoint = FORM_ENDPOINT,
    fetchImpl = globalThis.fetch,
    onStateChange = () => {}
} = {}) => {
    let status = SUBMISSION_STATUS.IDLE;
    let inFlight = null;

    const setStatus = (nextStatus) => {
        status = nextStatus;
        onStateChange(nextStatus);
    };

    const performSubmit = async (payload) => {
        if (!endpoint) return failure('ENDPOINT_MISSING');
        if (typeof fetchImpl !== 'function') return failure('NETWORK_ERROR');

        let response;
        try {
            response = await fetchImpl(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch {
            return failure('NETWORK_ERROR');
        }

        let body;
        try {
            body = await response.json();
        } catch {
            return failure('MALFORMED_RESPONSE');
        }

        if (
            response.ok
            && body !== null
            && typeof body === 'object'
            && !Array.isArray(body)
            && body.ok === true
            && body.accepted === true
        ) {
            return {
                status: SUBMISSION_STATUS.SUCCESS,
                accepted: true,
                telegramNotified: body.telegramNotified === true
            };
        }

        if (body?.code === 'DELIVERY_FAILED' && body.accepted === false) {
            return failure('DELIVERY_FAILED', body.retryable === true);
        }

        return failure(response.ok ? 'MALFORMED_RESPONSE' : 'HTTP_ERROR');
    };

    const submit = (payload) => {
        if (inFlight) return inFlight;

        setStatus(SUBMISSION_STATUS.SENDING);
        inFlight = performSubmit(payload)
            .then((result) => {
                setStatus(result.status);
                return result;
            })
            .finally(() => {
                inFlight = null;
            });
        return inFlight;
    };

    return {
        getStatus: () => status,
        submit
    };
};
