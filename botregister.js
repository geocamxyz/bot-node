module.exports = function (RED) {
  const os = require("os");
  const got = require("got");

  function register(config) {
    RED.nodes.createNode(this, config);

    const botConfig = RED.nodes.getNode(config.botconfig);

    const node = this;
    const baseUrl = botConfig.pm;

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
      const url = `${baseUrl}?hostname=${machine.hostname}&platform=${machine.platform}&arch=${machine.arch}&address=${machine.address}&release=${machine.release}`
     const response = await got(url, { method: 'GET' }).json();
      msg.payload = response;
      node.send(msg);
    });
  }

  RED.nodes.registerType("botregister", register);

};
