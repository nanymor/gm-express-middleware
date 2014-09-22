var gm		= require('gm'),
	moment 	= require('moment'),
	merge	= require('merge'),
	mkdirp	= require('mkdirp'),
	fs		= require('fs'),
	Logger	= require("./lib/logger");


module.exports = function(options) { 
	var settings = {
		cacheDir: '/tmp/',
		trigger: '/image/',
		allowedExtensions: ['jpg','png','gif'],
		recipes: [],
		quality: 1,
		debug: false
	};

	if (!options.rootDir) {	throw new Error('root folder is not defined'); }

	settings = merge(settings,options);

	var console = new Logger(settings);

	var _calculateCropSize = function(job,imgsize) {
		var result = {};
		var iw = imgsize.width;
		var ih = imgsize.height;
		var cw = (job.cw <= 1)?(iw *job.cw):job.cw;
		var ch = (job.ch <= 1)?(ih *job.ch):job.ch;
		var origRatio = iw/ih;
		var requestedRatio = null;

		console.log('job.cw',job.cw);

		//forced crop, constrained h: either cw or ch needs to be zeroed
		if (job.cw === '0' && (job.w > 0 && job.h > 0)) {
			console.log('forced crop, h constrain');
			var requestedRatio = (job.w/job.h);

			if (origRatio > requestedRatio) { 
				ch = Math.min(ch,ih);
				cw = ch*(job.w/job.h);
			} else {
				cw = iw;
				ch = cw*(job.h/job.w);
			}

		}

		//forced crop, constrained w: either cw or ch needs to be zeroed
		if (job.ch === '0' && (job.w > 0 && job.h > 0)) {
			console.log('forced crop, w constrain');
			var requestedRatio = (job.w/job.h);

			if (origRatio > requestedRatio) { 
				ch = ih;
				cw = ch*(job.w/job.h);
			} else {
				cw = Math.min(cw,iw);
				ch = cw*(job.h/job.w);
			}

		}

		console.log('adjusted w :',cw,ch);
		console.log('calculate',iw,ih,cw,ch);

		switch (job.co) {
			case '1': //top left
				result.x = 0;
				result.y = 0;
				break;

			case '2': //top
				result.x = (iw/2) - (cw/2);
				result.y = 0;
				break;

			case '3': //top right
				result.x = iw - cw;
				result.y = 0;
				break;

			case '4': //center left
				result.x = 0;
				result.y = (ih/2) - (ch/2);
				break;

			case '5': //center center
				result.x = (iw/2) - (cw/2);
				result.y = (ih/2) - (ch/2);
				break;

			case '6': //center right
				result.x = iw - iw - cw;
				result.y = (ih/2) - (ch/2);

			case '7': //bottom left
				result.x = 0;
				result.y = ih - ch;
				break;

			case '8': //bottom center
				result.x = (iw/2) - (cw/2);
				result.y = ih - ch;
				break;

			case '9': //bottom right
				result.x = iw - cw;
				result.y = ih - ch;
		}

		result.cw = cw;
		result.ch = ch;

		return result;

	}

	//processes a request
	var _process = function(job,callback) {
		console.log('processing this job',job);
		if (!fs.existsSync(settings.cacheDir + job.virtualPath)) {
			mkdirp.sync(settings.cacheDir + job.virtualPath);
		}

		switch (job.mode) {

			//just return image
			case 0:
				callback(null,{ path: job.srcPath });
				break;

			//resize image
			case 1:
				var w = (job.w > 0)?job.w:null;
				var h = (job.h > 0)?job.h:null;
				var opt = (job.w >0 && job.h > 0)?'!':'';
				console.log('generating:',w,h,job.cachePath,'from: ',job.srcPath);
				//create virtualPath if not exists
				gm(job.srcPath)
					.resize(w,h,opt)
					.noProfile()
					.quality(settings.quality)
					.write(job.cachePath,function(err) {
						if (err) {
							console.log('an error occurred while resizing',err);
						}
						callback(null,{ path: job.cachePath });
					})
				break

			case 2:
				gm(job.srcPath).size(function(err, value){
					if (!value) {
						console.log('no image size found');
					}
					var cw = job.cw;
					var ch = job.ch;
					var w = (job.w > 0)?job.w:null;
					var h = (job.h > 0)?job.h:null;
					var opt = (job.w >0 && job.h > 0)?'!':'';
					//caluclate crop region
					var crop = _calculateCropSize(job,value);
					console.log('cropping:',cw,ch,crop.x,crop.y);
					gm(job.srcPath)
					.crop(crop.cw,crop.ch,crop.x,crop.y)
					.resize(w,h,opt)
					.noProfile()
					.quality(settings.quality)
					.write(job.cachePath,function(err) {
						if (err) {
							console.log('an error occurred while cropping',err);
						}
						callback(null,{ path: job.cachePath });
					})

				});

		}


	};

	//check if cache file exists and is fresh
	var _checkCache = function(job) {

		if (!fs.existsSync(job.cachePath) || settings.debug) {
			console.log('cache file does not exist:',job.cachePath);
			return false;
		} else {
			console.log('cache file exists');
			var cachedFile = fs.statSync(job.cachePath);
			var srcFile = fs.statSync(job.srcPath);
			//if cache file was created after the last modified time of src file, it is fresh 
			return (moment.unix(cachedFile.ctime) > moment.unix(srcFile.mtime));
		}

	};

	
	return function (req,res,next) {
		//get original request
		var requestedUrl = req.originalUrl,
		//concateante allowed extensions with |
			extensions = settings.allowedExtensions.join('|'),
		//mode 0 regexp /image/0/]path/to/file.(ext)
			mode0Regexp = new RegExp('^'+settings.trigger+'0\\/([a-z]{1})(.*)\\/.*\\.('+ extensions +')$'),
		//mode 1 match /image/1/w/h/[q (0-100)/]path/to/file.(ext)
			mod1RegExp = new RegExp('^'+settings.trigger+'1\\/([0-9]*\\/){2}([a-z]{1}.*\\.)('+ extensions +')$','i'),
		//mode 2 match /image/2/w/h/cw/ch/co/path/to/file.(ext)
			mod2RegExp = new RegExp('^'+settings.trigger+'2\\/(\\d*\\/){4}([1-9]{1}\\/)([a-z]{1}.*\\.)('+ extensions +')$','i'),
			isTrigger = (requestedUrl.indexOf(settings.trigger) === 0),
			job = {};
		
		//exit if request does not match trigger pattern
		if (!isTrigger) {
			return next();
		} 

		//apply recipe if found >>> /image/recipe/path/to/file.ext
		if (settings.recipes.length) {
			console.log('checking recipes');
			for(var r=0,max=settings.recipes.length; r < max; r++) {
				var recipe = settings.recipes[r];
				console.log('?',requestedUrl.indexOf(recipe.pattern));
				if (requestedUrl.indexOf(recipe.pattern) > 0) {
					console.log('replacing with',recipe.value);
					requestedUrl = requestedUrl.replace(recipe.pattern,recipe.value);
					break;
				}
			}

		}
		console.log('requested URL:',requestedUrl);
		var urlSplit = requestedUrl.split('/');

		//identify requested mode 
		switch (urlSplit[2]) {

			case '0':
				console.log('match 0');
				job.mode = 0;
				job.valid = mode0Regexp.test(requestedUrl);
				job.path = urlSplit.slice(3).join('/');
				break;

			case '1':
				console.log('match 1');
				job.mode = 1;
				job.valid = mod1RegExp.test(requestedUrl);
				job.w = urlSplit[3];
				job.h = urlSplit[4];
				job.path = urlSplit.slice(5).join('/');
				break;

			case '2':
				console.log('match 2',mod2RegExp,mod2RegExp.test(requestedUrl) );
				job.mode = 2;
				job.valid = mod2RegExp.test(requestedUrl);
				job.w = urlSplit[3];
				job.h = urlSplit[4];
				job.cw = urlSplit[5];
				job.ch = urlSplit[6];
				job.co = urlSplit[7]
				job.path = urlSplit.slice(8).join('/');
				break;
				
		}

		if (!job.valid) {
			console.log('request does not match any image mode');
			res.writeHead(500);
			res.end('image url"'+ requestedUrl +'" is not valid');
			return;
		}

		//process request
		job.fileName = urlSplit[urlSplit.length - 1];
		job.virtualPath = urlSplit.slice(3,(urlSplit.length - 1)).join('/') + '/';
		job.srcPath = settings.rootDir + job.path;
		job.cachePath = settings.cacheDir + job.virtualPath + job.fileName;


		if (!fs.existsSync(job.srcPath)) {
			console.log('file does not exist')
			res.writeHead(404);
			res.end('image:"'+ job.path +'" was not found');
			return;
		}

		if (!_checkCache(job)) {
			_process(job,function(err,result) {
				res.sendfile(result.path);
			});
		} else {
			res.sendfile(job.cachePath);
		}

	}


};