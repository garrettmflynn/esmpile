// source map regex
const sourceReg = /\/\/# sourceMappingURL=(.*\.map)/

export const get = async (uri, text, evaluate = true) => {
    if (!text) text = await get(uri) // get text
    if (text) {
        const srcMap = text.match(sourceReg)

        if (srcMap) {
            const getMap = async () => {
                const loc = pathUtils.get(srcMap[1], uri);
                let res = await get(loc) // get text

                // remove source map invalidation
                if (res.slice(0, 3) === ")]}") {
                    console.warn('Removing source map invalidation characters')
                    res = res.substring(res.indexOf('\n'));
                }

                // return source map
                const out = { module: JSON.parse(res) }
                out.text = out.file = res
                return out
            }

            return evaluate ? getMap() : getMap
        }
    }
}