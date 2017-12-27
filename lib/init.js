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
var fsKit = require( 'fs-kit' ) ;
var Promise = require( 'seventh' ) ;

//var tree = require( 'tree-kit' ) ;
var kungFig = require( 'kung-fig' ) ;
var Babel = require( 'babel-tower' ) ;

var string = require( 'string-kit' ) ;
var term = require( 'terminal-kit' ).terminal ;

//function noop() {}

var packageDir = path.dirname( __dirname ) ;



/*
	options:
		* base: base directory, default to CWD
*/
async function init( options ) {
	var dirMode = 0o777 , fileMode = 0o644 ;

	// Turn the base path into an absolute path
	if ( ! path.isAbsolute( options.base ) ) {
		options.base = await fs.realpathAsync( options.base ) ;
	}
	
	if ( ! await fsKit.isEmptyDirAsync( options.base ) ) {
		term.brightRed.bold( "\n** This directory is not empty! **\n\n" ) ;
		return ;
	}
	
	if ( ! options.predef ) { options.predef = 'default' ; }
	
	var mainKfgContent = await fs.readFileAsync( packageDir + '/predef/' + options.predef + '.kfg' ) ;

	// Create directories
	await fsKit.ensurePathAsync( options.base + '/conf' , dirMode ) ;
	await fsKit.ensurePathAsync( options.base + '/content' , dirMode ) ;
	await fsKit.ensurePathAsync( options.base + '/css' , dirMode ) ;
	await fsKit.ensurePathAsync( options.base + '/media' , dirMode ) ;
	await fsKit.ensurePathAsync( options.base + '/site' , dirMode ) ;
	await fsKit.ensurePathAsync( options.base + '/templates' , dirMode ) ;
	
	mainKfgContent = await init.interactiveMainSetup( mainKfgContent ) ;
	
	await fs.writeFileAsync( options.base + '/main.kfg' , mainKfgContent , { mode: fileMode } ) ;

}

module.exports = init ;



init.interactiveMainSetup = async function interactiveMainSetup( mainKfgContent ) {
	return mainKfgContent ;
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


