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
  jsonPage: 100
};

function assetType(asset) {
  var type = 'O';
  if (asset.type == 'VIDEO') {
    type = 'V';
  } else if (asset.type == 'AUDIO') {
    type = 'A';
  } else if (asset.type == 'IMAGE') {
    type = 'I';
  }
  return type;
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
      data.type = assetType(data);
      if (!data.title) {
        data.title = '';
      }
      if (channels) {
        data.channels = channels;
      }
      if (!data.contents) {
        data.contents = [];
      }
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
  for (var i = 0; i < site.channels.length; i++) {
    var channel = site.channels[i];
    for (var j = 0; j < channel.players.length; j++) {
      var player = channel.players[j];
      if (players.indexOf(player) < 0) {
        promises.push(loadPlayer(player));
        players.push(player);
      }
    }
  }
  Q.all(promises).then(function (players) {
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      APP.players[player.id] = player;
    }
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
      for (var i = 0; i < data.channels.length; i++) {
        var channel = data.channels[i];
        channels[channel.name] = channel;
      }
      data.channels = channels;

      data.url = 'http://' + data.domain;
      if (data.alias) {
        data.url = 'http://' + data.alias;
      }

      loadSitesAssets(data.id).then(function (siteAssets) {
        var promises = [];
        for (var i = 0; i < siteAssets.length; i++) {
          var siteAsset = siteAssets[i];
          promises.push(loadAsset(siteAsset.asset, siteAsset.channels));
        }
        Q.all(promises).then(function (assets) {
          for (var i = 0; i < assets.length; i++) {
            var asset = assets[i];
            APP.contents[asset.id] = asset;
          }
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
      loadPlaylistsAssets(data.id).then(function (playlistAssets) {

        data.type = 'P';
        // If playlist id or parent is the same site.playlist change by 'index'
        if (data.id == APP.site.playlist) {
          data.id = 'index';
        }
        if (data.parent && data.parent == APP.site.playlist) {
          data.parent = 'index';
        }

        data.parents = parents.slice();

        data.assets = [];
        for (var i = 0; i < playlistAssets.length; i++) {
          var playlistAsset = playlistAssets[i];
          if (APP.contents.hasOwnProperty(playlistAsset.asset)) {
            var asset = APP.contents[playlistAsset.asset];
            asset.parents = _.union(data.parents, [diacritics.remove(data.id)]);
            asset.parent = diacritics.remove(data.id);
            data.assets.push(playlistAsset.asset);
          }
        }

        if (!data.children) {
          data.children = [];
        }
        var promises = [];
        for (var k = 0; k < data.children.length; k++) {
          var tmp = _.union(parents, [diacritics.remove(data.id)]);
          promises.push(loadPlaylists(data.children[k], tmp));
        }
        Q.all(promises).then(function () {
          data.id = diacritics.remove(data.id);
          if (data.parent) {
            data.parent = diacritics.remove(data.parent);
          }
          if (data.children) {
            data.children = _.map(data.children, function (id) {
              return diacritics.remove(id)
            });
          }
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
    throw new Error('media is required!')
  }
  if (!cfg.vres) {
    throw new Error('media is required!')
  }

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

function createFp4Config(cfg, content, path) {
  //console.log('createFp4Config');
  if (content.type != 'VIDEO') {
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
    pageUrl: APP.site.url + '/' + path + '/' + content.id,
    configUrl: APP.site.url + '/' + cfg.fp4 + '/' + content.id + '.js',
    provider: 'rtmp',
    urlResolvers: 'bwcheck',
    netConnectionUrl: cfg.rtmp,
    scaling: 'fit',
    showCaptions: false,
    autoPlay: true,
    bitrates: []
  };

  var bitrate;
  for (var i = 0; i < content.contents.length; i++) {
    var cnt = content.contents[i];
    if (cnt.media == 'mp4-base-360p') {
      if (cnt.format == 'MP4') {
        bitrate = {};
        bitrate.url = 'mp4:' + cnt.path;
        bitrate.width = cnt.video.width;
        bitrate.bitrate = cnt.video.bitrate;
        bitrate.isDefault = true;
        clip.bitrates.push(bitrate);
      }
    }
    if (cnt.media == 'mp4-main-480p') {
      if (cnt.format == 'MP4') {
        bitrate = {};
        bitrate.url = 'mp4:' + cnt.path;
        bitrate.width = cnt.video.width;
        bitrate.bitrate = cnt.video.bitrate;
        clip.bitrates.push(bitrate);
      }
    }
  }

  config.playlist = [];
  config.playlist.push(splash);
  config.playlist.push(clip);
  return config;
}

/* */
function createSearch(cfg, contents) {
  console.log('createSearch');
  var searchs = [];
  for (var i in contents) {
    if (contents.hasOwnProperty(i)) {
      var content = contents[i];
      var obj = {};
      obj.i = content.id;
      obj.c = content.type;
      obj.t = content.title;
      if (content.description) {
        obj.d = content.description;
      }
      obj.s = content.splash;
      searchs.push(obj);
    }
  }
  var filename = path.join(cfg.jsDir, 'search.js');
  fs.writeFileSync(filename, "APP.searchs = " + JSON.stringify(searchs));
}

function createSitemap(cfg, contents) {
  console.log('sitemapVideo');
  var urls = [], url = {};
  url.loc = APP.site.url;
  url.changefreq = 'weekly';
  urls.push(url);
  for (var i in contents) {
    if (contents.hasOwnProperty(i)) {
      var content = contents[i];
      if (content.id == 'index') {
        continue;
      }
      url = {};
      url.loc = APP.site.url + content.path + '/' + content.id;
      url.changefreq = 'monthly';
      url.lastmod = (content.updated) ? content.updated.toISOString() : content.created.toISOString();
      if (content.type == 'VIDEO') {
        url['video:video'] = {};
        url['video:video']['video:thumbnail_loc'] = cfg.cdn + content.splash;
        url['video:video']['video:title'] = content.title;
        if (content.description) {
          url['video:video']['video:description'] = content.description;
        }
        url['video:video']['video:content_loc'] = cfg.cdn + contentPath(cfg.media, content);
        if (content.source && content.source.duration) {
          url['video:video']['video:duration'] = content.source.duration;
        }
        url['video:video']['video:publication_date'] = content.created.toISOString();
        if (!_.isEmpty(content.categories)) {
          url['video:video']['video:category'] = content.categories[0];
        }
        if (!_.isEmpty(content.tags)) {
          url['video:video']['video:tag'] = content.tags;
        }
      }
      urls.push(url);
    }
  }
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

function createJSON(cfg, content) {
  var json = _.extend({}, _.pick(content, ['id', 'type', 'title', 'description', 'splash', 'tags', 'categories', 'values', 'parent', 'parents', 'children', 'assets']));
  if (json.type == 'P') {
    for (var start = 0, end = cfg.jsonPage, n = 0; start < json.assets.length; start += cfg.jsonPage, end += cfg.jsonPage, n++) {
      var page = json.assets.slice(start, end);
      for (var i = 0, assets = []; i < page.length; i++) {
        var asset = APP.contents[page[i]];
        var obj = _.pick(asset, ['id', 'type', 'title', 'description', 'splash']);
        obj.v = videoResolutions(cfg.vres, asset);
        assets.push(obj);
      }
      json.nPages = n+1;
      var filename = path.join(cfg.jsonDir, json.id + '-assets-' + n + '.json');
      fs.writeFileSync(filename, JSON.stringify(assets));
    }
  } else if (json.type == 'V') {
    json.v = videoResolutions(cfg.vres, content);
  } else if (json.type == 'A') {
  } else if (json.type == 'I') {
  }
  return json;
}

function createPage(cfg, pageCfg, content) {
  //console.log('createPage ' + content.id);
  var filename, page = {};
  if (content) {
    page = createJSON(cfg, content);
    if (cfg.beforeWriteJSON) {
      cfg.beforeWriteJSON(cfg, pageCfg, page, APP.contents);
    }
    if (pageCfg.json) {
      filename = path.join(cfg.jsonDir, page.id + '.json');
      fs.writeFileSync(filename, JSON.stringify(page));
    }
    if (pageCfg.fp4) {
      var fp4 = createFp4Config(cfg, content, pageCfg.path);
      filename = path.join(cfg.fp4Dir, page.id + '.js');
      fs.writeFileSync(filename, JSON.stringify(fp4));
    }
  }
  page = _.extend(page, _.omit(pageCfg, ['filter', 'sitemap', 'search', 'json', 'fp4', 'outputDir']));

  if (cfg.beforeWritePage) {
    cfg.beforeWritePage(cfg, pageCfg, page, APP.contents);
  }

  filename = path.join(pageCfg.outputDir, page.id + '.json');
  fs.writeFileSync(filename, JSON.stringify(page));
}

function filterContents(filter) {
  console.log('filterContents', filter);
  var i, contents = [];
  if (!filter) {
    for (var id in APP.contents) {
      if (APP.contents.hasOwnProperty(id)) {
        contents.push(APP.contents[id]);
      }
    }
  } else if (filter.types) {
    for (var t = 0; t < filter.types.length; t++) {
      for (i in APP.contents) {
        if (APP.contents.hasOwnProperty(i) && APP.contents[i].type == filter.types[t]) {
          contents.push(APP.contents[i]);
        }
      }
    }
  } else if (filter.ids) {
    for (i = 0; i < filter.ids.length; i++) {
      var fid = filter.ids[i];
      if (APP.contents.hasOwnProperty(fid)) {
        contents.push(APP.contents[fid]);
      }
    }
  }
  return contents;
}

function createJSConfig(cfg) {
  var config = {
    url: APP.site.url,
    ssl: cfg.ssl,
    cdn: cfg.cdn,
    repo: cfg.repo,
    rtmp: cfg.rtmp,
    fp5Key: cfg.fp5Key
  };
  var filename = path.join(cfg.jsDir, 'config.js');
  fs.writeFileSync(filename, "var APP = {}; APP.cfg = " + JSON.stringify(config));
}

function createLocals(cfg) {
  var channel = APP.site.channels.default;
  var locals = {};
  locals.url = APP.site.url;
  locals.title = channel.title;
  locals.description = channel.description;
  locals.ssl = cfg.ssl;
  locals.cdn = cfg.cdn;
  locals.repo = cfg.repo;
  locals.rtmp = cfg.rtmp;
  locals.fp4url = cfg.fp4url;
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

  var filename = path.join(cfg.outputDir, 'locals.json');
  fs.writeFileSync(filename, JSON.stringify(locals));
}

/* Create Content */
function createContents(cfg, cb) {
  console.log('createContent ');

  if (cfg.preCreateContents) {
    cfg.preCreateContents(cfg, APP.contents);
  }

  createLocals(cfg);
  createJSConfig(cfg);
  var sitemap = {}, searchs = {};
  for (var i = 0; i < cfg.pages.length; i++) {
    var page = cfg.pages[i];
    if (page.path) {
      page.outputDir = path.join(cfg.contentsDir, page.path);
      mkdirp.sync(page.outputDir);
    } else {
      page.outputDir = cfg.contentsDir;
    }
    if (page.id) {
      if (page.search && !searchs.hasOwnProperty(page.id)) {
        searchs[page.id] = page;
      }
      if (page.sitemap && !sitemap.hasOwnProperty(page.id)) {
        sitemap[page.id] = page;
      }
      createPage(cfg, page);
    } else {
      var contents = filterContents(page.filter);
      console.log('createContent ' + contents.length);
      for (var c = 0; c < contents.length; c++) {
        var id = contents[c].id;
        if (page.search && !searchs.hasOwnProperty(id)) {
          searchs[id] = contents[c];
        }
        if (page.sitemap && !sitemap.hasOwnProperty(id)) {
          sitemap[id] = contents[c];
          sitemap[id].path = page.path;
        }
        createPage(cfg, page, contents[c]);
      }
    }
  }
  createSitemap(cfg, sitemap);
  createSearch(cfg, searchs);

  if (cfg.postCreateContents) {
    cfg.postCreateContents(cfg, APP.contents);
  }

  console.log('createContent');
  cb();
}

function contentPath(media, asset) {
  for (var i = 0; i < asset.contents.length; i++) {
    if (asset.contents[i].media == media) {
      return asset.contents[i].path;
    }
  }
}

function videoResolutions(vres, asset) {
  //console.log('videoResolutions');
  var videos = {};
  for (var res in vres) {
    if (vres.hasOwnProperty(res)) {
      for (var fmt in vres[res]) {
        if (vres[res].hasOwnProperty(fmt)) {
          for (var i = 0; i < asset.contents.length; i++) {
            if (asset.contents[i].media == vres[res][fmt]) {
              if (!videos.hasOwnProperty(res)) {
                videos[res] = {};
              }
              videos[res][fmt] = asset.contents[i].path;
            }
          }
        }
      }
    }
  }
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
