

module.exports = function (RED) {
    const ZB = require('zeebe-node');

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
                node.emit('ready');
            },
            onConnectionError: () => {
                node.log('Connection Error');
                node.emit('connectionError');
            },
        };

        node.zbc = new ZB.ZBClient(config.zeebe, options);
        node.pm = config.geocampm;

        node.on('close', function (done) {
            return node.zbc.close().then(() => {
                node.log('All workers closed');
                done();
            });
        });
    }

    RED.nodes.registerType('botconfig', botconfig);
};