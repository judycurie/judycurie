import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import {
  DOCS_DIR,
  PUBLIC_DIR,
  VIEWS_DIR,
  buildNav,
  buildPageContext,
  findFileCaseInsensitive,
  loadConfig,
  resolveMarkdownForRequest,
} from './src/site.ts';
import type { FlatPageLink, PageViewModel } from './src/site.ts';

const app = express();
app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);

// Serve theme static assets (Bootstrap, theme.css, styles.css, FontAwesome, JS)
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));
// Serve site content assets (images, videos, PDFs, downloads)
app.use('/assets', express.static(path.join(DOCS_DIR, 'assets')));

// Serve non-markdown static files inside docs/ (e.g. /nav/art/NFTartWHY.mp4)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }

  const decodedPath = (() => {
    try {
      return decodeURIComponent(req.path);
    } catch {
      return req.path;
    }
  })();

  const relPath = decodedPath.replace(/^\/+/, '');
  if (!relPath || /\.md$/i.test(relPath)) {
    next();
    return;
  }

  const ext = path.extname(relPath);
  if (!ext) {
    next();
    return;
  }

  const matched = findFileCaseInsensitive(DOCS_DIR, relPath);
  if (matched) {
    res.sendFile(matched);
    return;
  }

  next();
});

// Render Markdown pages with MkDocs Simple Blog layout
app.get('*', (req: Request, res: Response) => {
  const config = loadConfig();
  const decodedPath = (() => {
    try {
      return decodeURIComponent(req.path);
    } catch {
      return req.path;
    }
  })();

  const relMdPath = resolveMarkdownForRequest(decodedPath);
  if (!relMdPath) {
    const flatPages: FlatPageLink[] = [];
    const nav = buildNav(config.nav, '', flatPages);
    const notFoundPage: PageViewModel = {
      title: 'Page Not Found',
      content: '<p>The requested page could not be found. <a href="/">Return home</a>.</p>',
      isHomepage: false,
      previousPage: null,
      nextPage: null,
    };
    res.status(404).render('base', { config, nav, page: notFoundPage });
    return;
  }

  const context = buildPageContext(config, relMdPath);
  res.render('base', context);
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
