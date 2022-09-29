export default class Bundle {

    value = undefined
    dependencies = new Set()
    dependents = new Set()
    
    constructor() {

    }

    compile = () => {

    }

    set = (value) => {
        this.value = value
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

}