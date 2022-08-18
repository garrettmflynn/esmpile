# remote-esm
 Import ESM from a remote endpoint


## Limitations
On remote files, you **cannot** share references across files or modify them during runtime. For example, if you export `myvariable` from `index.js` to two files and change its value during runtime, the value of `myvariable` will remain the same across both files. And if you change the value of `myvariable` in file #1, it will remain the same in file #2.