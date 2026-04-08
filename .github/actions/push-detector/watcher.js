// watcher.js — Background process that watches for buildx metadata files.
//
// docker/build-push-action (via @docker/actions-toolkit) writes build results
// to a file named "build-metadata-<random>.json" inside a temp directory under
// $RUNNER_TEMP. This watcher uses fs.watch() to detect those files and extract
// the container image digest and name.
const fs = require("fs");
const path = require("path");

const watchDir = process.argv[2];
const resultsFile = process.argv[3];

if (!watchDir || !resultsFile) {
  console.error("Usage: watcher.js <watch-dir> <results-file>");
  process.exit(1);
}

const seen = new Set();

// Scan a directory for metadata files we may have missed
function scanDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recurse into docker-actions-toolkit-* subdirectories
      if (entry.name.startsWith("docker-actions-toolkit-")) {
        watchSubDir(fullPath);
        scanDir(fullPath);
      }
    } else if (entry.isFile() && entry.name.match(/^build-metadata-.*\.json$/)) {
      processMetadataFile(fullPath);
    }
  }
}

// Process a single metadata file
function processMetadataFile(filePath) {
  if (seen.has(filePath)) return;
  seen.add(filePath);

  // Retry a few times — the file may still be written
  let attempts = 0;
  const tryRead = () => {
    attempts++;
    try {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (!content || content === "null") {
        if (attempts < 5) {
          setTimeout(tryRead, 200);
        }
        return;
      }

      const metadata = JSON.parse(content);
      const digest = metadata["containerimage.digest"];
      const image = metadata["image.name"] || "";

      if (digest) {
        const result = JSON.stringify({
          digest,
          image,
          timestamp: new Date().toISOString(),
        });

        fs.appendFileSync(resultsFile, result + "\n");
        console.log(`Push detected: ${image} @ ${digest}`);
      }
    } catch (err) {
      // File may not be ready yet — retry
      if (attempts < 5) {
        setTimeout(tryRead, 200);
      } else {
        console.error(`Failed to process ${filePath}: ${err.message}`);
      }
    }
  };

  tryRead();
}

// Watch a subdirectory for new metadata files
function watchSubDir(dir) {
  try {
    fs.watch(dir, (eventType, filename) => {
      if (filename && filename.match(/^build-metadata-.*\.json$/)) {
        // Small delay to let the writer finish
        setTimeout(() => processMetadataFile(path.join(dir, filename)), 300);
      }
    });
  } catch {
    // Directory may not exist yet
  }
}

// Watch the top-level temp directory for new docker-actions-toolkit-* dirs
try {
  fs.watch(watchDir, (eventType, filename) => {
    if (filename && filename.startsWith("docker-actions-toolkit-")) {
      const subDir = path.join(watchDir, filename);
      // Wait for the directory to be fully created
      setTimeout(() => {
        try {
          if (fs.statSync(subDir).isDirectory()) {
            watchSubDir(subDir);
            scanDir(subDir);
          }
        } catch {
          // not a directory or doesn't exist yet
        }
      }, 100);
    }
  });
} catch (err) {
  console.error(`Failed to watch ${watchDir}: ${err.message}`);
  process.exit(1);
}

// Also scan for any existing toolkit dirs (in case the action ran after
// a build-push-action, though that's not the expected usage)
scanDir(watchDir);

console.log(`Watcher started, monitoring ${watchDir}`);

// Keep the process alive
setInterval(() => {}, 60000);
