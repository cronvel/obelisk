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
/*
var fs = require( 'fs' ) ;
var fsKit = require( 'fs-kit' ) ;
*/
var path = require( 'path' ) ;
var Promise = require( 'seventh' ) ;

/*
var globAsync = Promise.promisify( require( 'glob' ) ) ;

//var tree = require( 'tree-kit' ) ;
var kungFig = require( 'kung-fig' ) ;
var markdownKit = require( 'markdown-kit' ) ;
var Babel = require( 'babel-tower' ) ;

var moment = require( 'moment' ) ;
var string = require( 'string-kit' ) ;
*/

var term = require( 'terminal-kit' ).terminal ;

//function noop() {}

var packageDir = path.dirname( __dirname ) ;

var obelisk = require( './obelisk.js' ) ;



module.exports = function cli() {
	var args = require( 'minimist' )( process.argv.slice( 2 ) ) ;

	args.base = args.base || args._[ 0 ] || process.cwd() ;

	delete args._ ;

	obelisk.build.generate( args )
	.catch( error => term( string.inspectError( { style: 'color' } , error ) + '\n' ) ) ;
} ;


