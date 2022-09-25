import * as pathUtils from "./utils/path.js";
import { getURL, handleFetch } from "./utils/request.js";

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
  "ts": "text/typescript",
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
const re = /[^\n]*(?<![\/\/])import\s+([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/gm;

function _arrayBufferToBase64( buffer ) {
    let binary = '';
    const bytes = new Uint8Array( buffer );
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
  }
  
  
export const moduleDataURI = (o, mimeType = "text/javascript", method, safe=false) => {
    const base64 = (method === 'buffer') ? _arrayBufferToBase64(o) : btoa((safe) ? unescape(encodeURIComponent(o)) : o)
    return `data:${mimeType};base64,` + base64
  }

          
  const loadScriptTag = async (uri) => {
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
}

const catchFailedModule = async (uri, e) => {
    if (
        e.message.includes('The string to be encoded contains characters outside of the Latin1 range.') // cannot be represented as a datauri
        || e.message.includes('Cannot set properties of undefined') // will not appropriately load to the window
    ) return await loadScriptTag(uri)
    else throw e
  }


  const tsconfig = {
    compilerOptions: {
        "target": "ES2015",
        "module": "ES2020",
        "strict": true,
        "esModuleInterop": true
    }
  }
  
  const compileTypescript = async (response, type="text") => {
    if (!window.ts) await loadScriptTag('https://cdn.jsdelivr.net/npm/typescript/lib/typescriptServices.js') // lazy load typescript
    const tsCode = (type !== 'buffer') ? response[type] : new TextDecoder().decode(response[type]);
    response.text = window.ts.transpile(tsCode, tsconfig.compilerOptions);
    if (type === 'buffer') response.buffer = new TextEncoder().encode(response.text); // encode to buffer
     return response[type]

  }
  

// Direct Import of ES6 Modules
export const importResponse = async (response, path, collection={}, type="buffer") => {
    const extension = path.split('.').slice(-1)[0]
    const isJSON = extension === 'json'
    let mimeType = getMimeType(extension)
    let reference = null;
    let imported = null;

    let info = response[type]

    // Compile Code
    switch (mimeType) {
        case 'text/typescript':
            info = await compileTypescript(response, type)
            mimeType = jsType
            break;
    }

    // Import Code
    const importURI = async (uri) => await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri)).catch((e) => {
        throw e
    });
  
    try {
      reference = moduleDataURI(info, mimeType, type);
      imported = await importURI(reference).catch((e) => {
        throw e
    });
    } 
    
    // Handle Exceptions
    catch (e) {
      reference = moduleDataURI(info, mimeType, type, true);
      if (mimeType === jsType) imported = reference = await catchFailedModule(reference, e).catch((e) => {
        throw e
    }); // javascript script tag imports
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

const enc = new TextDecoder("utf-8");
const getResponse = async (uri) => {
  const response = await globalThis.fetch(uri)
  const buffer = await response.arrayBuffer()
  return {
    response,
    buffer,
    text: enc.decode(buffer)
  }
}


const defaults = {
    nodeModules: "node_modules",
    rootRelativeTo: "./"
  };
  
  export const resolveNodeModule = async (path, opts) => {
    const nodeModules = opts.nodeModules ?? defaults.nodeModules;
    const rootRelativeTo = opts.rootRelativeTo ?? defaults.rootRelativeTo;
    const absoluteNodeModules = pathUtils.get(nodeModules, rootRelativeTo);
  
    const split = path.split('/')
    const base = pathUtils.get(path, absoluteNodeModules);
    if (split.length > 1) return base
  
  
    return await getMainPath(path, base).catch(e => {
      console.warn(`${base} does not exist or is not at the root of the project.`);
    })
  };
  
  const getPath = (str, path, base) => pathUtils.get(str, base, false, path.split("/").length === 1);
  
  const getPackagePath = (path, base=path) => getPath("package.json", path, base)
  
  const getMainPath = async (path, base=path) => {
    const pkg = await getPackage(path, base)
    if (!pkg) return base
    const destination = pkg.module || pkg.main || "index.js";
    return getPath(destination, path, base);
  }
  
  const getPackage = async (path, base=path) => {
      const pkgPath = getPackagePath(path, base)
      return (await import(pkgPath, { assert: { type: "json" } })).default;
  }
  
  const handleNoExtension = (path, repExt='js') => {
    const isAbsolute = path[0] !== ".";
    const split = path.split('/')
    const ext = split.slice(-1)[0].split('.').slice(-1)[0]
    if (!isAbsolute || (isAbsolute && split.length > 1)) {
        if (!mimeTypeMap[ext]) return`${path}.${repExt}` // use alternative extension
    }
  
    return path
  }
  
  const handleHandlers = async (path, handler, opts, force) => {
    if (typeof handler === 'string' && (!force || force === 'string')) {
      return handleNoExtension(path, handler)
    }
    else if (typeof handler === 'function' && (!force || force === 'function')) {
       return await handler(path).catch(e => { throw createError(path, getURLNoBase(path, opts)) })
    }
  }
  
  
  const getURLNoBase = (path, opts) => {
    const isAbsolute = path[0] !== ".";
    const rootRelativeTo = opts.rootRelativeTo ?? defaults.rootRelativeTo
    return isAbsolute ? path : correctPath.replace(`${rootRelativeTo.split("/").slice(0, -1).join("/")}/`, "");
  }
  
  const middle = "was not resolved locally. You can provide a direct reference to use in";
  const createError = (uri, key) => new Error(`${uri} ${middle} options.filesystem._fallbacks['${key}'].`)
  const internalImport = async (info, opts, handler = 'js') => {
  
    const uriCollection = opts.datauri || datauri;
  
  
    const { variables, wildcard } = info.import;
    let path = info.import.path
    const isAbsolute = path[0] !== ".";
  
          // Use String Handler
        if (typeof handler === 'string') path = await handleHandlers(path, handler, opts, 'string')
        
        try {
  
          let correctPath = pathUtils.get(path, info.uri); 
          if (isAbsolute) correctPath = await resolveNodeModule(path, opts);
  
          // Use Function Handler
          if (typeof handler === 'function') correctPath = await handleHandlers(correctPath, handler, opts, 'function').catch(e => {  
            throw e 
        })
  
          const dependentFilePath = pathUtils.get(correctPath);
          const dependentFileWithoutRoot = pathUtils.get(dependentFilePath.replace(opts.root ?? "", ""));
  
        if (opts.dependencies) opts.dependencies[info.uri][dependentFileWithoutRoot] = info.import;
        
        // Check If Already Exists
        let filesystemFallback = false;
        let ref = uriCollection[dependentFilePath];
        if (!ref) {
          const extension = correctPath.split(".").slice(-1)[0];
          const url = getURL(correctPath);
          const willBeJS = extension.includes("js") || extension === 'ts';
          const newURI = dependentFileWithoutRoot;
  
            let importedText;
            
            // Import JavaScript and TypeScript Safely
            if (willBeJS) {
              importedText = await new Promise(async (resolve, reject) => {
              await safeImport(newURI, {
                  ...opts,
                  root: url,
                  onImport: (path, info) => {
                    if (opts.onImport instanceof Function) opts.onImport(path, info);
                    if (path == newURI)
                    resolve(info.text);
                  },
                  outputText: true,
                  datauri: uriCollection
                }).catch((e) => {
                  const urlNoBase = isAbsolute ? getURLNoBase(path, opts) : getURLNoBase(correctPath, opts)
                  console.warn(`Failed to fetch ${newURI}. Checking filesystem references...`);
                  filesystemFallback = opts.filesystem?._fallbacks?.[urlNoBase];
                  if (filesystemFallback) {
                    console.warn(`Got fallback reference for ${newURI}.`);
                    resolve();
                  } else {
                    const middle = "was not resolved locally. You can provide a direct reference to use in";
                    if (e.message.includes(middle))
                      reject(e);
                    else
                      reject(createError(newURI, urlNoBase));
                  }
                });
              })
            } 
            
            // Just get buffer
            else {
              const info = await handleFetch(url, opts?.callbacks?.progress);
              let blob = new Blob([info.buffer], { type: info.type });
              importedText = await blob.text();
            }
  
            if (filesystemFallback) uriCollection[correctPath] = filesystemFallback;
            else await importResponse({text: importedText}, correctPath, uriCollection, "text");
          }
    
        // Handle datauri
          if (typeof uriCollection[correctPath] === "string") {
            info.response.text = `import ${wildcard ? "* as " : ""}${variables} from "${uriCollection[correctPath]}";
                  ${info.response.text}`;
          }

        // IGNORE OBJECTS SINCE THESE ARE PRODUCED WHEN GLOBAL VARIABLES ARE CREATED (that we don't know the name of...)
        // else {
        //     if (!window.GLOBAL_REMOTEESM_COLLECTION) window.GLOBAL_REMOTEESM_COLLECTION = {}
        //     window.GLOBAL_REMOTEESM_COLLECTION[correctPath] = uriCollection[correctPath]
        //     text =  `const ${variables} = window.GLOBAL_REMOTEESM_COLLECTION["${correctPath}"];
        //     ${text}`;
        // }
  
  
        return uriCollection[correctPath]
  
      } catch (e) {
        throw e
      }
  }
  
  
  const extensionsToTry = ['ts', 'js', getMainPath]

  const isAbsolute = (uri) => {
    const isAbsolute = uri[0] !== ".";
    const isRemote = uri.includes("://");
    return isAbsolute && !isRemote
  }

  const safeImport = async (uri, opts = {}) => {
    const {
      onImport = () => {},
      outputText,
      forceImportFromText,
    } = opts;
  
    const uriCollection = opts.datauri || datauri;
    // Make sure fetch is ready
    await ready
    
    // Register in Tree
    if (opts.dependencies) opts.dependencies[uri] = {};


    // Load the WASL file
    if (isAbsolute(uri)) uri = await resolveNodeModule(uri, opts);

    const extension = uri.split(".").slice(-1)[0];
    const noExtension = !mimeTypeMap[extension]

    const isJSON = extension === "json";
    let module = (!forceImportFromText) ? 
    await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri))
    .catch(() => { }) // is available locally?
    : undefined;

    let originalText, response;
    if (!module || outputText) {
  
        // ------------------- Get URI Response -------------------
        // Try Alternative Extensions
        if (noExtension) {
            const toTry = [...extensionsToTry]
            do {
            const transformed = await handleHandlers(uri, toTry.pop(), opts).catch(e => {
                throw e
            })

            response = await getResponse(transformed)
            if (!response.buffer) console.warn('Not found!', transformed)
            } while (!response.buffer && toTry.length > 0)
        }
        
        // Get Directory
        else response = await getResponse(uri); // get directly
        
      try {
        originalText = response.text;
        module = await importResponse(response, uri, uriCollection);
      } 
      
     // Catch Nested Imports in JS FIles
      catch (e) {

        // Use a Regular Expression to Splice Out the Import Details
        const importInfo = [];

        const matches = Array.from(response.text.matchAll(re))
        matches.forEach(m => {
            response.text = response.text.replace(m[0], ``); // Replace found text
            const wildcard = !!m[1].match(/\*\s+as/);
            const variables = m[1].replace(/\*\s+as/, "").trim();
            importInfo.push({
              path: m[3],
              variables,
              wildcard
            });
    })

        // Import Files Asynchronously
        for (let i in importInfo) {
  
          let res;
          for (let j in extensionsToTry){
            if (!res) {
              res = await internalImport({
                import: importInfo[i],
                response,
                uri
              }, opts, extensionsToTry[j]).catch((e) => {
                if (j === extensionsToTry.length - 1) throw e
              })
            }
          }
        }
  
        module = await importResponse(response, uri, uriCollection, "text").catch(e => { 
            throw e
         })
      }
    }
  
    onImport(uri, {
      text: response?.text,
      file: outputText ? originalText : undefined,
      module
    });
    return module;
  };

export default safeImport