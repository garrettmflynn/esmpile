export function get(input) {
    if (typeof input === 'string') input = new TextEncoder().encode(input);
    const blob = new Blob([input], { type: "text/javascript" })
    return URL.createObjectURL(blob)
}