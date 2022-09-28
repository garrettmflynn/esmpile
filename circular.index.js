import * as pathUtils from "./utils/path.js";
import { getURL } from "./utils/request.js";
import * as polyfills from './utils/polyfills.js'
import * as nodeModules from './utils/nodeModules.js'
import * as sourceMap from './utils/sourceMap.js'
import * as load from './utils/load.js'
import * as errors from './utils/errors.js'
import * as response from './utils/response.js'


globalThis.REMOTEESM_BUNDLES = {} // Share references between loaded dataurl instances

// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /[^\n]*(?<![\/\/])import\s+([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/gm;

export const resolve = pathUtils.get

const setBundle = (info, opts) => {
    const options = [info.datauri, info.objecturl]
    const bundle = getBundle(opts.bundle, info.uri).bundle
    console.log('setting bundle', info.uri, bundle)
    bundle.resolved = bundle.value = (opts.bundle === 'datauri') ? options[0] ?? options[1] : options[1] ?? options[0]
}

const getInternalInfo = async (info, importInfo, opts, collection={}, i=0) => {

    const bundleInfo = getBundle(opts.bundle) // must have a bundle
    const bundles = bundleInfo.bundle

    const { variables, wildcard } = importInfo;
    let path = importInfo.path
    const absolutePath = pathUtils.absolute(path)


    let imported;

    try {

        let correctPath = (absolutePath) ? path : pathUtils.get(path, info.uri);

        const absNode = nodeModules.path(opts)
        correctPath = correctPath.replace(`${absNode}/`, '')

        const dependentFilePath = pathUtils.get(correctPath);
        const dependentFileWithoutRoot = pathUtils.noBase(dependentFilePath, opts);

        const bundleKey = dependentFileWithoutRoot
        if (opts.dependencies) opts.dependencies[info.uri][bundleKey] = importInfo;

        
        // Create Bundle (check if exists)
        let thisBundle = getBundle(opts.bundle, bundleKey).bundle 
        let ref = thisBundle.value;

        console.log('Is a Ref', ref)
        if (ref === null) {
            console.warn(`Circular dependency detected: ${info.uri} -> ${dependentFilePath}.`)
            bundles[info.uri].circular.dependents.add(dependentFilePath)
            bundles[dependentFilePath].circular.dependencies.add(info.uri)

            let cache = null
            Object.defineProperty(thisBundle, 'value', {
                get: async () => {
                    
                    const result = globalThis.REMOTEESM_BUNDLES[bundleInfo.id][bundleKey].resolved

                    // Must turn to string before usage at runtime
                    console.log('Resolved bundle!', info.uri, cache)

                    if(result === 'string') {
                        if (!cache) cache = await import(result)
                        console.log('Got!', cache)
                    }

                    return cache
                }
            })
        } else if (!ref) {
            thisBundle.value = null
            const url = getURL(correctPath);
            const newURI = dependentFileWithoutRoot;

            // Import JavaScript and TypeScript Safely

            const newOptions = {
                output: {},
                ...opts,
                root: url,
                datauri: bundles
            }

            newOptions.output.text = true // always output text

            console.warn('i', newURI, i)
            if (i <= 3) imported = await getImports(newURI, newOptions, collection, i)
            console.log('Got', imported)
            // imported = await getInfo(newURI, newOptions, {
            //     original: path,
            //     transformed: correctPath
            // }).catch(e => {
            //     console.log(e)
            //     throw e
            // })
        }


        // Update Original Input TextS
        if (typeof thisBundle.value === "string") {
            info.text = `import ${wildcard ? "* as " : ""}${variables} from "${thisBundle.value}"; // Imported from ${bundleKey}
                  ${info.text}`;
        }

        // Passed by Reference (e.g. fallbacks)
        else {
            const variable = `ref${Math.floor(1000000*Math.random())}`
            info.text =  `const ${variable} = globalThis.REMOTEESM_BUNDLES["${bundleInfo.id}"]["${bundleKey}"]
            console.log(${variable})
            const ${variables} = await ${variable}.value;
            ${info.text}`;
        }

        return imported

    } catch (e) {
        console.log('Failing...', e)
        throw e
    }
}

