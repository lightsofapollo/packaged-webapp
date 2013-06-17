var achiver = require('archiver'),
    readdirp = require('readdirp'),
    fs = require('fs'),
    fsPath = require('path'),
    url = require('url'),
    Webapps = require('./webapps').Webapps,
    debug = require('debug')('packaged-webapp:install');

module.exports.webappDir = 'webapps';
module.exports.webappsJSON = 'webapps.json';
module.exports.applicationZip = 'application.zip';

var MANIFEST = require('./webapps').manifest;

function validateExistance(name, input) {
  if (!input) {
    throw new Error('option: "' + name + '" is required');
  }
}

function validateAbsPath(name, input) {
  validateExistance(name, input);
  if (!fs.existsSync(input))
    throw new Error('non-existant file path: ' + input);

  return input;
}

function validateDomain(name, input) {
  validateExistance(name, input);
  var parts = url.parse(input);

  // when there is no protocol try to assign it app://
  if (!parts.protocol) {
    parts = url.parse('app://' + url.format(parts));
  }

  // no protocol or protocol is anything other then app
  if (!parts.protocol || parts.protocol.indexOf('app') !== 0)
    throw new Error(name + ' has invalid origin ->' + input);

  if (!parts.hostname)
    throw new Error(name + ' is missing hostname ' + input);

  return parts;
}

var optionParse = {
  // each is a required option
  source: validateAbsPath,
  target: validateAbsPath,
  origin: validateDomain
};

// creates or reuse the webapp target dir.
function createWebappTarget(target, callback) {
  fs.exists(target, function(hasPath) {
    if (hasPath) {
      debug('webapp exists overriding', target);
      return callback(null, target);
    }

    debug('create webapp', target);
    // create the directory
    fs.mkdir(target, callback);
  });
}

// creates the application.zip file
function createApplicationZip(dest, source, callback) {
  debug('creating application.zip', dest, source);

  // archiver
  var archive = achiver('zip');

  // writable stream (will remove previous contents)
  var output =
    fs.createWriteStream(fsPath.join(dest, module.exports.applicationZip));

  // saves contents of file to the zip archive
  function append(data) {
    debug('appending file to zip archive', data.path);
    // create the readable stream and send it to be zipped
    archive.append(
      fs.createReadStream(data.fullPath),
      { name: data.path }
    );
  }

  // close the zip archive and fire callback
  function finalize() {
    debug('finalizing zip');
    archive.finalize(function(err, written) {
      if (err) return callback(err);
      debug('wrote bytes to zip', written);
      callback();
    });
  }

  archive.pipe(output);

  // readdirp stream
  var stream = readdirp({ root: source });

  // abort
  stream.on('error', function(err) {
    return callback(err);
  });

  stream.on('warn', function(err) {
    debug('zip warning', err);
  });

  stream.on('data', append);
  stream.on('end', finalize);
}

// copies the manifest file from the app to the target dir
function copyManifest(dest, source, callback) {
  debug('copying manifest', dest, source);

  function handleError(err) {
    callback && callback(err);
    callback = null;
  }

  var readable = fs.createReadStream(fsPath.join(source, MANIFEST));
  var writable = fs.createWriteStream(fsPath.join(dest, MANIFEST));

  // handle read/write errors
  readable.on('error', handleError);
  writable.on('error', handleError);

  readable.pipe(writable);
  writable.on('close', callback);
}

// updates the global webapps manifest
function updateWebapps(originParsed, dest, source, callback) {
  // read the apps manifest and update the global registry.
  var appManifest = fsPath.join(source, MANIFEST);
  var allManifest = fsPath.resolve(dest, '..', module.exports.webappsJSON);

  var manifest;
  var webappsJSON;

  function finalize() {
    debug('updating webapps.json');
    var domain = originParsed.hostname;
    var webapps = new Webapps(webappsJSON);

    webapps.add(domain, manifest);
    fs.writeFile(allManifest, JSON.stringify(webapps, null, 2), callback);
  }

  var pending = 2;
  function next(err) {
    if (err) {
      callback && callback(err);
      callback = null;
    }

    if (--pending === 0)
      finalize();
  }


  debug('updating', allManifest, 'from', appManifest);

  fs.readFile(allManifest, 'utf8', function(err, content) {
    // if the manifest is missing just create one.
    if (err && err.code === 'ENOENT') {
      err = null;
      content = '{}';
    }

    if (err) return next(err);

    webappsJSON = JSON.parse(content);
    next();
  });

  fs.readFile(appManifest, 'utf8', function(err, content) {
    if (err) return next(err);
    manifest = JSON.parse(content);
    next();
  });
}

/**
 * Creates a packaged app and installs it into the given profile.
 *
 *    var options = {
 *      source: '/path/to/app',
 *      target: '/path/to/profile',
 *      origin: 'myapp.com'
 *    };
 *
 *    require('packaged-web-app').install(
 *      options,
 *      function(err) {
 *        // yey installed!
 *      }
 *    );
 *
 *
 *  Options:
 *    - (String) source: absolute path where app is located.
 *    - (String) target: absolute path where profile is located.
 *    - (String) origin: the origin (domain) of the webapp.
 *
 * @param {String} options for installation.
 * @param {Function} callback [Error err].
 */
function install(options, callback) {
  if (typeof options !== 'object')
    throw new Error('options are required');

  // local copy of options
  var config = {};

  // validate & parse install options
  for (var name in optionParse) {
    config[name] = optionParse[name](name, options[name]);
  }

  // location in profile where files go (profile/webapps/HOSTNAME/
  var webappTarget =
    fsPath.join(config.target, module.exports.webappDir, config.origin.hostname);

  createWebappTarget(webappTarget, function(err) {
    if (err) return callback(err);
    var pending = 3;
    function next(err) {
      if (err) {
        callback && callback(err);
        // remove callback reference so we don't fire twice
        callback = null;
      }
      // when we are done doing the operation in parallel
      if (--pending === 0) {
        callback();
      }
    }

    updateWebapps(config.origin, webappTarget, config.source, next);
    createApplicationZip(webappTarget, config.source, next);
    copyManifest(webappTarget, config.source, next);
  });
}

module.exports.install = install;
