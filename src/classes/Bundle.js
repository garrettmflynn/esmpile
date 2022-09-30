import * as pathUtils from '../utils/path.js'

globalThis.REMOTEESM_BUNDLES = {global: {}} // Share references between loaded dataurl instances
const global = globalThis.REMOTEESM_BUNDLES.global

export default class Bundle {

    filename = 'bundle.esmpile.js'
    dependencies = new Set()
    dependents = new Set()
    options = {}
    info = {}

    link = undefined
    result = undefined
    text = {updated: undefined, original: undefined}

    constructor(info={}, options={}, identifiers) {

        this.set(info, options)

        this.parent = identifiers.parent
        this.name = identifiers.name

        let filename = this.name.split('/').pop()
        const components = filename.split('.')
        this.filename = [...components.slice(0,-1), 'esmpile', 'js'].join('.')

        let parent = globalThis.REMOTEESM_BUNDLES[this.parent]
        if (!parent) parent = globalThis.REMOTEESM_BUNDLES[this.parent] = {}

        if (!parent[this.name]) parent[this.name] = this
        else console.warn('Trying to duplicate bundle...', this.name)


        // Register In Global
        if (!global[this.name]) global[this.name] = parent[this.name]
        else if (this.options.bundle != 'global' && this.options.debug) console.warn('Duplicating this import. Already tracking globally...', this.name)


        // this.filename = filename
    }

    compile = () => {

    }

    set = (info) => {
        this.info = info
        this.update(this.info, this.options)
    }

    update = (info={}, opts={}) => {
        Object.assign(this.info, info)
        if (opts) this.options = opts
        const options = [info.datauri, info.objecturl]

        this.text = this.info.text
        this.result = this.info.result
        this.link = this.info.fallback ?? (this.options.bundler === 'objecturl') ? options[1] ?? options[0] : options[0] ?? options[1]
    }

    delete = () => {
        if (this.objecturl) window.URL.revokeObjectURL(this.objecturl);

        // Remove from Registries
        let parent = globalThis.REMOTEESM_BUNDLES[this.parent]
        if (global[this.name] === parent[this.name]) delete global[this.name]
        delete parent[this.name]
    }

    // ------------------- Dependency Management ------------------- //
    addDependency = (o) => {
        this.dependencies.add(o)
        o.dependents.add(this)
    }

    removeDependency = (o) => {
        this.dependencies.delete(o)
        o.dependents.delete(this)
    }


    // ------------------- Download Bundle ------------------- //
    download = () => {
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";
        a.href = this.link;

        a.download = this.filename;
        a.click();
    }
}