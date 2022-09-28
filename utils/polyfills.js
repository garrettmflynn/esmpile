// Node Polyfills
export const ready = new Promise(async (resolve, reject) => {
    try {
        if (typeof process === 'object') { //indicates node
            // globalThis.REMOTEESM_NODE = true
            globalThis.fetch = (await import('node-fetch')).default
            if (typeof globalThis.fetch !== 'function') globalThis.fetch = fetch

            const Blob = (await import('cross-blob')).default
            globalThis.Blob = Blob

            if (typeof globalThis.Blob !== 'function') globalThis.Blob = Blob
            resolve(true)
        } else resolve(true)

    } catch (err) {
        reject(err)
    }
})
