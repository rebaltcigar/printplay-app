const Service = require('node-windows').Service;

// Create a new service object
const svc = new Service({
  name: 'KunekAgent',
  description: 'Kunek Agent for managing PC timer sessions.',
  script: require('path').join(__dirname, '../service/index.js'),
  nodeOptions: [
    '--max-old-space-size=4096' // Adjust memory limit if necessary
  ],
  env: {
    name: "production",
    NODE_ENV: "production"
  }
});

// Listen for the "install" event, which indicates the service is available
svc.on('install', function() {
  console.log('Service installed successfully.');
  svc.start();
});

// Install the service
svc.install();