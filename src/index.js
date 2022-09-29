import * as pathUtils from "./utils/path.js";
import { getURL } from "./utils/request.js";
import * as polyfills from './utils/polyfills.js'
import * as nodeModules from './utils/nodeModules.js'
import * as sourceMap from './utils/sourceMap.js'
import * as load from './utils/load.js'
import * as errors from './utils/errors.js'
import * as response from './utils/response.js'
import Bundle from "./classes/Bundle.js";


globalThis.REMOTEESM_BUNDLES = {global: {}} // Share references between loaded dataurl instances

// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /[^\n]*(?<![\/\/])import\s+([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/gm;

export const resolve = pathUtils.get
export const path = pathUtils

const global = globalThis.REMOTEESM_BUNDLES.global
const setBundle = (info, opts) => {
    const bundleInfo = getBundle(opts.bundle)
    const bundles = bundleInfo.bundle

    const options = [info.datauri, info.objecturl]
    if (!bundles[info.uri]) bundles[info.uri] = new Bundle()

    // Register In Global
    if (!global[info.uri]) global[info.uri] = bundles[info.uri]
    else {
        if (opts.bundle != 'global' && opts.debug) console.warn('Duplicating this import. Already tracking globally...', info.uri)
    }

    global[info.uri].value = bundles[info.uri].value = (opts.bundler === 'objecturl') ? options[1] ?? options[0] : options[0] ?? options[1]
}

const bundle = async (info, importInfo, opts) => {

    const { variables, wildcard } = importInfo;
    let path = importInfo.path
    const absolutePath = pathUtils.absolute(path)


    let imported;

        let correctPath = (absolutePath) ? path : pathUtils.get(path, info.uri);

        // Correct the Correct Path
        const absNode = nodeModules.path(opts)
        correctPath = correctPath.replace(`${absNode}/`, '')

        // Set Bundle Key
        const noRoot = pathUtils.noBase(correctPath, opts); // still is relative
        const bundleKey = getPathID(correctPath, opts)
        const uriPathID = getPathID(info.uri, opts)

        // Check If Bundle Already Exists
        const bundleInfo = getBundle(opts.bundle, bundleKey) // must have a bundle

        const thisBundle = bundleInfo.bundle
        let ref = thisBundle.value;


        let foundCircular = false
        const dependencyBundle = getBundle(opts.bundle, uriPathID) // must have a bundle
        if (dependencyBundle.bundle.dependents.has(bundleKey)) foundCircular = true
        dependencyBundle.bundle.dependencies.add(bundleKey)
        if (thisBundle.dependencies.has(uriPathID)) foundCircular = true 
        thisBundle.dependents.add(uriPathID)

        // Abort for circular references
        if(foundCircular) {
            const message = `Circular dependency detected: ${uriPathID} <-> ${bundleKey}.`
            throw new Error(message)
        }

        // Get Bundle Value
        if (!ref) {
            thisBundle.value = null

            const url = getURL(correctPath);
            const newURI = noRoot;

            // Import JavaScript and TypeScript Safely
            const newOptions = {
                output: {},
                ...opts,
                root: url,
            }

            newOptions.output.text = true // always output text

            // Get File Info
            imported = await getInfo(newURI, newOptions, {
                original: path,
                transformed: correctPath
            })

            if (opts.dependencies) {
                if (!opts.dependencies[info.uri]) opts.dependencies[info.uri] = {}
                opts.dependencies[info.uri][imported.uri] = importInfo;
            }
              
            if (imported.fallback) thisBundle.value = imported.module;
            else {
                const innerInfo = await response.parse({
                    text: imported.text,
                    uri: bundleKey
                }, "text")

                setBundle(innerInfo, opts)
            }
        }


        // Update Original Input TextS
        const value = thisBundle.value
        if (typeof value === "string") {
            info.text.updated = `import ${wildcard ? "* as " : ""}${variables} from "${value}"; // Imported from ${bundleKey}
                  ${info.text.updated}`;
        }

        // Passed by Reference (e.g. fallbacks)
        else {
            info.text.updated =  `const ${variables} = globalThis.REMOTEESM_BUNDLE["${bundleInfo.id}"]["${bundleKey}"];
            ${info.text.updated}`;
        }

        return imported
}



