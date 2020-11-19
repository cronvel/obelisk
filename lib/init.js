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
const fsKit = require( 'fs-kit' ) ;
const Promise = require( 'seventh' ) ;

//const tree = require( 'tree-kit' ) ;
const kungFig = require( 'kung-fig' ) ;
const Babel = require( 'babel-tower' ) ;
const babel = new Babel() ;
babel.extendLocale( { undefinedString: '' } ) ;

const string = require( 'string-kit' ) ;
const term = require( 'terminal-kit' ).terminal ;
const inputFieldAsync = Promise.promisify( term.inputField , term ) ;
const yesOrNoAsync = Promise.promisify( term.yesOrNo , term ) ;

//function noop() {}

const packageDir = path.dirname( __dirname ) ;
const predefDir = packageDir + '/predef' ;

const obelisk = require( './obelisk.js' ) ;



/*
	options:
		* base: base directory, default to CWD
*/
async function init( options ) {
	var dirMode = 0o777 , fileMode = 0o644 ;

	// Turn the base path into an absolute path
	if ( ! path.isAbsolute( options.base ) ) {
		options.base = await fs.realpath( options.base ) ;
	}

	if ( ! await fsKit.isEmptyDir( options.base ) ) {
		term.brightRed.bold( "\n** This directory is not empty! **\n\n" ) ;
		return ;
	}

	if ( ! options.predef ) { options.predef = 'default' ; }

	try {
		var mainKfgContent = await fs.readFile( path.join( predefDir , options.predef , 'main.kfg' ) , 'utf8' ) ;

		// Those files does not need to be replicated by predef
		var localTargetKfgContent = await fs.readFile( path.join( predefDir , 'default/local.target.kfg' ) , 'utf8' ) ;
		var onlineTargetKfgContent = await fs.readFile( path.join( predefDir , 'default/online.target.kfg' ) , 'utf8' ) ;
	}
	catch ( error ) {
		term( "\n^R^+The^ ^/%s^ ^R^+predef does not exist!^:\n" , options.predef ) ;
		await init.printAvailablePredef() ;
		process.exit() ;
	}

	init.ctrlC() ;


	term( "\n^C^+-= Interactive setup: site template =-^:\n\n" ) ;
	mainKfgContent = await init.interactiveTemplateRenderer( mainKfgContent ) ;

	term( "\n^C^+-= Interactive setup: local machine publish =-^:\n\n" ) ;
	localTargetKfgContent = await init.interactiveTemplateRenderer( localTargetKfgContent ) ;

	term( "\n^C^+-= Interactive setup: online machine publish =-^:\n\n" ) ;
	onlineTargetKfgContent = await init.interactiveTemplateRenderer( onlineTargetKfgContent ) ;


	// Ask the user if everything is ok before starting creating things for real
	term( "\nAre those information ok? [^+^_Y^:es|^+^_N^:o] " ) ;

	if ( ! await yesOrNoAsync() ) {
		term.brightYellow( "\nAborting...\n" ) ;
		process.exit() ;
	}

	term( "\n\n" ) ;


	// Create directories
	await fsKit.ensurePath( options.base + '/conf' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/authors' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/content' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/errors' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/css' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/js' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/media' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/site' , dirMode ) ;
	await fsKit.ensurePath( options.base + '/templates' , dirMode ) ;

	// Write the main config and targets
	await fs.writeFile( options.base + '/main.kfg' , mainKfgContent , { mode: fileMode } ) ;
	await fs.writeFile( options.base + '/local.target.kfg' , localTargetKfgContent , { mode: fileMode } ) ;
	await fs.writeFile( options.base + '/online.target.kfg' , onlineTargetKfgContent , { mode: fileMode } ) ;

	await init.tryCopyPredefOrDefault( options , '/errors/404.md' ) ;
	await init.tryCopyPredefOrDefault( options , '/authors/404.error.md' ) ;
	await init.tryCopyPredefOrDefault( options , '/content/index.md' ) ;
	await init.tryCopyPredefOrDefault( options , '/content/first-article.md' ) ;
	await init.tryCopyPredefOrDefault( options , '/content/second-article.md' ) ;
	await init.tryCopyPredefOrDefault( options , '/content/third-article.md' ) ;
	await init.tryCopyPredefOrDefault( options , '/css/main.css' ) ;

	await obelisk.build( { base: options.base } ) ;

	term( "\n^Y^+Congratulation! Your^ ^M^+^/Obelisk^ ^Y^+project has been successfully created!^:\n\n" ) ;
}

module.exports = init ;



init.interactiveTemplateRenderer = async function( template ) {
	var templateData = {} ,
		keys = Babel.getNamedVars( template ) ;

	await Promise.forEach( keys , async( key ) => {
		term.bold( "%s: " , key.replace( /-/g , ' ' ) ) ;
		var value = await inputFieldAsync() ;

		// Useless, inputField() cannot return a string with \n
		//if ( isKfg ) { value = value.replace( /\n/gm , '<br />' ) ; }

		templateData[ key ] = value || undefined ;
		term( "\n" ) ;
	} ) ;

	return babel.render( template , templateData ) ;
} ;



init.tryCopyPredefOrDefault = async function( options , target ) {
	try {
		// Try copying a specific index.md, or fallback to the default one...
		await fsKit.copy( path.join( predefDir , options.predef , target ) , options.base + target ) ;
	}
	catch ( error ) {
		await fsKit.copy( path.join( predefDir , 'default' , target ) , options.base + target ) ;
	}
} ;



init.printAvailablePredef = async function() {
	term.yellow( "Available predef are:\n" ) ;

	var files = await fsKit.readdir( predefDir , { files: true } ) ;

	term( "%s\n" , files.join( ' ' ) ) ;
} ;



// Permit the user to exit (term.grabInput() can prevent this, if CTRL-C is not listened)
init.ctrlC = function() {
	term.grabInput() ;
	term.on( 'key' , key => {
		if ( key === 'CTRL_C' ) {
			term.green( "\nCTRL-C detected\n" ) ;
			process.exit() ;
		}
	} ) ;
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

