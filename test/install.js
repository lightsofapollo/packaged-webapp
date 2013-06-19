suite('install', function() {
  // setup marionette and launch a client
  var Marionette = require('marionette-client');
      host = require('marionette-host-environment'),
      assert = require('assert'),
      subject = require('../lib/install'),
      appPath = __dirname + '/fixtures/app',
      fs = require('fs');

  var b2gProcess;
  var device;
  var profile;

  // marionette port to use
  var marionettePort = 60045;

  // create the profile
  setup(function(done) {
    var options = {
      runtime: __dirname + '/b2g',
      userPrefs: {
        'marionette.defaultPrefs.enabled': true,
        'marionette.defaultPrefs.port': marionettePort
      }
    };
    var builder = require('mozilla-profile-builder').b2g;
    builder.profile(options, function(err, _profile) {
      if (err) return done(err);
      profile = _profile;
      done();
    });
  });

  /**
   * Finds origins for each installed app.
   *
   * @param {Function} callback [err, [origin, origin, ...]]
   */
  function getInstalledOrigins(callback) {
    function handleResult(err, content) {
      if (err) {
        return callback(err);
      }
      callback(null, content);
    }

    device.
      goUrl('app://system.gaiamobile.org').
      setContext('chrome').
      executeAsyncScript(function() {
        var win = window.wrappedJSObject;
        var req = win.navigator.mozApps.mgmt.getAll();
        req.onsuccess = function() {
          var list = req.result;
          var len = list.length;
          var results = req.result.map(function(app) {
            return app.origin;
          });
          marionetteScriptFinished(results);
        };
      }, handleResult);
  }

  function setupMarionette() {
    // setup device
    setup(function(done) {
      this.timeout('50s');
      var options = { profile: profile };
      host.spawn(__dirname + '/b2g/', options, function(err, port, child) {
        if (err) return callback(err);
        b2gProcess = child;

        if (process.env.DEBUG) {
          child.stdout.pipe(process.stdout);
        }

        var driver = new Marionette.Drivers.Tcp({ port: marionettePort });
        driver.connect(function() {
          device = new Marionette.Client(driver);
          device.startSession(done);
        });
      });
    });

    teardown(function(done) {
      device.deleteSession(function() {
        b2gProcess.kill();
        done();
      });
    });
  }


  suite('invalid installs', function() {
    var origin = 'foobar.com';
    var target = __dirname + '/fixtures';
    var source = __dirname + '/fixtures/app';

    test('no options', function(done) {
      subject.installApp(target, {}, function(err) {
        if (!err) return done(new Error('should send error'));
        done();
      });
    });

    test('no origin', function(done) {
      subject.installApp(target, { source: source }, function(err) {
        if (!err) return done(new Error('should send error'));
        assert.ok(err.message.indexOf('origin') !== -1);
        done();
      });
    });

    test('missing source', function(done) {
      subject.installApp(
        target,
        {
          origin: origin,
          source: ''
        },
        function(err) {
          assert.ok(err.message.match(/source/));
          done();
        }
      );
    });
  });

  suite('#installApp', function() {
    function validateApplication(appPath, domain, origin) {
      var options;
      var expectedAppDir;

      setup(function(done) {
        expectedAppDir = profile + '/' + subject.webappDir + '/' + domain;
        options = {
          source: appPath,
          origin: origin
        };

        subject.installApp(profile, options, done);
      });

      function exists(path, desc) {
        path = path || '';
        assert.ok(
          fs.existsSync(expectedAppDir + path),
          desc || path
        );
      }

      test('profile placement', function() {
        exists(null, 'has directory');
        exists('/application.zip');
        exists('/manifest.webapp');
      });

      test('webapps.json', function() {
        var content =
          fs.readFileSync(expectedAppDir + '/../webapps.json', 'utf8');
        content = JSON.parse(content);
        assert.ok(content[domain], 'updates webapps.json');
      });

      suite('launching installed app', function() {
        // actually run a b2g-desktop instance + marionette
        setupMarionette();

        test('checking apps existance', function(done) {
          this.timeout('10s');
          getInstalledOrigins(function(err, list) {
            if (list.indexOf('app://' + domain) === -1) {
              return done(new Error('domain is not installed ' + domain));
            }
            done();
          });
        });
      });
    }

    suite('with app:// origin', function() {
      validateApplication(appPath, 'foobar1.com', 'app://foobar1.com');
    });

    suite('without app:// origin', function() {
      validateApplication(appPath, 'mofo.com', 'mofo.com');
    });

    // XXX: need to figure out why this fails
    suite('without webapps.json', function() {
      return test('XXX figure out why this fails');
      setup(function() {
        fs.unlinkSync(profile + '/webapps/webapps.json');
      });
      validateApplication(
        appPath, 'system.gaiamobile.org', 'system.gaiamobile.org'
      );
    });
  });

  suite('#installApps', function() {
    setupMarionette();

    var apps = [
      { source: appPath, origin: 'app://myfoo.com' },
      { source: appPath, origin: 'app://yourfooo.com' }
    ];

    setup(function(done) {
      subject.installApps(profile, apps, done);
    });

    test('all apps are installed', function(done) {
      getInstalledOrigins(function(err, installed) {
        assert.ok(installed.indexOf(apps[0].origin), apps[0].origin);
        assert.ok(installed.indexOf(apps[1].origin), apps[1].origin);
        done();
      });
    });
  });

});
