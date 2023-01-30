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
    const hostname = os.hostname();
    const active = {};

    const getTime = function() {
      const time =    new Date().toLocaleString().split(" ")[1]
      const parts = time.split(':');
      parts.pop();
      return parts.join(':');
    }

    const oneDP = function(n) {
      return Math.round(n * 10) / 10;
    }

    const runTime = function(since) {
      const now = new Date();
      const diff = now.getTime() - since.getTime();
      const hours = Math.floor(diff / 3600000);
      if (hours > 0) return `${oneDP(diff / 3600000)}h`;
      const minutes = Math.floor(diff / 60000);
      if (minutes > 0) return `${minutes}m`;
      const seconds = ((diff % 60000) / 1000).toFixed(0);
      return `${seconds}s`;
    }

    const poll = async function (capability) {
      const running = Object.keys(active).length;
      const limit = parseInt(capability.limit);
      const compute = parseFloat(capability.compute);
      const slots = limit - running;

      const setBusyStatus = function (resetIfNone = true) {
        const instances = Object.values(active).map(
            (v) => `${v.processInstanceKey} ${runTime(v.since)}`
          );
        if (instances.length > 0) {
          node.status({
            fill: "grey",
            shape: "dot",
            text: `${getTime()} ${instances.length} running: ${instances.join(", ")}`,
          });
        } else if (resetIfNone) {
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
          timeout: parseInt(capability.timeout),
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
        jobs = await botConfig.activateJobs(req);
        jobs.forEach((job) => {
          job.since = new Date();
          active[job.key] = job;
          zbc.setVariables({ elementInstanceKey: job.elementInstanceKey, variables: {bot: hostname} , local: false}).catch((err) => console.log('error updating bot variable',err));
          globals.set("availableCompute",oneDP(available - compute));
          const done = async function (errorMessage = null, variables) {
            await zbc.setVariables({ elementInstanceKey: job.elementInstanceKey, variables: {bot: null} , local: false});
            delete active[job.key];
            setBusyStatus();
            globals.set(
              "availableCompute",
             oneDP( globals.get("availableCompute") + compute)
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
        setBusyStatus(false);
      } else {
        if (running < 1) {
          node.status({
            fill: "grey",
            shape: "ring",
            text: `${
             getTime()
            } busy: ${running}/${limit} ${compute}/${available}`,
          });
        } else {
           setBusyStatus();
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
