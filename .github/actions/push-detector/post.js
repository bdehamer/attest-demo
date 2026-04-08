// post.js — Runs after all workflow steps. Stops the watcher and collects
// the detected push results.
const fs = require("fs");
const os = require("os");

function getState(name) {
  return process.env[`STATE_${name}`] || "";
}

function setOutput(name, value) {
  const filePath = process.env.GITHUB_OUTPUT || "";
  if (!filePath) return;

  // Use delimiter format for multi-line values
  const delimiter = `ghadelimiter_${Math.random().toString(36).slice(2)}`;
  fs.appendFileSync(
    filePath,
    `${name}<<${delimiter}${os.EOL}${value}${os.EOL}${delimiter}${os.EOL}`
  );
}

const watcherPid = getState("watcher-pid");
const resultsFile = getState("results-file");
const logFile = getState("log-file");

// Stop the watcher process
if (watcherPid) {
  try {
    process.kill(Number(watcherPid));
    console.log(`Stopped push detector (PID: ${watcherPid})`);
  } catch {
    // Process may have already exited
  }
}

// Small delay to let the watcher flush any final writes
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await sleep(500);

  // Dump the watcher log for debugging
  if (logFile) {
    try {
      const log = fs.readFileSync(logFile, "utf-8").trim();
      if (log) {
        console.log("::group::Push detector log");
        console.log(log);
        console.log("::endgroup::");
      }
    } catch {
      // No log file
    }
  }

  // Read and output results
  let pushes = [];
  if (resultsFile) {
    try {
      const content = fs.readFileSync(resultsFile, "utf-8").trim();
      if (content) {
        pushes = content
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      }
    } catch (err) {
      console.error(`Failed to read results: ${err.message}`);
    }
  }

  console.log(`Detected ${pushes.length} push(es)`);
  for (const push of pushes) {
    console.log(`  ${push.image} @ ${push.digest}`);
  }

  setOutput("pushes", JSON.stringify(pushes));
}

main().catch((err) => {
  console.error(`Post step failed: ${err.message}`);
  process.exitCode = 0; // Don't fail the workflow
});
