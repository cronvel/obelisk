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

var tree = require( 'tree-kit' ) ;
var kungFig = require( 'kung-fig' ) ;
var markdownKit = require( 'markdown-kit' ) ;
var Babel = require( 'babel-tower' ) ;

var moment = require( 'moment' ) ;
var string = require( 'string-kit' ) ;
var term = require( 'terminal-kit' ).terminal ;

var packageDir = path.dirname( __dirname ) ;



const obelisk = {} ;
module.exports = obelisk ;



obelisk.cli = function cli()
{
	var args = require( 'minimist' )( process.argv.slice( 2 ) ) ;
	
	args.base = args.base || args._[ 0 ] || process.cwd() ;
	
	delete args._ ;
	
	obelisk.generate( args )
	.catch( error => term( string.inspectError( { style: 'color' } , error ) ) ) ;
} ;



obelisk.generate = async function generate( options )
{
	var config , dirMode = 0o777 , templateCache = {} ,
		pageList = [] , navPageList = [] , contentList = [] ,
		coreCssDir = packageDir + '/css' ,
		coreMediaDir = packageDir + '/media' ,
		markdownKitCssDir = packageDir + '/node_modules/markdown-kit/css' ;
	
	// Turn the base path into an absolute path
	if ( ! path.isAbsolute( options.base ) )
	{
		options.base = await fs.realpathAsync( options.base ) ;
	}
	
	config = obelisk.loadConfig( options ) ;
	
	// Execute the init hook, if any
	if ( config.hooks.init ) { await config.hooks.init( config ) ; }
	
	// Prepare the build: delete all the /site subtree
	await fsKit.deltreeAsync( options.base + '/site/*' ) ;
	
	// Copy CSS
	var cssDir = options.base + '/site/css' ;
	await fsKit.ensurePathAsync( cssDir , dirMode ) ;
	//await fsKit.copyAsync( markdownKitCssDir + '/standalone.css' , cssDir + '/markdown-kit-standalone.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/markdown.css' , cssDir + '/default-markdown.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/highlight.css' , cssDir + '/default-highlight.css' ) ;
	await fsKit.copyAsync( coreCssDir + '/default.css' , cssDir + '/default-highlight.css' ) ;
	await fsKit.copyDirAsync( options.base + '/css' , options.base + '/site/css' , { clobber: false } ) ;
	
	// Copy media
	var mediaDir = options.base + '/site/media' ;
	await fsKit.ensurePathAsync( mediaDir , dirMode ) ;
	await fsKit.copyAsync( coreMediaDir + '/cover.png' , mediaDir + '/cover.png' ) ;
	await fsKit.copyDirAsync( options.base + '/media' , options.base + '/site/css' , { clobber: false } ) ;
	
	// Misc directories
	var contentDir = options.base + '/site/content' ;
	await fsKit.ensurePathAsync( contentDir , dirMode ) ;
	
	var summaryDir = options.base + '/site/summary' ;
	await fsKit.ensurePathAsync( summaryDir , dirMode ) ;
	
	// Get all source content paths
	var sources = await globAsync( 'content/**/*.md' , { cwd : options.base } ) ;
	
	// Generate, first pass (load and parse pages)
	var pageList = await Promise.map( sources , async ( relSource ) => {
		var source = options.base + '/' + relSource ;
		
		var relTarget = relSource.replace( /^content\// , 'site/' ).replace( /\.md$/ , '.html' ) ;
		var target = options.base + '/' + relTarget ;
		var targetDir = path.dirname( target ) ;
		var urlPath = relTarget.replace( /^site\// , '/' ) ;
		
		await fsKit.ensurePathAsync( targetDir , dirMode ) ;
		
		// Get the file and parse it
		var parsed = obelisk.parseSource(
			config ,
			await fs.readFileAsync( source , 'utf8' ) ,
			relSource ,
			await fs.statAsync( source )
		) ;
		
		parsed.header.relRoot = obelisk.relativePath( urlPath , '/' ) ;
		parsed.header.url = parsed.header.protocol + parsed.header.domain + parsed.header.url ;
		
		if ( ! parsed.header.query )
		{
			// Render markdown
			//parsed.contentList.forEach( part => {
			await Promise.forEach( parsed.contentList , async ( part ) => {
				part.header.content = markdownKit.generateFragment( { markdown: part.content } ) ;
				part.header.id = contentList.length ;
				contentList.push( part ) ;
				
				await fs.writeFileAsync( contentDir + '/' + part.header.id + '.html' , part.header.content ) ;
				term( '^GWrote^ ^/^b%s^:\n' , 'site/content/' + part.header.id + '.html' ) ;
			} ) ;
		}
		
		// Return the current page, without the top-level template applied
		return Object.assign( {} , parsed.header , {
			urlPath: urlPath ,
			target: target ,
			relTarget: relTarget ,
			contentList: parsed.contentList
		} ) ;
	} ) ;
	
	//console.log( string.inspect( { style: 'color' , depth: 5 } , pageList[0] ) ) ;
	
	// Sort items by date
	navPageList = pageList.filter( e => ! e.noNav ) ;
	navPageList.sort( ( a , b ) => b._date - a._date ) ;
	
	// Generate, second pass (solve query, construct nav, content and full pages)
	await Promise.all( pageList , async ( data ) => {
		
		// Has query? retrieve the content
		if ( data.query )
		{
			data.contentList = obelisk.query( contentList , data.query ) ;
		}
		
		// Construct navList
		data.navList = navPageList.map( navPage => ( {
			title: navPage.navTitle ,
			urlPath: navPage.urlPath ,
			relPath: obelisk.relativePath( data.urlPath , navPage.urlPath )
		} ) ) ;
		
		// Render the page
		var output = await obelisk.render( config , data , templateCache ) ;
		
		await fs.writeFileAsync( data.target , output ) ;
		term( '^GWrote^ ^/^b%s^:\n' , data.relTarget ) ;
	} ) ;
	
	
	// Write nginx conf
	await fs.writeFileAsync(
		options.base + '/nginx.conf' ,
		await obelisk.partialRender( config , config , config.nginxTemplate , templateCache )
	) ;
} ;



obelisk.loadConfig = function loadConfig( options )
{
	// Defaults
	var config = {
		siteTitle: 'My Wonderful Blog' ,
		siteBaseLine: 'Yet Another Blog' ,
		siteDescription: 'Insert here your site description' ,
		siteCoverImage: '' ,
		protocol: 'http://' ,
		domain: 'obelisk.local' ,
		urlRootPath: '/' ,
		nginxTemplate: packageDir + '/templates/nginx.conf' ,
		owner: 'Unknown'
	} ;
	
	// Load the KFG config, if any...
	try {
		config = Object.assign( config , kungFig.load( options.base + '/main.kfg' ) ) ;
	}
	catch ( error ) {} // This is not an error
	
	// Sanitize some fields
	if ( ! config.protocol.endsWith( '://' ) ) { config.protocol += '://' ; }
	
	// Forced values
	config.localRoot = options.base + '/site' ;
	config.options = options ;
	
	// Load the hooks, if any ...
	try {
		config.hooks = require( options.base + '/hooks.js' ) ;
	}
	catch ( error ) { config.hooks = {} ; } // This is not an error
	
	// Context for hooks
	config.context = {} ;
	
	return config ;
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
	
	// Mandatory
	header.siteTitle = config.siteTitle ;
	header.siteBaseLine = config.siteBaseLine ;
	header.siteDescription = config.siteDescription ;
	header.protocol = config.protocol ;
	header.domain = config.domain ;
	header.urlRootPath = config.urlRootPath ;
	
	// Templates
	if ( ! header.pageTemplate ) { header.pageTemplate = packageDir + '/templates/default-page.html' ; }
	if ( ! header.navLinkTemplate ) { header.navLinkTemplate = packageDir + '/templates/default-nav-link.partial.html' ; }
	if ( ! header.asideContentTemplate ) { header.asideContentTemplate = packageDir + '/templates/default-aside-content.partial.html' ; }
	
	// CSS and JS
	if ( ! header.css ) { header.css = [] ; }
	else if ( ! Array.isArray( header.css ) ) { header.css = [ header.css ] ; }
	
	if ( ! header.js ) { header.js = [] ; }
	else if ( ! Array.isArray( header.js ) ) { header.js = [ header.js ] ; }
	
	// Lang, format
	if ( ! header.lang ) { header.lang = 'en' ; }
	if ( ! header.dateFormat ) { header.dateFormat = "LLLL" ; }
	if ( ! header.inputDateFormat ) { header.inputDateFormat = "L LT" ; }
	
	// Titles, author, tags, etc...
	if ( ! header.title )
	{
		// Automatic title
		header.title = path.basename( sourcePath ).replace( /\..*$/ , '' ) ;
	}
	
	if ( ! header.author ) { header.author = config.owner ; }
	if ( ! header.navTitle ) { header.navTitle = header.title ; }
	
	if ( ! header.tags ) { header.tags = [] ; }
	else if ( ! Array.isArray( header.tags ) ) { header.tags = [ header.tags ] ; }
	
	// Copyright & Powered By
	if ( ! header.copyright ) { header.copyright = "Me" ; }
	if ( ! header.copyrightLink ) { header.copyrightLink = "mailto:someone@somewhere.net" ; }
	if ( ! header.copyrightYear ) { header.copyrightYear = ( new Date() ).getFullYear() ; }
	if ( ! header.poweredBy ) { header.poweredBy = "Obelisk" ; }
	if ( ! header.poweredByLink ) { header.poweredByLink = "https://npmjs.org/package/obelisk" ; }
	
	// Misc
	if ( ! header.cover ) { header.cover = "/media/cover.png" ; }
	
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
			contentHeader.contentTemplate = packageDir + '/templates/default-content.partial.html' ;
		}
		
		// Default to few *implicit* page headers, when it make sense
		if ( ! contentHeader.lang ) { contentHeader.lang = header.lang ; }
		if ( ! contentHeader.dateFormat ) { contentHeader.dateFormat = header.dateFormat ; }
		if ( ! contentHeader.inputDateFormat ) { contentHeader.inputDateFormat = header.inputDateFormat ; }
		if ( ! contentHeader.author ) { contentHeader.author = header.author ; }
		if ( ! contentHeader.tags ) { contentHeader.tags = header.tags ; }
		
		// CSS and JS
		if ( ! contentHeader.css )
		{
			contentHeader.css = header.css.slice() ;
		}
		else if ( ! Array.isArray( contentHeader.css ) )
		{
			contentHeader.css = header.css.slice() ;
			contentHeader.css.push( header.css ) ;
		}
		else
		{
			contentHeader.css = header.css.concat( contentHeader.css ) ;
		}
		
		if ( ! contentHeader.js )
		{
			contentHeader.js = header.js.slice() ;
		}
		else if ( ! Array.isArray( contentHeader.js ) )
		{
			contentHeader.js = header.js.slice() ;
			contentHeader.js.push( header.js ) ;
		}
		else
		{
			contentHeader.js = header.js.concat( contentHeader.js ) ;
		}
		
		
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



obelisk.render = async function render( config , data , templateCache )
{
	// If there is a custom template renderer, use it!
	if ( config.hooks.templateRenderer )
	{
		data.config = config ;
		config.hooks.templateRenderer( config , data , await obelisk.getTemplate( config , templatePath , templateCache ) , templateCache ) ;
		return ;
	}
	
	// Apply the nav template
	data.nav = ( await Promise.map( data.navList , async ( nav ) => {
		return await obelisk.partialRender( config , nav , data.navLinkTemplate , templateCache ) ;
	} ) ).join( '\n' ) ;
	
	// Apply the content template
	data.contentList = await Promise.map( data.contentList , async ( part ) => {
		// Apply the template
		return await obelisk.partialRender( config , part.header , part.header.contentTemplate , templateCache ) ;
	} ) ;
	
	data.contents = data.contentList.join( '\n' ) ;
	
	// Apply the aside-content template
	data.asideContent = await obelisk.partialRender( config , data , data.asideContentTemplate , templateCache ) ;
	
	// Apply the page template
	return await obelisk.partialRender( config , data , data.pageTemplate , templateCache , true ) ;
} ;



//obelisk.partialRender = async function partialRender( templatePath , config , data , templateCache , isPage )
obelisk.partialRender = async function partialRender( config , data , templatePath , templateCache , isPage )
{
	var microTemplateRenderer = config.hooks.microTemplateRenderer || obelisk.microTemplateRenderer ;
	
	data.config = config ;
	
	if ( isPage )
	{
		data.cssLinks = data.css.map( link => '<link rel="stylesheet" href="' + link + '"/>' ).join( '\n' ) ;
		data.jsScripts = data.js.map( src => '<script src="' + src + '"></script>' ).join( '\n' ) ;
	}
	
	return microTemplateRenderer( config , data , await obelisk.getTemplate( config , templatePath , templateCache ) , templateCache ) ;
} ;



obelisk.microTemplateRenderer = async function microTemplateRenderer( config , data , template )
{
	var babel = Babel.create() ;
	babel.undefinedString = '' ;
	
	return babel.solve( template , data ) ;
} ;



obelisk.query = function query( contentList , query )
{
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



// Load the template file
obelisk.getTemplate = async function getTemplate( config , templatePath , templateCache )
{
	if ( templateCache[ templatePath ] ) { return templateCache[ templatePath ] ; }
	
	templatePath = templatePath.replace( /^core:/ , packageDir + '/templates/' ) ;
	
	if ( ! path.isAbsolute( templatePath ) )
	{
		templatePath = await fs.realpathAsync( config.options.base + '/templates/' + templatePath ) ;
	}
	
	templateCache[ templatePath ] = await fs.readFileAsync( templatePath , 'utf8' ) ;
	
	return templateCache[ templatePath ] ;
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


