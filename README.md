# conductor-node
Node-red node for handling Geocam processing jobs based on defined 
compute and task limits that are returned by the capabilities URL on the project management system.

This repository is public for easy install (to save having to set up keys on each bot machine) but will be of very limited use outside of Geocam

Node-red setup: 
in setting.js enable:
    functionGlobalContext: {
         os:require('os'),
    },