const internal = async (info, importInfo, opts) => {

    const bundleInfo = getBundle(opts.bundle) // must have a bundle
    const bundles = bundleInfo.bundle

    const { variables, wildcard } = importInfo;
    let path = importInfo.path
    const absolutePath = pathUtils.absolute(path)


    let imported;

    try {

        let correctPath = (absolutePath) ? path : pathUtils.get(path, info.uri);

        const absNode = nodeModules.path(opts)
        correctPath = correctPath.replace(`${absNode}/`, '')

        const dependentFilePath = pathUtils.get(correctPath);
        const dependentFileWithoutRoot = pathUtils.noBase(dependentFilePath, opts);

        const bundleKey = dependentFileWithoutRoot
        if (opts.dependencies) opts.dependencies[info.uri][bundleKey] = importInfo;

        
        // Create Bundle (check if exists)
        let thisBundle = getBundle(opts.bundle, bundleKey).bundle 
        let ref = thisBundle.value;

        console.log('Is a Ref', ref)
        if (ref === null) {
            console.warn(`Circular dependency detected: ${info.uri} -> ${dependentFilePath}.`)
            bundles[info.uri].circular.dependents.add(dependentFilePath)
            bundles[dependentFilePath].circular.dependencies.add(info.uri)

            let cache = null
            Object.defineProperty(thisBundle, 'value', {
                get: async () => {
                    
                    const result = globalThis.REMOTEESM_BUNDLES[bundleInfo.id][bundleKey].resolved

                    // Must turn to string before usage at runtime
                    console.log('Resolved bundle!', info.uri, cache)

                    if(result === 'string') {
                        if (!cache) cache = await import(result)
                        console.log('Got!', cache)
                    }

                    return cache
                }
            })
        } else if (!ref) {
            thisBundle.value = null
            const url = getURL(correctPath);
            const newURI = dependentFileWithoutRoot;

            // Import JavaScript and TypeScript Safely

            const newOptions = {
                output: {},
                ...opts,
                root: url,
                datauri: bundles
            }

            newOptions.output.text = true // always output text

            imported = await getInfo(newURI, newOptions, {
                original: path,
                transformed: correctPath
            }).catch(e => {
                console.log(e)
                throw e
            })


            if (imported.fallback) thisBundle.resolved = thisBundle.value = imported.module;
            else {
                const innerInfo = await response.parse({
                    text: imported.text,
                    uri: bundleKey
                }, "text")

                setBundle(innerInfo, opts)
            }
        }


        // Update Original Input TextS
        if (typeof thisBundle.value === "string") {
            info.text = `import ${wildcard ? "* as " : ""}${variables} from "${thisBundle.value}"; // Imported from ${bundleKey}
                  ${info.text}`;
        }

        // Passed by Reference (e.g. fallbacks)
        else {
            const variable = `ref${Math.floor(1000000*Math.random())}`
            info.text =  `const ${variable} = globalThis.REMOTEESM_BUNDLES["${bundleInfo.id}"]["${bundleKey}"]
            console.log(${variable})
            const ${variables} = await ${variable}.value;
            ${info.text}`;
        }

        return imported

    } catch (e) {
        console.log('Failing...', e)
        throw e
    }
}



// ------------- Get All Import Information -------------
export const getInfo = async (uri, opts, pathInfo = {
    original: uri,
    transformed: uri
}) => {
    return await new Promise(async (resolve, reject) => {
        await safe(uri, {
            ...opts,
            onImport: (path, info) => {
                if (opts.onImport instanceof Function) opts.onImport(path, info);
                if (path == uri) resolve(info); // pass all info
            }
        }).catch((e) => {

                console.log('e', e)
                const noBase = pathUtils.absolute(pathInfo.original) ? pathUtils.noBase(pathInfo.original, opts) : pathUtils.noBase(pathInfo.transformed, opts)
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
        })
    })
}

function getBundle(id, path) {
    if (!id) id = Math.random()
    
    let bundle = globalThis.REMOTEESM_BUNDLES[id]
    if (!bundle) bundle = bundle = {}
    
    if (path)  {
        if (!bundle[path]) {
            bundle[path] = {
                uri: path,
                value: undefined,
                resolved: undefined,
                circular: {
                    dependencies: new Set(),
                    dependents: new Set()
                }
            }
        }
        bundle = bundle[path]
    }

    return {
        id,
        bundle
    }
}

// ------------- Safely Import Module -------------