// ------------- Get All Import Information -------------
export const getInfo = async (uri, opts, pathInfo = {
    original: uri,
    transformed: uri
}) => {
    return await new Promise(async (resolve, reject) => {
        await compile(uri, {
            ...opts,
            onImport: (path, info) => {
                if (opts.onImport instanceof Function) opts.onImport(path, info);
                if (info.original === uri) resolve(info); // pass all info
            }
        }).catch((e) => {
            if (e.message.includes('Circular dependency detected')) reject(e)
            else {
                const noBase = pathUtils.absolute(pathInfo.original) ? pathUtils.noBase(pathInfo.original, opts, true) : pathUtils.noBase(pathInfo.transformed, opts, true)
                console.warn(`Failed to fetch ${uri}. Checking filesystem references...`);
                const filesystemFallback = opts.filesystem?._fallbacks?.[noBase];
                if (filesystemFallback) {
                    console.warn(`Got fallback reference (module only) for ${uri}.`);
                    const info = { module: filesystemFallback }
                    Object.defineProperty(info, 'fallback', { value: true, enumerable: false })
                    resolve({ module: filesystemFallback });
                } else {
                    const middle = "was not resolved locally. You can provide a direct reference to use in";
                    if (e.message.includes(middle)) reject(e);
                    else reject(errors.create(uri, noBase));
                }
            }
        })
    })
}

function getBundle(id, key) {
    if (!id) id = Math.random()
    
    let bundle = globalThis.REMOTEESM_BUNDLES[id]
    if (!bundle) bundle = globalThis.REMOTEESM_BUNDLES[id] = {}

    if (key) {
        if (!bundle[key]) bundle[key] = new Bundle()
        bundle = bundle[key] // move
    }

    return {
        id,
        bundle
    }
}


function getPathID(path, opts) {
    return pathUtils.get(pathUtils.noBase(path,opts))
}

// ------------- Safely Import Module -------------
export const compile = async (uri, opts = {}) => {

    opts = Object.assign({}, opts) // copy options

    const {
        onImport = () => { },
        output = {},
    } = opts;


    // Progress Monitoring Utilities
    let dependenciesResolved = 0
    let numDependencies = 0
    const fileCallback = opts.callbacks?.progress?.file
    const runFileCallback = typeof fileCallback === 'function'

    let pathId = getPathID(uri, opts)

    try {

        // Set Bundle ID
        if (!opts.bundle) {
            const bundleInfo = getBundle(opts.bundle)
            opts.bundle = bundleInfo.id // use same 
        }

        // Set Bundler
        if (!opts.bundler) opts.bundler = 'objecturl' // default bundler

        // Initialize
        await polyfills.ready // Make sure fetch is ready

        let finalInfo = {};
        const notDirect = output.text || output.datauri || output.objecturl

        // Try to Import Natively
        const info = (notDirect) ? undefined : await response.findModule(uri, opts).catch((e) => {})
        finalInfo.module = info?.module
        if (info?.uri) pathId = getPathID(info.uri, opts) // Set Path ID

        if (!finalInfo.module || notDirect) {

            // ------------------- Get URI Response -------------------
            const info = await response.findText(uri, opts)
            pathId = getPathID(info.uri, opts) // Update Path ID

            // ------------------- Try Direct Import -------------------
            try {
                finalInfo = await response.parse(info)
                setBundle(finalInfo, opts)
            }

            // ------------------- Replace Nested Imports -------------------
            catch (e) {

                // ------------------- Get Import Details -------------------
                const importInfo = [];

                const matches = Array.from(info.text.updated.matchAll(re))
                matches.forEach(m => {
                    info.text.updated = info.text.updated.replace(m[0], ``); // Replace found text
                    const wildcard = !!m[1].match(/\*\s+as/);
                    const variables = m[1].replace(/\*\s+as/, "").trim();
                    importInfo.push({
                        path: m[3],
                        variables,
                        wildcard
                    });
                })


                numDependencies = importInfo.length
                // ------------------- Import Files Asynchronously -------------------
                const promises = importInfo.map(async (thisImport) => {
                    await bundle(info, thisImport, opts) // can't stop all the requests in midflight...
                    dependenciesResolved++
                    if (runFileCallback) fileCallback(pathId, dependenciesResolved, numDependencies) 
                })

                await Promise.all(promises)

                // ------------------- Import Updated File Text -------------------
                finalInfo = await response.parse(info, "text")
                setBundle(finalInfo, opts)
            }
        }


        // ------------------- Tell the User the File is Done -------------------
        if (runFileCallback) fileCallback(pathId, dependenciesResolved, numDependencies, true) 

        // ------------------- Pass Additional Information to the User -------------------
        finalInfo.original = uri
        onImport(pathId, finalInfo);


        // ------------------- Return Standard Import Value -------------------
        return finalInfo.module;
    } 
    
    // Indicate Failure to the User
    catch (e) {
        if (runFileCallback) fileCallback(pathId, dependenciesResolved, numDependencies, null, e) 
        throw e
    }
};

export default compile

export {
    sourceMap,
    nodeModules,
    load
}