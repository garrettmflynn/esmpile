import * as pathUtils from "./utils/path.js";
import { handleFetch } from "./utils/request.js";

const datauri = {} // Share references between loaded dataurl instances

// Node Polyfills
export const ready = new Promise(async (resolve, reject) => {
    try {
        if(typeof process === 'object') { //indicates node
            // globalThis.REMOTEESM_NODE = true
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

// source map regex
const sourceReg = /\/\/# sourceMappingURL=(.*\.map)/

// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /import([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/g 
export const moduleDataURI = (text, mimeType='text/javascript') => `data:${mimeType};base64,` + btoa(text);

// Direct Import of ES6 Modules
export const importFromText = async (text, path, collection={}) => {
    const extension = path.split('.').slice(-1)[0]
    const isJSON = extension === 'json'
    let mimeType = isJSON ? 'application/json' : 'application/javascript'
    const uri = moduleDataURI(text, mimeType)
    let imported = await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri)).catch((e) => {
        if (e.message.includes('Unexpected token')) throw new Error('Failed to fetch') // Not found
        else throw e;
      });


      const ref = {}

    for (let key in imported) {
        // mimic live bindings
        Object.defineProperty(ref, key, {
            get: () => imported[key], // get original import value
            // set: (input) => imported[key] = input, // NOTE: Is immutable from this interface
            enumerable: true,
        })
     }

     collection[path] = uri// ref

    return imported
}

export const resolve = pathUtils.get

export const getSourceMap = async (uri, text, evaluate=true) => {
    if (!text) text = await getText(uri) // get text
    if (text){
        const srcMap = text.match(sourceReg)

        if (srcMap) {
            const get = async () => {

                const loc = pathUtils.get(srcMap[1], uri);
                let res = await getText(loc) // get text

                // remove source map invalidation
                if (res.slice(0, 3) === ")]}") {
                    console.warn('Removing source map invalidation characters')
                    res = res.substring(res.indexOf('\n'));
                }
                
                // return source map
                const out = {module: JSON.parse(res)}
                out.text = out.file = res
                return out
            }

            return evaluate ? get() : get
        }
    }
}

const getText = async (uri) => await globalThis.fetch(uri).then(res => res.text())

const safeImport =  async (uri, opts = {}) => {

    const {
        root,
        onImport = ()=>{},
        outputText,
        forceImportFromText,
        useSource
    } = opts

    const uriCollection = opts.datauri || datauri

    // Make sure fetch is ready
    await ready
    
    // Register in Tree
    if (opts.dependencies) opts.dependencies[uri] = {}


    // Load the WASL file
    const extension = uri.split('.').slice(-1)[0]
    const isJSON = extension === "json";

     let module = (!forceImportFromText) ? 
     await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri))
     .catch(() => { }) // is available locally?
     : undefined;

     let text, originalText;
    if (!module) {

        text = originalText = await getText(uri)

    try {
        module = await importFromText(text, uri, uriCollection)
    }

    // Catch Nested Imports
    catch (e) {

        const base = pathUtils.get("", uri);
        let childBase = base;

        // Use a Regular Expression to Splice Out the Import Details
        const importInfo = []
        let m;
        do {
            m = re.exec(text)
            if (m == null) m = re.exec(text); // be extra sure (weird bug)
            if (m) {
                text = text.replace(m[0], ``) // Replace found text
                const wildcard = !!m[1].match(/\*\s+as/)
                const variables = m[1].replace(/\*\s+as/, '').trim()
                importInfo.push({
                    path: m[3],
                    variables,
                    wildcard
                })
            }
        } while (m);

        // Import Files Asynchronously
        for (let i in importInfo){
            const {variables, wildcard, path} = importInfo[i]

            // Check If Already Exists
            let correctPath = pathUtils.get(path, childBase)
            const dependentFilePath = pathUtils.get(correctPath)
            const dependentFileWithoutRoot = pathUtils.get(dependentFilePath.replace(root ?? '', ''))

            if (opts.dependencies) opts.dependencies[uri][dependentFileWithoutRoot] = importInfo[i]
            
            // Check If Already Exists
            let ref = uriCollection[dependentFilePath]
            if (!ref) {
                const extension = correctPath.split('.').slice(-1)[0]
                const info = await handleFetch(correctPath);
                let blob = new Blob([info.buffer], { type: info.type });
                const isJS = extension.includes('js')
                const newURI = dependentFileWithoutRoot
                const newText = await blob.text()
                let importedText = (isJS) ? await new Promise(async (resolve) => {
                    await safeImport(newURI, {
                        root: uri, 
                        onImport: (path, info)=> {
                            onImport(path, info)
                            if (path == newURI) resolve(info.text)
                        }, 
                        outputText: true,
                        forceImportFromText
                    }) 
                }) : newText

                await importFromText(importedText, correctPath, uriCollection) // registers in text references
            }
            
            text = `import ${(wildcard) ? '* as ' : ''}${variables} from "${uriCollection[correctPath]}";\n${text}`;
        }

        module = await importFromText(text, uri, uriCollection)
    }
}


let txt = outputText ? text ?? await getText(uri) : void 0

onImport(uri, {
  text: txt,
  file: outputText ? originalText ?? txt : void 0,
  module
});

return module

}

export default safeImport