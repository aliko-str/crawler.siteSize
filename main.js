// quick cd -->
// /Users/Aleksii/Documents/Dropbox/Projects/Exp[3.0]/node/webCrawler.siteSize

var fs = require('fs');
var util = require('util');
var https = require("http");
var jsdom = require("jsdom");
var sprintf = util.format;
var url = require("url");

var _jqueryStr = fs.readFileSync("./jquery-2.0.3.min.js");
var _websToCrawl = require("./webs.to.crawl.js").allSites;
var _settings = {
	maxDepth : 3,
	countNonHtmlLinks : true,
	outFName : "./websSizes.txt"
};
var _treeNodeStates = {
	toBeChecked : 1,
	notLeaf : 2,
	leaf : 3
};

function treeConstructor(site) {
	var outpTree = {
		webRoot : site.webRoot,
		_allPageStoreTime: {
			// "url": timeToLoadUrl in milliseconds
		},
		_allPageStore : {
			// "url": linkStoreArray
		},
		levelsLinks : {
			"1" : {
				pages : ["http://" + site.home],
				pointer : 0
			}
		},
		levelsPages : {
			"1" : {
				pages : {
				}
				//pointer: 0
			}
		}
	};
	outpTree.levelsPages["1"].pages["http://" + site.home] = _treeNodeStates.toBeChecked;
	for(var i = 2; i <= _settings.maxDepth; i++) {
		outpTree.levelsLinks[i.toString()] = {
			pages : [],
			pointer : 0
		};
		outpTree.levelsPages[i.toString()] = {
			pages : {}
		};
	}
	return outpTree;
}

(function main() {
	(function onSiteProcessedCallback(outpTree) {
		if(outpTree) {
			// save results; otherwise it's the first go
			var totalPageNum = Object.keys(outpTree._allPageStore).length;
			var breadth = 0;
			for(var key in outpTree.levelsPages) {
				for(var urlKey in outpTree.levelsPages[key].pages) {
					if(outpTree.levelsPages[key].pages[urlKey] != _treeNodeStates.notLeaf) {
						breadth++;
					}
				}
			}
			var totalLinkNum = 0;
			for(var key in outpTree.levelsLinks) {
				totalLinkNum += outpTree.levelsLinks[key].pages.length;
			}
			var linkBreadth = outpTree.levelsLinks[_settings.maxDepth.toString()].pages.length;
			var allLinkCount = 0;
			for(var key in outpTree._allPageStore) {
				allLinkCount += outpTree._allPageStore[key].length;
			}
			var linksPerPageAv = allLinkCount / Object.keys(outpTree._allPageStore).length;
			var timePerPage = 0;
			var _nonEmptyPageCount = 0;
			for (var key in outpTree._allPageStoreTime) {
		    var val = outpTree._allPageStoreTime[key];
		    if(val > -1){
		    	timePerPage += val;
		    	_nonEmptyPageCount++;
		    }
			}
			timePerPage = timePerPage / _nonEmptyPageCount;
			saveALine(outpTree.webRoot, totalPageNum, breadth, totalLinkNum, linkBreadth, linksPerPageAv, timePerPage);
		}
		var aWebsite = _websToCrawl.shift();
		if(aWebsite) {
			console.log("Processing website: " + aWebsite.webRoot);
			extractLinksFromAsite(aWebsite, onSiteProcessedCallback);
		} else {
			console.log("FINISHED");
		}
	})();
	return;
})();

function checkIfSameOrigin(webRoot, url) {
	if(url.indexOf(webRoot) == -1) {
		return false;
	}
	return true;
}

function extractLinksFromAsite(site, onSiteProcessedCallback) {
	var websiteOrigin = site.webRoot.replace("www.", "");
	var outpTree = treeConstructor(site);
	function traverseTreeForAPage(outpTree, callback) {
		var currLevel = 0;
		while(++currLevel < _settings.maxDepth) {
			var pCurrLevel = outpTree.levelsLinks[currLevel.toString()];
			if(pCurrLevel.pages.length > pCurrLevel.pointer) {
				var pageUrl = pCurrLevel.pages[pCurrLevel.pointer];
				pCurrLevel.pointer++;
				return (callback(pageUrl, currLevel, outpTree));
			}
		}
		// otherwise we've reached the end - no more page to traverse
		onSiteProcessedCallback(outpTree);
	}

	traverseTreeForAPage(outpTree, processAPage);
	function processAPage(pageUrl, level, outpTree) {
		if(outpTree._allPageStore[pageUrl]) {
			// we've already visited it -- simply add that page links to the next level
			var urlArr = outpTree._allPageStore[pageUrl];
			for(var i = 0, ilen = urlArr.length; i < ilen; i++) {
				outpTree.levelsLinks[(level + 1).toString()].pages.push(urlArr[i]);
			}
			traverseTreeForAPage(outpTree, processAPage);
		} else {
			// visit, add to pageStore, add to linkStore, add to the globalPageIndex
			extractLinksFromAPage(pageUrl, function(timeToLoadPage, urlArr) {
				outpTree._allPageStoreTime[pageUrl] = timeToLoadPage;
				outpTree._allPageStore[pageUrl] = urlArr;
				var theCheckedPageLeafStatus = _treeNodeStates["leaf"];
				for(var i = 0, ilen = urlArr.length; i < ilen; i++) {
					var url = urlArr[i];
					outpTree.levelsLinks[(level + 1).toString()].pages.push(url);
					if(!outpTree._allPageStore[url] && checkIfSameOrigin(websiteOrigin, url)) {
						theCheckedPageLeafStatus = _treeNodeStates["notLeaf"];
						outpTree.levelsPages[(level + 1).toString()].pages[url] = _treeNodeStates["toBeChecked"];
					}
				}
				outpTree.levelsPages[(level).toString()].pages[pageUrl] = theCheckedPageLeafStatus;
				traverseTreeForAPage(outpTree, processAPage);
			});
		}
		return;
	}

}

