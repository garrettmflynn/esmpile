import * as pathUtils from './utils/path.js'
import * as encode from "./utils/encode/index.js";
import * as mimeTypes from "./utils/mimeTypes.js";
import * as compile from "./utils/compile.js"
import * as response from "./utils/response.js"
import * as nodeModules from './utils/nodeModules.js'
import * as errors from './utils/errors.js'
import * as polyfills from './utils/polyfills.js'
import * as sourceMap from './utils/sourceMap.js';

if (!globalThis.REMOTEESM_BUNDLES) globalThis.REMOTEESM_BUNDLES = {global: {}} // Share references between loaded dataurl instances
const global = globalThis.REMOTEESM_BUNDLES.global

const noEncoding = `No buffer or text to bundle for`

// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /[^\n]*(?<![\/\/])import\s+([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/gm;

export function get(url, opts=this.options){
    const pathId = (url) ? pathUtils.pathId(url, opts) : undefined // Set Path ID
    let ref = globalThis.REMOTEESM_BUNDLES[opts.collection]
    if (!ref) ref = globalThis.REMOTEESM_BUNDLES[opts.collection] = {}
    let bundle = ref[pathId]
    if (!bundle)  bundle =  new Bundle(url, opts)
    else if (opts) bundle.options = opts // Reset options
    return bundle
}


export default class Bundle {

    filename = 'bundle.esmpile.js'

    uri;

