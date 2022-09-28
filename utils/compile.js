const tsconfig = {
    compilerOptions: {
        "target": "ES2015",
        "module": "ES2020",
        "strict": false,
        "esModuleInterop": true
    }
}

export const typescript = (response, type = "text") => {
    if (window.ts) {
        const tsCode = (type !== 'buffer') ? response[type] : new TextDecoder().decode(response[type]);
        response.text = window.ts.transpile(tsCode, tsconfig.compilerOptions);
        if (type === 'buffer') response.buffer = new TextEncoder().encode(response.text); // encode to buffer
        return response[type]
    } else throw new Error('Must load TypeScript extension to compile TypeScript files')

}