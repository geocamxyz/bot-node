module.exports = function (RED) {
  const common = require("./common.js");
  const pathChar = common.pathChar;
  const nasPath = process.env.NAS_PATH;

  function arch2path(config) {
    RED.nodes.createNode(this, config);

    const node = this;

    node.on("input", function (msg) {
      const wasArray = Array.isArray(msg.payload);
      const paths = wasArray ? msg.payload : [msg.payload];
      const converted = paths.map((p) => {
        if (config.removeNas) {
          if (p.startsWith(nasPath)) {
            p = p.substring(nasPath.length);
          }
        }
        let path = p.replaceAll(pathChar, "/");
        return path;
      });
      msg.payload = wasArray ? converted : converted[0];
      node.send(msg);
    });
  }

  RED.nodes.registerType("botarch2path", arch2path);
};
