async function main() {
  await messenger.BootstrapLoader.registerChromeUrl([ 
    ["content", "etesync4tbsync", "content/"],
    ["resource", "etesync4tbsync", "."],
  ]);
  await messenger.BootstrapLoader.registerBootstrapScript("chrome://etesync4tbsync/content/bootstrap.js");  
}

main();
