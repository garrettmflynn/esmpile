import * as pathUtils from "./path.js"

export const getURL = (path) => {
    let url
    try { url = new URL(path).href } 
    catch { url = pathUtils.get(path, globalThis.location.href) }
    return url
}

export const handleFetch = async (path, options={}) => {
    if (!options.mode)  options.mode = 'cors' // Auto-CORS Support
    const url = getURL(path) 

    const progressCallback = options?.callbacks?.progress?.fetch

    const info = await fetchRemote(url, options, progressCallback)
    if (!info.buffer) throw new Error('No response received.')
    const type = info.type.split(';')[0] // Get mimeType (not fully specified)

    return {
        ...info,
        url,
        type,
    }
}

export const fetchRemote = async (url, options={}, progressCallback) => {

    const response = await globalThis.fetch(url, options)

    const info = await new Promise(async resolve => {

        if (response) {

            const type = response.headers.get('Content-Type')

            // Browser Remote Parser
            if (globalThis.REMOTEESM_NODE) {
                const buffer = await response.arrayBuffer()
                resolve({buffer, type})
            }
            
            // Browser Remote Parser
            else {

                const reader = response.body.getReader();

                const bytes = parseInt(response.headers.get('Content-Length'), 10)
                let bytesReceived = 0
                let buffer = [];

                const processBuffer = async ({ done, value }) => {

                    if (done) {
                        const config = {}
                        if (typeof type === 'string') config.type = type
                        const blob = new Blob(buffer, config)
                        const ab = await blob.arrayBuffer()
                        resolve({buffer: new Uint8Array(ab), type})
                        if (progressCallback instanceof Function) progressCallback(url, bytesReceived, bytes, done, response.headers.get('Range')) // Send Done

                        return;
                    }

                    bytesReceived += value.length;
                    const chunk = value;
                    buffer.push(chunk);

                    if (progressCallback instanceof Function) progressCallback(url, bytesReceived, bytes, response.headers.get('Range'))

                    // Read some more, and call this function again
                    return reader.read().then(processBuffer)
                }

                reader.read().then(processBuffer);
            }

        } else {
            console.warn('Response not received!', options.headers)
            resolve(undefined)
        }
    })

    return {
        response,
        ...info
    }
}