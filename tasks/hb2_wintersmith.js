/*
 * grunt-hb2-wintersmith
 * https://github.com/stratusmedia/grunt-hb2-wintersmith
 *
 * Copyright (c) 2014 
 * Licensed under the MIT license.
 */

'use strict';

var mongo = require('mongoskin'),
  Q = require('q'),
  _ = require('underscore'),
  fs = require('fs'),
  path = require('path'),
  mkdirp = require('mkdirp'),
  js2xmlparser = require('js2xmlparser'),
  diacritics = require('diacritics');

var APP = {};
APP.contents = {};
APP.players = {};

var cfgDefaults = {
  contents: 'contents', // Relative to output directory
  json: 'json', // Relative to contents
  js: 'js', // Relative to contents
  fp4: 'js/fp4', // Relative to contents
  jsonPage: 100,
  cfgProps: [],
  assetProps: [],
  playlistProps: [],
  playlistChildProps: [],
  playlistAssetProps: []
};

function validateCfg(cfg) {
  cfg = _.defaults(cfg, cfgDefaults);

  if (!cfg.account) {
    throw new Error('account is required!');
  }
  if (!cfg.site) {
    throw new Error('site is required!');
  }
  if (!cfg.dbcon) {
    throw new Error('dbcon is required!');
  }
  if (!cfg.media) {
    throw new Error('media is required!');
  }

  if (!_.isArray(cfg.cfgProps)) {
    throw new Error('cfgProps must be an array!');
  }
  if (!_.isArray(cfg.assetProps)) {
    throw new Error('assetProps must be an array!');
  }
  if (!_.isArray(cfg.playlistProps)) {
    throw new Error('playlistProps must be an array!');
  }
  if (!_.isArray(cfg.playlistAssetProps)) {
    throw new Error('playlistAssetProps must be an array!');
  }
  if (!_.isArray(cfg.playlistChildProps)) {
    throw new Error('playlistChildProps must be an array!');
  }

  if (cfg.assetJsonFn && !_.isFunction(cfg.assetJsonFn)) {
    throw new Error('assetJsonFn must be a function!');
  }
  if (cfg.playlistJsonFn && !_.isFunction(cfg.playlistJsonFn)) {
    throw new Error('playlistJsonFn must be a function!');
  }
  if (cfg.playlistAssetJsonFn && !_.isFunction(cfg.playlistAssetJsonFn)) {
    throw new Error('playlistAssetJsonFn must be a function!');
  }
  if (cfg.playlistChildJsonFn && !_.isFunction(cfg.playlistChildJsonFn)) {
    throw new Error('playlistChildJsonFn must be a function!');
  }

  cfg.cfgProps = _.union(cfg.cfgProps, ['ssl','cdn','repo', 'rtmp', 'fp5Key', 'jsonPage', 'media']);

  cfg.assetProps = _.union(cfg.assetProps, ['id', 'type', 'title', 'description', 'splash', 'tags', 'categories', 'contents', 'playlists', 'created', 'updated']);
  cfg.playlistProps = _.union(cfg.playlistProps, ['id', 'type', 'title', 'description', 'splash', 'parent', 'parents', 'children', 'assets', 'created', 'updated']);

  cfg.outputDir = (cfg.output) ? path.join(process.cwd(), cfg.output) : process.cwd();
  cfg.contentsDir = path.join(cfg.outputDir, cfg.contents);
  cfg.jsonDir = path.join(cfg.contentsDir, cfg.json);
  cfg.jsDir = path.join(cfg.contentsDir, cfg.js);
  cfg.fp4Dir = path.join(cfg.contentsDir, cfg.fp4);

  mkdirp.sync(cfg.outputDir);
  mkdirp.sync(cfg.contentsDir);
  mkdirp.sync(cfg.jsonDir);
  mkdirp.sync(cfg.jsDir);
  mkdirp.sync(cfg.fp4Dir);

  return cfg;
}

function initDb(dbcon) {
  APP.db = mongo.db(dbcon, {
    native_parser: true
  });

  APP.db.bind('sites');
  APP.db.bind('sites.assets');
  APP.db.bind('players');
  APP.db.bind('playlists');
  APP.db.bind('playlists.assets');
  APP.db.bind('assets');
}

