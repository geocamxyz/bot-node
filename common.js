
  const os = require("os");
  const plat = os.platform();
  const isUnix = (plat === "linux") || (plat === "darwin");
  const isWindows =  !isUnix;
  const swap = isUnix ? "/" : "\\"
  module.exports.pathChar = swap;
  module.exports.isWindows = isWindows;