module.exports = function (RED) {
  const os = require("os");
  const got = require("got");

  function notify(config) {
    RED.nodes.createNode(this, config);

    const node = this;

    const telegram = RED.nodes.getNode(config.botconfig).telegram;

    node.on("input", async function (msg) {
      const token = telegram.token;
      const chatId = telegram.chatId;
      if (token && chatId) {
        let message = config.message || msg.payload.message || msg.payload;
        if (!(typeof message === "string" || message instanceof String)) {
          message = JSON.stringify(message);
        }
        if (message) {
          if (config.prependHostname) {
            const hostname = os.hostname();
            message = `${hostname}: ${message}`;
          }
          let result;
          try {
            url = `https://api.telegram.org/bot${token}/sendMessage`;
            const response = await got
              .post(url, {
                json: {
                  chat_id: chatId,
                  text: message,
                },
              })
              .json();
            result = response;
          } catch (err) {
            result = { ok: false, description: err.message };
          }
          if (!result.ok) {
            node.status({
              fill: "red",
              shape: "dot",
              text: `${new Date().toLocaleString().split(" ")[1]} ${
                result.description
              }`,
            });
          }
        } else {
          node.status({
            fill: "grey",
            shape: "ring",
            text: `${new Date().toLocaleString().split(" ")[1]} empty message`,
          });
        }
      } else {
        node.status({
          fill: "red",
          shape: "dot",
          text: `${new Date().toLocaleString().split(" ")[1]} Telegram ${
            token ? "bot token" : "chat id"
          } not configured"}`,
        });
      }
      node.send(msg);
    });
  }

  RED.nodes.registerType("botnotify", notify);
};
