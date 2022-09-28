import * as pathUtils from "../path.js";
import * as load from "../load.js";
import * as mimeTypes from '../mimeTypes.js'

function _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}


export const getURI = (o, mimeType = "text/javascript", method, safe = false) => {
    const base64 = (method === 'buffer') ? _arrayBufferToBase64(o) : btoa((safe) ? unescape(encodeURIComponent(o)) : o)
    return `data:${mimeType};base64,` + base64
}

// Import DataURI 
const importURI = async (uri, isJSON) => await ((isJSON) ? import(uri, { assert: { type: "json" } }) : import(uri)).catch((e) => {
    throw e
});

export const get = async (input, uri, mimeType) => {
    const type = (typeof input === 'string') ? 'text' : 'buffer'

    let datauri, module

    if (!mimeType){
        const pathExt = pathUtils.extension(uri)
        mimeType = mimeTypes.get(pathExt)
    }

    let isJSON = mimeType === 'application/json'
    
    try {
        datauri = getURI(input, mimeType, type);
        module = await importURI(datauri, isJSON) // check if datauri will work to be imported. Otherwise try different methods and flag for import replacement
    }

    // Handle Exceptions
    catch (e) {
        datauri = getURI(input, mimeType, type, true);
        if (mimeTypes.isJS(mimeType)) module = datauri = await catchFailedModule(datauri, e).catch((e) => {
            // console.error('Failed to load module', path, info, e)
            throw e
        }); // javascript script tag imports
        else module = datauri // audio / video assets
    }

    return {
        datauri,
        module
    }
}

async function catchFailedModule (uri, e){
    if (
        e.message.includes('The string to be encoded contains characters outside of the Latin1 range.') // cannot be represented as a datauri
        || e.message.includes('Cannot set properties of undefined') // will not appropriately load to the window
    ) return await load.script(uri)
    else throw e
}