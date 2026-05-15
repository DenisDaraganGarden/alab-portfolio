export default {
    build: {
        rollupOptions: {
            output: {
                entryFileNames: 'assets/alab-[hash].js',
                chunkFileNames: 'assets/alab-[hash].js',
                assetFileNames: 'assets/alab-[hash][extname]',
            },
        },
    },
};
