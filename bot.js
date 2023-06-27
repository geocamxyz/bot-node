module.exports = function (RED) {
  const os = require("os");
  const ZB = require("zeebe-node");
  const exec = require("child_process").exec;
  const common = require("./common");
  const isWindows = common.isWindows;

  const requestTimeout = 5000;

  const getV4Ips = function () {
    const nets = os.networkInterfaces();
    const results = Object.create(null); // Or just '{}', an empty object

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
        const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
        if (net.family === familyV4Value && !net.internal) {
          if (!results[name]) {
            results[name] = [];
          }
          results[name].push(net.address);
        }
      }
    }
    return results;
  };

  const ipAddresses = getV4Ips();

  function bot(config) {
    RED.nodes.createNode(this, config);

    const botConfig = RED.nodes.getNode(config.botconfig);

    const node = this;
    const globals = node.context().global;
    const task = config.name;
    const hostname = os.hostname();

    const active = {};
    let reserverNode = false;

    const jobsFinished = function (completeNode) {
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          let available = globals.get("availableCompute");
          if (available === undefined) {
            available = 1;
          }
          if (available >= 1) {
            clearInterval(interval);
            resolve();
          } else {
            completeNode.status({
              fill: "grey",
              shape: "ring",
              text: `${getTime()} waiting for jobs to finish (compute ${available} < 1)`,
            });
          }
        }, 1000 * 10);
      });
    };

    const getTime = function () {
      const time = new Date().toLocaleString().split(" ")[1];
      const parts = time.split(":");
      parts.pop();
      return parts.join(":");
    };

    const oneDP = function (n) {
      return Math.round(n * 10) / 10;
    };

    const runTime = function (since) {
      const now = new Date();
      const diff = now.getTime() - since.getTime();
      const hours = Math.floor(diff / 3600000);
      if (hours > 0) return `${oneDP(diff / 3600000)}h`;
      const minutes = Math.floor(diff / 60000);
      if (minutes > 0) return `${minutes}m`;
      const seconds = ((diff % 60000) / 1000).toFixed(0);
      return `${seconds}s`;
    };

    const reserve = function (job) {
      const user = job.variables.username || "Unknown";
      globals.set("reserved", user);
      reserverNode = true;
      node.status({
        fill: "blue",
        shape: "dot",
        text: `${getTime()} reserved by ${user}`,
      });
      const pidObj = globals.get("PIDs") || {};
      const pids = Object.values(pidObj);
      const cmd = isWindows ? "taskkill /F ?PID " : "kill ";
      pids.forEach((pid) => {
        exec(cmd + pid, function (error, stdout, stderr) {
          if (error) {
            console.log(error);
          }
        });
      });
    };

    const poll = async function (capability, force_one_job = false) {
      const reserved = globals.get("reserved");
      if (reserved && task != "bot:release") {
        if (!reserverNode) node.status({});
        return;
      }
      if (!reserved && task == "bot:release") {
        // don't poll for release task if not reserved
        return;
      }
      if (task=="bot:release"){
        task = `bot:release-${hostname}`
      }

      let urgentReserveTimeout;

      if (task == "bot:reserve-urgent") {
        urgentReserveTimeout = setTimeout(() => {
          poll(capability, true);
        }, 1000 * 100); //attempt a forced reserve in just under 2 minutes at which point other machines should have cleared it if available
      }

      const running = Object.keys(active).length;
      const limit = parseInt(capability.limit);
      const compute = parseFloat(capability.compute);
      const slots = limit - running;

      const setBusyStatus = function (resetIfNone = true) {
        if (!reserverNode) {
          const instances = Object.values(active).map(
            (v) => `${v.processInstanceKey} ${runTime(v.since)}`
          );
          if (instances.length > 0) {
            node.status({
              fill: "grey",
              shape: "dot",
              text: `${getTime()} ${instances.length} running: ${instances.join(
                ", "
              )}`,
            });
          } else if (resetIfNone) {
            node.status({});
          }
        }
      };

      let available = globals.get("availableCompute");
      if (available === undefined) {
        available = 1;
      }
      const numJobs = force_one_job
        ? 1
        : Math.min(Math.floor(available / compute), slots);
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
            text: `${getTime()} Poll: ${numJobs}`,
          });
        }
        if (task == "bot:reserve-urgent") {
          clearTimeout(urgentReserveTimeout);
        }
        jobs = await botConfig.activateJobs(req);
        jobs.forEach((job) => {
          job.since = new Date();
          active[job.key] = job;
          zbc
            .setVariables({
              elementInstanceKey: job.elementInstanceKey,
              variables: { bot: hostname, botIPs: ipAddresses },
              local: false,
            })
            .catch((err) => {
              node.warn(`error updating bot variable ${JSON.stringify(err)}`);
              console.log("error updating bot variable", err);
            });
          node.warn(`set Ipaddresses to ${JSON.stringify(ipAddresses)}`);
          globals.set("availableCompute", oneDP(available - compute));
          if (task.startsWith("bot:reserve")) {
            reserve(job);
          }
          const done = async function (
            errorMessage = null,
            variables,
            completeNode
          ) {
            delete active[job.key];
            setBusyStatus();
            globals.set(
              "availableCompute",
              oneDP(globals.get("availableCompute") + compute)
            );
            if (task.startsWith( "bot:release")) {
              globals.set("reserved", null);
            }
            if (task == "bot:reserve-urgent" && force_one_job) {
              await jobsFinished(completeNode);
            }
            if ((!errorMessage) && (task != "bot:reserve")) variables.bot = null;
            delete variables.botIPs; // stop variables from previous instance overwriting Ipds from this bot
            // if job has been terminated calls below will error so we call them last
            /*
            await zbc.setVariables({
              elementInstanceKey: job.elementInstanceKey,
              variables: { bot: null },
              local: false,
            });
            */
            await (errorMessage
              ? zbc.failJob({
                  jobKey: job.key,
                  errorMessage: errorMessage,
                  retries: job.retries - 1,
                })
              : zbc.completeJob({ jobKey: job.key, variables: variables }));
          };
          msg = { payload: { job: job, done: done } };
          msg.zeebePayload = msg.payload;
          node.send(msg);
        });
        setBusyStatus(false);
      } else {
        if (running < 1) {
          node.status({
            fill: "grey",
            shape: "ring",
            text: `${getTime()} busy: ${running}/${limit} ${compute}/${available}`,
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
