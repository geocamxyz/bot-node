
  const os = require("os");
  const plat = os.platform();
  const swap = ((plat === "linux") || (plat === "darwin")) ? "/" : "\\"
  module.exports.pathChar = swap;