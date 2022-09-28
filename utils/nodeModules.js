import * as pathUtils from './path.js'

export const defaults = {
    nodeModules: "node_modules",
    rootRelativeTo: "./"
};

export const path = (opts) => {
    const nodeModules = opts.nodeModules ?? defaults.nodeModules;
    const rootRelativeTo = opts.rootRelativeTo ?? defaults.rootRelativeTo;
    return pathUtils.get(nodeModules, rootRelativeTo)
}

export const resolve = async (uri, opts) => {
    const absoluteNodeModules = path(opts)

    const split = uri.split('/')
    let base = pathUtils.get(uri, absoluteNodeModules);


    if (split.length > 1) {
        const hasExt = pathUtils.extension(base)
        if (hasExt) return base // not a base node-module
        else base += '/package.json' // otherwise might have an associated package.json
    }


    return await getMainPath(uri, base).catch(e => {
        console.warn(`${base} does not exist or is not at the root of the project.`);
    })
};

const getPath = (str, path, base) => pathUtils.get(str, base, false, path.split("/").length === 1);

const getPackagePath = (path, base = path) => getPath("package.json", path, base)

export const getMainPath = async (path, base = path) => {
    const pkg = await getPackage(path, base).catch(e => {
        throw e
    })
    if (!pkg) return base
    const destination = pkg.module || pkg.main || "index.js";
    return getPath(destination, path, base);
}

const getPackage = async (path, base = path) => {
    const pkgPath = getPackagePath(path, base)
    const isURL = pathUtils.url(pkgPath)
    const correct = isURL ? pkgPath : new URL(pkgPath, window.location.href).href
    return (await import(correct, { assert: { type: "json" } })).default;
}

// Export the Related Transformation
export const transformation = {
    name: 'node_modules',
    handler: resolve
}
