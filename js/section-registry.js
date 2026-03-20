/**
 * Section Registry
 * Maps section IDs to their complex initialization logic if needed.
 */

const registry = {
    // Complex sections can be registered here if they need more than just a simple init function
};

export const getSectionLoader = (id) => {
    return registry[id] || null;
};
