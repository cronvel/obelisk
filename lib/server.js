/*
	Obelisk

	Copyright (c) 2017 - 2020 Cédric Ronvel

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



const path = require( 'path' ) ;
const fs = require( 'fs' ).promises ;
const Promise = require( 'seventh' ) ;

const serverKit = require( 'server-kit' ) ;
const Router = serverKit.Router ;
const FileRouter = serverKit.FileRouter ;
const File = serverKit.File ;

const string = require( 'string-kit' ) ;
const term = require( 'terminal-kit' ).terminal ;

function noop() {}



/*
	options:
		* base: base directory, default to CWD
*/
async function server( options ) {
	var promise = new Promise() ;

	if ( ! path.isAbsolute( options.base ) ) {
		options.base = await fs.realpath( options.base ) ;
	}

	if ( options.build || options.watch ) {
		await obelisk.build( { base: options.base } ) ;
	}

	server.start( options ) ;

	if ( options.watch ) {
		await server.watch( options ) ;
	}

	return promise ;
}

module.exports = server ;

const obelisk = require( './obelisk.js' ) ;



server.help = function() {
	term( "^bUsage is: ^cobelisk server [<options>]\n\n" ) ;
	term( "^bAvailable options:\n" ) ;
	term( "^KNone\n" ) ;

	term( "\n" ) ;
} ;



server.start = function( options ) {
	// Set the port, get it from command line if necessary
	var port = options.port || 8080 ;

	var router = new Router( {
		//"^": [ new CorsMiddleware() ] ,
		//"/": new File( options.base + '/site/index.html' ) ,
		".": new FileRouter( options.base + '/site' , {
			directoryIndex: true ,
			autoExtension: 'html'
		} ) ,
		"!!": {
			notFound: client => {
				var body = "<h1>Wrong URL!</h1>" ;

				try {
					client.response.writeHead( 404 , "Wrong URL!" ) ;
				}
				catch ( error ) {}

				try {
					client.response.end( body ) ;
				}
				catch ( error ) {}
			}
		}
	} ) ;

	serverKit.createServer( {
		port , http: true , verbose: true , catchErrors: false
	} , router ) ;
} ;



server.watch = function( options ) {
	return obelisk.build.watch( options ) ;
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

