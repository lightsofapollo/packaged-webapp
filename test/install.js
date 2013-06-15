suite('install', function() {
  // setup marionette and launch a client
  var Marionette = require('marionette-client');
  var host = require('marionette-host-environment');
  var subject = require('./install.js');
  var assert = require('assert');

  // setup device
  var b2gProcess;
  var device;
  setup(function(done) {
    this.timeout('50s');
    host.spawn(__dirname + '/b2g/', function(err, port, child) {
      if (err) return callback(err);
      b2gProcess = child;
      var driver = new Marionette.Drivers.Tcp({ port: port });
      driver.connect(function() {
        device = new Marionette.Client(driver);
        device.startSession(done);
      });
    });
  });

});
