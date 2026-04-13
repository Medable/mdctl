/***********************************************************

@script		Dev Tools - Get Objects

@brief		This script is created by Medable Dev Tools for Atom

@version	0.0.0	Medable.TRS
	Released

(c)2016 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
***********************************************************/

var request = require('request'),
    options = {skipAcl: true, grant: 7, limit: 1000};
options.paths = request.query.paths;
return require('wrapped')(request.params.element, options).find();