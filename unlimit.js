module.exports = function (RED) {
  function unlimit(config) {
    RED.nodes.createNode(this, config);

    const node = this;
    const globals = node.context().global;

    node.on("input", async function (msg) {
      const job = msg.parts.id;
      const ref = `limit_${job}`;

      const limit = globals.get(ref);
      limit.running -= 1;
         let next = null;
      if (limit.queued.length > 0) {
        next = limit.queued.pop();
      }
      globals.set(ref, limit);
      if (next) {
        msg.parts.limitNode.limit(next);
      }
      node.send(msg);
    });
  }

  RED.nodes.registerType("unlimit", unlimit);
};
