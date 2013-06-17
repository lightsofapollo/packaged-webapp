suite('webapps', function() {
  var assert = require('assert');
  var mozprofile = require('mozilla-profile-builder').b2g;
  var fixture = __dirname + '/fixtures/webapps.json';
  var Webapps = require('../lib/webapps').Webapps;
  var fs = require('fs');

  var fixtureContent;
  var subject;
  setup(function() {
    fixtureContent = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    subject = new Webapps(fixtureContent);
  });

  test('.nextLocalId', function() {
    // number determined by reading fixtures/webapps.json
    assert.equal(subject.nextLocalId(), 42);
  });

  suite('appStatusForType', function() {
    [
      ['certified', 3],
      ['privileged', 2],
      ['web', 1],
      ['foobar', 1]
    ].forEach(function(pair) {
      var type = pair[0];
      var expected = pair[1];

      test(type, function() {
        assert.equal(subject.appStatusForType(type), expected);
      });
    });
  });

  suite('#add', function() {
    var localId;
    var domain = 'foobar.com';
    var manifest = {
      type: 'certified'
    };
    var expectedOrigin = 'app://' + domain;
    var now;

    setup(function() {
      localId = subject.nextLocalId();
      now = Date.now();
      subject.add(domain, manifest);
    });

    test('initial add without options', function() {
      assert.ok(subject.content[domain], 'has record');
      var record = subject.content[domain];

      assert.equal(record.installOrigin, expectedOrigin, 'installOrigin');
      assert.equal(record.origin, expectedOrigin, 'origin');
      assert.equal(record.localId, localId, 'localId');
      assert.equal(
        record.appStatus,
        subject.appStatusForType(manifest.type),
        'type'
      );

      var time = record.installTime;
      assert.ok(
        time && time >= now,
        'installTime'
      );

      assert.equal(
        record.manifestURL,
        'app://' + domain + '/manifest.webapp',
        'manifestURL'
      );
    });

    test('update', function() {
      // add again but change appStatus
      subject.add(domain, { type: 'web' });
      var record = subject.content[domain];

      assert.equal(
        record.appStatus,
        subject.appStatusForType('web')
      );

      assert.equal(
        record.localId,
        localId,
        'does not increment local id for updates'
      );
    });
  });

  test('#toJSON', function() {
    var expected = JSON.stringify(fixtureContent);

    assert.equal(
      JSON.stringify(subject),
      expected,
      'stringifies only #content'
    );
  });

});
