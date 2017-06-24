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
var seventh = require( 'seventh' ) ;
var Promise = seventh.Promise ;

seventh.promisifyNodeApi( fs ) ;
seventh.promisifyNodeApi( fsKit ) ;
var globAsync = seventh.promisifyNodeFnOne( require( 'glob' ) ) ;

var kungFig = require( 'kung-fig' ) ;
var markdownKit = require( 'markdown-kit' ) ;
var Babel = require( 'babel-tower' ) ;

var moment = require( 'moment' ) ;
var string = require( 'string-kit' ) ;
var term = require( 'terminal-kit' ).terminal ;



const obelisk = {} ;
module.exports = obelisk ;



obelisk.cli = function cli()
{
	var args = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	
	args.base = args.base || args._[ 0 ] || process.cwd() ;
	
	obelisk.generate( args )
	.catch( error => term( string.inspectError( { style: 'color' } , error ) ) ) ;
} ;



obelisk.generate = async function generate( options )
{
	var config , dirMode = 0o777 , templateCache = {} , pageList = [] , nav = [] ,
		coreCssDir = __dirname + '/../css' ,
		markdownKitCssDir = __dirname + '/../node_modules/markdown-kit/css' ;
	
	// Turn the base path into an absolute path
	if ( ! path.isAbsolute( options.base ) )
	{
		options.base = await fs.realpathAsync( options.base ) ;
	}
	
	// Load the KFG config, if any...
	try {
		config = await fs.readFileAsync( options.base + '/main.kfg' ) ;
		config = kungFig.parse( config ) ;
	}
	catch ( error ) { config = {} ; } // This is not an error
	
	// Load the hooks, if any ...
	try {
		config.hooks = require( options.base + '/hooks.js' ) ;
	}
	catch ( error ) { config.hooks = {} ; } // This is not an error
	
	// Add various default stuff to the config
	config.urlRoot = config.urlRoot || '/' ;
	
	// Add the options to the config, so hook and template engine may have access to it, if needed
	config.options = options ;
	
	// Prepare the build: delete all the /site subtree
	await fsKit.deltreeAsync( options.base + '/site/*' ) ;
	
	// Copy to it the default CSS
	var cssDir = options.base + '/site/css' ;
	await fsKit.ensurePathAsync( cssDir , dirMode ) ;
	
	//await fsKit.copyAsync( markdownKitCssDir + '/standalone.css' , cssDir + '/markdown-kit-standalone.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/markdown.css' , cssDir + '/default-markdown.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/highlight.css' , cssDir + '/default-highlight.css' ) ;
	await fsKit.copyAsync( coreCssDir + '/default.css' , cssDir + '/default-highlight.css' ) ;
	
	// Get all source content paths
	var sources = await globAsync( 'content/**/*.md' , { cwd : options.base } ) ;
	
	// Generate, first pass (load and parse pages)
	var pageList = await Promise.map( sources , async ( relSource ) => {
		var source = options.base + '/' + relSource ;
		
		var relTarget = relSource.replace( /^content\// , 'site/' ).replace( /\.md$/ , '.html' ) ;
		var target = options.base + '/' + relTarget ;
		var targetDir = path.dirname( target ) ;
		var url = relTarget.replace( /^site\// , '/' ) ;
		
		await fsKit.ensurePathAsync( targetDir , dirMode ) ;
		
		// Get the file and parse it
		var parsed = obelisk.parseSource(
			config ,
			await fs.readFileAsync( source , 'utf8' ) ,
			relSource ,
			await fs.statAsync( source )
		) ;
		
		parsed.header.relRoot = obelisk.relativePath( url , '/' ) ;
		
		// Return the current page, without the top-level template applied
		return Object.assign( {} , parsed.header , {
			url: url ,
			target: target ,
			relTarget: relTarget ,
			contentList: parsed.contentList
		} ) ;
	} ) ;
	
	//console.log( string.inspect( { style: 'color' , depth: 5 } , pageList[0] ) ) ;
	
	// Sort items by date
	nav = pageList.filter( e => ! e.noNav ) ;
	nav.sort( ( a , b ) => b._date - a._date ) ;
	
	// Generate, second pass (solve query, construct nav, content and full pages)
	await Promise.all( pageList , async ( data ) => {
		
		// Has query? retrieve the content
		if ( data.query )
		{
			data.contentList = obelisk.query( pageList , data.query ) ;
		}
		
		// Apply the nav templates
		data.nav = await Promise.map( nav , async ( navLinkData ) => {
			navLinkData = Object.assign( {} , navLinkData , {
				title: navLinkData.navTitle ,
				url: obelisk.relativePath( data.url , navLinkData.url )
			} ) ;
			
			return await obelisk.applyTemplate( navLinkData.navLinkTemplate , config , navLinkData , templateCache ) ;
		} ) ;
		
		data.nav = data.nav.join( '\n' ) ;
		
		// Apply the content template
		data.contentList = await Promise.map( data.contentList , async ( part ) => {
			var content = markdownKit.generateFragment( { markdown: part.content } ) ;
			var contentData = Object.assign( {} , part.header , { content: content } ) ;
			
			// Apply the template
			return await obelisk.applyTemplate( contentData.contentTemplate , config , contentData , templateCache ) ;
		} ) ;
		
		data.contents = data.contentList.join( '\n' ) ;
		
		// Apply the page template
		var output = await obelisk.applyTemplate( data.pageTemplate , config , data , templateCache , true ) ;
		
		await fs.writeFileAsync( data.target , output ) ;
		
		term( '^GWrote^ ^/^b%s^:\n' , data.relTarget ) ;
	} ) ;
} ;



obelisk.parseSource = function parseSource( config , rawContent , sourcePath , fsStats )
{
	var header , explicitHeader , contents ;
	var parts = rawContent.split( /^=(?:\*=)+ *$/m ) ;
	
	if ( parts.length <= 1 )
	{
		explicitHeader = {} ;
		header = Object.assign( {} , config.header ) ;
		contents = rawContent ;
	}
	else
	{
		explicitHeader = kungFig.parse( parts[ 0 ] ) ;
		header = Object.assign( {} , config.header , explicitHeader ) ;
		contents = parts[ 1 ] ;
	}
	
	if ( ! header.pageTemplate ) { header.pageTemplate = __dirname + '/../templates/default.html' ; }
	if ( ! header.navLinkTemplate ) { header.navLinkTemplate = __dirname + '/../templates/default-nav-link.partial.html' ; }
	if ( ! header.lang ) { header.lang = 'en' ; }
	if ( ! header.dateFormat ) { header.dateFormat = "LLLL" ; }
	if ( ! header.inputDateFormat ) { header.inputDateFormat = "L LT" ; }
	
	if ( ! header.tags ) { header.tags = [] ; }
	else if ( ! Array.isArray( header.tags ) ) { header.tags = [ header.tags ] ; }
	
	if ( ! header.title )
	{
		// Automatic title
		header.title = path.basename( sourcePath ).replace( /\..*$/ , '' ) ;
	}
	
	if ( ! header.navTitle ) { header.navTitle = header.title ; }
	
	obelisk.fixDates( header , fsStats ) ;
	
	var contentList = contents.split( /^=(?:\+=)+ *$/m ).map( content => {
		var contentHeader ;
		var parts = content.split( /^-(?:\*-)+ *$/m ) ;
		//console.log( 'parts:' , parts ) ;
		
		// Page headers inheritance
		
		// Delete explicit page headers unrelated to content
		delete explicitHeader.pageTemplate ;
		delete explicitHeader.query ;
		
		// Copy only *EXPLICIT* page headers to content headers
		if ( parts.length <= 1 )
		{
			contentHeader = Object.assign( {} , config.contentHeader , explicitHeader ) ;
		}
		else
		{
			contentHeader = Object.assign( {} , config.contentHeader , explicitHeader , kungFig.parse( parts[ 0 ] ) ) ;
			content = parts[ 1 ] ;
		}
		
		if ( ! contentHeader.contentTemplate )
		{
			contentHeader.contentTemplate = __dirname + '/../templates/default-content.partial.html' ;
		}
		
		// Default to few *implicit* page headers, when it make sense
		if ( ! contentHeader.lang ) { contentHeader.lang = header.lang ; }
		if ( ! contentHeader.dateFormat ) { contentHeader.dateFormat = header.dateFormat ; }
		if ( ! contentHeader.inputDateFormat ) { contentHeader.inputDateFormat = header.inputDateFormat ; }
		if ( ! contentHeader.tags ) { contentHeader.tags = header.tags ; }
		
		
		obelisk.fixDates( contentHeader , fsStats , header ) ;
		
		return {
			header: contentHeader ,
			content: content
		} ;
	} ) ;
	
	return {
		header: header ,
		contentList: contentList
	} ;
} ;



obelisk.fixDates = function fixDates( header , fsStats , masterHeader )
{
	if ( fsStats.birthtime > fsStats.mtime ) { fsStats.birthtime = fsStats.mtime ; }
	
	var momentDate , momentEditionDate ;
	var date = header.date || ( masterHeader && masterHeader._date ) || fsStats.birthtime ;
	var editionDate = header.editionDate || ( masterHeader && masterHeader._editionDate ) || fsStats.mtime ;
	
	
	if ( date instanceof Date )
	{
		header._date = date ;
		header.date = moment( date ).locale( header.lang ).format( header.dateFormat ) ;
	}
	else
	{
		momentDate = moment( date , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] , header.lang ) ;
		
		if ( ! momentDate.isValid() )
		{
			momentDate = moment( date , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] ) ;
		}
		
		header._date = momentDate.toDate() ;
		header.date = momentDate.locale( header.lang ).format( header.dateFormat ) ;
	}
	
	
	if ( editionDate instanceof Date )
	{
		header._editionDate = editionDate ;
		header.editionDate = moment( editionDate ).locale( header.lang ).format( header.dateFormat ) ;
	}
	else
	{
		momentEditionDate = moment( editionDate , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] , header.lang ) ;
		
		if ( ! momentEditionDate.isValid() )
		{
			momentEditionDate = moment( editionDate , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] ) ;
		}
		
		header._editionDate = momentEditionDate.toDate() ;
		header.editionDate = momentEditionDate.locale( header.lang ).format( header.dateFormat ) ;
	}
} ;



