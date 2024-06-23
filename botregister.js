module.exports = function (RED) {
  const os = require("os");
  const got = require("got");

  function register(config) {
    RED.nodes.createNode(this, config);

    const botConfig = RED.nodes.getNode(config.botconfig);

    const node = this;
    const baseUrl = botConfig.pm;
    const connectionAttemptsToRestartAfter = 60; // at 1 per 10 seconds this is 10 minutes
    let failureCount = 0;

    const extractUsefulIp = (networkInterfaces) => {
      const v4s = [];
      const keys = Object.keys(networkInterfaces);
      keys.forEach((key) => {
        if (!key.startsWith("lo")) {
          networkInterfaces[key].forEach((iface) => {
            if (iface.family === "IPv4") {
              v4s.push(iface);
            }
          });
        }
      });
      return v4s[0].address;
    };

    const machine = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      address: extractUsefulIp(os.networkInterfaces()),
      release: os.release(),
    };

    node.status({
      fill: "green",
      shape: "dot",
      text: `${machine.address}`,
    });

    node.on("input", async function (msg) {
      const url = `${baseUrl}?hostname=${machine.hostname}&platform=${machine.platform}&arch=${machine.arch}&address=${machine.address}&release=${machine.release}`;
      try {
        const response = await got(url, { method: "GET" }).json();
        msg.payload = response;
        node.send(msg);
        node.status({});
        failureCount += 0;
      } catch (error) {
        failureCount += 1;
        node.status({
          fill: "red",
          shape: "dot",
          text: `${failureCount}: ${error}`,
        });
        if (failureCount > connectionAttemptsToRestartAfter) {
          node.error(error, msg); // adding message into node error passes it on to catch node which does the restart
          failureCount = 0;
        } else {
          node.error(error);
        }
      }
    });
  }

  RED.nodes.registerType("botregister", register);
};