    #url 
    get url() { return this.#url }
    set url(url) {
        this.#url = url
        const ESMPileInternalOpts = this.options._esmpile
        if (!ESMPileInternalOpts.entrypoint) ESMPileInternalOpts.entrypoint = this

        if (!this.uri) this.uri = url // set original uri
        const pathId = pathUtils.pathId(this.url, this.options)
        if (this.name !== pathId) this.name = pathId // derive a name
        this.updateCollection(this.options.collection)
    }

    status = null
    #options
    get options() {return this.#options}
    set options(opts={}) {

            if (!opts._esmpile) opts._esmpile = this.#options?._esmpile ?? {circular: new Set()} // keep internal information

            
            if (!opts.collection) opts.collection = this.#options?.collection // keep collection

            this.#options = opts

            const output = opts.output ?? {}

            // ------------------- Set Bundle Collection -------------------
            this.updateCollection(this.options.collection)

            // ------------------- Derived Properties -------------------
            this.derived.direct = opts.forceNativeImport || (!output.text && !output.datauri && !output.objecturl)

            if (typeof opts.callbacks.progress.file === 'function') this.callbacks.file = opts.callbacks.progress.file

            // ------------------- Set Defaults -------------------
            if (!opts.bundler) opts.bundler = 'objecturl' // default bundler
            this.bundler = opts.bundler

            // Default Fetch Options
            if (!opts.fetch) opts.fetch = {}
            opts.fetch = Object.assign({}, opts.fetch) // shallow copy
            opts.fetch.signal = this.controller.signal
    }

    controller = new AbortController()

    // ------------------- Toggle Bundle Encoding -------------------
    #bundler;
    get bundler() { return this.#bundler }
    set bundler(bundler) {
        this.setBundler(bundler)
    }

    setBundler = async (bundler) => {
        const innerInfo = this.#options._esmpile
            const lastBundleType = innerInfo.lastBundle

            if (
                this.#bundler !== bundler  // if bundler has changed
                || !lastBundleType // no last bundle type
            ) {
                this.#bundler = this.#options.bundler = bundler
                const entrypoint = innerInfo.entrypoint
                const entries = Array.from(this.dependencies.entries())
                await Promise.all((entries).map(async ([_, entry]) => {
                    entry.bundler = bundler
                    await entry.result
                })) // set bundler for all entries
                
                if (entrypoint?.status === 'success') {
                    if (lastBundleType) this.encoded = await this.bundle(innerInfo.lastBundle) // resolve again
                    else this.result = await this.resolve()
                }
            }
    }

    // Name Property
    #name;
    get name() { return this.#name }
    set name (name) {

        // set new name
        if (name !== this.#name){

            // remove existing reference
            let collection = globalThis.REMOTEESM_BUNDLES[this.collection]
            if (collection){
                if (global[this.name] === collection[this.name]) delete global[this.name] // delete from global collection
                delete collection[this.name] // delete from parent collection
            }

            this.#name = name

            // set filename
            let filename = name.split('/').pop()
            const components = filename.split('.')
            this.filename = [...components.slice(0,-1), 'esmpile', 'js'].join('.')


            // register in global
            if (!global[this.name]) global[this.name] = this
            else if (
                this.options.collection != 'global'
                //  && this.options.debug
            ) console.warn(`Duplicating global bundle (${this.name})`, this.name)
        }
    }

    // Register Bundle in Collection
    #collection;
    get collection() { return this.#collection }
    set collection(collection) {

        // if (collection !== this.#collection) {
        this.#collection = collection
        let ref = globalThis.REMOTEESM_BUNDLES[collection]
            if (!ref) ref = globalThis.REMOTEESM_BUNDLES[collection] = {}
            if (this.name) {
                if (!ref[this.name]) ref[this.name] = this
                else if (
                    ref[this.name] !== this
                ) console.warn(`Trying to duplicate bundle in bundle ${collection} (${this.name})`, this.name)
            } //else console.warn('No name to set collection')
        // }
    }

    // Update Bundle
    #text
    #buffer
    get text() {return this.#text}
    set text(text) {
        this.#text = text
        this.encoded = this.bundle('text').catch(e => { 
            if (!e.message.includes(noEncoding)) throw e 
        }) 
    }

    set buffer(buffer) {
        this.#buffer = buffer
        this.encoded = this.bundle('buffer').catch(e => { if (!e.message.includes(noEncoding)) throw e }) // New info creates new bundle
    }

    dependencies = new Map()
    dependents = new Map()

    get entries(){

        let entries = []

        const drill = (target) => {
            target.dependencies.forEach(o => {
                if (!entries.includes(o)) {
                    entries.push(o)
                    drill(o)
                }
            })
        }

        drill(this)

        return entries
    }

    encodings = {}

    info = {}

    imports = []

    link = undefined
    result = undefined

    callbacks = {
        file: undefined,
    }

    derived = {
        direct: undefined,
        dependencies: {n: 0, resolved: 0}
    }

    constructor(url, options={}) {

        this.options = options
        this.url = url
    }

    import = async () => {

        this.status = 'importing'

         const info = await response.findModule(this.url, this.options).catch((e) => {})
         
         // Direct import was successful
         if (info?.result) return info.result
         else this.status = 'fallback'
    }

    get = get

    compile = async () => {

        this.status = 'compiling'

        await polyfills.ready // Make sure fetch is ready

        try {
            
            const info = await response.findText(this.url, this.options).catch(e => { throw e })

            try {

                if (info){
                    this.info = info
                    this.url = this.info.uri // reset this bundle's name
                    this.buffer = this.info.buffer
                    await this.encoded // resolve after successful encoding  
                }
            }

            // ------------------- Replace Nested Imports -------------------
            catch (e) {

                // ------------------- Get Import Details -------------------
                this.imports = []
                const matches = Array.from(this.info.text.updated.matchAll(re))
                matches.forEach(m => {
                    this.info.text.updated = this.info.text.updated.replace(m[0], ``); // Replace found text
                    const wildcard = !!m[1].match(/\*\s+as/);
                    const variables = m[1].replace(/\*\s+as/, "").trim();
                    this.imports.push({
                        path: m[3],
                        variables,
                        wildcard
                    });
                })

                this.derived.dependencies.resolved = 0
                this.derived.dependencies.n = this.imports.length

                // ------------------- Import Files Asynchronously -------------------
                const promises = this.imports.map(async (info) => {
                     await this.importDependency(info)
                    this.derived.dependencies.resolved++
                })

                await Promise.all(promises)
                this.text = this.info.text.updated // trigger recompilation from text
            }

        } 
        // ------------------- Catch Aborted Requests -------------------
        catch (e) {
            throw e
        }

        await this.encoded

        return this.result
    }

    importDependency = async (info) => {
        const { variables, wildcard } = info;
        let path = info.path
        const absolutePath = pathUtils.absolute(path)
        
            let correctPath = (absolutePath) ? path : pathUtils.get(path, this.url);

            // Correct the Correct Path
            const absNode = nodeModules.path(this.options)
            correctPath = correctPath.replace(`${absNode}/`, '')
    
            // Get Dependency Bundle
            const bundle = this.get(correctPath) 

            this.addDependency(bundle)
    
            // Get Bundle Value
            if (!bundle.status) {
                const options = { output: {}, ...this.options }
                options.output.text = true // import from text
                const newBundle = await this.get(correctPath, options)
                await newBundle.resolve(path)
            } else {
                await bundle.result // wait for bundle to resolve
            }
    
            // Update Original Input Texts
            const encoded = await bundle.encoded 

            if (typeof encoded === "string") {
                this.info.text.updated = `import ${wildcard ? "* as " : ""}${variables} from "${encoded}"; // Imported from ${bundle.name}
                      ${this.info.text.updated}`;
            }
    
            // Passed by Reference (e.g. fallbacks)
            else {
                
                const replaced = variables.replace('{', '').replace('}', '')
                const exportDefault = (replaced !== variables) ? true : false
                const splitVars = variables.replace('{', '').replace('}', '').split(',').map(str => str.trim())

                const insertVariable = (variable) => {
                    let end = ''
                    if (exportDefault) end = `.default`
                    else if (!wildcard) end = `.${variable}`

                    this.info.text.updated = `const ${variable} = (await globalThis.REMOTEESM_BUNDLES["${bundle.collection}"]["${bundle.name}"].result)${end};  
                    ${this.info.text.updated}`;
                }

                splitVars.forEach(insertVariable)
            }
    
            return bundle
    }

    notify = (done, failed) => {

        const isDone = done !== undefined
        const isFailed = failed !== undefined

        // ------------------- Tell the User the File is Done -------------------
        if (this.callbacks.file) this.callbacks.file(this.name, this.derived.dependencies.resolved, this.derived.dependencies.n, isDone ? this : undefined, isFailed ? failed : undefined) 
    }

    get buffer() {return this.#buffer}


    // Get Encoded Promise
    bundle = (type="buffer") => {

        this.options._esmpile.lastBundle = type // register last bundle type
        return new Promise (async (resolve, reject) => {

            try {

            let bufferOrText = (type === 'text') ? this.info.text.updated :  this.buffer 

                if (!bufferOrText) {
                    if (this.info.fallback) this.encoded = this.info.fallback
                    else reject(new Error(`${noEncoding} ${this.name}`))
                }
        
                // Compile Code
                const pathExt = pathUtils.extension(this.url)
                let mimeType = mimeTypes.get(pathExt)
                switch (mimeType) {
                    case 'text/typescript':
                        bufferOrText = compile.typescript(this.info, type)
                        mimeType = mimeTypes.js
                        break;
                }
            
            
                // Encode into a datauri and/or objecturl
                const encodings = []
                const output = this.options.output
                if (output?.datauri || this.bundler === 'datauri') encodings.push('datauri')
                if (output?.objecturl || this.bundler === 'objecturl') encodings.push('objecturl')
                for (let i in encodings) {
                    const encoding = encodings[i]
                    const encodedInfo = await encode[encoding](bufferOrText, this.url, mimeType)

                    if (encodedInfo) {
                        this.result = encodedInfo.module
                        this.encodings[encoding] = await encodedInfo.encoded
                    }
                }

                const options = [this.encodings.datauri, this.encodings.objecturl]
                const encoded = (this.bundler === 'objecturl') ? options[1] ?? options[0] : options[0] ?? options[1]
                resolve(encoded)
            } catch (e) {
                reject(e)
            }
        })
    }

    delete = () => {
        if (this.objecturl) window.URL.revokeObjectURL(this.objecturl);
    }

    // ------------------- Dependency Management ------------------- //
    addDependency = (o) => {

        let foundCircular = false
        if (this.dependents.has(o.url)) foundCircular = true
        this.dependencies.set(o.url, o)
        if (o.dependencies.has(this.url)) foundCircular = true 
        o.dependents.set(this.url, this)

        // Abort for circular references before waiting
        if(foundCircular) {
            this.options._esmpile.circular.add(this.url, o.url)
            this.options._esmpile.circular.add(o.url)
            this.circular()
            o.circular()
        }
    }

    removeDependency = (o) => {
        this.dependencies.delete(o.name)
        o.dependents.delete(this.name)
    }

    // ------------------- Additional Helpers ------------------- //
    updateCollection = (collection) => {
        if (!collection) {
            this.collection = this.options.collection = Object.keys(globalThis.REMOTEESM_BUNDLES).length
        } else this.collection = collection
    }

    // ------------------- Download Bundle ------------------- //
    download = () => {
            let objecturl = this.encodings.objecturl

            if (this.bundler === 'datauri') {
                const mime = this.encodings.datauri.split(',')[0].split(':')[1].split(';')[0];
                const binary = atob(this.encodings.datauri.split(',')[1]);
                const array = [];
                for (var i = 0; i < binary.length; i++) {
                array.push(binary.charCodeAt(i));
                }
                const blob = new Blob([new Uint8Array(array)], {type: mime});
                objecturl = URL.createObjectURL(blob)
            }



            var a = document.createElement("a");
            document.body.appendChild(a);
            a.style = "display: none";
            a.href = objecturl;
            a.download = this.filename;
            a.click();
    }

    // ------------------- Handle Circular References ------------------- //
    circular = async () => {
        const result = await this.resolve().catch((e) => {
            console.warn(`Circular dependency detected: Fallback to direct import for ${this.url} failed...`)
            const message = `Circular dependency detected: ${uriPathID} <-> ${bundleKey}.`
            throw new Error(message)
        })

        console.warn(`Circular dependency detected: Fallback to direct import for ${this.url} was successful!`, result)
    }

    resolve = async (uri=this.uri) => {

        // resetting resolution variables
        this.status = 'resolving'
        this.result = undefined
        this.encoded = undefined

        // define result promise
        this.result = new Promise(async (resolve, reject) => {

            let result;

            const isCircular = this.options._esmpile.circular.has(this.url)
            let isDirect = isCircular || this.derived.direct
            try {
                try {
                    result = (isDirect) ? await this.import() : undefined // try to import natively
                    if (!result) {
                        if (isCircular) throw new Error(`Failed to import ${this.url} natively.`)
                        else result = await this.compile() // fallback to text compilation
                    }
                } 
                
                // Handle Resolution Errors
                catch (e) {

                    if (this.options.fetch?.signal?.aborted) throw e

                    // TODO: Can use these as defaults
                    else {
                        const noBase = pathUtils.absolute(uri) ? pathUtils.noBase(uri, this.options, true) : pathUtils.noBase(this.url, this.options, true)
                        console.warn(`Failed to fetch ${uri}. Checking filesystem references...`);
                        const filesystemFallback = this.options.filesystem?._fallbacks?.[noBase];
                        if (filesystemFallback) {
                            console.warn(`Got fallback reference (module only) for ${uri}.`);
                            result = filesystemFallback;
                            Object.defineProperty(info, 'fallback', { value: true, enumerable: false })
                        } else {
                            const middle = "was not resolved locally. You can provide a direct reference to use in";
                            if (e.message.includes(middle)) throw e;
                            else throw errors.create(uri, noBase);
                        }
                    }
                }

                 await this.encoded // ensure properly encoded
                this.status = 'success'
                this.notify(this)
                resolve(result)
            } catch (e) {
                this.status = 'failed'               
                 this.notify(null, e)
                reject(e)
            }
        })

        // Forward promise...
        return this.result
    }

    sources = async () => await sourceMap.get(this.#url, this.#options, this.info.text.original)
}