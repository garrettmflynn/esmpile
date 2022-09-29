import * as encode from './encode/index.js'

// Bundle Text
// NOTE: unused for now
export default function bundle(input, opts) {
    const bundler = opts.bundler ?? 'objecturl'
    if (bundler === 'objecturl') return encode.objecturl.get(input) // runtime bundle
    else return encode.datauri.get(input) // saveable bundle
}
