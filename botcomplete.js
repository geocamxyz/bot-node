module.exports = function (RED) {
  function complete(config) {
    RED.nodes.createNode(this, config);

    const node = this;

    node.on("input", function (msg) {
      const payload = msg.payload && msg.payload.job ? msg.payload : msg.zeebePayload;
      node.warn( payload)
      if (payload && payload.done) {
        const  error  = (payload.job && payload.job.error) || null;
        const variables = payload.job && payload.job.variables;
        node.warn(`about to call done with error ${error}`);
        payload.done(error,variables,node).catch((err) => {
          node.warn(`got errror calling payload done ${err}`);
          node.status({
            fill: "red",
            shape: "ring",
            text: `zeebe err: ${err}`,
          });
        });
        node.warn('payload done called')
      }
      if (payload.job && payload.job.error) {
        node.status({
          fill: "red",
          shape: "dot",
          text: `${new Date().toLocaleString().split(' ')[1]} ${payload.job.processInstanceKey}${payload.job.error}`,
        });
      } else {
        node.status({
          fill: "blue",
          shape: "dot",
          text: `${new Date().toLocaleString().split(' ')[1]} ${payload.job.processInstanceKey}`,
        });
      }
    });
  }

  RED.nodes.registerType("botcomplete", complete);
};