function assetType(type) {
  if (type == 'VIDEO') {
    return 'V';
  } else if (type == 'AUDIO') {
    return 'A';
  } else if (type == 'IMAGE') {
    return 'I';
  }
  return 'O';
}

/* Load Asset */
function loadAsset(id, channels) {
  //console.log('loadAsset: ' + id);
  var deferred = Q.defer();
  var criteria = {
    _id: id
  };
  APP.db.assets.findOne(criteria, function (err, data) {
    if (err) {
      deferred.reject(err);
    } else {
      data.id = data._id;
      delete data._id;
      data.type = assetType(data.type);
      if (!data.contents) data.contents = [];
      data.channels = (channels) ? channels : [];
      data.playlists = [];
      deferred.resolve(data);
    }
  });
  return deferred.promise;
}

/* Load PlaylistsAssets */
function loadSitesAssets(id) {
  console.log('loadSitesAssets: ' + id);
  var deferred = Q.defer();
  var criteria = {
    site: id
  };
  var sort = {
    order: 1
  };
  APP.db['sites.assets'].find(criteria).sort(sort).toArray(function (err, datas) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(datas);
    }
  });
  return deferred.promise;
}

/* Load Player */
function loadPlayer(id) {
  console.log('loadPlayer: ' + id);
  var deferred = Q.defer();
  var criteria = {
    _id: id
  };
  APP.db.players.findOne(criteria, function (err, data) {
    if (err) {
      deferred.reject(err);
    } else {
      data.id = data._id;
      delete data._id;
      deferred.resolve(data);
    }
  });
  return deferred.promise;
}

/* Load Site Players */
function loadPlayers(site) {
  console.log('loadPlayers');
  var players = [], promises = [];
  _.each(site.channels, function (channel) {
    _.each(channel.players, function (player) {
      if (_.contains(players, player)) {
        promises.push(loadPlayer(player));
        players.push(player);
      }
    });
  });
  Q.all(promises).then(function (players) {
    _.each(players, function (player) {
      APP.players[player.id] = player;
    })
  });
}

/* Load Site */
function loadSite(id) {
  console.log('loadSite: ' + id);
  var deferred = Q.defer();
  var criteria = {
    _id: id
  };
  APP.db.sites.findOne(criteria, function (err, data) {
    if (err) {
      deferred.reject(err);
    } else {
      data.id = data._id;
      delete data._id;

      loadPlayers(data);

      var channels = {};
      _.each(data.channels, function (channel) {
        channels[channel.name] = channel;
      });
      data.channels = channels;
      data.url = (data.alias) ? 'http://' + data.alias : 'http://' + data.domain;

      loadSitesAssets(data.id).then(function (siteAssets) {
        var promises = _.map(siteAssets, function (siteAsset) {
          return loadAsset(siteAsset.asset, siteAsset.channels);
        });
        Q.all(promises).then(function (assets) {
          _.each(assets, function (asset) {
            APP.contents[asset.id] = asset;
          });
          deferred.resolve(data);
        });
      });
    }
  });
  return deferred.promise;
}

/* Load PlaylistsAssets */
function loadPlaylistsAssets(id) {
  //console.log('loadPlaylistsAssets: ' + id);
  var deferred = Q.defer();
  var criteria = {
    playlist: id
  };
  var sort = {
    order: 1
  };
  APP.db['playlists.assets'].find(criteria).sort(sort).toArray(function (err, datas) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(datas);
    }
  });
  return deferred.promise;
}

/* Load Playlist with parents tree */
function loadPlaylists(id, parents) {
  //console.log('loadPlaylists: ' + id + ' ', parents);
  var deferred = Q.defer();
  var criteria = {
    _id: id
  };
  APP.db.playlists.findOne(criteria, function (err, data) {
    if (err) {
      deferred.reject(err);
    } else {
      data.id = data._id;
      delete data._id;
      data.type = 'P';
      data.parents = parents.slice();
      if (!data.children) data.children = [];

      loadPlaylistsAssets(data.id).then(function (playlistAssets) {
        // If playlist id or parent is the same site.playlist change by 'index'
        if (data.id == APP.site.playlist) data.id = 'index';
        if (data.parent && data.parent == APP.site.playlist) data.parent = 'index';

        data.id = diacritics.remove(data.id);
        if (data.parent) data.parent = diacritics.remove(data.parent);

        data.assets = _.compact(_.map(playlistAssets, function (playlistAsset) {
          if (APP.contents.hasOwnProperty(playlistAsset.asset)) {
            APP.contents[playlistAsset.asset].playlists.push(data.id);
            return playlistAsset.asset;
          }
        }));

        var promises = _.map(data.children, function (child) {
          return loadPlaylists(child, _.union(parents, [data.id]))
        });
        data.children = _.map(data.children, function (id) {
          return diacritics.remove(id)
        });
        Q.all(promises).then(function () {
          APP.contents[data.id] = data;
          deferred.resolve(data);
        });
      });
    }
  });
  return deferred.promise;
}

