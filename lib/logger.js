var moment 	= require('moment');

module.exports = function(config) {
	this.config = config;

	this.log = function() {
		if(this.config && this.config.debug) {
			console.log(moment(new Date()).format('[[]MMM DD HH:mm:ss:SSS[]]'),arguments);
		}
	}

};