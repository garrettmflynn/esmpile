const fullSuffix = (fileName='') => (fileName).split('.').slice(1)

export const suffix = (fileName='') => {
    const suffix = fullSuffix(fileName) // Allow no name
    return suffix.join('.')
}

const regex = new RegExp('https?:', 'g')
export const get = (path, rel = '', keepRelativeImports=false) => {
    // if (!path.includes('./')) rel = '' // absolute

    const windowLocation = globalThis?.location?.origin

    let pathMatch = false
    let relMatch = false
    
    // Check if browser
    if (windowLocation) {

        relMatch = rel.includes(windowLocation)
        if (relMatch){
            rel = rel.replace(windowLocation, '');
            if (rel[0] === '/') rel = rel.slice(1)
        }

        pathMatch = path.includes(windowLocation)
        if (pathMatch){
            path = path.replace(windowLocation, '');
            if (path[0] === '/') path = path.slice(1)
        }
    }

    if (!keepRelativeImports) rel = rel.split('/').filter(v => v != '..').join('/') // Remove leading ..

    if (rel[rel.length - 1] === '/') rel = rel.slice(0, -1) // Remove trailing slashes

    let dirTokens = rel.split('/')
    if (dirTokens.length === 1 && dirTokens[0] === '') dirTokens = [] // Remove consequence of empty string rel

    const potentialFile = dirTokens.pop() // remove file name
    if (potentialFile) {
        const splitPath = potentialFile.split('.')
       if (splitPath.length == 1 || (splitPath.length > 1 && splitPath.includes(''))) dirTokens.push(potentialFile) // ASSUMPTION: All files have an extension
    }

    const splitPath = path.split("/")
    const pathTokens = splitPath.filter((str, i) => {
        if (splitPath[i-1] && regex.test(splitPath[i-1])) return true
        else return !!str
    }) // remove bookend slashes

    // force back if using urls
    // console.log('pathTokens', JSON.parse(JSON.stringify(pathTokens)))
    // if (matches) {
    //     dirTokens.forEach((_, i) => {
    //         if (pathTokens[i] != '..') pathTokens.unshift('..')
    //     })
    // }
    // console.log('pathTokens', JSON.parse(JSON.stringify(pathTokens)))

    const extensionTokens = pathTokens.filter((str, i) => {
        if (str === '..') {
            dirTokens.pop() // Pop off directories
            return false
        } else if (str === '.') return false
        else return true
    })

    // Concatenate with windowLocation if rel matched OR no rel and path matched...
    const newPath = ((relMatch || (!rel && pathMatch)) ? `${windowLocation}/` : ``) + [...dirTokens, ...extensionTokens].join('/')

    return newPath
}