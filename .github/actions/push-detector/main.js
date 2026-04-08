// main.js — Starts a background watcher process that monitors for buildx
// metadata files created by docker/build-push-action.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Helpers that write to GITHUB_OUTPUT and GITHUB_STATE without @actions/core
function setOutput(name, value) {
  const filePath = process.env.GITHUB_OUTPUT || "";
  if (filePath) {
    fs.appendFileSync(filePath, `${name}=${value}${os.EOL}`);
  }
}

function saveState(name, value) {
  const filePath = process.env.GITHUB_STATE || "";
  if (filePath) {
    fs.appendFileSync(filePath, `${name}=${value}${os.EOL}`);
  }
}

const runnerTemp = process.env.RUNNER_TEMP || os.tmpdir();
const resultsFile = path.join(runnerTemp, "push-detector-results.jsonl");
const logFile = path.join(runnerTemp, "push-detector.log");
const watcherScript = path.join(__dirname, "watcher.js");

// Create an empty results file
fs.writeFileSync(resultsFile, "");

// Spawn the watcher as a detached process so it survives this step
const child = spawn(process.execPath, [watcherScript, runnerTemp, resultsFile], {
  detached: true,
  stdio: ["ignore", fs.openSync(logFile, "w"), fs.openSync(logFile, "a")],
});

child.unref();

const pid = child.pid;
console.log(`Push detector started (PID: ${pid}), watching ${runnerTemp}`);

// Persist state for the post step
saveState("watcher-pid", String(pid));
saveState("results-file", resultsFile);
saveState("log-file", logFile);
