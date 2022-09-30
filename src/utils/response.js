import * as encode from "./encode/index.js";
import * as transformations from './transformations.js'
import * as handlers from './handlers.js'
import * as pathUtils from "./path.js";
import * as mimeTypes from "./mimeTypes.js";
import * as compile from "./compile.js";
import { handleFetch } from "./request.js";


// Get ESM Module Info
const enc = new TextDecoder("utf-8");
export const get = async (uri, opts, expectedType) => {

    const fetchInfo = await handleFetch(uri, opts)
    const response = fetchInfo.response

    const info = { uri, response, text: {original: '', updated: ''}, buffer: null }
    if (response.ok) {
        if (expectedType) {
            const mimeType = response.headers.get("Content-Type")
            if (!mimeType.includes(expectedType)) throw new Error(`Expected Content Type ${expectedType} but received ${mimeType} for  ${uri}`)
        }

        info.buffer = fetchInfo.buffer
        info.text.original = info.text.updated = enc.decode(info.buffer)
    } else {
        throw new Error(response.statusText)
    }

    return info
}

export const find = async(uri, opts, callback) => {
    
     // Try Alternative File Paths
     const transArray = transformations.get(uri)

     let response;
 
     if (transArray.length > 0) {
         do {
             const ext = transArray.shift()
 
             const name = ext?.name ?? ext
             const warning = (e) => {
                 if (opts.debug) console.error(`Import using ${name ?? ext} transformation failed for ${uri}`)
             }
 
             const transformed = await handlers.transformation(uri, ext, opts)
             const correctURI = pathUtils.get(transformed, opts.relativeTo)
             const expectedType = (ext) ? null : 'application/javascript'
             response = await callback(correctURI, opts, expectedType).then(res => {
                if (opts.debug) console.warn(`Import using ${name ?? ext} transformation succeeded for ${uri}`)
                return res
            }).catch(warning)
         } while (!response && transArray.length > 0)
 
         if (!response) throw new Error(`No valid transformation found for ${uri}`)
     }
 
     // Get Specified URI Directly
     else response = await callback(pathUtils.get(uri, opts.relativeTo), opts);

    return response
}


export const findModule = async (uri, opts) => {
    const pathExt = pathUtils.extension(uri)
    const isJSON = pathExt === "json";

    const info = {}
    await find(uri, opts, async (transformed) => {
        info.uri = transformed
        info.result = await (isJSON ? import(transformed, { assert: { type: "json" } }) : import(transformed))
    })

    return info
}

// Get ESM Module Text
export const findText = async (uri, opts) => await find(uri, opts, get)

// Direct Import of ES6 Modules
export const parse = async (info, type="buffer") => {

    let bufferOrText = (type === 'text') ? info.text.updated :  info.buffer 

    // Compile Code
    const pathExt = pathUtils.extension(info.uri)
    let mimeType = mimeTypes.get(pathExt)
    switch (mimeType) {
        case 'text/typescript':
            bufferOrText = compile.typescript(info, type)
            mimeType = mimeTypes.js
            break;
    }

    // Get Data URI
    const datauriInfo = await encode.datauri.get(bufferOrText, info.uri, mimeType)

    // Get Object URL
    const objecturl = encode.objecturl.get(bufferOrText)

    info.result = datauriInfo.module
    info.datauri = datauriInfo.datauri
    info.objecturl = objecturl

    return info
}