/*
 * Load from Database site, playlists and assets
 */
function loadData(opts, cb) {
  console.log('loadData', opts);

  if (!opts.config) {
    throw new Error('config is required');
  }
  var filepath = path.join(process.cwd(), opts.config);
  var cfg = require(filepath);

  cfg = validateCfg(cfg);
  initDb(cfg.dbcon);

  /* Load Site */
  loadSite(cfg.site).then(function (site) {
    APP.site = site;
    /* Load Playlist */
    loadPlaylists(site.playlist, []).then(function () {
      APP.db.close();
      createContents(cfg, cb);
    });
  });
}

function createFp4Config(cfg, content) {
  //console.log('createFp4Config');
  if (content.type != 'V') {
    return {};
  }
  var config = {};
  config.key = cfg.fp4Key;
  config.plugins = {};
  config.plugins.rtmp = {
    url: cfg.fp4RtmpUrl,
    netConnectionUrl: cfg.rtmp
  };
  config.plugins.bwcheck = {
    url: cfg.fp4BwcheckUrl,
    serverType: "fms",
    netConnectionUrl: cfg.rtmp
  };

  var splash = {
    url: cfg.cdn + content.splash,
    autoplay: true,
    scaling: 'fit'
  };
  var clip = {
    pageUrl: APP.site.url + '/' + content.path + '/' + content.id,
    configUrl: APP.site.url + '/' + cfg.fp4 + '/' + content.id + '.js',
    provider: 'rtmp',
    urlResolvers: 'bwcheck',
    netConnectionUrl: cfg.rtmp,
    scaling: 'fit',
    showCaptions: false,
    autoPlay: true,
    bitrates: []
  };

  _.each(content.contents, function (value, res) {
    if (value.mp4) {
      var bitrate = {};
      bitrate.url = 'mp4:' + value.mp4;
      bitrate.bitrate = value.vbr;
      if (res == cfg.resolution) bitrate.isDefault = true;
      clip.bitrates.push(bitrate);
    }
  });

  config.playlist = [];
  config.playlist.push(splash);
  config.playlist.push(clip);
  return config;
}

/* */
function createSearch(cfg, contents) {
  console.log('createSearch');
  var searchs = _.map(contents, function (content) {
    var obj = {};
    obj.i = content.id;
    obj.c = content.type;
    obj.t = content.title;
    if (content.description) {
      obj.d = content.description;
    }
    obj.s = content.splash;
    return obj;
  });
  var filename = path.join(cfg.jsDir, 'search.js');
  fs.writeFileSync(filename, "APP.searchs = " + JSON.stringify(searchs));
}

function createSitemap(cfg, contents) {
  console.log('sitemapVideo');
  var url;

  var urls = _.compact(_.map(contents, function (content) {
    if (content.id == 'index') return;
    url = {};
    url.loc = APP.site.url + content.path + '/' + content.id;
    url.changefreq = 'monthly';
    url.lastmod = (content.updated) ? content.updated.toISOString() : content.created.toISOString();
    if (content.type == 'V' && content.contents[cfg.resolution]) {
      url['video:video'] = {};
      url['video:video']['video:thumbnail_loc'] = cfg.cdn + content.splash;
      url['video:video']['video:title'] = content.title;
      if (content.description) {
        url['video:video']['video:description'] = content.description;
      }
      url['video:video']['video:content_loc'] = cfg.cdn + content.contents[cfg.resolution].mp4;
      if (content.contents[cfg.resolution].vdu) {
        url['video:video']['video:duration'] = parseInt(content.contents[cfg.resolution].vdu / 1000);
      }
      url['video:video']['video:publication_date'] = content.created.toISOString();
      if (!_.isEmpty(content.categories)) {
        url['video:video']['video:category'] = content.categories[0];
      }
      if (!_.isEmpty(content.tags)) {
        url['video:video']['video:tag'] = content.tags;
      }
    }
    return url;
  }));

  url = {};
  url.loc = APP.site.url;
  url.changefreq = 'weekly';
  urls.unshift(url);

  var urlset = {
    '@': {
      'xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'xmlns:video': 'http://www.google.com/schemas/sitemap-video/1.1'
    },
    url: urls
  };

  var xml = js2xmlparser("urlset", urlset);
  var filename = path.join(cfg.contentsDir, 'sitemap-video.xml');
  fs.writeFileSync(filename, xml);
}

