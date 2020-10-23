/*
 * This file is provided by the addon-developer-support repository at
 * https://github.com/thundernest/addon-developer-support
 *
 * Version: 1.3
 * - flush cache
 *
 * Version: 1.2
 * - add support for resource urls
 *
 * Author: John Bieling (john@thunderbird.net)
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Get various parts of the WebExtension framework that we need.
var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");

var BootstrapLoader = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    this.pathToBootstrapScript = null;
    this.chromeHandle = null;
    this.chromeData = null;
    this.resourceData = null;    
    this.bootstrappedObj = {};

    // make the extension object and the messenger object available inside
    // the bootstrapped scope
    this.bootstrappedObj.extension = context.extension;
    this.bootstrappedObj.messenger = Array.from(context.extension.views)
                      .find(view => view.viewType === "background")
                      .xulBrowser.contentWindow.wrappedJSObject.browser;


    this.BOOTSTRAP_REASONS = {
      APP_STARTUP: 1,
      APP_SHUTDOWN: 2,
      ADDON_ENABLE: 3,
      ADDON_DISABLE: 4,
      ADDON_INSTALL: 5,
      ADDON_UNINSTALL: 6, // not supported
      ADDON_UPGRADE: 7,
      ADDON_DOWNGRADE: 8,
    };

    const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
    const resProto = Cc["@mozilla.org/network/protocol;1?name=resource"].getService(Ci.nsISubstitutingProtocolHandler);
    
    let self = this;

    return {
      BootstrapLoader: {

        registerChromeUrl(data) {
          let chromeData = [];
          let resourceData = [];
          for (let entry of data) {
            if (entry[0] == "resource") resourceData.push(entry);
            else chromeData.push(entry)
          }

          if (chromeData.length > 0) {
            const manifestURI = Services.io.newURI(
              "manifest.json",
              null,
              context.extension.rootURI
            );
            self.chromeHandle = aomStartup.registerChrome(manifestURI, chromeData);
          }

          for (let res of resourceData) {
            // [ "resource", "shortname" , "path" ]
            let uri = Services.io.newURI(
              res[2],
              null,
              context.extension.rootURI
            );
            resProto.setSubstitutionWithFlags(
              res[1],
              uri,
              resProto.ALLOW_CONTENT_ACCESS
            );
          }

          self.chromeData = chromeData;
          self.resourceData = resourceData;
        },

        registerBootstrapScript: async function(aPath) {
          self.pathToBootstrapScript = aPath.startsWith("chrome://")
            ? aPath
            : context.extension.rootURI.resolve(aPath);

          // Get the addon object belonging to this extension.
          let addon = await AddonManager.getAddonByID(context.extension.id);
          //make the addon globally available in the bootstrapped scope
          self.bootstrappedObj.addon = addon;

          // add BOOTSTRAP_REASONS to scope
          for (let reason of Object.keys(self.BOOTSTRAP_REASONS)) {
            self.bootstrappedObj[reason] = self.BOOTSTRAP_REASONS[reason];
          }

          // Load registered bootstrap scripts and execute its startup() function.
          try {
            if (self.pathToBootstrapScript) Services.scriptloader.loadSubScript(self.pathToBootstrapScript, self.bootstrappedObj, "UTF-8");
            if (self.bootstrappedObj.startup) self.bootstrappedObj.startup.call(self.bootstrappedObj, self.extension.addonData, self.BOOTSTRAP_REASONS[self.extension.startupReason]);
          } catch (e) {
            Components.utils.reportError(e)
          }
        }
      }
    };
  }

  onShutdown(isAppShutdown) {
    // Execute registered shutdown()
    try {
      if (this.bootstrappedObj.shutdown) {
        this.bootstrappedObj.shutdown(
          this.extension.addonData,
          isAppShutdown
            ? this.BOOTSTRAP_REASONS.APP_SHUTDOWN
            : this.BOOTSTRAP_REASONS.ADDON_DISABLE);
      }
    } catch (e) {
      Components.utils.reportError(e)
    }

    if (this.resourceData) {
      const resProto = Cc["@mozilla.org/network/protocol;1?name=resource"].getService(Ci.nsISubstitutingProtocolHandler);
      for (let res of this.resourceData) {
        // [ "resource", "shortname" , "path" ]
        resProto.setSubstitution(
          res[1],
          null,
        );
      }
    }

    if (this.chromeHandle) {
      this.chromeHandle.destruct();
      this.chromeHandle = null;
    }
    // Flush all caches
    Services.obs.notifyObservers(null, "startupcache-invalidate");
    console.log("BootstrapLoader for " + this.extension.id + " unloaded!");
  }
};
