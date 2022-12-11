module.exports = function (RED) {
  function conductorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.status({ fill: "yellow", shape: "ring", text: "connecting" });

    const sleep = function (ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    };

    const os = require("os");
    const bot = os.hostname();
    const ZB = require("zeebe-node");

    const capabilitiesUrl = `http://vpn.localhost:3091/api/v1/bots/capabilities?host=${bot}`;
    const zeebeHost = "zeebe.geocam.xyz:26500";

    const zbc = new ZB.ZBClient(zeebeHost, {
      initialConnectionTolerance: 5000,
      onReady: () => {
        node.status({ fill: "green", shape: "dot", text: "zeebe connected" });
      },
      onConnectionError: (err) => {
        node.status({
          fill: "red",
          shape: "dot",
          text: "zeebe connection error",
        });
      },
    });
    zbc
      .topology()
      .then((topology) => console.log(JSON.stringify(topology, null, 2)));

    const globalContext = this.context().global;
    globalContext.set("availableCompute", 1);

    const delay = 5;
    const requestTimeout = 5000;
    let timeout;

    import("node-fetch").then(({ default: fetch }) => {
      const mainLoop = async function () {
        const capabilities = await fetch(capabilitiesUrl);
        const json = await capabilities.json();
        const all = json.all;
        const tasks = all.map(([action, timout]) => action);

        const mine = json.self;
        for (var i = 0; i < mine.length; i++) {
          const [action, compute] = mine[i];
          const numJobs = Math.floor(
            globalContext.get("availableCompute") / compute
          );
          if (numJobs > 0) {
            const position = tasks.indexOf(action);
            const baseTask = all[position];
            const options = {
              maxActiveJobs: numJobs,
              timeout: baseTask[1],
              requestTimeout: requestTimeout,
              worker: bot,
              taskHandler: (job, worker) => {
                console.log("got a job", job);
                globalContext.set(
                  "availableCompute",
                  globalContext.get("availableCompute") - compute
                );
                const done = {cancelWorflow, complete, fail, error, forward, forwarded } = job;
                done.success = function(...args) {
                  job.complete(...args)
                }
                 done.failure = function(...args) {
                  job.fail(...args)
                }
                const msg = { payload: { job, complete: done } };
                const outputs = new Array(tasks.length);
                outputs[position] = msg;
                node.send(outputs);
              },
              taskType: action,
            };
            const zbWorker = zbc.createWorker(options);
            await sleep(requestTimeout); // delay for the same length as the request timeout so availableCompute stays in sync
          }
        }
        setTimeout(mainLoop, delay * 1000);
      };

      mainLoop();
    });

    node.on("close", function () {
      clearTimeout(timeout);
    });
  }
  RED.nodes.registerType("conductor-node", conductorNode);
};
