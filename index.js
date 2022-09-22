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


// Mime Type Resolution
const jsType =  'application/javascript'
const mimeTypeMap = {
  'js': jsType,
  'mjs': jsType,
  'cjs': jsType,
  'json': "application/json",
  'html': 'text/html',
  'css': 'text/css',
  'txt': 'text/plain',
  'svg': 'image/svg+xml',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  
  'mp3': 'audio/mpeg',
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogg': 'application/ogg',
  'wav': 'audio/wav'
}

const getMimeType = (extension) => mimeTypeMap[extension]

// source map regex
const sourceReg = /\/\/# sourceMappingURL=(.*\.map)/

// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /import([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/g 

function _arrayBufferToBase64( buffer ) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
  }
  
  
export const moduleDataURI = (o, mimeType = "text/javascript", method, safe=false) => {
    const base64 = (method === 'buffer') ? _arrayBufferToBase64(o) : btoa((safe) ? unescape(encodeURIComponent(o)) : o)
    return `data:${mimeType};base64,` + base64
  }

const catchFailedModule = async (uri, e) => {
    if (e.message.includes('The string to be encoded contains characters outside of the Latin1 range.')) {
        return await new Promise(((resolve, reject) => {
  
        const script = document.createElement('script')
  
          let r = false
          script.onload = script.onreadystatechange = function() {
            if ( !r && (!this.readyState || this.readyState == 'complete') ) {
              r = true
              resolve(window)
            }
        }
  
          script.onerror = reject
  
  
            script.src=uri;
            document.body.insertAdjacentElement('beforeend', script)
      }))

  } else throw e
  }
  

// Direct Import of ES6 Modules
export const importResponse = async (info, path, collection={}, type="buffer") => {
    const extension = path.split('.').slice(-1)[0]
    const isJSON = extension === 'json'
    let mimeType = getMimeType(extension)
    let reference = null;
    let imported = null;
  
    const importURI = async (uri) => await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri)).catch((e) => {throw e});
  
    try {
      reference = moduleDataURI(info, mimeType, type);
      imported = await importURI(reference).catch(e => {throw e});
    } 
    
    // Handle Exceptions
    catch (e) {
      reference = moduleDataURI(info, mimeType, type, true);
      if (mimeType === jsType) imported = reference = await catchFailedModule(reference, e).catch(e => {throw e}); // javascript script tag imports
      else imported = reference // audio / video assets
    }

     collection[path] = reference

    return imported
}

export const resolve = pathUtils.get

export const getSourceMap = async (uri, text, evaluate=true) => {
    if (!text) text = await getResponse(uri) // get text
    if (text){
        const srcMap = text.match(sourceReg)

        if (srcMap) {
            const get = async () => {

                const loc = pathUtils.get(srcMap[1], uri);
                let res = await getResponse(loc) // get text

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

var enc = new TextDecoder("utf-8");
var getResponse = async (uri) => {
  const response = await globalThis.fetch(uri)
  const buffer = await response.arrayBuffer()
  return {
    response,
    buffer,
    text: enc.decode(buffer)
  }
}

const safeImport =  async (uri, opts = {}) => {

    const {
        root,
        onImport = ()=>{},
        outputText,
        forceImportFromText,
        // useSource,
        nodeModules = 'node_modules', // at base
        rootRelativeTo = './'
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
    if (!module || outputText) {
        const response = await getResponse(uri)
        text = originalText = response.text
    try {
        module = await importResponse(response.buffer, uri, uriCollection)
    }

    // Catch Nested Imports
    catch (e) {

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

            const isAbsolute = path[0] !== '.'

            // Check If Already Exists
            let correctPath = pathUtils.get(path, uri)


            // Assume node_modules is at the base
            if (isAbsolute) {
                const base = pathUtils.get(path, nodeModules)
                const getPath = (path) => pathUtils.get(pathUtils.get(path, base, false, path.split('/').length === 1), rootRelativeTo, true)
                const pkgPath =  getPath('package.json', base)
                try {
                    const pkg = (await import(pkgPath, {assert: {type: 'json'}})).default
                    const destination = pkg.module || pkg.main || 'index.js'
                    correctPath = getPath(destination)
                } catch (e) {
                    console.warn(`${base} does not exist or is not at the root of the project.`)
                }
            }            

            const dependentFilePath = pathUtils.get(correctPath)
            const dependentFileWithoutRoot = pathUtils.get(dependentFilePath.replace(root ?? '', ''))

            if (opts.dependencies) opts.dependencies[uri][dependentFileWithoutRoot] = importInfo[i]
            
            // Check If Already Exists
            let filesystemFallback = false
            let ref = uriCollection[dependentFilePath]
            if (!ref) {
                const extension = correctPath.split('.').slice(-1)[0]
                const info = await handleFetch(correctPath, opts?.callbacks?.progress);
                let blob = new Blob([info.buffer], { type: info.type });
                const isJS = extension.includes('js')
                const newURI = dependentFileWithoutRoot
                const newText = await blob.text()
                let importedText = (isJS) ? await new Promise(async (resolve, reject) => {
                    
                    await safeImport(newURI, {
                        ...opts,
                        root: uri, 
                        onImport: (path, info)=> {
                            onImport(path, info)
                            if (path == newURI) resolve(info.text)
                        }, 
                        outputText: true,
                        datauri: uriCollection
                    }).catch((e) => {
                            // TODO: Ensure that you get a valid set of errors...
                            const urlNoBase = isAbsolute ? path : correctPath.replace(`${rootRelativeTo.split('/').slice(0, -1).join('/')}/`, '')
                            console.warn(`Failed to fetch ${newURI}. Checking filesystem references...`)
                            filesystemFallback = opts.filesystem?._fallbacks?.[urlNoBase]
                          if(filesystemFallback) {
                            console.warn(`Got fallback reference for ${newURI}.`, )
                            resolve();
                          } else {
                            const middle = 'was not resolved locally. You can provide a direct reference to use in'
                            if (e.message.includes(middle)) reject(e);
                            else reject(new Error(`${newURI} ${middle} options.filesystem._fallbacks['${urlNoBase}'].`))
                          }
                      }) 
                }) : newText

                if (filesystemFallback) uriCollection[correctPath] = filesystemFallback
                else await importResponse(importedText, correctPath, uriCollection, 'text') // registers in text references
            }
            

            // Handle datauri
            if (typeof uriCollection[correctPath] === 'string') {
                text =  `import ${wildcard ? "* as " : ""}${variables} from "${uriCollection[correctPath]}";
                ${text}`;
            } 
            
            // Handle objects
            else {
                if (!window.GLOBAL_REMOTEESM_COLLECTION) window.GLOBAL_REMOTEESM_COLLECTION = {}
                window.GLOBAL_REMOTEESM_COLLECTION[correctPath] = uriCollection[correctPath]
                text =  `const ${variables} = window.GLOBAL_REMOTEESM_COLLECTION["${correctPath}"];
                ${text}`;
            }
        }

        module = await importResponse(text, uri, uriCollection, 'text')
    }
}

onImport(uri, {
  text,
  file: outputText ? originalText : void 0,
  module
});

return module

}

export default safeImport