function filterContents(filter) {
  console.log('filterContents', filter);
  var contents = [];
  if (!filter) {
    contents = _.map(APP.contents, function (content) {
      return content;
    });
  } else if (filter.types) {
    _.each(filter.types, function (type) {
      contents = _.compact(_.map(APP.contents, function (content) {
        if (content.type == type) {
          return content;
        }
      }));
    });
  } else if (filter.ids) {
    contents = _.compact(_.map(filter.ids, function (id) {
      return APP.contents[id];
    }));
  }
  return contents;
}

function createJSConfig(cfg) {
  var config = {};
  config.url = APP.site.url;
  config = _.extend(config, _.pick(cfg, cfg.cfgProps));
  var filename = path.join(cfg.jsDir, 'config.js');
  fs.writeFileSync(filename, "var APP = {}; APP.cfg = " + JSON.stringify(config));
}

function createLocals(cfg) {
  var channel = APP.site.channels.default;
  var locals = {};
  locals.url = APP.site.url;
  locals.title = channel.title;
  locals.description = channel.description;
  locals.fb = {
    app_id: cfg.fb.app_id,
    site_name: channel.title
  };
  locals.twitter = cfg.twitter;
  if (APP.site.gaUa) {
    locals.gaUa = APP.site.gaUa;
  }
  if (APP.site.gvc) {
    locals.gvc = APP.site.gvc;
  }
  if (APP.site.flowplayerkey) {
    locals.fp4Key = APP.site.flowplayerkey;
    locals.fp5Key = cfg.fp5Key;
  }
  locals = _.extend(locals, _.pick(cfg, cfg.cfgProps));
  var filename = path.join(cfg.outputDir, 'locals.json');
  fs.writeFileSync(filename, JSON.stringify(locals));
}

function createPage(cfg, page) {
  //console.log('createPage ' + page.id);
  var filename;
  if (page.fp4) {
    var fp4 = createFp4Config(cfg, page);
    filename = path.join(cfg.fp4Dir, page.id + '.js');
    fs.writeFileSync(filename, JSON.stringify(fp4));
  }

  var wpage = (cfg.beforeWritePageFn) ? cfg.beforeWritePageFn(cfg, _.clone(page), APP.contents) : _.clone(page);
  wpage = _.omit(wpage, ['filter', 'sitemap', 'search', 'json', 'fp4', 'outputDir']);

  filename = path.join(page.outputDir, page.id + '.json');
  fs.writeFileSync(filename, JSON.stringify(wpage));
}

