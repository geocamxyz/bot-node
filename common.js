
  const os = require("os");
  const arch = os.arch();
  const swap = ((arch === "linux") || (arch === "arm64")) ? "/" : "\\"
  module.exports.pathChar = swap;