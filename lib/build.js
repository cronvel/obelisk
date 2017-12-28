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

var globAsync = Promise.promisify( require( 'glob' ) ) ;

//var tree = require( 'tree-kit' ) ;
var kungFig = require( 'kung-fig' ) ;
var markdownKit = require( 'markdown-kit' ) ;
var Babel = require( 'babel-tower' ) ;

var moment = require( 'moment' ) ;
var charmap = require( './charmap.js' ) ;
var string = require( 'string-kit' ) ;
var term = require( 'terminal-kit' ).terminal ;

function noop() {}

var packageDir = path.dirname( __dirname ) ;



/*
	options:
		* base: base directory, default to CWD
*/
async function build( options ) {
	var config , dirMode = 0o777 , templateCache = {} ,
		pageList = [] , navPageList = [] , contentList = [] , contentListByTag = {} ,
		globalNavList ,
		coreCssDir = packageDir + '/css' ,
		coreMediaDir = packageDir + '/media' ,
		markdownKitCssDir = packageDir + '/node_modules/markdown-kit/css' ;

	// Turn the base path into an absolute path
	if ( ! path.isAbsolute( options.base ) ) {
		options.base = await fs.realpathAsync( options.base ) ;
	}

	config = build.loadConfig( options ) ;

	// Execute the init hook, if any
	if ( config.hooks.init ) { await config.hooks.init( config ) ; }

	// Prepare the build: delete all the /site and /conf subtree
	await fsKit.deltreeAsync( options.base + '/site/*' ) ;
	await fsKit.deltreeAsync( options.base + '/conf/*' ) ;

	// Copy CSS
	var cssDir = options.base + '/site/css' ;
	await fsKit.ensurePathAsync( cssDir , dirMode ) ;
	//await fsKit.copyAsync( markdownKitCssDir + '/standalone.css' , cssDir + '/markdown-kit-standalone.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/markdown.css' , cssDir + '/default-markdown.css' ) ;
	await fsKit.copyAsync( markdownKitCssDir + '/highlight.css' , cssDir + '/default-highlight.css' ) ;
	await fsKit.copyAsync( coreCssDir + '/default.css' , cssDir + '/default.css' ) ;
	await fsKit.copyDirAsync( options.base + '/css' , options.base + '/site/css' , { clobber: false } ).catch( noop ) ;

	// Copy JS
	var jsDir = options.base + '/site/js' ;
	await fsKit.ensurePathAsync( jsDir , dirMode ) ;
	await fsKit.copyDirAsync( options.base + '/js' , options.base + '/site/js' , { clobber: false } ).catch( noop ) ;

	// Copy media
	var mediaDir = options.base + '/site/media' ;
	await fsKit.ensurePathAsync( mediaDir , dirMode ) ;
	await fsKit.copyAsync( coreMediaDir + '/cover.png' , mediaDir + '/cover.png' ) ;
	await fsKit.copyDirAsync( options.base + '/media' , options.base + '/site/css' , { clobber: false } ).catch( noop ) ;

	// Misc directories
	var fragmentsDir = options.base + '/site/fragments' ;
	await fsKit.ensurePathAsync( fragmentsDir , dirMode ) ;

	var summaryDir = options.base + '/site/summary' ;
	await fsKit.ensurePathAsync( summaryDir , dirMode ) ;

	var tagsDir = options.base + '/site/tags' ;
	await fsKit.ensurePathAsync( tagsDir , dirMode ) ;

	await fsKit.ensurePathAsync( options.base + '/site' + config.authorsPath ) ;

	// Get all source content paths
	var sources = await globAsync( 'content/**/*.md' , { cwd: options.base } ) ;


	// Generate, first pass (load and parse pages)
	await Promise.forEach( sources , async( relSource ) => {
		var source = options.base + '/' + relSource ;

		// Get the file and parse it
		var data = build.parseSource(
			config ,
			await fs.readFileAsync( source , 'utf8' ) ,
			relSource ,
			await fs.statAsync( source )
		) ;

		if ( ! data ) { return null ; }

		await fsKit.ensurePathAsync( data.targetDir , dirMode ) ;

		if ( ! data.query ) {
			// Render markdown
			await Promise.forEach( data.contentList , async( part ) => {
				part.content = markdownKit.generateFragment( { markdown: part.content } ) ;
				part.id = contentList.length ;
				contentList.push( part ) ;

				await fs.writeFileAsync( fragmentsDir + '/' + part.id + '.html' , part.content ) ;
				term( '^GWrote fragment^ ^/^b%s^:\n' , part.id + '.html' ) ;
			} ) ;
		}

		pageList.push( data ) ;
	} ) ;


	// Add auto tags pages
	if ( config.tagPages ) {
		contentList.forEach( content => {
			content.tags.forEach( tag => {
				if ( ! contentListByTag[ tag ] ) { contentListByTag[ tag ] = [] ; }
				contentListByTag[ tag ].push( content ) ;
			} ) ;
		} ) ;

		// Create all tag page sub-directories
		await Promise.map( Object.keys( contentListByTag ) , async( tag ) => {
			var targetDir , data = Object.assign( {} , config.header , config.tagPages ) ;

			data.relTarget = 'site/tags/' + tag ;
			data.target = options.base + '/' + data.relTarget ;
			targetDir = data.target ;
			data.urlPath = '/tags/' + tag ;
			data.relRoot = '../../' ;

			data.url = data.protocol + data.domain + data.url ;

			data.multiple = 'pages' ;

			if ( ! data.query ) { data.query = {} ; }
			data.query.tags = [ tag ] ;

			build.defaultPageHeaders( config , data , data.target ) ;

			await fsKit.ensurePathAsync( targetDir , dirMode ) ;

			// Tag specific header
			data.title = data.navTitle = data.pageTitle = tag[ 0 ].toUpperCase() + tag.slice( 1 ) ;
			data.pageType = 'tag-page' ;

			pageList.push( data ) ;
		} ) ;
	}


	navPageList = pageList.filter( e => e.addToNav ).map( navPage => ( {
		title: navPage.navTitle ,
		url: navPage.urlPath ,
		date: navPage._date || 0 ,
		order: navPage.navOrder || 0 ,
		count: 0 ,
		icon: navPage.navIcon || '' ,
		indent: navPage.navIndent
	} ) ) ;

	globalNavList = config.navList.concat( navPageList ) ;


	// Generate, second pass (solve query, construct nav and  full pages)
	await Promise.map( pageList , async( data ) => {

		var output , multiData ;

		data.navList = data.navList.concat( globalNavList ) ;
		data.navList.sort( ( a , b ) => {
			return ( b.order - a.order ) ||
				b.date - a.date ;
		} ) ;

		data.navLinks = data.navList.map( e => build.menuItem( e ) ) ;

		data.contextNavList = [] ;

		switch ( data.multiple ) {
			case 'pages' :
				// Render multiple pages

				// Query is mandatory for multiple pages...
				if ( ! data.query ) { return ; }

				multiData = { end: false , index: 0 } ;

				while ( ! multiData.end ) {
					data.contentList = build.query( contentList , data.query , multiData ) ;

					data.contextNavList.length = 0 ;

					if ( multiData.index ) {
						data.contextNavList.push( {
							title: data.previousPageTitle || '« previous' ,
							url: data.urlPath + ( multiData.index > 1 ? '/' + multiData.index : '' )
						} ) ;
					}
					else {
						data.contextNavList.push( {} ) ;
					}

					data.contextNavList.push( {
						// /!\ Tmp, should be internationalized
						title: 'page ' + ( multiData.index + 1 )
					} ) ;

					if ( ! multiData.end ) {
						data.contextNavList.push( {
							title: data.nextPageTitle || 'next »' ,
							url: data.urlPath + '/' + ( multiData.index + 2 )
						} ) ;
					}
					else {
						data.contextNavList.push( {} ) ;
					}

					data.contextNavLinks = data.contextNavList.map( e => build.menuItem( e ) ) ;

					output = await build.render( config , data , templateCache ) ;

					await fs.writeFileAsync( data.target + '/' + ( multiData.index + 1 ) + '.html' , output ) ;
					term( '^GWrote page^ ^/^b%s^:\n' , data.relTarget + '/' + ( multiData.index + 1 ) + '.html' ) ;

					multiData.index ++ ;
				}

				break ;
			default :
				// Normal mode: render one page

				// Has query? retrieve the content
				if ( data.query ) {
					data.contentList = build.query( contentList , data.query ) ;
				}

				output = await build.render( config , data , templateCache ) ;

				await fs.writeFileAsync( data.target , output ) ;
				term( '^GWrote page^ ^/^b%s^:\n' , data.relTarget ) ;
				break ;
		}
	} ) ;


	// Write nginx conf
	await fsKit.ensurePathAsync( options.base + '/conf/' , dirMode ) ;
	await fs.writeFileAsync(
		options.base + '/conf/nginx.conf' ,
		await build.partialRender( config , config , config.nginxTemplate , templateCache )
	) ;
	term( '^GWrote Nginx conf^ ^/^b%s^:\n' , options.base + '/conf/nginx.conf' ) ;
}

