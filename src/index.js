import * as pathUtils from "./utils/path.js";
import * as polyfills from './utils/polyfills.js'
import * as nodeModules from './utils/nodeModules.js'
import * as sourceMap from './utils/sourceMap.js'
import * as load from './utils/load.js'
import * as errors from './utils/errors.js'
import * as response from './utils/response.js'
import Bundle from "./classes/Bundle.js";


// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /[^\n]*(?<![\/\/])import\s+([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/gm;

export const resolve = pathUtils.get
export const path = pathUtils

const bundleImports = async (info, importInfo, opts) => {

    const { variables, wildcard } = importInfo;
    let path = importInfo.path
    const absolutePath = pathUtils.absolute(path)


    let imported;

        let correctPath = (absolutePath) ? path : pathUtils.get(path, info.uri);

        // Correct the Correct Path
        const absNode = nodeModules.path(opts)
        correctPath = correctPath.replace(`${absNode}/`, '')

        // Set Bundle Key
        const newURI = pathUtils.noBase(correctPath, opts); // still is relative
        const bundleKey = getPathID(correctPath, opts)
        const uriPathID = getPathID(info.uri, opts)

        // Check If Bundle Already Exists
        const bundleInfo = getBundle(opts, bundleKey) // must have a bundle

        let bundle = bundleInfo.bundle
        let ref = bundle.bundle;


        let foundCircular = false
        const dependencyBundle = getBundle(opts, uriPathID) // must have a bundle
        if (dependencyBundle.bundle.dependents.has(bundleKey)) foundCircular = true
        dependencyBundle.bundle.dependencies.add(bundleKey)
        if (bundle.dependencies.has(uriPathID)) foundCircular = true 
        bundle.dependents.add(uriPathID)

        // Abort for circular references
        if(foundCircular) {
            const message = `Circular dependency detected: ${uriPathID} <-> ${bundleKey}.`
            throw new Error(message)
        }

        // Get Bundle Value
        if (!ref) {

            // Import JavaScript and TypeScript Safely
            const newOptions = {
                output: {},
                ...opts,
            }

            newOptions.output.text = true // always output text

            // Get File Info
            // bundle.getInfo(newURI, newOptions, {
            //     original: path,
            //     transformed: correctPath
            // })
            let bundleInfo = await getInfo(newURI, newOptions, {
                original: path,
                transformed: correctPath
            })

            if (bundle instanceof Bundle) bundle = bundleInfo
            else bundle.set(bundleInfo) // TODO: Check if this works

            if (opts.dependencies) {
                if (!opts.dependencies[info.uri]) opts.dependencies[info.uri] = {}
                opts.dependencies[info.uri][bundle.uri] = importInfo;
            }
              
            if (bundle.link === undefined) {
                const bundleInfo = await response.parse({
                    uri: bundle.name,
                    text: bundle.text,
                }, "text")

                bundle.update(bundleInfo, opts)
            }
        }


        // Update Original Input TextS
        if (typeof bundle.link === "string") {
            info.text.updated = `import ${wildcard ? "* as " : ""}${variables} from "${bundle.link}"; // Imported from ${bundle.name}
                  ${info.text.updated}`;
        }

        // Passed by Reference (e.g. fallbacks)
        else {
            info.text.updated =  `const ${variables} = globalThis.REMOTEESM_BUNDLE["${bundle.parent}"]["${bundle.name}"];
            ${info.text.updated}`;
        }

        return imported
}

