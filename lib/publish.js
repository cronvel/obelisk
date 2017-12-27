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

"use strict" ;



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

	if ( options.build || options.watch ) {
		await obelisk.build( { base: options.base } ) ;
	}

	await publish.rsync( config ) ;

	if ( options.watch ) {
		await publish.watch( config , options ) ;
	}
}

module.exports = publish ;

var obelisk = require( './obelisk.js' ) ;



publish.loadConfig = function loadConfig( options ) {
	// Defaults
	var config = {
		local: false ,
		host: 'example.com' ,
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


	// IMPORTANT: don't forget to add a final slash, so rsync does not create an extra subdirectory
	var from = config.localRoot + '/' ;
	var to = config.path ;

	if ( ! config.local ) {
		to = config.host + ':' + to ;
	}

	return publish.execCommand( 'rsync' , [
		'-a' ,					// archive mode (preserve permissions, symlinks, and more...)
		'-v' ,					// verbose
		'-z' ,					// compress
		'--omit-dir-times' ,	// omit directories from --times
		//'--omit-link-times' ,	// omit symlinks from --times, cool but does not work on all server
		'--checksum' ,			// use checksum instead of time and size to detect changes
		'--cvs-exclude' ,		// exclude files like .git, .svn, .o, .so, etc...
		'-hh' ,					// human readable, level 2
		//'--stats' ,				// show stats of the delta transfer
		'--delete' ,			// delete files when needed
		'--force' ,				// delete dir even if not empty

		from ,
		to
	] ) ;
} ;



// It returns a Promise.
// Maybe we should move that to a separated file...
publish.execCommand = function execCommand( command , options ) {

	var triggered = false ,
		promise = new Promise() ;

	var triggerCallback = status => {
		var error ;

		if ( triggered ) { return ; }
		triggered = true ;

		if ( status ) {
			//error = new Error( "Non-zero exit code: '" + status + "' for command '" + command + "'." ) ;
			error = new Error( "Non-zero exit code: '" + status + "' for command '" + command + ' ' + options.join( ' ' ) + "'." ) ;
			error.code = 'nonZeroExit' ;
			term( "^GCommand^ ^b^/%s^ ^R^+failed^:\n" , command ) ;
		}
		else {
			term( "^GCommand^ ^b^/%s^ ^G^+succeeded^:\n" , command ) ;
		}

		if ( error ) { promise.reject( error ) ; }
		else { promise.resolve() ; }
	} ;

	var onceExit = status => {
		//console.log( 'EXIT:' , status ) ;

		process.stdin.removeListener( 'data' , onStdin ) ;

		// For some reason, 'exit' can be triggered before some 'data' event, so we have to delay removeListener() a bit
		setTimeout( () => {

			child.stdout.removeListener( 'data' , onStdout ) ;
			child.stderr.removeListener( 'data' , onStderr ) ;
			triggerCallback( status ) ;

		} , 0 ) ;
	} ;

	// ignore some errors
	var onIgnoredError = function() {} ;

	var onStdin = function( chunk ) {
		// Send the process stdin to the command's stdin
		child.stdin.write( chunk ) ;
	} ;

	var onStdout = chunk => {
		// Send the command's stdout to the process stdout and the output file
		process.stdout.write( chunk ) ;
	} ;

	var onStderr = chunk => {
		// Send the command's stderr to the process stderr and the output file
		process.stderr.write( chunk ) ;
	} ;

	term( "^GStarting^ ^b^/%s^:\n" , command ) ;

	var child = execFile( command , options ) ;

	child.on( 'error' , triggerCallback ) ;

	// Prevent message sent to command that ignore them, then emit ECONNRESET when finished
	// WE MUST USE IT if process.stdin is redirected to child.stdin
	child.stdin.on( 'error' , onIgnoredError ) ;

	process.stdin.on( 'data' , onStdin ) ;
	child.stdout.on( 'data' , onStdout ) ;
	child.stderr.on( 'data' , onStderr ) ;

	child.once( 'exit' , onceExit ) ;

	return promise ;
} ;



publish.watch = function watch( config , options ) {
	var chokidar = require( 'chokidar' ) ;

	var promise = new Promise() ;

	term( '^GStarting file watcher...\n' ) ;

	var onError = error => {
		term.red( "File watcher error: %E\n" , error ) ;
	} ;

	var onChange = async( event , path ) => {
		term( "^GChange detected^ (%s on %s)\n" , event , path ) ;
		try {
			await publishAgain() ;
		}
		catch ( error ) {
			promise.reject( error ) ;
		}
	} ;

	var publishAgain = Promise.debounceUpdate( async() => {
		var date = new Date() ;

		term( '\n^Y-- Building and publishing again^ ^K[%s]^ ^Y--\n' ,
			( '0' + date.getHours() ).slice( -2 ) + ':' + ( '0' + date.getMinutes() ).slice( -2 ) + ':' + ( '0' + date.getSeconds() ).slice( -2 )
		) ;

		await obelisk.build( { base: options.base } ) ;
		await publish.rsync( config ) ;

		term( '^Y-- Done --\n\n' ) ;
	} ) ;

	var watcher = chokidar.watch( options.base , {
		ignoreInitial: true ,
		ignored: [
			options.base + '/site' ,
			options.base + '/conf'
		]
	} ) ;

	watcher.on( 'error' , onError ) ;
	watcher.on( 'all' , onChange ) ;

	//await publish.rsync( config ) ;

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


