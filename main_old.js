var fs = require('fs');
var util = require('util');
var https = require("https");
var jsdom = require("jsdom");
var istoreBusnUrlTmpl = "https://itunes.apple.com/us/genre/ios-business/id6000?mt=8&letter=";
var istoreEntertUrlTmpl = "https://itunes.apple.com/us/genre/ios-entertainment/id6016?mt=8&letter=";
var istoreTravelUrlTmpl = "https://itunes.apple.com/us/genre/ios-travel/id6003?mt=8&letter=";
var istoreUkPopular = "https://www.apple.com/itunes/charts/free-apps/";
var numAppsToSelect = 50;
var _rforeign = /[^\u0000-\u007f]/;
var _popularAppNames;
var _jqueryStr = fs.readFileSync("./jquery-2.0.3.min.js");

// free
// Business
// iPhone

function _shuffle(o) {
	for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
	return o;
};

function _getAndProcessAPage(url, processingCallback) {
	//console.log("FROM: " + url);
	https.get(url, function(res) {
		var htmlStrStore = "";
		console.log("%s FROM: %s", res.statusCode, url);
		res.on('data', function(d) {
			htmlStrStore += d;
			return;
		});
		res.on('end', function(ev) {
			jsdom.env({
				html : htmlStrStore,
				src : [_jqueryStr],
				done : function(errors, window) {
					if(errors) {
						return console.error("PARSING ERROR: %j", errors);
					}
					processingCallback(window);
					window.close();
					window = null;
					htmlStrStore = null;
					if(process.memoryUsage().heapUsed > 500000000) {//only call if memory use is bove
						// 200MB
						console.log("Memory cleaning");
						return global.gc();
					}
					return;
				}
			});
			return;
		});
	}).on('error', (function(url, processingCallback) {
		return function(e) {
			console.error("Re-trying because of: '%s' FROM: %s", e, url);
			return _getAndProcessAPage(url, processingCallback);
		};
	})(url, processingCallback));
	return;
}

function getPopularApps(callback) {
	return _getAndProcessAPage(istoreUkPopular, function(window) {
		var res = [];
		window.$("section.section").find("li h3 a").each(function(i, el) {
			var thisA = window.$(el);
			var appName = thisA.text();
			if(!_rforeign.test(appName)) {
				res.push(appName);
			} else {
				console.log("Non-Latin app name" + appName);
			}
		});
		return callback(res);
	});
}

function crawlApps(urls, callback) {
	var appStorage = [];
	function _wrapper(url) {
		_getAndProcessAPage(url, function(window) {
			var res = [];
			window.$("#selectedcontent").find("li a").each(function(i, el) {
				var thisA = window.$(el);
				var appName = thisA.text();
				if(!_rforeign.test(appName)) {
					if(_popularAppNames.indexOf(appName) == -1) {
						res.push({
							url : thisA.attr("href"),
							name : appName
						});
					} else {
						console.log("Popular APP met: " + appName);
					}
				} else {
					//console.log("Non-Latin app name" + appName);
				}
			});
			appStorage = appStorage.concat(res);
			res = null;
			if(urls.length) {
				return _wrapper(urls.shift());
			} else {
				return callback(appStorage);
			}
		});
	}

	return _wrapper(urls.shift());
};

function buildUrls(category, callback) {
	switch(category) {
		case "Business":
			baseUrl = istoreBusnUrlTmpl;
			break;
		case "Entertainment":
			baseUrl = istoreEntertUrlTmpl;
			break;
		case "Travel":
			baseUrl = istoreTravelUrlTmpl;
			break;
		default:
			throw "Unknown category";
	}
	var urls = [];
	var aCharCode = 'A'.charCodeAt(0);
	var zCharCode = 'Z'.charCodeAt(0);
	var semaphore = zCharCode - aCharCode + 1;
	for(var i = aCharCode; i <= zCharCode; i++) {
		var currLetter = String.fromCharCode(i);
		_getAndProcessAPage(baseUrl + currLetter, (function(_originalUrl) {
			return function(window) {
				semaphore--;
				var jqAels = window.$("#selectedgenre").find("ul.paginate li a");
				var ind = jqAels.length;
				var ind = Math.floor(Math.random() * (ind));
				var thisAhref = window.$(jqAels[ind]).attr("href");
				if(!thisAhref) {
					console.log("This href is undefined - switch to default");
					thisAhref = _originalUrl;
				}
				urls.push(thisAhref);
				if(!semaphore) {
					return callback(urls);
				}
				return;
			};
		})(baseUrl + currLetter));
	}
	return urls;
}

