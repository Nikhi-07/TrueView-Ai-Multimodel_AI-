const fs = require('fs');
const path = require('path');

const manifestSrc = path.join(__dirname, '../manifest.json');
const manifestDist = path.join(__dirname, '../dist/manifest.json');

const raw = fs.readFileSync(manifestSrc, 'utf8');
const manifest = JSON.parse(raw);

// Adjust output paths for dist folder structure
manifest.background = {
  service_worker: "background/service-worker.js",
  type: "module"
};
manifest.action.default_popup = "src/popup/index.html";
manifest.side_panel.default_path = "src/sidepanel/index.html";
manifest.content_scripts = [
  {
    matches: [
      "https://meet.google.com/*",
      "https://teams.microsoft.com/*",
      "https://teams.live.com/*"
    ],
    js: ["content/content-script.js"],
    run_at: "document_end"
  }
];

fs.writeFileSync(manifestDist, JSON.stringify(manifest, null, 2));
console.log('Successfully copied and formatted dist/manifest.json!');
