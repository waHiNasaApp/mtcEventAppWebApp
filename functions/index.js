// Set maximum number of containers
const { setGlobalOptions } = require('firebase-functions');
setGlobalOptions({
  maxInstances: 10,
});
