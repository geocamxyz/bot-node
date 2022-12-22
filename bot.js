module.exports = function (RED) {
  const os = require("os");
  const ZB = require("zeebe-node");
  const requestTimeout = 5000;

  function bot(config) {
    RED.nodes.createNode(this, config);

    const botConfig = RED.nodes.getNode(config.botconfig);
    
    const node = this;
    const globals = node.context().global;
    const task = config.name;
    const hostname = os.hostname;
    const active = {};

    const poll = async function (capability) {
      const running = Object.keys(active).length;
      const slots = capability.limit - running;
      const numJobs = Math.min(
        Math.floor(globals.get("availableCompute") / capability.compute),
        slots
      );
      const zbc = botConfig.zbc;
      req = {
        maxJobsToActivate: slots,
        requestTimeout: requestTimeout,
        timeout: capability.timeout,
        type: task,
        worker: hostname,
      };
      jobs = await zbc.activateJobs(req);
      jobs.forEach((job) => {
        active[job.key] = job;
        globals.set(
          "availableCompute",
          globals.get("availableCompute") - capability.compute
        );
        const done = async function (errorMessage = null) {
          delete active[job.key];
          globals.set(
            "availableCompute",
            globals.get("availableCompute") + capability.compute
          );
          await (errorMessage ? zbc.failJob({ jobKey: job.key, errorMessage: errorMessage, retries: job.retries - 1}) : zbc.completeJob({ jobKey: job.key, variables: job.variables }));
        };
        msg = { payload: { job: job, done: done } };
        node.send(msg);
      });
    };

    node.on("input", function (msg) {
      // find my name in array
      const capabilities = msg.payload;
      let stored = globals.get('capabilities');
      console.log('got stored capabilities',stored)
      if (!stored) {
        stored = capabilities.map(c => c.task_type);
        globals.set('capabilities',stored);
      }
      const idx = capabilities.findIndex((c) => c["task_type"] === task);
      if (idx >= 0) {
        stored.splice(stored.indexOf(task), 1);
        globals.set('capabilities', stored);
        console.log('set stored capabilities',stored)
        node.status({
          fill: "green",
          shape: "dot",
          text: `Polling for ${task} jobs`,
        });
        setTimeout(() => poll(capabilities[idx], idx * requestTimeout));
      } else {
        node.status({
          fill: "yellow",
          shape: "ring",
          text: `Not a ${hostname} task`,
        });
      }
    });
  }
  RED.nodes.registerType("bot", bot);
};
