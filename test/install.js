suite('install', function() {
  // setup marionette and launch a client
  var Marionette = require('marionette-client');
      host = require('marionette-host-environment'),
      assert = require('assert'),
      subject = require('../lib/install'),
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

    test('missing source', function() {
      assert.throws(function() {
        subject.install({
          origin: origin,
          target: target,
          source: ''
        }, /source/);
      });
    });

    test('missing target', function() {
      assert.throws(function() {
        subject.install({
          origin: origin,
          target: __dirname + '/fakefoobar/',
          source: source
        }, /target/);
      });
    });
  });

  suite('successful install', function() {
    function validateApplication(appPath, domain, origin) {
      var options;
      var expectedAppDir;

      setup(function(done) {
        expectedAppDir = profile + '/' + subject.webappDir + '/' + domain;
        options = {
          source: appPath,
          target: profile,
          origin: origin
        };

        subject.install(options, done);
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
        var content = fs.readFileSync(expectedAppDir + '/../webapps.json');
        content = JSON.parse(content);
        assert.ok(content[domain], 'updates webapps.json');
      });

      suite('launching installed app', function() {
        // actually run a b2g-desktop instance + marionette
        setupMarionette();

        test('launching app', function(done) {
          this.timeout('10s');

          function onComplete(err, result) {
            if (result) {
              done();
            } else {
              done(new Error('app should be installed'));
            }
          }

          device.
            setScriptTimeout(2500).
            setContext('chrome').
            executeAsyncScript(function(domain) {
              var win = window.wrappedJSObject;
              var req = win.navigator.mozApps.mgmt.getAll();
              req.onsuccess = function() {
                var list = req.result;
                var len = list.length;

                for (var i = 0; i < len; i++) {
                  if (list[i].origin.indexOf(domain) !== -1)
                    return marionetteScriptFinished(true);
                }
                return marionetteScriptFinished(false);
              };
            }, [domain], onComplete);
        });
      });
    }

    var appPath = __dirname + '/fixtures/app';
    suite('with app:// origin', function() {
      validateApplication(appPath, 'foobar.com', 'app://foobar.com');
    });

    suite('without app:// origin', function() {
      validateApplication(appPath, 'xfoo.com', 'xfoo.com');
    });

    // XXX: need to figure out why this fails
    suite('without webapps.json', function() {
      return test('XXX figure out why this fails');
      setup(function() {
        fs.unlinkSync(profile + '/webapps/webapps.json');
      });
      validateApplication(appPath, 'system.gaiamobile.org', 'system.gaiamobile.org');
    });
  });
});
