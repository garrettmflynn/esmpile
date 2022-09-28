function _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}


export const get = (o, mimeType = "text/javascript", method, safe = false) => {
    const base64 = (method === 'buffer') ? _arrayBufferToBase64(o) : btoa((safe) ? unescape(encodeURIComponent(o)) : o)
    return `data:${mimeType};base64,` + base64
}