// ------------- Get All Import Information -------------
export const getInfo = async (uri, opts, pathInfo = {
    original: uri,
    transformed: uri
}) => {

    // Copy Options
    const optsCopy = {...opts}
    if (!optsCopy.callbacks) optsCopy.callbacks = {}
    const onFile = optsCopy.callbacks.onfile

    // Compile File
    return await new Promise(async (resolve, reject) => {

        optsCopy.callbacks.onfile = (path, bundle) => {
            if (onFile instanceof Function) onFile(path, bundle);
            if (bundle.info.original === uri) resolve(bundle); // pass all info
        }

        await compile(uri, optsCopy).catch((e) => {
            if (e.message.includes('Circular dependency detected')) reject(e)
            else {
                const noBase = pathUtils.absolute(pathInfo.original) ? pathUtils.noBase(pathInfo.original, opts, true) : pathUtils.noBase(pathInfo.transformed, opts, true)
                console.warn(`Failed to fetch ${uri}. Checking filesystem references...`);
                const filesystemFallback = opts.filesystem?._fallbacks?.[noBase];
                if (filesystemFallback) {
                    console.warn(`Got fallback reference (module only) for ${uri}.`);
                    const info = { result: filesystemFallback }
                    Object.defineProperty(info, 'fallback', { value: true, enumerable: false })
                    resolve({ result: filesystemFallback });
                } else {
                    const middle = "was not resolved locally. You can provide a direct reference to use in";
                    if (e.message.includes(middle)) reject(e);
                    else reject(errors.create(uri, noBase));
                }
            }
        })
    })
}

function getBundle(options, key) {
    let id = options.bundle
    if (!id) id = Math.random()
    
    let bundle = globalThis.REMOTEESM_BUNDLES[id]
    if (!bundle) bundle = globalThis.REMOTEESM_BUNDLES[id] = {}

    if (key) {
        bundle = bundle?.[key]
        if (!bundle) bundle =  new Bundle(undefined, options, {parent: id, name: key})
    }

    return {
        id,
        bundle
    }
}


function getPathID(path, opts) {
    return pathUtils.get(pathUtils.noBase(path,opts))
}

// Declare internal helper function for bundle management
const resetBundle = (pathId, opts, update, old) => {
    if (old) old.delete()
    const bundle = getBundle(opts, pathId).bundle
    bundle.update(update) // set original uri
    return bundle
}

// ------------- Safely Import Module -------------
export const compile = async (uri, opts = {}) => {

    opts = Object.assign({}, opts) // copy options

    const { output = {} } = opts;

    // Progress Monitoring Utilities
    let dependenciesResolved = 0
    let numDependencies = 0
    const fileCallback = opts.callbacks?.progress?.file
    const onFileCallback = opts.callbacks?.onfile
    const runOnFileCallback = typeof onFileCallback === 'function'
    const runFileCallback = typeof fileCallback === 'function'

    let pathId = getPathID(uri, opts)

    try {

        // Set Bundle ID
        if (!opts.bundle) {
            const bundleInfo = getBundle(opts)
            opts.bundle = bundleInfo.id // use same 
        }

        // Set Bundler
        if (!opts.bundler) opts.bundler = 'objecturl' // default bundler

        // Initialize
        await polyfills.ready // Make sure fetch is ready


        const directImport = !output.text && !output.datauri && !output.objecturl

        // Try to Import Natively
        const info = (directImport) ? await response.findModule(uri, opts).catch((e) => {}) : undefined

        if (info?.uri) pathId = getPathID(info.uri, opts) // Set Path ID
        let bundle = resetBundle(pathId, opts, {original: uri})

        // Check Success of Native Import
        if (info?.result) bundle.update({result: info?.result}) // 
        else {

            // ------------------- Get URI Response -------------------
            const info = await response.findText(uri, opts)
            pathId = getPathID(info.uri, opts) // Update Path ID
            bundle = resetBundle(pathId, opts, {original: uri}, bundle) // reset the bundle

            // ------------------- Try Direct Import -------------------
            try {
                let bundleInfo = await response.parse(info)
                bundle.update(bundleInfo, opts)
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
                    await bundleImports(info, thisImport, opts) // can't stop all the requests in midflight...
                    dependenciesResolved++
                    if (runFileCallback) fileCallback(pathId, dependenciesResolved, numDependencies) 
                })

                await Promise.all(promises)

                // ------------------- Import Updated File Text -------------------
                let bundleInfo = await response.parse(info, "text")
                bundle.update(bundleInfo, opts)
            }
        }


        // ------------------- Tell the User the File is Done -------------------
        if (runFileCallback) fileCallback(pathId, dependenciesResolved, numDependencies, bundle) 
        if (runOnFileCallback) onFileCallback(pathId, bundle);

        // ------------------- Return Standard Import Value -------------------
        return bundle.result;
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