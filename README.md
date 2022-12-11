# conductor-node

in setting.js enable:
    functionGlobalContext: {
         os:require('os'),
    },



TODO
Need to compare array length with number of outputs.  Should use number of outputs but alert that version is different.
Could pass this up to PM
Should probably also pass to PM when engaged in a task.  Which could be done on launch a task
In which case we may want to do our own complete node to tell manager when done.