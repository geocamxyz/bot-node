module.exports = function (RED) {
  const os = require("os");
  const ZB = require("zeebe-node");
  const exec = require("child_process").exec;
  const common = require("./common");
  const isWindows = common.isWindows;

  const requestTimeout = -1; // time to wait for job request in ms or disable long polling if negative
  const uniqueTaskPollingInterval = 1000;

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
    let task = config.name;
    const hostname = os.hostname();

    const active = {};
    let reserverNode = false;

    const jobsFinished = function (completeNode) {
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          let available = getAvailableCompute();
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
      // parts.pop();
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
      const user =
        job.variables.username || job.variables.currentUser || "Unknown";
      globals.set("reserved", user);
      reserverNode = true;
      node.status({
        fill: "blue",
        shape: "dot",
        text: `${getTime()} ${job.processInstanceKey} reserved by ${user}`,
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
        return;
      }

      let urgentReserveTimeout;

      if (task == "bot:reserve-urgent") {
        urgentReserveTimeout = setTimeout(() => {
          poll(capability, true);
        }, 1000 * 100); //attempt a forced reserve in just under 2 minutes at which point other machines should have cleared it if available
      }

      const running = () => Object.keys(active).length;
      const limit = parseInt(capability.limit);
      const compute = parseFloat(capability.compute);
      const zbc = botConfig.zbc;

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

      const getAvailableCompute = function () {
        let c = globals.get("availableCompute");
        if (!c && c !== 0) c = 1;
        return c;
      };

      const activateJobs = async function (baseType, force_one = false) {
        let result = [];
        const taskTypes = [];
        let polled = false;
        for (let priority = 0; priority <= 10; priority++) {
          taskTypes.push(`${baseType}-${priority}-${hostname}`);
          taskTypes.push(`${baseType}-${priority}`);
        }
        taskTypes.push(`${baseType}-${hostname}`);
        taskTypes.push(`${baseType}`);
        while (taskTypes.length > 0) {
          let available = getAvailableCompute();
          const numJobs = force_one
            ? 1
            : Math.min(Math.floor(available / compute), limit - running());
          if (numJobs < 1) return polled ? result : false;
          node.status({
            fill: "green",
            shape: "dot",
            text: `${getTime()} Poll: ${numJobs}`,
          });
          req = {
            maxJobsToActivate: numJobs,
            requestTimeout: requestTimeout,
            timeout: parseInt(capability.timeout),
            type: taskTypes.shift(),
            worker: hostname,
          };
          polled = true;
          const jobs = await botConfig.activateJobs(req);
          jobs.forEach((job) => {
            active[job.key] = job;
            job.since = new Date();
            globals.set(
              "availableCompute",
              oneDP(getAvailableCompute() - compute)
            );
          });
          if (jobs.length > 0) {
            result = result.concat(jobs);
          }
        }
        return polled ? result : false;
      };

      if (task == "bot:reserve-urgent") {
        clearTimeout(urgentReserveTimeout);
      }
      console.log(`Checking for jobs of base type ${task}`);
      const jobs = await activateJobs(task, force_one_job);
      console.log(`Found ${jobs.length} jobs of base type ${task}`);
      if (jobs && jobs.length > 0) {
        setBusyStatus();
        jobs.forEach((job) => {
          const inputVariableValues = JSON.parse(JSON.stringify(job.variables));
          zbc
            .setVariables({
              elementInstanceKey: job.elementInstanceKey,
              variables: { botIPs: ipAddresses },
              local: false,
            })
            .catch((err) => {
              node.warn(
                `error updating bot variable at 1 ${JSON.stringify(err)}`
              );
              console.log("error updating bot variable", err);
            });
          zbc
            .setVariables({
              elementInstanceKey: job.elementInstanceKey,
              variables: { jobStartedAt: Date.now(), bot: hostname, processedBy: hostname },
              local: true,
            })
            .catch((err) => {
              node.warn(
                `error updating jobStartedAt variable at 2 ${JSON.stringify(
                  err
                )}`
              );
              console.log("error updating jobStartedAt variable", err);
            });
          if (task == "bot:reserve") {
            reserve(job);
          }
          const done = async function (
            errorMessage = null,
            variables,
            completeNode,
            retries
          ) {
            const storedJob = active[job.key];
            if (!storedJob) {
              return false; // we only want to call done once if the job has already been deleted then done must have been called.
            }
            delete active[job.key];
            setBusyStatus();
            globals.set(
              "availableCompute",
              oneDP(getAvailableCompute() + compute)
            );
            if (task == "bot:release") {
              globals.set("reserved", null);
            }
            if (task == "bot:reserve-urgent" && force_one_job) {
              await jobsFinished(completeNode);
            }
            delete inputVariableValues.botIPs; // stop variables from previous instance overwriting Ipds from this bot
            await zbc.setVariables({
              elementInstanceKey: job.elementInstanceKey,
              variables: { jobFinishedAt: Date.now(), bot: null },
              local: true,
            });
            // only update variables that have changed from incoming variables
            for (const [key, value] of Object.entries(inputVariableValues)) {
              if (variables[key] && JSON.stringify(variables[key]) ===  JSON.stringify(value)) {
                delete variables[key];
              }
            }
            node.warn(`calling complete with ${JSON.stringify(variables)}`);
            if (errorMessage) {
              // I can't seem to get variables to update on a fail job call despite it being a listed argument in proto
              // so lets do two steps
              /*  now commented out as this was here to set finished at but we're now doing that on complete as well to force local setting
              completeJob may be local or global depending on output mappings.
              await zbc.setVariables({
                elementInstanceKey: job.elementInstanceKey,
                variables: variables,
                local: true,
              });
              */
             retries = (retries || job.retries) - 1;
             if (retries < 0) retries = 0;
             const errMsg =  JSON.stringify(errorMessage);// errorMessage.replace(/\W/g,' '); 
              await zbc.failJob({
                jobKey: job.key,
                errorMessage: errMsg,
                retries: retries,
                variables: variables,
              });
            } else {
              await zbc.completeJob({ jobKey: job.key, variables: variables });
            }
            return true;
          };
          msg = { payload: { job: job, done: done } };
          msg.zeebePayload = msg.payload;
          node.send(msg);
        });
        setBusyStatus(false);
      } else {
        if (jobs === false) {
          if (running() > 0) {
            setBusyStatus();
          } else {
            node.status({
              fill: "grey",
              shape: "ring",
              text: `${getTime()} busy: ${running()}/${limit} ${compute}/${getAvailableCompute()}`,
            });
          }
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
          idx * uniqueTaskPollingInterval
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
