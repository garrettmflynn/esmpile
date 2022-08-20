# remote-esm
 Import ESM from a remote endpoint

 In addition to standard ESM import features, this library allows for you to **import ESM text files** from any endpoint. For instance, you can load https://raw.githubusercontent.com/garrettmflynn/phaser/main/src/index.js!

## Limitations
Only variables declared initially OR objects are shared reliably across for shared **internal imports** (i.e.imports within files that are imported remotely). 