obelisk.applyTemplate = async function applyTemplate( templatePath , config , data , templateCache , isPage )
{
	var templateEngine = config.hooks.templateEngine || obelisk.defaultTemplateEngine ;
	var template = templateCache[ templatePath ] ;
	
	if ( ! template )
	{
		if ( ! path.isAbsolute( templatePath ) )
		{
			templatePath = await fs.realpathAsync( templatePath ) ;
		}
		
		template = await fs.readFileAsync( templatePath , 'utf8' ) ;
		templateCache[ templatePath ] = template ;
	}
	
	data.config = config ;
	
	if ( isPage && data.cssLinks )
	{
		if ( ! Array.isArray( data.cssLinks ) ) { data.cssLinks = [ data.cssLinks ] ; }
		data.cssLinks = data.cssLinks.map( link => '<link rel="stylesheet" href="' + link + '"/>' ).join( '\n' ) ;
	}
	
	return templateEngine( template , data ) ;
} ;



obelisk.defaultTemplateEngine = async function defaultTemplateEngine( template , data )
{
	var babel = Babel.create() ;
	babel.undefinedString = '' ;
	
	return babel.solve( template , data ) ;
} ;



obelisk.query = function query( pageList , query )
{
	// First, get the content list from non-query pages
	var contentList = [].concat( ... pageList.filter( e => ! e.query ).map( e => e.contentList ) ) ;
	
	if ( query.tags )
	{
		// Filter out content that has not all required tags
		if ( ! Array.isArray( query.tags ) ) { query.tags = [ query.tags ] ; }
		contentList = contentList.filter( content => query.tags.every( tag => content.header.tags.indexOf( tag ) !== -1 ) ) ;
	}
	
	// Order content by date
	switch ( query.order )
	{
		case 'desc' :
		case 'descendant' :
			contentList.sort( ( a , b ) => b.header._date - a.header._date ) ;
			break ;
		case 'asc' :
		case 'ascendant' :
			contentList.sort( ( a , b ) => a.header._date - b.header._date ) ;
			break ;
	}
	
	// Limit the content number
	if ( query.limit && contentList.length > query.limit )
	{
		contentList.length = query.limit ;
	}
	
	return contentList ;
} ;



obelisk.relativePath = function relativePath( from , to )
{
	var rel = path.relative( path.dirname( from ) , to ) ;
	if ( ! rel ) { rel = '.' ; }
	return rel ;
} ;



// Utility to debug things
function deb()
{
	var log , value ;
	
	if ( arguments.length >= 2 )
	{
		[ log , value ] = arguments ;
	}
	else
	{
		log = 'DEBUG:' ;
		value = arguments[ 0 ] ;
	}
	
	console.log( log , string.inspect( { style: 'color' , depth: 5 } , value ) ) ;
}


