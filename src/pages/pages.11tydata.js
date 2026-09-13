module.exports = {
  permalink: (data) => {
    // If it's the index page, compile directly to the root index.html
    if (data.page.fileSlug === 'login' || data.page.fileSlug === 'index') {
      return 'index.html';
    }
    // Otherwise, create a clean directory folder at the root
    return `${data.page.fileSlug}/index.html`;
  },
};