function saveResults(apps, category, numOfAllApps) {
	return fs.open("./" + category.toString() + ".txt", 'w', function(err, fd) {
		if(err) {
			return console.error("FILE ERROR: %j", err);
		}
		fs.write(fd, util.format('Selected out of %d apps\n\n', numOfAllApps));
		for(var i = 0, ilen = apps.length; i < ilen; i++)
			fs.write(fd, util.format('NUM - %d\n%s\n%s\n\n', i, apps[i].name, apps[i].url));
		fs.close(fd);
	});
}

function checkAndSelectApps(categoryName, apps, callback) {
	var remixedApps = _shuffle(apps);
	var selectedApps = [];
	function _wrapper() {
		if(!remixedApps.length) {
			return callback(selectedApps);
		}
		var anApp = remixedApps.shift();
		_getAndProcessAPage(anApp.url, function(window) {
			window.$("div#left-stack").find("li.genre a").each(function(i, el) {
				var thisA = window.$(el);
				var categoryText = thisA.text();
				if(categoryText == categoryName) {
					var priceStr = window.$("div.price").text();
					if(priceStr == "Free") {
						var appRequirementsStr = window.$("span.app-requirements").parent().text().toString();
						if(appRequirementsStr.indexOf("iPhone") > -1) {
							selectedApps.push(anApp);
							console.log(" Pushed app: " + anApp.name);
						} else {
							//console.log("NO iPHONE:" + appRequirementsStr);
						}
					} else {
						//console.log("NOT FOR FREE: " + remixedApps[i].name);
					}
				} else {
					//console.log("CATEGORY MISMATCH: " + categoryText);
				}
			});
			console.log("APPS SELECTED:" + selectedApps.length);
			if(selectedApps.length < numAppsToSelect) {
				return _wrapper();
			} else {
				return callback(selectedApps);
			}
		});
	}
	return _wrapper();
}

// function saveAllApps(category, apps) {
// return checkAndSelectApps(category, apps, function(selectedApps) {
// saveResults(selectedApps, "business", busnApps.length);
// return checkAndSelectApps("Entertainment", entertApps, function(selectedApps)
// {
// saveResults(selectedApps, "Entertainment", entertApps.length);
// return checkAndSelectApps("Travel", travelApps, function(selectedApps) {
// saveResults(selectedApps, "travel", travelApps.length);
// return console.log("DONE!");
// });
// });
// });
// }

// function crawlAllCategoryApps(category, urls, callback) {
// var busnApps, entertApps, travelApps;
// return crawlApps(busnUrls, function(apps) {
// busnApps = apps;
// console.log("Busn app num: " + apps.length);
// return crawlApps(travelUrls, function(apps) {
// travelApps = apps;
// console.log("Travel app num: " + apps.length);
// return crawlApps(entertUrls, function(apps) {
// entertApps = apps;
// console.log("Entert app num: " + apps.length);
// return saveAllApps(busnApps, entertApps, travelApps);
// });
// });
// });
// }

function main(category, callback) {
	return buildUrls(category, function(urls) {
		return crawlApps(urls, function(apps) {
			console.log(category + " app num: " + apps.length);
			return checkAndSelectApps(category, apps, function(selectedApps) {
				saveResults(selectedApps, category, apps.length);
				callback();
			});
		});
	});
};

(function glMain() {
	return getPopularApps(function(popularAppNames) {
		_popularAppNames = popularAppNames;
		return main("Business", function() {
			console.log("Done!");
		});
		// return main("Business", function() {
			// return main("Entertainment", function() {
				// return main("Travel", function() {
					// console.log("Done!");
				// });
			// });
		// });
	});
})();
