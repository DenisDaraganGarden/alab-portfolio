/**
 * Split Text Utility
 * Wraps characters/words in spans for animation.
 */

export const splitText = (element, type = 'chars') => {
    if (!element) return;
    
    if (type === 'chars') {
        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                // Preserve spaces but normalize them
                if (!text.trim() && text.length > 0) return document.createTextNode(' ');
                
                const fragment = document.createDocumentFragment();
                // Replace all whitespace (including newlines) with a single space
                const words = text.replace(/\s+/g, ' ').split(' ');
                
                words.forEach((word, index) => {
                    if (!word) {
                        if (index < words.length - 1) fragment.appendChild(document.createTextNode(' '));
                        return;
                    }
                    
                    const wordSpan = document.createElement('span');
                    wordSpan.classList.add('word');
                    wordSpan.style.display = 'inline-block';
                    
                    word.split('').forEach(char => {
                        const charSpan = document.createElement('span');
                        charSpan.classList.add('char');
                        charSpan.innerText = char;
                        wordSpan.appendChild(charSpan);
                    });
                    
                    fragment.appendChild(wordSpan);
                    
                    if (index < words.length - 1) {
                        fragment.appendChild(document.createTextNode(' '));
                    }
                });
                return fragment;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const clone = node.cloneNode(false);
                Array.from(node.childNodes).forEach(child => {
                    clone.appendChild(processNode(child));
                });
                return clone;
            }
            return node.cloneNode(true);
        };

        const newContent = processNode(element);
        element.innerHTML = '';
        Array.from(newContent.childNodes).forEach(child => {
            element.appendChild(child);
        });
    }
};
