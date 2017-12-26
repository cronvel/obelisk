
## Command line common options

* base: base path



## 'build' command

It build the website.

### Options

* preview: preview/local mode, page that should not be published are still built
* protocol: the protocol (either 'http://' or 'https://')
* domain: the website domain, e.g. my-blog.com
* urlRootPath: the root path of the website, default to: /



## 'publish' command

*alias: 'pub'*

It publish locally or remotely.
The second argument should be the target, and a file named `<target-name>.target.kfg` should exist.

### Options

* build: build the site before publishing
* watch: force `--build`, does not exit, watches for changes, build and publish again anytime a file is changed



## 'realtime' command

*alias: 'rt'*

Like *'publish --watch'*, any changes are immediately forwarded to the target.

