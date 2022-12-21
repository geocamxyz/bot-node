module.exports = function (RED) {
  function complete(config) {
    RED.nodes.createNode(this, config);

    const node = this;

    node.on("input", function (msg) {
      if (msg.payload && msg.payload.done)
        msg.payload.done(msg.payload.job.error);
      if (msg.payload.job.error) {
        node.status({
          fill: "red",
          shape: "dot",
          text: `${msg.payload.job.error}`,
        });
      } else {
        node.status({
          fill: "green",
          shape: "dot",
          text: `${new Date().toLocaleString()}`,
        });
      }
    });
  }

  RED.nodes.registerType("botcomplete", complete);
};
