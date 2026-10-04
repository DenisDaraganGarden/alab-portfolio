import { resolve } from 'node:path';

export default {
    build: {
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'index.html'),
                privacyPolicy: resolve(import.meta.dirname, 'privacy-policy/index.html'),
                consent: resolve(import.meta.dirname, 'consent/index.html'),
                cookieConsent: resolve(import.meta.dirname, 'cookie-consent/index.html'),
            },
            output: {
                entryFileNames: 'assets/alab-[hash].js',
                chunkFileNames: 'assets/alab-[hash].js',
                assetFileNames: 'assets/alab-[hash][extname]',
            },
        },
    },
};
