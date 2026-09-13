const fs = require('fs/promises');
const path = require('path');

async function deleteSiteDirectory() {
  let targetDir = path.join(__dirname, '_site');

  try {
    await fs.rm(targetDir, {
      recursive: true,
      force: true,
    });
    console.log(`Successfully deleted: ${targetDir}`);
  } catch (err) {
    console.error(`Error while deleting directory: ${err.message}`);
  }
}

deleteSiteDirectory();
