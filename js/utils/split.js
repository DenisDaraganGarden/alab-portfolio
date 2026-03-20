/**
 * Split Text Utility
 * Wraps characters/words in spans for animation.
 */

export const splitText = (element, type = 'chars') => {
    if (!element) return;
    const text = element.innerText;
    element.innerHTML = '';
    
    if (type === 'chars') {
        text.split('').forEach(char => {
            const span = document.createElement('span');
            span.classList.add('char');
            span.innerText = char === ' ' ? '\u00A0' : char;
            element.appendChild(span);
        });
    }
    // Add other split types if needed
};
