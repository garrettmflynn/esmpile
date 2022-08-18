import * as pathUtils from "./utils/path.js";
import { handleFetch } from "./utils/request.js";

// Import ES6 Modules (and replace their imports with actual file imports!)
const re = /import([ \n\t]*(?:(?:\* (?:as .+))|(?:[^ \n\t\{\}]+[ \n\t]*,?)|(?:[ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\}))[ \n\t]*)from[ \n\t]*(['"])([^'"\n]+)(?:['"])([ \n\t]*assert[ \n\t]*{type:[ \n\t]*(['"])([^'"\n]+)(?:['"])})?/g 
const moduleDataURI = (text, mimeType='text/javascript') => `data:${mimeType};base64,` + btoa(text);

// Direct Import of ES6 Modules
export const importFromText = async (text) => {
    let imported = await import(moduleDataURI(text))
    if (imported.default && Object.keys(imported).length === 1) imported = imported.default
    return imported
}

export const resolve = pathUtils.get


const safeImport =  async (uri, root, onBlob, output) => {

    let module = await import(uri).catch(e => {})

    if (module && output !== 'text') return module
    else {

        let text = await fetch(uri).then(res => res.text())

    const isRemote = false
    try {
        new URL(uri)
        isRemote = true
    } catch {}


    try {
        module = await importFromText(text)
    }

    // Catch Nested Imports
    catch (e) {

        const base = pathUtils.get("", uri);
        let childBase = base;

        // Use a Regular Expression to Splice Out the Import Details
        const importInfo = {}
        let m;
        do {
            m = re.exec(text)
            if (m == null) m = re.exec(text); // be extra sure (weird bug)
            if (m) {
                text = text.replace(m[0], ``) // Replace found text
                const variables = m[1].replace(/\*\s+as/, '').trim().split(",");
                importInfo[m[3]] = variables // Save variables to path
            }
        } while (m);

        // Import Files
        for (let path in importInfo) {

            // Check If Already Exists
            let correctPath = pathUtils.get(path, childBase)
            const variables = importInfo[path];
           
      const dependentFilePath = pathUtils.get(correctPath)
      const dependentFileWithoutRoot = pathUtils.get(dependentFilePath.replace(root ?? '', ''))
      
      const extension = correctPath.split('.').slice(-1)[0]
    const mimeType = (extension === 'js') ? 'application/javascript' : `application/${extension}`
    const info = await handleFetch(correctPath);
    let blob = new Blob([info.buffer], { type: info.type });
      const isJS = extension.includes('js')
      const newURI = dependentFileWithoutRoot
      const newText = await blob.text()
      let importedText = (isJS) ? await safeImport(newURI, uri, onBlob, 'text') : newText

      const dataUri = moduleDataURI(importedText, mimeType);
        variables.forEach((str) => {

          text = `const ${str} =  await import('${dataUri}', ${isJS ? '{}' : '{assert: {type: "json"}}'});
${text}`;
        });
    }

        module = await importFromText(text)
    }

    if (output === 'text') return text
    else return module
}
}

export default safeImport