function parseHtmlExtractLinks(originUrl, windowObj, timeToLoadPage, callback) {
	var links = [];
	windowObj.$("a").each(function(i, el) {
		var hrefStr = windowObj.$(el).attr("href") || "";
		hrefStr = url.resolve(originUrl, hrefStr);
		hrefStr = hrefStr.replace(el.hash, "");
		links.push(hrefStr);
		return;
	});
	return callback(timeToLoadPage, links);
}

function checkUrlForNodeHttpModule(url) {
	if(url.indexOf("http://") !== 0) {
		return false;
	}
	return true;
}

function extractLinksFromAPage(url, callback) {
	function onErrorCallback(request){
		if(request){
			request.abort();
			request = null;
		}
		callback(-1, []);
		return;
	}
	if(!checkUrlForNodeHttpModule(url)) {
		console.log("Not 'http://' protocol: " + url);
		onErrorCallback();
		return;
	}
	var reqAttemptCounter = 0;
	function requestFunc(url, callback) {
		if(++reqAttemptCounter > 2){
			onErrorCallback();
			return;
		}
		var timeStampBeforeSend = Date.now();
		var request = https.get(url, function(res) {
			var htmlStrStore = "";
			console.log("%s FROM: %s", res.statusCode, url);
			if(res.statusCode >= 500){
				requestFunc(url, callback);
				return;
			}
			if(res.statusCode < 200 || res.statusCode >= 300){
				onErrorCallback(request);
				return;
			}
			if(!res.headers["content-type"] || res.headers["content-type"].toLowerCase().indexOf("text/html") == -1) {
				// not HTML --> no page parsing; simpy return an empty array of outgoing urls +
				// abort the request
				console.log("Not-HTML page is met, content-type: " + res.headers["content-type"]);
				onErrorCallback(request);
				return;
			}
			res.on('data', function(d) {
				htmlStrStore += d;
				return;
			});
			res.on('end', function(ev) {
				var timeToLoadPage = Date.now() - timeStampBeforeSend;
				jsdom.env({
					html : htmlStrStore,
					src : [_jqueryStr],
					done : function(errors, window) {
						if(errors) {
							onErrorCallback(request);
							return console.error("PARSING ERROR: %j", errors);
						} {
							// the actual parsing out of links
							parseHtmlExtractLinks(url, window, timeToLoadPage, callback);
						} {
							// clean up <-- there is a memory leak somewhere down the line
							window.close();
							window = null;
							htmlStrStore = null;
							if(process.memoryUsage().heapUsed > 500000000) {
								console.log("Memory cleaning");
								return global.gc();
							}
						}
						return;
					}
				});
				return;
			});
		});
		request.on('error', (function(url, callback) {
			return function(e) {
				console.error("Re-trying because of: '%s' FROM: %s", e, url);
				requestFunc(url, callback);
				return;
			};
		})(url, callback));
		return request;
	}
	var request = requestFunc(url, callback);
	return;
}

function saveALine(webRoot, totalPageNum, breadth, totalLinkNum, linkBreadth, linksPerPageAv, timePerPage) {
	var strToSave = sprintf("%s\t%d\t%d\t%d\t%d\t%d\t%d\n", webRoot, totalPageNum, breadth, totalLinkNum, linkBreadth, linksPerPageAv, timePerPage);
	fs.exists(_settings.outFName, function(ifExists) {
		if(!ifExists) {
			var txtHeaders = sprintf("%s\t%s\t%s\t%s\t%s\t%s\t%s\n", "webRoot", "totalPageNum", "breadth", "totalLinkNum", "linkBreadth", "linksPerPageAv", "timePerPage");
			strToSave = txtHeaders + strToSave;
		}
		fs.appendFile(_settings.outFName, strToSave, {
			flag : "a"
		}, function(err) {
			if(err) {
				return console.error("FILE ERROR: %j", err);
			}
			return "OK";
		});
		return;
	});
	return strToSave;
}
