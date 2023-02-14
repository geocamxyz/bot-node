module.exports = function (RED) {
  function pidscooper(config) {
    RED.nodes.createNode(this, config);

    const node = this;
    const globals = node.context().global;

    node.on("input", function (msg) {
      const status = msg.status;
      if (status) {
        if (status.source.type == "exec") {
          const id = status.source.id;
          const str = status.text;
          let pid = null;
          if (str && str.startsWith("pid:")) {
            pid = str.split(":")[1];
          }
          const pids = globals.get("PIDs") || {};
          pid ? (pids[id] = pid) : delete pids[id];
          globals.set("PIDs", pids);
          console.log('Set pids to', pids);
        }
      }
    });
  }

  RED.nodes.registerType("botpidscooper", pidscooper);
};
