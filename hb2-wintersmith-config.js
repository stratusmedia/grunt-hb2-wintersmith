module.exports = {
  account: 'ramonareces',
  site: 'www',
  dbcon: 'mongodb://127.0.0.1:27017/ramonareces',
  output: 'tmp',
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
      json: true,
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
  media: 'mp4-base-360p', // for sitemap video:content_loc, facebook video/mp4 and twitter:player:stream ,
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

  preCreateContents: function (cfg, contents) {
    console.log('preCreateContents');
    contents.index.assets = contents.entrevistas.assets;
  }
};