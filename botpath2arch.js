module.exports = function (RED) {
    const common = require("./common.js");
    const pathChar = common.pathChar;
    const nasPath = process.env.NAS_PATH;

  function path2arch(config) {
    RED.nodes.createNode(this, config);

    const node = this;

    node.on("input", function (msg) {
      const wasArray = Array.isArray(msg.payload)
      const paths = wasArray ? msg.payload : [msg.payload];
      const converted = paths.map((p) => {
        let path =  p.replaceAll('/',pathChar);
        if ((config.addNas) && (!path.startsWith(nasPath))) {
          if (nasPath.endsWith(pathChar) && path.startsWith(pathChar)) {
            path = nasPath + path.substring(1);        
          } else if  (!nasPath.endsWith(pathChar) && !path.startsWith(pathChar)) {
            path = nasPath + pathChar + path;
          } else {
            path = nasPath + path;
          }
        }
        return path;
      });
      msg.payload = wasArray ? converted : converted[0];
      node.send(msg);
    });
  }

  RED.nodes.registerType("botpath2arch", path2arch);
};
