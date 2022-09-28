// Bundle Text into a Object URL (runtime bundle)
export default function bundle(input) {
    if (typeof input === 'string') input = new TextEncoder().encode(input);
    const blob = new Blob([input], { type: "text/javascript" })
    return URL.createObjectURL(blob)
}
