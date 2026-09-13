const admin = require('firebase-admin');
const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');

// 1. Initialize Firebase Admin
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const SITE_DIR = path.join(__dirname, '_site');

/**
 * Generates a Firestore Document ID from a file path.
 * Normalizes paths to ensure "index" is always removed, even on Windows.
 */
function generateDocId(relativePath) {
  // 1. Normalize Windows backslashes (\) to forward slashes (/)
  let id = relativePath.replace(/\\/g, '/');

  // 2. Remove .html extension
  id = id.replace(/\.html$/, '');

  // 3. Handle index files (removes the /index part entirely)
  if (id === 'index') return 'home';
  if (id.endsWith('/index')) {
    id = id.replace(/\/index$/, '');
  }

  // 4. Return the NAME.
  // Replaces remaining directory separators with underscores (e.g., 'folder/page' -> 'folder_page').
  // If you want strictly the file name without folders (e.g., 'page'), change this to: return id.split('/').pop();
  return id.replace(/\//g, '_');
}

async function syncFiles() {
  console.log('--- Starting Sync to Firestore ---');

  if (!fs.existsSync(SITE_DIR)) {
    console.error(`Error: Directory ${SITE_DIR} not found.`);
    return;
  }

  const files = await getFiles(SITE_DIR);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));

  console.log(`Found ${htmlFiles.length} HTML files to process.`);

  for (const filePath of htmlFiles) {
    const relativePath = path.relative(SITE_DIR, filePath);
    const docId = generateDocId(relativePath);

    try {
      const htmlContent = await fs.readFile(filePath, 'utf8');
      const $ = cheerio.load(htmlContent);
      const protectedDiv = $('#protected-content');

      if (protectedDiv.length > 0) {
        const secretContent = protectedDiv.html();

        if (!secretContent || secretContent.trim() === '') {
          console.log(
            `[Skipped] ${relativePath} - Content already vaulted or empty.`,
          );
          continue;
        }

        // 1. Sync to Firestore at protected_pages/NAME
        console.log(`[Syncing] ID: ${docId} | Path: ${relativePath}`);
        await db.collection('protected_pages').doc(docId).set({
          content: secretContent,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          sourcePath: relativePath,
        });

        // 2. Replace content in local file
        protectedDiv.html('');
        await fs.writeFile(filePath, $.html());
        console.log(`[Success] ${relativePath} content has been vaulted.`);
      }
    } catch (err) {
      console.error(`[Error] Failed processing ${relativePath}:`, err.message);
    }
  }

  console.log('--- ✅ Sync Completed ---');
  process.exit();
}

/**
 * Recursively gets all files in a directory
 */
async function getFiles(dir) {
  const subdirs = await fs.readdir(dir);
  const files = await Promise.all(
    subdirs.map(async (subdir) => {
      const res = path.resolve(dir, subdir);
      return (await fs.stat(res)).isDirectory() ? getFiles(res) : res;
    }),
  );
  return files.reduce((a, f) => a.concat(f), []);
}

syncFiles();
