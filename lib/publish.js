/*
	Obelisk

	Copyright (c) 2017 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/





// Load modules
var path = require( 'path' ) ;
var fs = require( 'fs' ) ;
//var fsKit = require( 'fs-kit' ) ;
var execFile = require( 'child_process' ).execFile ;
var Promise = require( 'seventh' ) ;

//var tree = require( 'tree-kit' ) ;
var kungFig = require( 'kung-fig' ) ;

var string = require( 'string-kit' ) ;
var term = require( 'terminal-kit' ).terminal ;



/*
	options:
		* base: base directory, default to CWD
*/
async function publish( options ) {
	// Turn the base path into an absolute path
	if ( ! path.isAbsolute( options.base ) ) {
		options.base = await fs.realpathAsync( options.base ) ;
	}

	if ( ! options.target ) {
		publish.help() ;
		return ;
	}
	
	var config = publish.loadConfig( options ) ;

	await publish.rsync( config ) ;
}

module.exports = publish ;



publish.loadConfig = function loadConfig( options ) {
	// Defaults
	var config = {
		local: false ,
		path: '/srv'
	} ;

	var configPath = options.base + '/' + options.target + '.target.kfg' ;

	try {
		fs.accessSync( configPath ) ;
	}
	catch ( error ) {
		throw new Error( "Target '" + options.target + "' not found: " + error.message ) ;
	}

	// Load the KFG config, and let it crash
	config = Object.assign( config , kungFig.load( options.base + '/' + options.target + '.target.kfg' ) ) ;

	// Forced values
	config.localRoot = options.base + '/site' ;
	config.options = options ;

	return config ;
} ;



publish.rsync = function rsync( config ) {
	
	var triggered = false ,
		promise = new Promise() ;
	
	var triggerCallback = status => {
		var error ;
		
		if ( triggered ) { return ; }
		triggered = true ;
		
		if ( status )
		{
			error = new Error( "Non-zero exit code: '" + status + "'." ) ;
			error.code = 'nonZeroExit' ;
		}
		
		if ( error ) { promise.reject( error ) ; }
		else { promise.resolve() ; }
	} ;
	
	var onceExit = status => {
		//console.log( 'EXIT:' , status ) ;
		
		// For some reason, 'exit' can be triggered before some 'data' event, so we have to delay removeListener() a bit
		setTimeout( () => {
			
			child.stdout.removeListener( 'data' , onStdout ) ;
			child.stderr.removeListener( 'data' , onStderr ) ;
			triggerCallback( status ) ;
			
		} , 0 ) ;
	} ;
	
	var onStdout = chunk => {
		// Send the command's stdout to the process stdout and the output file
		process.stdout.write( chunk ) ;
	} ;
	
	var onStderr = chunk => {
		// Send the command's stderr to the process stderr and the output file
		process.stderr.write( chunk ) ;
	} ;
	
	var child = execFile( 'rsync' , [ '-av' /*, '--delete'*/ , config.localRoot , '/tmp/bob' ] ) ;
	
	child.on( 'error' , triggerCallback ) ;
	
	child.stdout.on( 'data' , onStdout ) ;
	child.stderr.on( 'data' , onStderr ) ;
	
	child.once( 'exit' , onceExit ) ;
	
	return promise ;
} ;



publish.help = function help() {
	term( "^bUsage is: ^cobelisk publish <target> [<options>]\n\n" ) ;
	term( "^bAvailable options:\n" ) ;
	term( "^KNone\n" ) ;

	term( "\n" ) ;
} ;



// Utility to debug things
/* eslint-disable no-unused-vars */
function deb( ... args ) {
	var log , value ;

	if ( args.length >= 2 ) {
		[ log , value ] = args ;
	}
	else {
		log = 'DEBUG:' ;
		value = args[ 0 ] ;
	}

	console.log( log , string.inspect( { style: 'color' , depth: 5 } , value ) ) ;
}
/* eslint-disable no-unused-vars */


