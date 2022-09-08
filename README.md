# remote-esm
 Import ESM from a remote endpoint

 In addition to standard ESM import features, this library allows for you to **import ESM text files** from any endpoint. For instance, you can load https://raw.githubusercontent.com/garrettmflynn/phaser/main/src/index.js!
 
 This project is used by [es-monitor](https://github.com/garrettmflynn/es-monitor) to visualize the ESM code of an application.
 

 ## Additional Features
 Include a `dependencies` key in the `options` object to extract a list of dependencies for each file.

 Include a `references` key in the `options` object to extract a list of module references.