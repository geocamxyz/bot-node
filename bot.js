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

    const getTime = function() {
      const time =    new Date().toLocaleString().split(" ")[1]
      const parts = time.split(':');
      parts.pop();
      return parts.join(':');
    }

    const poll = async function (capability) {
      const running = Object.keys(active).length;
      const limit = parseInt(capability.limit);
      const compute = parseFloat(capability.compute);
      const slots = limit - running;

      const setBusyStatus = function () {
        const instances = Object.values(active).map(
            (v) => v.processInstanceKey
          );
        if (instances.length > 0) {
          node.status({
            fill: "grey",
            shape: "dot",
            text: `${getTime()} ${instances.length} running: ${instances.join(", ")}`,
          });
        } else {
          node.status({});
        }
      };

      let available = globals.get("availableCompute");
      if (available === undefined) {
        available = 1;
      }
      const numJobs = Math.min(Math.floor(available / compute), slots);
      if (numJobs > 0) {
        const zbc = botConfig.zbc;
        req = {
          maxJobsToActivate: numJobs,
          requestTimeout: requestTimeout,
          timeout: capability.timeout,
          type: task,
          worker: hostname,
        };
        if (running < 1) {
          node.status({
            fill: "green",
            shape: "dot",
            text: `${
              getTime()
            } Poll: ${numJobs}`,
          });
        }
        jobs = await zbc.activateJobs(req);
        jobs.forEach((job) => {
          active[job.key] = job;
          globals.set("availableCompute", available - compute);
          const done = async function (errorMessage = null, variables) {
            delete active[job.key];
            setBusyStatus();
            globals.set(
              "availableCompute",
              globals.get("availableCompute") + compute
            );
            await (errorMessage
              ? zbc.failJob({
                  jobKey: job.key,
                  errorMessage: errorMessage,
                  retries: job.retries - 1,
                })
              : zbc.completeJob({ jobKey: job.key, variables: variables }));
          };
          msg = { payload: { job: job, done: done } };
          node.send(msg);
        });
        setBusyStatus();
      } else {
        if (running < 1) {
          node.status({
            fill: "grey",
            shape: "ring",
            text: `${
             getTime()
            } busy: ${running}/${limit} ${compute}/${available}`,
          });
        }
      }
    };

    node.on("input", function (msg) {
      // find my name in array
      const capabilities = msg.payload;
      let stored = globals.get("capabilities");
      if (!stored) {
        stored = capabilities.map((c) => c.task_type);
        globals.set("capabilities", stored);
      }
      const idx = capabilities.findIndex((c) => c["task_type"] === task);
      if (idx >= 0) {
        stored.splice(stored.indexOf(task), 1);
        globals.set("capabilities", stored);
        /*
        node.status({
          fill: "green",
          shape: "dot",
          text: `Polling for ${task} jobs`,
        });
        */
        setTimeout(
          () =>
            poll(capabilities[idx]).catch((err) => {
              node.status({
                fill: "red",
                shape: "dot",
                text: `${getTime()} ${err}`,
              });
            }),
          idx * requestTimeout
        );
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
