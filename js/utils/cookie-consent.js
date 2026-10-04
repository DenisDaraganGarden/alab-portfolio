const CONSENT_STORAGE_KEY = 'alab_cookie_consent';
const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const CONSENT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const METRICA_ID = 108408263;
const METRICA_SCRIPT_URL = `https://mc.yandex.ru/metrika/tag.js?id=${METRICA_ID}`;

let metricaState = 'idle';
let metricaScript = null;

const parseStoredConsent = () => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || 'null');
        if (!stored || !['accepted', 'rejected'].includes(stored.status)) return null;

        const selectedAt = Date.parse(stored.selectedAt);
        const consentAge = Date.now() - selectedAt;
        if (
            !Number.isFinite(selectedAt)
            || consentAge >= CONSENT_TTL_MS
            || consentAge < -CONSENT_FUTURE_TOLERANCE_MS
        ) {
            window.localStorage.removeItem(CONSENT_STORAGE_KEY);
            return null;
        }

        return stored;
    } catch {
        try { window.localStorage.removeItem(CONSENT_STORAGE_KEY); } catch {}
        return null;
    }
};

const saveConsent = (status) => {
    try {
        window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
            status,
            selectedAt: new Date().toISOString()
        }));
    } catch {}
};

const notifyConsent = (status) => {
    document.dispatchEvent(new CustomEvent('alab:cookie-consent', { detail: { status } }));
};

export const hasAnalyticsConsent = () => parseStoredConsent()?.status === 'accepted';

export const loadYandexMetrica = () => {
    if (metricaState !== 'idle' || !hasAnalyticsConsent()) return;
    metricaState = 'loading';

    window.ym = window.ym || function (...args) {
        (window.ym.a = window.ym.a || []).push(args);
    };
    window.ym.l = window.ym.l || Date.now();
    window.ym(METRICA_ID, 'init', {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: true
    });

    const existingScript = document.querySelector(`script[src="${METRICA_SCRIPT_URL}"]`);
    if (existingScript) {
        existingScript.remove();
    }

    const script = document.createElement('script');
    metricaScript = script;
    script.async = true;
    script.src = METRICA_SCRIPT_URL;
    script.dataset.alabMetrica = 'true';
    script.addEventListener('load', () => {
        if (metricaState !== 'loading' || metricaScript !== script) return;
        metricaState = 'started';
    }, { once: true });
    script.addEventListener('error', () => {
        if (metricaState !== 'loading' || metricaScript !== script) return;
        metricaState = 'idle';
        metricaScript = null;
        script.remove();
    }, { once: true });
    document.head.append(script);
};

const createBanner = () => {
    const banner = document.createElement('section');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-labelledby', 'cookie-banner-title');
    banner.setAttribute('aria-describedby', 'cookie-banner-description');
    banner.innerHTML = `
        <div class="cookie-banner__inner">
            <h2 id="cookie-banner-title" class="cookie-banner__title">Файлы cookie</h2>
            <p id="cookie-banner-description" class="cookie-banner__text">Мы обрабатываем файлы cookie и используем сервис Яндекс.Метрика (включая Вебвизор) в целях улучшения и обеспечения работоспособности Сайта и статистических исследований. Данные собираются только после нажатия кнопки «Принять». Отозвать согласие можно в любой момент по ссылке «Настройки cookie» внизу страницы. Пожалуйста, ознакомьтесь с <a href="/cookie-consent/" target="_blank" rel="noopener noreferrer">условиями обработки файлов cookie</a>.</p>
            <div class="cookie-banner__actions">
                <button type="button" class="cookie-banner__button" data-consent-choice="accepted">Принять</button>
                <button type="button" class="cookie-banner__button" data-consent-choice="rejected">Отклонить</button>
            </div>
        </div>`;
    return banner;
};

const dismissBanner = (banner, status) => {
    if (!banner.isConnected) return;
    saveConsent(status);
    banner.remove();
    if (status === 'accepted') loadYandexMetrica();
    notifyConsent(status);
};

const expireCookie = (name, domain) => {
    const domainPart = domain ? `; domain=${domain}` : '';
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/${domainPart}; SameSite=Lax`;
};

const removeAccessibleMetricaCookies = () => {
    const knownNames = new Set([
        '_ym_uid', '_ym_d', '_ym_isad', '_ym_visorc', '_ym_debug',
        '_ym_hostIndex', '_ym_retryReqs', '_ym_sup_debug', 'yabs-sid'
    ]);

    document.cookie.split(';').forEach((item) => {
        const name = item.split('=')[0]?.trim();
        if (name && (name.startsWith('_ym') || name.startsWith('_yasc') || name === 'yabs-sid')) {
            knownNames.add(name);
        }
    });

    const domains = ['', window.location.hostname];
    if (window.location.hostname === 'alabspace.com' || window.location.hostname.endsWith('.alabspace.com')) {
        domains.push('alabspace.com', '.alabspace.com');
    }

    knownNames.forEach((name) => {
        [...new Set(domains)].forEach((domain) => expireCookie(name, domain));
    });
};

const resetConsent = () => {
    try { window.localStorage.removeItem(CONSENT_STORAGE_KEY); } catch {}
    try { window.ym?.(METRICA_ID, 'destruct'); } catch {}
    metricaState = 'idle';
    metricaScript?.remove();
    metricaScript = null;
    removeAccessibleMetricaCookies();
    window.location.reload();
};

export const initCookieConsent = () => {
    document.querySelectorAll('[data-cookie-settings]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            resetConsent();
        });
    });

    const stored = parseStoredConsent();
    if (stored?.status === 'accepted') {
        loadYandexMetrica();
        notifyConsent('accepted');
        return 'accepted';
    }
    if (stored?.status === 'rejected') {
        notifyConsent('rejected');
        return 'rejected';
    }

    const banner = createBanner();
    document.body.append(banner);
    banner.querySelectorAll('[data-consent-choice]').forEach((button) => {
        button.addEventListener('click', () => dismissBanner(banner, button.dataset.consentChoice));
    });
    return null;
};
