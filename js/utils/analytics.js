const VISITOR_KEY = 'alab_visitor_id';
const SESSION_KEY = 'alab_session_id';
const SESSION_STARTED_KEY = 'alab_session_started_at';
const SESSION_TTL = 30 * 60 * 1000;

const randomId = (prefix) => {
    if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const storageGet = (storage, key) => {
    try { return storage.getItem(key); } catch { return null; }
};

const storageSet = (storage, key, value) => {
    try { storage.setItem(key, value); } catch {}
};

const getVisitorId = () => {
    let id = storageGet(window.localStorage, VISITOR_KEY);
    if (!id) {
        id = randomId('v');
        storageSet(window.localStorage, VISITOR_KEY, id);
    }
    return id;
};

const getSessionId = () => {
    const now = Date.now();
    const startedAt = Number(storageGet(window.sessionStorage, SESSION_STARTED_KEY) || 0);
    let id = storageGet(window.sessionStorage, SESSION_KEY);

    if (!id || !startedAt || now - startedAt > SESSION_TTL) {
        id = randomId('s');
        storageSet(window.sessionStorage, SESSION_KEY, id);
    }

    storageSet(window.sessionStorage, SESSION_STARTED_KEY, String(now));
    return id;
};

const detectEndpoint = () => {
    if (window.ALAB_ANALYTICS_ENDPOINT) return window.ALAB_ANALYTICS_ENDPOINT;
    const { hostname, port } = window.location;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '5173') {
        return 'http://localhost:3001/api/analytics/collect';
    }
    return '/api/analytics/collect';
};

const detectDevice = () => {
    const ua = navigator.userAgent || '';
    if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobi|iphone|android/i.test(ua)) return 'mobile';
    return 'desktop';
};

const detectBrowser = () => {
    const ua = navigator.userAgent || '';
    if (/edg\//i.test(ua)) return 'Edge';
    if (/opr\//i.test(ua)) return 'Opera';
    if (/firefox\//i.test(ua)) return 'Firefox';
    if (/safari\//i.test(ua) && !/chrome|chromium|android/i.test(ua)) return 'Safari';
    if (/chrome|chromium/i.test(ua)) return 'Chrome';
    return 'unknown';
};

const detectOs = () => {
    const ua = navigator.userAgent || '';
    if (/windows/i.test(ua)) return 'Windows';
    if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
    if (/mac os|macintosh/i.test(ua)) return 'macOS';
    if (/android/i.test(ua)) return 'Android';
    if (/linux/i.test(ua)) return 'Linux';
    return 'unknown';
};

const utmPayload = () => {
    const params = new URLSearchParams(window.location.search);
    return {
        source: params.get('utm_source') || undefined,
        medium: params.get('utm_medium') || undefined,
        campaign: params.get('utm_campaign') || undefined
    };
};

export const initAnalytics = () => {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

    const endpoint = detectEndpoint();
    const visitorId = getVisitorId();
    const sessionId = getSessionId();
    const startedAt = Date.now();
    const viewedSections = new Set();
    let lastPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    const basePayload = () => ({
        visitorId,
        sessionId,
        url: window.location.href,
        path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        title: document.title,
        referrer: document.referrer || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        device: detectDevice(),
        browser: detectBrowser(),
        os: detectOs(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        dpr: window.devicePixelRatio || 1,
        connection: navigator.connection?.effectiveType || '',
        ...utmPayload()
    });

    const send = (type, extra = {}) => {
        const payload = {
            ...basePayload(),
            type,
            ...extra
        };

        const body = JSON.stringify(payload);

        if (navigator.sendBeacon && !/^https?:\/\/localhost:3001/.test(endpoint)) {
            const blob = new Blob([body], { type: 'application/json' });
            if (navigator.sendBeacon(endpoint, blob)) return;
        }

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
            mode: endpoint.startsWith('http') ? 'cors' : 'same-origin'
        }).catch(() => {});
    };

    const trackPageview = () => {
        lastPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        send('pageview');
    };

    trackPageview();

    const trackIfPathChanged = () => {
        const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextPath !== lastPath) trackPageview();
    };

    window.addEventListener('hashchange', trackIfPathChanged);
    window.addEventListener('popstate', trackIfPathChanged);

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const section = entry.target.getAttribute('data-section') || entry.target.id;
                if (!section || viewedSections.has(section)) return;
                viewedSections.add(section);
                send('section_view', { metadata: { section } });
            });
        }, { threshold: 0.45 });

        document.querySelectorAll('[data-section], section[id]').forEach((section) => observer.observe(section));
    }

    document.addEventListener('click', (event) => {
        const link = event.target.closest?.('a[href]');
        if (!link) return;
        const href = link.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) return;
        const url = new URL(href, window.location.href);
        if (url.hostname === window.location.hostname) return;
        send('outbound_click', { metadata: { href: url.href, text: link.textContent.trim().slice(0, 120) } });
    }, { capture: true });

    const sendEngagement = () => {
        send('engagement', { duration: Date.now() - startedAt });
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') sendEngagement();
    });
    window.addEventListener('pagehide', sendEngagement);
};
