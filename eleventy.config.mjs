import EleventyVitePlugin from '@11ty/eleventy-plugin-vite';
import tailwindcss from '@tailwindcss/vite';

export default function (eleventyConfig) {
  // Add the Vite Plugin and pass Tailwind into its options
  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      plugins: [tailwindcss()],
    },
  });

  // Passthrough copy assets
  eleventyConfig.addPassthroughCopy({ 'src/style.css': 'style.css' });
  eleventyConfig.addPassthroughCopy('src/js');

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
    },
  };
}