/* Create Content */
function createContents(cfg, cb) {
  console.log('createContent ');
  var filename, start, end, range, n, jsons = {};

  if (cfg.beforeCreateContents) cfg.beforeCreateContents(cfg, APP.contents);

  createLocals(cfg);
  createJSConfig(cfg);

  _.each(APP.contents, function (content) {
    if (content.type == 'P') {
      var json = (!_.isEmpty(cfg.playlistProps)) ? _.pick(content, cfg.playlistProps) : content;
      json.children = _.compact(_.map(json.children, function (id) {
        var child = (!_.isEmpty(cfg.playlistChildProps)) ? _.pick(APP.contents[id], cfg.playlistChildProps) : id;
        return (cfg.playlistChildFn) ? cfg.playlistChildFn(cfg, json, child, APP.contents) : child;
      }));
      json.assets = _.compact(_.map(json.assets, function (id) {
        var asset = (!_.isEmpty(cfg.playlistAssetProps)) ? _.pick(APP.contents[id], cfg.playlistAssetProps) : id;
        asset.contents = assetJsonContents(cfg, asset, APP.contents);
        return (cfg.playlistAssetFn) ? cfg.playlistAssetFn(cfg, json, asset, APP.contents) : asset;
      }));
      if (cfg.playlistFn) json = cfg.playlistFn(cfg, json, APP.contents);
    } else {
      json = (!_.isEmpty(cfg.assetProps)) ? _.pick(content, cfg.assetProps) : content;
      json.contents = assetJsonContents(cfg, json, APP.contents);
      if (_.isEmpty(json.contents)) {
        console.error('Error: Asset without contents: ' + json.id);
        return;
      }
      if (cfg.assetFn) json = cfg.assetFn(cfg, json, APP.contents);
    }
    if (cfg.jsonFn) json = cfg.jsonFn(cfg, json, APP.contents);

    var wjson = (cfg.beforeWriteJsonFn) ? cfg.beforeWriteJsonFn(cfg, _.clone(json), APP.contents) : _.clone(json);
    filename = path.join(cfg.jsonDir, json.id + '.json');
    fs.writeFileSync(filename, JSON.stringify(wjson));

    if (json.children && cfg.playlistChildrenJsonPages) {
      for (start = 0, end = cfg.jsonPage, n = 0; start < json.children.length; start += cfg.jsonPage, end += cfg.jsonPage, n++) {
        range = json.children.slice(start, end);
        filename = path.join(cfg.jsonDir, json.id + '-children-' + n + '.json');
        fs.writeFileSync(filename, JSON.stringify(range));
      }
    }
    if (json.assets && cfg.playlistAssetsJsonPages) {
      for (start = 0, end = cfg.jsonPage, n = 0; start < json.assets.length; start += cfg.jsonPage, end += cfg.jsonPage, n++) {
        range = json.assets.slice(start, end);
        filename = path.join(cfg.jsonDir, json.id + '-assets-' + n + '.json');
        fs.writeFileSync(filename, JSON.stringify(range));
      }
    }
    jsons[json.id] = json;
  });
  APP.contents = jsons;

  var sitemap = {}, searchs = {};
  _.each(cfg.pages, function (page) {
    // Create the path directory relative to contents
    if (page.path) {
      page.outputDir = path.join(cfg.contentsDir, page.path);
      mkdirp.sync(page.outputDir);
    } else {
      page.outputDir = cfg.contentsDir;
    }

    if (page.id) {
      if (page.search && !searchs.hasOwnProperty(page.id)) searchs[page.id] = page;
      if (page.sitemap && !sitemap.hasOwnProperty(page.id)) sitemap[page.id] = page;
      createPage(cfg, page);
    } else {
      var contents = filterContents(page.filter);
      console.log('createContent ' + contents.length);
      _.each(contents, function (content, id) {
        if (page.search && !searchs.hasOwnProperty(id)) searchs[id] = content;
        if (page.sitemap && !sitemap.hasOwnProperty(id)) sitemap[id] = _.extend(content, {path: page.path});
        createPage(cfg, _.extend(content, page));
      });
    }
  });

  createSitemap(cfg, sitemap);
  createSearch(cfg, searchs);

  if (cfg.afterCreateContents) cfg.afterCreateContents(cfg, APP.contents);

  console.log('createContent');
  cb();
}

function assetJsonContents(cfg, json, contents) {
  var asset = contents[json.id];
  if (asset.type = 'V') {
    return videoResolutions(cfg.vres, asset);
  } else if (asset.type = 'A') {
    return asset.contents;
  } else if (asset.type = 'I') {
    return asset.contents;
  }
  return asset.contents;
}

function videoResolutions(vres, asset) {
  var videos = {};
  _.each(vres, function (value, res) {
    _.each(vres[res], function (value, fmt) {
      _.each(asset.contents, function (content) {
        if (content.media == vres[res][fmt]) {
          if (!videos.hasOwnProperty(res)) videos[res] = {};
          videos[res].vdu = content.duration;
          videos[res].vbr = content.video.bitrate;
          videos[res][fmt] = content.path;
        }
      });
    });
  });
  return videos;
}

module.exports = function (grunt) {
  grunt.registerMultiTask('hb2_wintersmith', 'HB2 wintersmith contents generator', function () {
    var options = this.options();

    var _ = grunt.util._;
    options = _.defaults(options, {
      config: './hb2-wintersmith.js'
    });

    var done = this.async();
    loadData(options, done);
  });
};