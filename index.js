import * as pathUtils from "./utils/path.js";
import { handleFetch } from "./utils/request.js";

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
export const importFromText = async (text, extension) => {
    const isJSON = extension === 'json'
    let mimeType = isJSON ? 'application/json' : 'application/javascript'
    const uri = moduleDataURI(text, mimeType)
    let imported = await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri)).catch((e) => {
        if (e.message.includes('Unexpected token')) throw new Error('Failed to fetch') // Not found
        else throw e;
      });
    return imported
}

export const resolve = pathUtils.get


const safeImport =  async (uri, root, onImport=()=>{}, output) => {

    // Make sure fetch is ready
    await ready

    // Load the WASL file
    const extension = uri.split('.').slice(-1)[0]
    const isJSON = extension === "json";

     let module = await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri))
     .catch(() => { }); // is available locally?

    let text = await globalThis.fetch(uri).then(res => res.text())

    if (!module) {

    try {
        module = await importFromText(text, extension)
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
                const variables = m[1].replace(/\*\s+as/, '').trim()
                importInfo[m[3]] = variables // Save variables to path
            }
        } while (m);

        // Import Files
        for (let path in importInfo) {

            // Check If Already Exists
            let correctPath = pathUtils.get(path, childBase)
            const variables = importInfo[path];

      const dependentFilePath = pathUtils.get(correctPath)
      const dependentFileWithoutRoot = pathUtils.get(dependentFilePath.replace(root ?? '', ''))
      
      const extension = correctPath.split('.').slice(-1)[0]
    const mimeType = (extension === 'js') ? 'application/javascript' : `application/${extension}`
    const info = await handleFetch(correctPath);
    let blob = new Blob([info.buffer], { type: info.type });
      const isJS = extension.includes('js')
      const newURI = dependentFileWithoutRoot
      const newText = await blob.text()
      let importedText = (isJS) ? await safeImport(newURI, uri, onImport, 'text') : newText

      const hasBrackets = variables.includes('{')
      const dataUri = moduleDataURI(importedText, mimeType);
          text = `const ${variables} =  (await import('${dataUri}', ${isJS ? '{}' : '{assert: {type: "json"}}'}))${hasBrackets ? '' : '.default'};
${text}`;
    }

        module = await importFromText(text, extension)
    }
}

onImport(uri, {text, module})
if (output === 'text') return text
else return module

}

export default safeImport