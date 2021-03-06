
## Top-level properties

* siteTitle: the title of the website, e.g.: My Wonderful Blog
* siteBaseLine: the baseline of title of the website
* siteDescription: the website description
* siteCoverImage: the cover image of the website

* protocol: the protocol (either 'http://' or 'https://')
* domain: the website domain, e.g. my-blog.com
* urlRootPath: the root path of the website, default to: /

* owner: the owner of the website's name

* lang: the language of the website, default to: 'en' (english)
* dateFormat: the date's display format (moment.js format), default to: 'LLLL'
* inputDateFormat: the date's input format (moment.js format), default to: 'L LT'

* preview: if true/on/yes, page that should not be published are still built

* nginxTemplate: the template for the Nginx conf, default to: /templates/nginx.conf

* navList: an array of navigation links, object where:
	* title: title of the link
	* url: link url
	* icon: (optional) icon html markup, e.g.: <i class="fa fa-tag"></i>
	* order: (optional) priority of the link, if different from the array order
	* count
	* date
	* indent

* header: the header for normal page (see page header properties), specific page header properties overwrite this
* tagPages: the header for tag pages (see page header properties)



## Page header properties

* title: the page title
* author: the author of this page, in input it's either a string (the author name) or an object,
  in output (at template rendering time) it's always an object (but with a .toString() returning the *name* property).
  See author data.
* tags: a tag or an array of tags for the page
* cover: cover image for the page, default to */media/cover.png*

* publish: if true/yes/on (the default), the page is published (built), if false/no/off, the page is not published (not built)
* addToNav: if true/yes/on, this page is added to the navigation menu (default: false/no/off)
* queryable: if true/yes/on (the default), content on this page can appear in query page

* copyright: name of the copyright holder, default to *Me*
* copyrightLink: link URL for the copyright, default to: *mailto:someone@somewhere.net*
* copyrightYear: copyright year or years, default to current year

* pageTemplate: the top-level template, if there is not an external template renderer, it would use other sub-template
* contentTemplate: the template name for the content
* asideContentTemplate: (optional) the template name for the aside content
* css: a CSS file or an array of CSS file to include
* js: a Javascript file or an array of Javascript file to include

* pageTitleIcon: (optional) icon html markup, e.g.: <i class="fa fa-tag"></i>
* jsTemplate: (optional) the Javascript template

* lang: the language of the page, default to the website's language
* dateFormat: the date's display format (moment.js format), default to the website format
* inputDateFormat: the date's input format (moment.js format), default to the website format

* pageType: the type of the page:
	* *normal-page* a normal content page
	* *query-page* a page that aggregates contents

* navTitle: like *title* in a nav item, default to the page header's title
* navOrder: like *order* in a nav item
* navIndent: like *indent* in a nav item

* query: query are for special pages, collecting content, see query page

* poweredBy: *powered by* name, default to *Obelisk*
* poweredByLink: link URL for the *powered by*, default to *https://npmjs.org/package/obelisk*

* *any other properties*: no internal usage, but accessible in template



## Page header populated properties (accessible in templates)

* tagNavLinks: an array of tag links (see link data)



## Link data

* text: the text of the link
* title: alias of text
* url: the URL/href of the link
* iconHtml: (optional) HTML code for an icon (e.g.: `<i class="fa fa-tag"></i>`)
* image: (optional) the URL of an image
* indent: (optional) link indent (for menu)



## Author data

* name: the name of the author
* id: the id of the author, i.e. its name after some normalization suitable for URL and files
* url: the URL of its page

Standardized data:

* picture: a photo or avatar of the author
* bio: a short biography of the author



## Page data

* header: page header, see page header properties
* contentList: array of parts, object where:
	* id: 
	* content: the content built from markdown
* query: a query object, see query page



## Query page

* tags: a tag or an array of tags to filter content in
* order: order the content by date, either:
	* *descendant* or *desc*
	* *ascendant* or *asc*
* limit: number of content per page



## Hooks

Hooks are Javascript functions exported in the */hooks.js* file, if any.
All those hooks must return a Promise.

* init( config ): called at init time, with the whole config
* templateRenderer( config, data, template, templateCache ): the template renderer for the whole page, called with:
	* config: the whole config
	* data: the page data (header and content)
	* template: the page template
	* templateCache: an object containing cache for template
* microTemplateRenderer( config, data, template, templateCache ): the template renderer for a page part, called with:
	* config: the whole config
	* data: the page data (header and content)
	* template: the page template
	* templateCache: an object containing cache for template



## Top-level automatic (internal) properties

* base: base path
* localRoot: build website path, i.e.: base path + /site
* hooks: loaded from base path + /hooks.js, it should contain hooks
* context: context for hooks



