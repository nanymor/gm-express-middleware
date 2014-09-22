gm-express-middleware
=====================

## - WIP
Image resize/cropping middleware for Express 

	...
	var gem = require('gm-express-middleware');
	...
	var imgconfig = {
		rootDir: __dirname + '/public/assets/img/',
		cacheDir: __dirname + '/tmp/',
		debug: false,
		recipes: [
				{
					pattern: '/square/',
					value: '/2/300/300/1/0/5/'
				},
				{
					pattern: '/thumb/100v/',
					value: '/2/100/100/0/1/5/'
				},
				{
					pattern: '/thumb/200/',
					value: '/2/200/200/0/1/5/'
				},
				{
					pattern: '/thumb/',
					value: '/2/50/50/0/1/5/'
				}
			]
		};

	app.use(gem(imgconfig));