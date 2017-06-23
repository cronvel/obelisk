/*
	Static Blog
	
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
var seventh = require( 'seventh' ) ;
var Promise = seventh.Promise ;

seventh.promisifyNodeApi( fs ) ;
seventh.promisifyNodeApi( fsKit ) ;
var globAsync = seventh.promisifyNodeFnOne( require( 'glob' ) ) ;

var kungFig = require( 'kung-fig' ) ;
var markdownKit = require( 'markdown-kit' ) ;
var Babel = require( 'babel-tower' ) ;

var term = require( 'terminal-kit' ).terminal ;



const staticBlog = {} ;
module.exports = staticBlog ;



staticBlog.cli = function cli()
{
	var args = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	
	args.base = args.base || args._[ 0 ] || process.cwd() ;
	
	staticBlog.generate( args ) ;
} ;



staticBlog.generate = async function generate( options )
{
	var config , dirMode = 0o777 , templateCache = {} ,
		markdownKitCssDir = __dirname + '/../node_modules/markdown-kit/css' ;
	
	if ( ! path.isAbsolute( options.base ) )
	{
		options.base = await fs.realpathAsync( options.base ) ;
	}
	
	try {
		config = await fs.readFileAsync( options.base + '/site/main.kfg' ) ;
		config = kungFig.parse( config ) ;
	}
	catch ( error ) {
		// This is not an error
		config = {} ;
	}
	
	// First, delete all the /site subtree
	await fsKit.deltreeAsync( options.base + '/site/*' ) ;
	
	// Copy default CSS
	var cssDir = options.base + '/site/css' ;
	await fsKit.ensurePath( cssDir , dirMode ) ;
	
	//await fsKit.copyAsync( markdownKitCssDir + '/standalone.css' , cssDir + '/markdown-kit-standalone.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/markdown.css' , cssDir + '/default-markdown.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/highlight.css' , cssDir + '/default-highlight.css' ) ;
	
	// Get all sources path
	var sources = await globAsync( 'content/**/*.md' , { cwd : options.base } ) ;
	
	// Generate all pages
	await Promise.forEach( sources , async ( relSource ) => {
		var source = options.base + '/' + relSource ;
		
		var relTarget = relSource.replace( /^content\// , 'site/' ).replace( /\.md$/ , '.html' ) ;
		var target = options.base + '/' + relTarget ;
		var targetDir = path.dirname( target ) ;
		
		await fsKit.ensurePath( targetDir , dirMode ) ;
		
		// Get the file, extract the header and the content
		var [ header , content ] = staticBlog.parseSource( config , await fs.readFileAsync( source , 'utf8' ) ) ;
		
		content = markdownKit.generateFragment( { markdown: content } ) ;
		
		// Apply the template
		//console.log( 'header:' , header ) ;
		content = await staticBlog.applyTemplate( config , header , content , templateCache ) ;
		
		await fs.writeFileAsync( target , content ) ;
		
		term( '^GWrote^ ^/^b%s^:\n' , relTarget ) ;
	} ) ;
} ;



staticBlog.parseSource = function parseSource( config , content )
{
	var header ;
	var parts = content.split( /^-(?:\+-)+ *$/m ) ;
	//console.log( 'parts:' , parts ) ;
	
	if ( parts.length <= 1 )
	{
		header = Object.assign( {} , config.header ) ;
	}
	else
	{
		header = Object.assign( {} , config.header , kungFig.parse( parts[ 0 ] ) ) ;
		content = parts[ 1 ] ;
	}
	
	if ( ! header.template ) { header.template = __dirname + '/../templates/default.html' ; }
	//console.log( 'one' , header ) ;
	
	return [ header , content ] ;
} ;



staticBlog.applyTemplate = async function applyTemplate( config , header , content , templateCache )
{
	var templatePath = header.template ;
	var template = templateCache[ header.template ] ;
	
	if ( ! template )
	{
		//console.log( templatePath ) ;
		if ( ! path.isAbsolute( templatePath ) )
		{
			templatePath = await fs.realpathAsync( templatePath ) ;
		}
		
		template = await fs.readFileAsync( templatePath , 'utf8' ) ;
		templateCache[ header.template ] = template ;
	}
	
	var babel = Babel.create() ;
	babel.undefinedString = '' ;
	
	var data = Object.assign( {} , header ) ;
	
	data.content = content || data.content || '' ;
	
	if ( data.cssLinks )
	{
		if ( ! Array.isArray( data.cssLinks ) ) { data.cssLinks = [ data.cssLinks ] ; }
		data.cssLinks = data.cssLinks.map( link => '<link rel="stylesheet" href="' + link + '"/>' ).join( '\n' ) ;
	}
	
	return babel.solve( template , data ) ;
} ;