module.exports = build ;



build.loadConfig = function loadConfig( options ) {
	// Defaults
	var config = {
		siteTitle: 'My Wonderful Blog' ,
		siteBaseLine: 'Yet Another Blog' ,
		siteDescription: 'Insert here your site description' ,
		siteCoverImage: '' ,
		preview: !! options.preview ,
		protocol: options.protocol || 'http://' ,
		domain: options.domain || 'obelisk.local' ,
		urlRootPath: options.urlRootPath || '/' ,
		authorsPath: '/authors' || options.authorsPath ,
		nginxTemplate: packageDir + '/templates/nginx.conf' ,
		owner: 'Unknown' ,
		lang: 'en' ,
		dateFormat: 'LLLL' ,
		inputDateFormat: 'L LT'
	} ;

	// Load the KFG config, if any...
	try {
		config = Object.assign( config , kungFig.load( options.base + '/main.kfg' ) ) ;
	}
	catch ( error ) {} // This is not an error

	// Sanitize some fields
	if ( ! config.protocol.endsWith( '://' ) ) { config.protocol += '://' ; }
	if ( config.tagPages && typeof config.tagPages !== 'object' ) { config.tagPages = {} ; }

	if ( ! Array.isArray( config.navList ) ) { config.navList = [] ; }

	/* eslint-disable no-nested-ternary */
	config.navList = Array.isArray( config.navList ) ?
		config.navList :
		( config.navList ? [ config.navList ] : [] ) ;
	/* eslint-enable no-nested-ternary */

	config.navList.forEach( e => {
		e.date = build.fixOneDate( config , e.date ) ;
		e.order = e.order || 0 ,
		e.count = e.count || 0 ,
		e.icon = e.icon || '' ,
		e.indent = e.indent || 0 ;
	} ) ;

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



build.parseSource = function parseSource( config , rawContent , sourcePath , fsStats ) {
	var header , explicitHeader , contents ;
	var parts = rawContent.split( /^=(?:\*=)+ *$/m ) ;

	if ( parts.length <= 1 ) {
		explicitHeader = {} ;
		header = Object.assign( {} , config.header ) ;
		contents = rawContent ;
	}
	else {
		explicitHeader = kungFig.parse( parts[ 0 ] ) ;
		header = Object.assign( {} , config.header , explicitHeader ) ;
		contents = parts[ 1 ] ;
	}

	build.defaultPageHeaders( config , header , sourcePath ) ;

	if ( ! header.publish && ! config.preview ) { return null ; }

	if ( header.multiple ) {
		header.relTarget = sourcePath.replace( /^content\// , 'site/' ).replace( /\.md$/ , '' ) ;
		header.target = config.options.base + '/' + header.relTarget ;
		header.targetDir = header.target ;
		header.urlPath = header.relTarget.replace( /^site\// , '/' ) ;
		header.relRoot = build.relativePath( header.urlPath + '/something' , '/' ) ; // hacky, but well...
	}
	else {
		header.relTarget = sourcePath.replace( /^content\// , 'site/' ).replace( /\.md$/ , '.html' ) ;
		header.target = config.options.base + '/' + header.relTarget ;
		header.targetDir = path.dirname( header.target ) ;
		header.urlPath = header.relTarget.replace( /^site\// , '/' ).replace( /\.html/ , '' ) ;
		header.relRoot = build.relativePath( header.urlPath , '/' ) ;
	}

	header.url = header.protocol + header.domain + header.urlPath ;

	build.fixDates( header , fsStats ) ;

	var contentList = contents.split( /^=(?:\+=)+ *$/m ).map( content => {
		var contentHeader ;
		var parts_ = content.split( /^-(?:\*-)+ *$/m ) ;
		//console.log( 'parts_:' , parts_ ) ;

		// Page headers inheritance

		// Delete explicit page headers unrelated to content
		delete explicitHeader.pageTemplate ;
		delete explicitHeader.query ;

		// Copy only *EXPLICIT* page headers to content headers
		if ( parts_.length <= 1 ) {
			contentHeader = Object.assign( {} , config.contentHeader , explicitHeader ) ;
		}
		else {
			contentHeader = Object.assign( {} , config.contentHeader , explicitHeader , kungFig.parse( parts_[ 0 ] ) ) ;
			content = parts_[ 1 ] ;
		}

		// Content template should be per page? not per content?
		//if ( ! contentHeader.contentTemplate ) { contentHeader.contentTemplate = packageDir + '/templates/default-content.html' ; }

		// Mandatory
		contentHeader.protocol = header.protocol ;
		contentHeader.domain = header.domain ;
		contentHeader.urlPath = header.urlPath ;
		contentHeader.url = header.url ;

		// Default to few *implicit* page headers, when it make sense
		if ( contentHeader.queryable === undefined ) { contentHeader.queryable = true ; }
		if ( ! contentHeader.lang ) { contentHeader.lang = header.lang ; }
		if ( ! contentHeader.dateFormat ) { contentHeader.dateFormat = header.dateFormat ; }
		if ( ! contentHeader.inputDateFormat ) { contentHeader.inputDateFormat = header.inputDateFormat ; }
		if ( ! contentHeader.author ) { contentHeader.author = header.author ; }
		if ( ! contentHeader.tags ) { contentHeader.tags = header.tags ; }

		// Author's page url
		contentHeader.urlAuthorPath = path.join( config.urlRootPath , config.authorsPath , build.slugify( contentHeader.author ) ) ;
		term.magenta( "%s\n" , contentHeader.urlAuthorPath ) ;

		// CSS and JS
		if ( ! contentHeader.css ) {
			contentHeader.css = header.css.slice() ;
		}
		else if ( ! Array.isArray( contentHeader.css ) ) {
			contentHeader.css = header.css.slice() ;
			contentHeader.css.push( header.css ) ;
		}
		else {
			contentHeader.css = header.css.concat( contentHeader.css ) ;
		}

		if ( ! contentHeader.js ) {
			contentHeader.js = header.js.slice() ;
		}
		else if ( ! Array.isArray( contentHeader.js ) ) {
			contentHeader.js = header.js.slice() ;
			contentHeader.js.push( header.js ) ;
		}
		else {
			contentHeader.js = header.js.concat( contentHeader.js ) ;
		}


		build.fixDates( contentHeader , fsStats , header ) ;

		// Add the content to header and return the whole as page's data
		contentHeader.content = content ;

		return contentHeader ;
	} ) ;

	// Add the contentList to header and return the whole as page's data
	header.contentList = contentList ;

	return header ;
} ;



build.defaultPageHeaders = function defaultPageHeaders( config , header , sourcePath ) {
	// Mandatory
	header.siteTitle = config.siteTitle ;
	header.siteBaseLine = config.siteBaseLine ;
	header.siteDescription = config.siteDescription ;
	header.protocol = config.protocol ;
	header.domain = config.domain ;
	header.urlRootPath = config.urlRootPath ;
	header.pageType = header.query ? 'query-page' : 'normal-page' ;
	header.navOrder = header.navOrder || 0 ;
	header.navIndent = header.navIndent || 0 ;

	header.publish = header.publish === undefined ? true : !! header.publish ;

	// Lang, format
	if ( ! header.lang ) { header.lang = config.lang ; }
	if ( ! header.dateFormat ) { header.dateFormat = config.dateFormat ; }
	if ( ! header.inputDateFormat ) { header.inputDateFormat = config.inputDateFormat ; }

	// Nav list
	/* eslint-disable no-nested-ternary */
	header.navList = Array.isArray( header.navList ) ?
		header.navList :
		( header.navList ? [ header.navList ] : [] ) ;
	/* eslint-enable no-nested-ternary */

	header.navList.forEach( e => {
		e.date = build.fixOneDate( header , e.date ) ;
		e.order = e.navOrder || 0 ,
		e.count = e.count || 0 ,
		e.icon = e.icon || '' ,
		e.indent = e.indent || 0 ;
	} ) ;

	// Templates
	if ( ! header.pageTemplate ) { header.pageTemplate = packageDir + '/templates/default-page.html' ; }
	if ( ! header.asideContentTemplate ) { header.asideContentTemplate = packageDir + '/templates/default-aside.html' ; }
	if ( ! header.contentTemplate ) { header.contentTemplate = packageDir + '/templates/default-content.html' ; }

	// CSS and JS
	if ( ! header.css ) { header.css = [] ; }
	else if ( ! Array.isArray( header.css ) ) { header.css = [ header.css ] ; }

	if ( ! header.js ) { header.js = [] ; }
	else if ( ! Array.isArray( header.js ) ) { header.js = [ header.js ] ; }

	// Titles, author, tags, etc...
	if ( ! header.title ) {
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
} ;



build.fixOneDate = function fixOneDate( config , date ) {
	if ( date instanceof Date ) { return date ; }
	return moment( date , [ moment.ISO_8601 , config.inputDateFormat , config.dateFormat ] , config.lang ).toDate() ;
} ;



build.fixDates = function fixDates( header , fsStats , masterHeader ) {
	if ( fsStats.birthtime > fsStats.mtime ) { fsStats.birthtime = fsStats.mtime ; }

	var momentDate , momentEditionDate ;
	var date = header.date || ( masterHeader && masterHeader._date ) || fsStats.birthtime ;
	var editionDate = header.editionDate || ( masterHeader && masterHeader._editionDate ) || fsStats.mtime ;


	if ( date instanceof Date ) {
		header._date = date ;
		header.date = moment( date ).locale( header.lang ).format( header.dateFormat ) ;
	}
	else {
		momentDate = moment( date , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] , header.lang ) ;

		if ( ! momentDate.isValid() ) {
			momentDate = moment( date , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] ) ;
		}

		header._date = momentDate.toDate() ;
		header.date = momentDate.locale( header.lang ).format( header.dateFormat ) ;
	}


	if ( editionDate instanceof Date ) {
		header._editionDate = editionDate ;
		header.editionDate = moment( editionDate ).locale( header.lang ).format( header.dateFormat ) ;
	}
	else {
		momentEditionDate = moment( editionDate , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] , header.lang ) ;

		if ( ! momentEditionDate.isValid() ) {
			momentEditionDate = moment( editionDate , [ moment.ISO_8601 , header.inputDateFormat , header.dateFormat ] ) ;
		}

		header._editionDate = momentEditionDate.toDate() ;
		header.editionDate = momentEditionDate.locale( header.lang ).format( header.dateFormat ) ;
	}
} ;



build.render = async function render( config , data , templateCache ) {
	// If there is a custom template renderer, use it!
	if ( config.hooks.templateRenderer ) {
		data.config = config ;

		if ( data.pageTemplate ) {
			config.hooks.templateRenderer( config , data , await build.getTemplate( config , data.pageTemplate , templateCache ) , templateCache ) ;
		}
		else {
			config.hooks.templateRenderer( config , data , null , templateCache ) ;
		}

		return ;
	}

	// Apply the content template
	data.contentList = await Promise.map( data.contentList , async( part ) => {

		// /!\ move it elsewhere? /!\
		part.tagNavLinks = part.tags.map( tag => build.menuItem( {
			title: tag ,
			url: '/tags/' + tag
		} ) ) ;

		// Apply the template
		return await build.partialRender( config , part , data.contentTemplate , templateCache ) ;
	} ) ;

	// Apply the optional aside-content template
	data.asideContent = data.asideContentTemplate ?
		await build.partialRender( config , data , data.asideContentTemplate , templateCache ) :
		'' ;

	// Apply the optional js-raw-scripts template
	data.jsRawScripts = data.jsTemplate ?
		await build.partialRender( config , data , data.jsTemplate , templateCache ) :
		'' ;

	// Apply the page template
	return await build.partialRender( config , data , data.pageTemplate , templateCache , true ) ;
} ;



//build.partialRender = async function partialRender( templatePath , config , data , templateCache , isPage )
build.partialRender = async function partialRender( config , data , templatePath , templateCache , isPage ) {
	var microTemplateRenderer = config.hooks.microTemplateRenderer || build.microTemplateRenderer ;

	data.config = config ;

	if ( isPage ) {
		data.cssLinks = data.css.map( link => '<link rel="stylesheet" href="' + link + '"/>' ).join( '\n' ) ;
		data.jsScripts = data.js.map( src => '<script src="' + src + '"></script>' ).join( '\n' ) ;
	}

	return microTemplateRenderer( config , data , await build.getTemplate( config , templatePath , templateCache ) , templateCache ) ;
} ;



build.microTemplateRenderer = async function microTemplateRenderer( config , data , template ) {
	var babel = Babel.create() ;
	babel.undefinedString = '' ;

	return babel.solve( template , data ) ;
} ;



build.menuItem = function menuItem( link ) {
	var output ;

	if ( link.title || link.icon ) {
		output = '<div class="menu-item' +
			( link.indent ? ' indent-' + link.indent : '' ) +
			'">' +
			( link.icon ? link.icon + ' ' : '' ) +
			link.title + '</div>' ;
	}
	else {
		output = '<div class="menu-item empty"></div>' ;
	}

	if ( link.url ) {
		output = '<a href="' + link.url + '">' + output + '</a>' ;
	}

	return output ;
} ;



build.query = function query( contentList , query_ , multiData = null ) {
	// First: copy the list immediately, do not modify the original one
	contentList = contentList.filter( content => content.queryable ) ;

	if ( query_.tags ) {
		// Filter out content that has not all required tags
		if ( ! Array.isArray( query_.tags ) ) { query_.tags = [ query_.tags ] ; }
		contentList = contentList.filter( content => query_.tags.every( tag => content.tags.indexOf( tag ) !== -1 ) ) ;
	}

	// Order content by date
	switch ( query_.order ) {
		case 'desc' :
		case 'descendant' :
			contentList.sort( ( a , b ) => b._date - a._date ) ;
			break ;
		case 'asc' :
		case 'ascendant' :
			contentList.sort( ( a , b ) => a._date - b._date ) ;
			break ;
	}

	if ( query_.limit ) {
		// If in multiData mode, eventually skip some contents
		if ( multiData && multiData.index && query_.limit ) {
			contentList = contentList.slice( multiData.index * query_.limit ) ;
		}

		if ( contentList.length > query_.limit ) {
			contentList.length = query_.limit ;
		}
		else if ( multiData ) {
			multiData.end = true ;
		}
	}
	else if ( multiData ) {
		multiData.end = true ;
	}

	return contentList ;
} ;



// Load the template file
build.getTemplate = async function getTemplate( config , templatePath , templateCache ) {
	if ( templateCache[ templatePath ] ) { return templateCache[ templatePath ] ; }

	templatePath = templatePath.replace( /^core:/ , packageDir + '/templates/' ) ;

	if ( ! path.isAbsolute( templatePath ) ) {
		templatePath = await fs.realpathAsync( config.options.base + '/templates/' + templatePath ) ;
	}

	templateCache[ templatePath ] = await fs.readFileAsync( templatePath , 'utf8' ) ;

	return templateCache[ templatePath ] ;
} ;



build.relativePath = function relativePath( from , to ) {
	var rel = path.relative( path.dirname( from ) , to ) ;
	if ( ! rel ) { rel = '.' ; }
	return rel ;
} ;



// Slugify authors name, etc, to match a file/URL
// Derivated from the rest-query-shared module
build.slugify = function slugify( str , options ) {
	options = options || {} ;

	str = mapReplace( str , charmap.asciiMapCommon ) ;

	if ( options.worldApha ) { str = mapReplace( str , charmap.asciiMapWorldAlpha ) ; }

	if ( options.symbols ) {
		switch ( options.symbols ) {
			case 'fr' :
				str = mapReplace( str , charmap.asciiMapSymbolsFr ) ;
				break ;
			//case 'en' :
			default :
				str = mapReplace( str , charmap.asciiMapSymbolsEn ) ;
		}
	}

	str = mapReplace( str , {
		// '\\.': '-', // should be deleted?
		'·': '-' ,
		'/': '-' ,
		'_': '-' ,
		',': '-' ,
		':': '-' ,
		';': '-'
	} ) ;

	str = str
	.toLowerCase()
	.replace( /[\s-]+/g , '-' ) // collapse whitespace and hyphen and replace by hyphen only
	.replace( /^-|-$/g , '' ) // remove the first and last hyphen
	.replace( /[^a-z0-9-]/g , '' ) ; // remove remaining invalid chars

	return str ;
} ;



// From the rest-query-shared module
function mapReplace( str , map ) {
	var i , keys , length , from , to ;

	keys = Object.keys( map ) ;
	length = keys.length ;

	for ( i = 0 ; i < length ; i ++ ) {
		from = keys[ i ] ;
		to = map[ from ] ;
		str = str.replace( new RegExp( from , 'g' ) , to ) ;
	}

	return str ;
}



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


