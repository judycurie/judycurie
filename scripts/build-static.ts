import ejs from 'ejs';
import fs from 'node:fs';
import path from 'node:path';
import {
  DIST_DIR,
  DOCS_DIR,
  PUBLIC_DIR,
  VIEWS_DIR,
  buildNav,
  buildPageContext,
  fileToUrl,
  listAllMarkdownFiles,
  loadConfig,
} from '../src/site.ts';
import type { FlatPageLink, PageViewModel } from '../src/site.ts';

function copyDirectoryRecursive(
  srcDir: string,
  destDir: string,
  skipFile?: (relPath: string) => boolean,
  prefix = ''
): void {
  if (!fs.existsSync(srcDir)) {
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, skipFile, rel);
    } else if (entry.isFile()) {
      if (skipFile && skipFile(rel)) {
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function buildStaticSite(): Promise<void> {
  const config = loadConfig();
  const baseTemplatePath = path.join(VIEWS_DIR, 'base.ejs');

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 1. Copy theme static assets (Bootstrap, styles.css, theme.css, FontAwesome, JS)
  copyDirectoryRecursive(path.join(PUBLIC_DIR, 'assets'), path.join(DIST_DIR, 'assets'));

  // 2. Copy all non-Markdown files from docs/ (images, videos, PDFs, CNAME, downloads)
  copyDirectoryRecursive(DOCS_DIR, DIST_DIR, (rel) => /\.md$/i.test(rel));

  // 3. Ensure GitHub Pages CNAME and .nojekyll files exist at dist root
  const docsCnamePath = path.join(DOCS_DIR, 'CNAME');
  if (fs.existsSync(docsCnamePath)) {
    fs.copyFileSync(docsCnamePath, path.join(DIST_DIR, 'CNAME'));
  }
  fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '');

  // 4. Render every Markdown document in docs/ to static HTML
  const markdownFiles = listAllMarkdownFiles(DOCS_DIR);
  for (const relMdPath of markdownFiles) {
    const context = buildPageContext(config, relMdPath);
    const html = await ejs.renderFile(baseTemplatePath, context, {
      views: [VIEWS_DIR],
    });
    const urlPath = fileToUrl(relMdPath).replace(/^\/+|\/+$/g, '');
    const outDir = urlPath ? path.join(DIST_DIR, urlPath) : DIST_DIR;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
  }

  // 5. Render 404.html for GitHub Pages
  const flatPages: FlatPageLink[] = [];
  const nav = buildNav(config.nav, '', flatPages);
  const notFoundPage: PageViewModel = {
    title: 'Page Not Found',
    content: '<p>The requested page could not be found. <a href="/">Return home</a>.</p>',
    isHomepage: false,
    previousPage: null,
    nextPage: null,
  };
  const notFoundHtml = await ejs.renderFile(
    baseTemplatePath,
    { config, nav, page: notFoundPage },
    { views: [VIEWS_DIR] }
  );
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), notFoundHtml, 'utf-8');

  console.log(`Static site built to dist/ (${markdownFiles.length} pages + 404.html)`);
}

await buildStaticSite();
