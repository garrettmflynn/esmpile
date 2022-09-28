import * as pathUtils from "./utils/path.js";
import { getURL } from "./utils/request.js";
import * as polyfills from './utils/polyfills.js'
import * as nodeModules from './utils/nodeModules.js'
import * as sourceMap from './utils/sourceMap.js'
import * as load from './utils/load.js'
import * as errors from './utils/errors.js'
import * as response from './utils/response.js'


globalThis.REMOTEESM_BUNDLES = {} // Share references between loaded dataurl instances
const bundleInfo = {} // All information saved

// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /[^\n]*(?<![\/\/])import\s+([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/gm;

export const resolve = pathUtils.get

const setBundle = (info, opts, bundles) => {
    const options = [info.datauri, info.objecturl]
    bundles[info.uri] = (opts.bundle === 'datauri') ? options[0] ?? options[1] : options[1] ?? options[0]
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

        
        // Check If Already Exists
        let ref = bundles[bundleKey];

        if (ref === null) {
            console.warn(`Circular dependency detected: ${info.uri} -> ${dependentFilePath}.`)
            // const res = await import(globalThis.REMOTEESM_BUNDLE[bundleInfo.bundle][bundleKey])
        } 
        
        if (!ref) {
            bundles[bundleKey] = null
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


            if (imported.fallback) bundles[bundleKey] = imported.module;
            else {
                const innerInfo = await response.parse({
                    text: imported.text,
                    uri: bundleKey
                }, "text")

                setBundle(innerInfo, opts, bundles)
            }
        }


        // Update Original Input TextS
        console.log('Bundle', bundles[bundleKey])
        if (typeof bundles[bundleKey] === "string") {
            info.text = `import ${wildcard ? "* as " : ""}${variables} from "${bundles[bundleKey]}"; // Imported from ${bundleKey}
                  ${info.text}`;
        }

        // Passed by Reference (e.g. fallbacks)
        else {
            console.log('What Is This?')
            text =  `const ${variables} = globalThis.REMOTEESM_BUNDLE["${bundleInfo.bundle}"]["${bundleKey}"];
            ${text}`;
        }

        return imported

    } catch (e) {
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
            if (e.message.includes('Circular dependency detected')) reject(e)
            else {
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
            }
        })
    })
}

function getBundle(id) {
    console.log(globalThis.REMOTEESM_BUNDLES[id])
    if (!id) id = Math.random()
    if (!globalThis.REMOTEESM_BUNDLES[id]) globalThis.REMOTEESM_BUNDLES[id] = {}
    return {
        id,
        bundle: globalThis.REMOTEESM_BUNDLES[id]
    }
}

// ------------- Safely Import Module -------------
export const safe = async (uri, opts = {}) => {
    const {
        onImport = () => { },
        output = {},
        forceImportFromText,
    } = opts;
    

    const bundleInfo = getBundle(opts.bundle)
    opts.bundle = bundleInfo.id
    const bundles = bundleInfo.bundle

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
            setBundle(finalInfo, opts, bundles)
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

            // ------------------- Import Files Asynchronously -------------------
            const promises = importInfo.map(async (thisImport) => {
                await internal(info, thisImport, opts) // can't stop all the requests in midflight...
            })

            await Promise.all(promises)

            // ------------------- Import Updated File Text -------------------
            finalInfo = await response.parse(info, "text")
            setBundle(finalInfo, opts, bundles)
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