import * as encode from "./encode/index.js";
import * as pathUtils from "./path.js";
import * as load from "./load.js";
import * as transformations from './transformations.js'
import * as handlers from './handlers.js'
import * as mimeTypes from './mimeTypes.js'
import * as compile from './compile.js'

const catchFailedModule = async (uri, e) => {
    if (
        e.message.includes('The string to be encoded contains characters outside of the Latin1 range.') // cannot be represented as a datauri
        || e.message.includes('Cannot set properties of undefined') // will not appropriately load to the window
    ) return await load.script(uri)
    else throw e
}

// Get ESM Module Info
const enc = new TextDecoder("utf-8");
export const get = async (uri, expectedType) => {

    const response = await globalThis.fetch(uri)
    const info = { uri, response, text: '', buffer: null }
    if (response.ok) {
        if (expectedType) {
            const mimeType = response.headers.get("Content-Type")
            if (!mimeType.includes(expectedType)) throw new Error(`Expected Content Type ${expectedType} but received ${mimeType} for  ${uri}`)
        }

        info.buffer = await response.arrayBuffer()
        info.text = enc.decode(info.buffer)
    } else {
        throw new Error(response.statusText)
    }

    return info
}


// Get ESM Module Info (safely)
export const safe = async (uri, opts) => {

    // Try Alternative File Paths
    const transArray = transformations.get(uri)

    if (transArray.length > 0) {

        let info;
        do {
            const ext = transArray.shift()

            const name = ext?.name ?? ext
            const warning = (e) => {
                console.error(`Import using ${name ?? ext} transformation failed for ${uri}`)
                // if (e) console.error(e)
            }

            const transformed = await handlers.transformation(uri, ext, opts)

            const expectedType = (ext) ? null : 'application/javascript'
            info = await get(transformed, expectedType).then(res => {
                console.warn(`Import using ${name ?? ext} transformation succeeded for ${uri}`)
                return res
            }).catch(warning)
        } while (!info && transArray.length > 0)

        if (!info) throw new Error(`No valid transformation found for ${uri}`)
        else return info
    }

    // Get Specified URI Directly
    else return await get(uri);
}


// Direct Import of ES6 Modules
export const parse = async (info, type = "buffer") => {
    const pathExt = pathUtils.extension(info.uri)
    const isJSON = pathExt === 'json'
    let mimeType = mimeTypes.get(pathExt)
    let datauri = null;
    let module = null;
    let objecturl = null

    let bufferOrText = info[type]

    // Compile Code
    switch (mimeType) {
        case 'text/typescript':
            bufferOrText = compile.typescript(info, type)
            mimeType = mimeTypes.js
            break;
    }

    // Import DataURI 
    const importURI = async (uri) => await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri)).catch((e) => {
        throw e
    });

    try {
        datauri = encode.datauri.get(bufferOrText, mimeType, type);
        module = await importURI(datauri).catch((e) => {
            throw e
        });
    }

    // Handle Exceptions
    catch (e) {
        datauri = encode.datauri.get(bufferOrText, mimeType, type, true);
        if (mimeTypes.isJS(mimeType)) module = datauri = await catchFailedModule(datauri, e).catch((e) => {
            // console.error('Failed to load module', path, info, e)
            throw e
        }); // javascript script tag imports
        else module = datauri // audio / video assets
    }

    // Get Object URL
    objecturl = encode.objecturl.get(bufferOrText) // save

    return {
        uri: info.uri,
        module,
        datauri,
        objecturl
    }
}