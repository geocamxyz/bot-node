module.exports = function (RED) {
  const ZB = require("zeebe-node");

  function botconfig(config) {
    RED.nodes.createNode(this, config);

    const node = this;

    const options = {
      /*
            useTls: Boolean(config.useTls),
            oAuth: {
                url: config.oAuthUrl,
                audience: config.zeebe.split(':')[0],
                clientId: config.clientId,
                clientSecret: config.clientSecret,
                cacheOnDisk: true,
            },
            */
      onReady: () => {
        node.log(`Connected to ${config.zeebe}`);
        node.emit("ready");
      },
      onConnectionError: () => {
        node.log("Connection Error");
        node.emit("connectionError");
      },
    };

    const zeebe = process.env.ZEEBE || "zeebe:26500";

    node.zbc = new ZB.ZBClient(zeebe, options);
    const projectmanager =
      process.env.PROJECTMANAGER || "https://projectmanager";
    node.pm = `${projectmanager}/api/v1/bots/capabilities`;
    node.telegram = {
      token: config.telegramToken,
      chatId: config.telegramChatId,
    };

    node.activateJobs = function (request) {
      return new Promise(async (resolve, reject) => {
        try {
          const stream = await node.zbc.grpc.activateJobsStream(request);
          if (stream) {
            stream.on("data", (result) => {
              const jobs = result.jobs.map((job) =>
                Object.assign({}, job, {
                  customHeaders: JSON.parse(job.customHeaders),
                  variables: JSON.parse(job.variables),
                })
              );
              resolve(jobs);
            });
            stream.on("close", () => {
              resolve([]);
            });
          } else {
            // did not get a stream - is this due to timeout or something we don't need to worry about????
          }
        } catch (err) {
          reject(err);
        }
      });
    };

    node.on("close", function (done) {
      return node.zbc.close().then(() => {
        node.log("All workers closed");
        done();
      });
    });
  }

  RED.nodes.registerType("botconfig", botconfig);
};
