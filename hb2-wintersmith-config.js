var _ = require('underscore');

module.exports = {
  account: 'ramonareces',
  site: 'www',
  dbcon: 'mongodb://127.0.0.1:27017/ramonareces',
  output: 'tmp',
//  assetProps: ['id', 'type', 'title', 'description', 'splash', 'tags', 'categories', 'contents','values'],
//  playlistProps: ['id', 'type', 'title', 'description', 'splash', 'values', 'parent', 'children', 'created', 'updated', 'version', 'assets'],
  playlistChildProps: ['id', 'type', 'title', 'description', 'splash'],
  playlistAssetProps: ['id', 'type', 'title', 'description', 'splash'],
  pages: [
    {
      filter: {
        ids: ['index']
      },
      template: 'watch.jade',
      path: '/'
    },
    {
      sitemap: true,
      search: true,
      fp4: true,
      template: 'watch.jade',
      path: '/watch'
    },
    {
      template: 'embed.jade',
      path: '/embed'
    },
    {
      filter: {
        ids: ['index']
      },
      template: 'embebido-watch.jade',
      path: '/embebido'
    },
    {
      template: 'embebido-watch.jade',
      path: '/embebido/watch'
    }
  ],
  media: 'mp4-base-360p',
  cfgProps: ['resolution', 'vres'],
  resolution: '360p', // for sitemap video:content_loc, facebook video/mp4 and twitter:player:stream ,
  vres: {
    '360p': {
      'mp4': 'mp4-base-360p'
    },
    '480p': {
      'mp4': 'mp4-main-480p'
    }
  },
  ssl: 'https://www-ramonareces-hb.stratusmedia.io',
  cdn: 'https://dyyzh7ucyaj7e.cloudfront.net/',
  repo: 'https://s3-eu-west-1.amazonaws.com/repo.hb.stratusmedia.io/',
  rtmp: 'rtmp://rtmp.hb.stratusmedia.io/cfx/st',
  fb: {
    app_id: '1602119370014329'
  },
  twitter: {
    site: '@FundacionAreces',
    creator: '@FundacionAreces'
  },
  fp5Key: '$466654415438793, $554375918340970',
  fp4Key: ['#@0b3272bb43eff43967a', '#@ccd0cf31ec1448e3606', '#$45d948e2d74d428c2cf'],
  fp4url: 'https://static-hb.stratusmedia.io/public/players/flowplayer/swf/flowplayer.commercial.swf',
  fp4RtmpUrl: 'http://dyyzh7ucyaj7e.cloudfront.net/public/players/flowplayer/swf/flowplayer.rtmp.swf',
  fp4BwcheckUrl: 'http://dyyzh7ucyaj7e.cloudfront.net/public/players/flowplayer/swf/flowplayer.bwcheck.swf',

  beforeCreateContents: function (cfg, contents) {
    //console.log('beforeCreateContents');
    contents.index.assets = contents.entrevistas.assets;
  },

  jsonFn: function (cfg, json, contents) {
    //console.log('jsonFn');
    var breadcrumbs = [];
    if (json.type == 'P') {
      breadcrumbs.push(_.union(json.parents, [json.id]));
    } else {
      breadcrumbs = _.map(json.playlists, function (pid) {
        var playlist = contents[pid];
        return _.union(playlist.parents, [playlist.id, json.id]);
      });
    }
    json.breadcrumbs = _.map(breadcrumbs, function (ids) {
      return _.map(ids, function (id) {
        return _.pick(contents[id], ['id', 'title']);
      });
    });
    return json;
  },

  beforeWritePageFn: function (cfg, page, contents) {
    //console.log('beforeWritePageFn');
    if (page.type == 'P') {
      page.items = (page.id == 'index') ? page.children : _.union(page.children, page.assets);
    } else {
      if (!_.isEmpty(page.playlists)) {
        var playlist = contents[page.playlists[0]];
        page.items = _.union(playlist.children, playlist.assets);
      }
    }
    return page;
  }

};