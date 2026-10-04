export const METRICA_COUNTER_ID = 108408263;

export const METRICA_GOALS = Object.freeze({
    FORM_SUCCESS: 'form_success',
    TELEGRAM_CLICK: 'telegram_click',
    PHONE_CLICK: 'phone_click',
    EMAIL_CLICK: 'email_click',
    EXTERNAL_LINK_CLICK: 'external_link_click'
});

export const trackMetricaGoal = (goalId) => {
    if (!Object.values(METRICA_GOALS).includes(goalId)) return false;
    if (typeof window.ym !== 'function') return false;
    try {
        window.ym(METRICA_COUNTER_ID, 'reachGoal', goalId);
        return true;
    } catch {
        return false;
    }
};

export const classifyLinkGoal = (href, currentUrl = window.location.href) => {
    if (!href) return null;
    if (/^tel:/i.test(href)) return METRICA_GOALS.PHONE_CLICK;
    if (/^mailto:/i.test(href)) return METRICA_GOALS.EMAIL_CLICK;

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
        return METRICA_GOALS.EXTERNAL_LINK_CLICK;
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
