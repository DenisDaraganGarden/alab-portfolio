export function splitText(element) {
    const text = element.innerText;
    element.innerHTML = text.split(' ').map(word => 
        `<span class="word-wrapper" style="overflow:hidden; display:inline-block;">
            <span class="word" style="display:inline-block;">${word}</span>
        </span>`
    ).join(' ');
}
