const core = require('@actions/core');

async function main() {
  const token = await core.getIDToken();
  console.log(token);
}

main();