export async function getImports(info, opts, collection, i=0) {
    i++
    if (typeof info === 'string') info = await response.safe(info, opts) // actually get from uri


    const createInfo = (info) => {return { info, dependents: {}, dependencies: {}}}

    if (!collection[info.uri]) collection[info.uri] = createInfo(info) // add to collection


    const importInfo = [];
    const matches = Array.from(info.text.matchAll(re))
    matches.forEach(m => {
        info.text = info.text.replace(m[0], ``); // Replace found text
        const wildcard = !!m[1].match(/\*\s+as/);
        const variables = m[1].replace(/\*\s+as/, "").trim();
        importInfo.push({
            path: m[3],
            variables,
            wildcard
        });
    })

    const promises = importInfo.map(async (thisImport) => {
        return await getInternalInfo(info, thisImport, opts, collection, i) // can't stop all the requests in midflight...
    })

    const imports = await Promise.all(promises)
   imports.forEach(o =>{
        if(o) {
            let toReturn = false
            if (!collection[o.info.uri]) {
                collection[o.info.uri] = createInfo(o.info)
                toReturn = true
            }
            if (collection[o.info.uri].dependents[info.uri]) console.log('Already have this! Why are we getting this more than once...')

            collection[o.info.uri].dependents[info.uri] = collection[info.uri]
            collection[info.uri].dependencies[o.info.uri] = collection[o.info.uri]

            const dependencyKeys = Object.keys(collection[info.uri].dependencies)

            Object.keys(collection[o.info.uri].dependents).forEach((key) =>{
                if (dependencyKeys.includes(key)) console.warn(`Circular dependency detected: ${key} <--> ${o.info.uri}.`)
            })
        } else {
            console.log('undefined', allImports, info)
        }
    })

    return {
        info,
        imports: newImports,
        collection
    }
}

export const safe = async (uri, opts = {}) => {
    const {
        onImport = () => { },
        output = {},
        forceImportFromText,
    } = opts;
    
    const firstCall = !opts._internal
    opts._internal = true // set an internal flag

    // set bundle information
    const bundleInfo = getBundle(opts.bundle)
    opts.bundle = bundleInfo.id

    await polyfills.ready // Make sure fetch is ready
    if (opts.dependencies) opts.dependencies[uri] = {}; // Register in tree

    let finalInfo = {};
    const pathExt = pathUtils.extension(uri)

    const isJSON = pathExt === "json";

    finalInfo.module = (!forceImportFromText) ?
        await (isJSON ? import(uri, { assert: { type: "json" } }) : import(uri))
            .catch(() => { }) // is available locally?
        : undefined;

    let originalText, info;
    if (!finalInfo.module || output.text || output.datauri) {

        // ------------------- Get URI Response -------------------
        info = await response.safe(uri, opts)
        originalText = info.text;

        // ------------------- Try Direct Import -------------------
        try {

            finalInfo = await response.parse(info)
            setBundle(finalInfo, opts)
        }

        // ------------------- Replace Nested Imports -------------------
        catch (e) {

            // ------------------- Get Import Details -------------------
            const importInfo = [];

            const matches = Array.from(info.text.matchAll(re))
            matches.forEach(m => {
                info.text = info.text.replace(m[0], ``); // Replace found text
                const wildcard = !!m[1].match(/\*\s+as/);
                const variables = m[1].replace(/\*\s+as/, "").trim();
                importInfo.push({
                    path: m[3],
                    variables,
                    wildcard
                });
            })

            console.warn('Got More Imports', uri, importInfo)

            const internalInfo = {}
            const promises = importInfo.map(async (thisImport) => {
                return await getInternalInfo(info, thisImport, opts, internalInfo) // can't stop all the requests in midflight...
            })

            await Promise.all(promises)
            console.log('internalInfo', internalInfo)

            if (firstCall) {
                console.log('Bundle', bundleInfo.bundle)
            }
            
            return internalInfo

            // // ------------------- Import Files Asynchronously -------------------
            // const promises = importInfo.map(async (thisImport) => {
            //     await internal(info, thisImport, opts) // can't stop all the requests in midflight...
            // })

            // await Promise.all(promises)

            // // ------------------- Import Updated File Text -------------------
            // console.log('First Call', firstCall)
            // finalInfo = await response.parse(info, "text")
            // setBundle(finalInfo, opts)
        }
    }


    // ------------------- Pass Additional Information to the User -------------------
    onImport(uri, {
        ...finalInfo,
        text: info?.text,
        file: originalText,
    });


    // ------------------- Return Standard Import Value -------------------
    return finalInfo.module;
};

export default safe

export {
    sourceMap,
    nodeModules,
    load
}