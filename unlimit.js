module.exports = function (RED) {
  function unlimit(config) {
    RED.nodes.createNode(this, config);

    const node = this;
    const globals = node.context().global;

    node.on("input", async function (msg) {
      if (!msg.limit){
        node.error(
          "No msg.limit object found.  Did you use limit prior to this node?",
          msg
        );
      }
      
      const ref = msg.limit.queue;

      const limit = globals.get(ref);
      limit.running -= 1;
         let next = null;
      if (limit.queued.length > 0) {
        next = limit.queued.pop();
      }
      globals.set(ref, limit);
      if (next) {
        msg.limit.limitNode.limit(next);
      } else {
        msg.limit.limitNode.clear();
      }
      if (msg.limit.limit) {
        msg.limit = msg.limit.limit;
      } else {
        delete msg.limit;
      }
      node.send(msg);
    });
  }

  RED.nodes.registerType("unlimit", unlimit);
};
