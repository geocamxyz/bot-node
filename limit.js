module.exports = function (RED) {
  function limit(config) {
    RED.nodes.createNode(this, config);

    const node = this;
    const limitTo = parseInt(config.limit);
    const queue = config.queue;
    const globals = node.context().global;

    node.on("input", async function (msg) {

      node.clear = function () {
        node.status({}); // don't seem to be able to call status directly from unlimit node so added a function for that
      }

      node.limit = function (msg) {
        let job = queue;
        if (queue.startsWith("msg.")) {
          const parts = queue.split(".");
          parts.shift();
          job = msg;
          parts.forEach((part) => {
            job = job[part];
          });
        }

        if (!job) {
          node.error(
            `No ${queue} object found.  Did you use split prior to this node?`,
            msg
          );
          return;
        }

        const ref = `limit_${job}`;

        let send = false;
        const limit = globals.get(ref) || { running: 0, queued: [] };
        if (limit.running < limitTo || limitTo < 1) {
          limit.running += 1;
          send = true;
          node.status({
            fill: "green",
            shape: "dot",
            text: `${limit.running}`,
          });
        } else {
          limit.queued.push(msg);
          node.status({
            fill: "red",
            shape: "dot",
            text: `${limit.running}`,
          });
        }
        globals.set(ref, limit);
        if (send) {
          if (msg.hasOwnProperty("limit")) {
            msg.limit = { limit: msg.limit };
          } // push existing parts to a stack
          else {
            msg.limit = {};
          }
          msg.limit.id = RED.util.generateId();
          msg.limit.limitNode = node;
          msg.limit.queue = ref;
          node.send(msg);
        }
      };

      node.limit(msg);
      return null;
    });
  }

  RED.nodes.registerType("limit", limit);
};
