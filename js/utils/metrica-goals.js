import { canTrackYandexMetrica, YANDEX_METRIKA_ID } from './cookie-consent.js';

export const METRICA_COUNTER_ID = YANDEX_METRIKA_ID;

export const METRICA_GOALS = Object.freeze({
    FORM_SUCCESS: 'form_success',
    TELEGRAM_CLICK: 'telegram_click',
    EXTERNAL_CLICK: 'external_click'
});

const ALLOWED_GOALS = new Set(Object.values(METRICA_GOALS));

export const createMetricaGoalTracker = ({
    canTrack = canTrackYandexMetrica,
    send = (counterId, method, goalId) => window.ym(counterId, method, goalId)
} = {}) => (goalId) => {
    if (!ALLOWED_GOALS.has(goalId) || !canTrack()) return false;
    try {
        send(METRICA_COUNTER_ID, 'reachGoal', goalId);
        return true;
    } catch {
        return false;
    }
};

export const trackMetricaGoal = createMetricaGoalTracker();

export const classifyLinkGoal = (href, currentUrl = window.location.href) => {
    if (!href) return null;
    // Телефон, email и формы уже покрываются автоматическими целями Метрики.
    // Не отправляем для них ручные цели, чтобы не плодить дубли в отчётах.
    if (/^(?:tel|mailto):/i.test(href)) return null;

    let url;
    try {
        url = new URL(href, currentUrl);
    } catch {
        return null;
    }

    if (['t.me', 'telegram.me', 'telegram.org'].includes(url.hostname.toLowerCase())) {
        return METRICA_GOALS.TELEGRAM_CLICK;
    }

    const current = new URL(currentUrl);
    if (url.protocol.match(/^https?:$/) && url.origin !== current.origin) {
        return METRICA_GOALS.EXTERNAL_CLICK;
    }
    return null;
};

let initialized = false;

export const initMetricaGoals = () => {
    if (initialized) return;
    initialized = true;
    document.addEventListener('click', (event) => {
        const link = event.target.closest?.('a[href]');
        if (!link) return;
        const goal = classifyLinkGoal(link.getAttribute('href'));
        if (goal) trackMetricaGoal(goal);
    }, { capture: true });
};
