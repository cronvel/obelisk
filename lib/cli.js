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
const Promise = require( 'seventh' ) ;
const string = require( 'string-kit' ) ;
const term = require( 'terminal-kit' ).terminal ;

const packageDir = path.dirname( __dirname ) ;
const obeliskPackage = require( '../package.json' ) ;

const obelisk = require( './obelisk.js' ) ;



module.exports = function cli() {
	var args = require( 'minimist' )( process.argv.slice( 2 ) ) ;

	var sequentialArgs = args._ ;
	delete args._ ;

	args.command = sequentialArgs[ 0 ] ;

	//args.base = args.base || sequentialArgs[ 1 ] || process.cwd() ;
	args.base = args.base || process.cwd() ;

	// Intro
	term.bold.magenta( 'Obelisk' ).dim( ' v%s by Cédric Ronvel\n' , obeliskPackage.version ) ;

	// Because we may have read stdin, and it prevents node from exiting,
	// we need to explicitly process.exit()

	switch ( args.command ) {
		case 'init' :
			args.predef = sequentialArgs[ 1 ] ;
			obelisk.init( args )
			.then(
				ok => process.exit() ,
				error => {
					term( string.inspectError( { style: 'color' } , error ) + '\n' ) ;
					process.exit( 1 ) ;
				}
			) ;
			break ;

		case 'build' :
			obelisk.build( args )
			.then(
				ok => process.exit() ,
				error => {
					term( string.inspectError( { style: 'color' } , error ) + '\n' ) ;
					process.exit( 1 ) ;
				}
			) ;
			break ;

		case 'pub' :
		case 'publish' :
			args.target = sequentialArgs[ 1 ] ;
			obelisk.publish( args )
			.then(
				ok => process.exit() ,
				error => {
					term( string.inspectError( { style: 'color' } , error ) + '\n' ) ;
					process.exit( 1 ) ;
				}
			) ;
			break ;

		case 'live' :
		case 'rt' :
		case 'realtime' :
			args.target = sequentialArgs[ 1 ] ;
			args.watch = true ;
			obelisk.publish( args )
			.then(
				ok => process.exit() ,
				error => {
					term( string.inspectError( { style: 'color' } , error ) + '\n' ) ;
					process.exit( 1 ) ;
				}
			) ;
			break ;

		case 'help' :
		default :
			usage() ;
			process.exit() ;
			break ;
	}
} ;



function usage() {
	term( "\n^m^+Obelisk^ ^-is a static website generator and publisher for blog.\n\n" ) ;

	term( "^bUsage is: ^cobelisk <command> [<args>]\n\n" ) ;
	term( "^bAvailable commands:\n" ) ;
	term( "^b  init [<predef>]            init an obelisk project, the predef name is optional\n" ) ;
	term( "^b  build [<path>]             build the static site from content\n" ) ;
	term( "^b  publish <target>           publish to the target (a file <target>.target.kfg should exist)\n" ) ;
	term( "^b  live <target>              like 'publish' with the '--watch' option\n" ) ;

	term( "\n" ) ;
}


