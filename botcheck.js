module.exports = function (RED) {
  const os = require("os");

  function check(config) {
    RED.nodes.createNode(this, config);

    const node = this;
    const globals = node.context().global;

    node.on("input", function (msg) {
      if (!msg.payload || msg.payload.length < 1) {
        msg = {
          payload: {
            error: `No capabilities found for ${os.hostname()}`,
          },
        };
        node.status({ fill: "red", shape: "dot", text: msg.payload.error });
        node.send(msg);
      } else {

      setTimeout(() => {
        const remaining = globals.get("capabilities");
        globals.set("capabilities",null);
        if (remaining && remaining.length > 0) {
          node.status({
            fill: "red",
            shape: "dot",
            text: `Not handled: ${remaining[0]}`,
          });
          msg = { payload: { error: "Missing handlers", tasks: remaining } };
          node.send(msg);
        } else if (remaining && remaining.length == 0) {
          node.status({
            fill: "green",
            shape: "dot",
            text: `All capabilities handled`,
          });
        }
      }, 5000);
      }
    });
  }

  RED.nodes.registerType("botcheck", check);
};
