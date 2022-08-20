import * as pathUtils from "./utils/path.js";
import { handleFetch } from "./utils/request.js";

globalThis.REMOTEESM_TEXT_REFERENCES = {} // Share references betwee loaded dataurl instances

// Node Polyfills
globalThis.REMOTEESM_NODE = false
export const ready = new Promise(async (resolve, reject) => {
    try {
        if(typeof process === 'object') { //indicates node
            globalThis.REMOTEESM_NODE = true
            globalThis.fetch = (await import('node-fetch')).default
            if (typeof globalThis.fetch !== 'function') globalThis.fetch = fetch

            const Blob = (await import('cross-blob')).default
            globalThis.Blob = Blob

            if (typeof globalThis.Blob !== 'function') globalThis.Blob = Blob
            resolve(true)
        } else resolve(true)

    } catch (err) {
        console.log(err)
        reject(err)
    }
})


// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /import([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/g 
const moduleDataURI = (text, mimeType='text/javascript') => `data:${mimeType};base64,` + btoa(text);

// Direct Import of ES6 Modules
export const importFromText = async (text, path) => {
    const extension = path.split('.').slice(-1)[0]
    const isJSON = extension === 'json'
    let mimeType = isJSON ? 'application/json' : 'application/javascript'
    const uri = moduleDataURI(text, mimeType)
    let imported = await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri)).catch((e) => {
        if (e.message.includes('Unexpected token')) throw new Error('Failed to fetch') // Not found
        else throw e;
      });


    globalThis.REMOTEESM_TEXT_REFERENCES[path] = imported

    return imported
}

export const resolve = pathUtils.get

const getText = async (uri) => await globalThis.fetch(uri).then(res => res.text())

const safeImport =  async (uri, root, onImport=()=>{}, outputText) => {

    // Make sure fetch is ready
    await ready

    // Load the WASL file
    const extension = uri.split('.').slice(-1)[0]
    const isJSON = extension === "json";

     let module = await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri))
     .catch(() => { }); // is available locally?

     let text;
    if (!module) {

        text = await getText(uri)

    try {
        module = await importFromText(text, uri)
    }

    // Catch Nested Imports
    catch (e) {

        const base = pathUtils.get("", uri);
        let childBase = base;

        // Use a Regular Expression to Splice Out the Import Details
        const importInfo = {}
        let m;
        do {
            m = re.exec(text)
            if (m == null) m = re.exec(text); // be extra sure (weird bug)
            if (m) {
                text = text.replace(m[0], ``) // Replace found text
                const wildcard = !!m[1].match(/\*\s+as/)
                const variables = m[1].replace(/\*\s+as/, '').trim()
                importInfo[m[3]] = {
                    variables,
                    wildcard
                }
            }
        } while (m);

        // Import Files Asynchronously
        for (let path in importInfo){
            const {variables, wildcard} = importInfo[path]

            // Check If Already Exists
            let correctPath = pathUtils.get(path, childBase)
            const dependentFilePath = pathUtils.get(correctPath)
            const dependentFileWithoutRoot = pathUtils.get(dependentFilePath.replace(root ?? '', ''))
            
            // Check If Already Exists
            let ref = globalThis.REMOTEESM_TEXT_REFERENCES[dependentFilePath]
            if (!ref) {
                const extension = correctPath.split('.').slice(-1)[0]
                const info = await handleFetch(correctPath);
                let blob = new Blob([info.buffer], { type: info.type });
                const isJS = extension.includes('js')
                const newURI = dependentFileWithoutRoot
                const newText = await blob.text()
                let importedText = (isJS) ? await new Promise(async (resolve) => {
                    await safeImport(newURI, uri, (path, info)=> {
                        onImport(path, info)
                        if (path == newURI) resolve(info.text)
                    }, true) 
                }) : newText

                await importFromText(importedText, correctPath) // registers in text references
            }
            
            text = `const ${variables} =  globalThis.REMOTEESM_TEXT_REFERENCES['${correctPath}']${variables.includes('{') ? '' : (wildcard) ? '' : '.default'};
        ${text}`;
        }

        module = await importFromText(text, uri)
    }
}

onImport(uri, {
    text: (outputText) ? (text ?? await getText(uri)) : undefined, 
    module
})

return module

}

export default safeImport