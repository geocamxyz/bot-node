module.exports = function (RED) {
  function limit(config) {
    RED.nodes.createNode(this, config);

    const node = this;
    const limitTo = parseInt(config.limit);
    const globals = node.context().global;

    node.on("input", async function (msg) {
      if (!msg.parts) {
        node.error(
          "No msg.parts object found.  Did you use split prior to this node?",
          msg
        );
        return;
      }

      node.limit = function (msg) {
        const job = msg.parts.id;
        const ref = `limit_${job}`;
        msg.parts.limitNode = node;

        let send = false;
        const limit = globals.get(ref) || { running: 0, queued: [] };
        if (limit.running < limitTo) {
          limit.running += 1;
          send = true;
        } else {
          limit.queued.push(msg);
        }
        globals.set(ref, limit);
        if (send) {
          node.send(msg);
        }
      };

      node.limit(msg);
      return null;
    });
  }

  RED.nodes.registerType("limit", limit);
};
