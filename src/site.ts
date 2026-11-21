import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DOCS_DIR = path.join(ROOT_DIR, 'docs');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const VIEWS_DIR = path.join(ROOT_DIR, 'views');
export const DIST_DIR = path.join(ROOT_DIR, 'dist');
export const CONFIG_PATH = path.join(ROOT_DIR, 'site.config.json');

export interface NavConfigItem {
  title?: string;
  file?: string;
  children?: NavConfigItem[];
}

export interface SocialItem {
  icon?: string;
  link: string;
  name: string;
}

export interface SiteConfig {
  siteName: string;
  siteTitleMeta: string;
  siteDescription: string;
  repoName?: string;
  siteUrl?: string;
  copyright?: string;
  email?: string;
  theme: {
    titleStyle: string;
    siteNameStyle: string;
    favicon?: string;
    logo?: string;
    colors?: {
      text?: string;
      title?: string;
      primary?: string;
      background?: string;
    };
  };
  nav: NavConfigItem[];
  social: SocialItem[];
}

export interface ResolvedNavItem {
  title: string;
  file?: string;
  url: string;
  active: boolean;
  children: ResolvedNavItem[];
}

export interface FlatPageLink {
  title: string;
  file: string;
  url: string;
}

export interface PageViewModel {
  title: string;
  content: string;
  isHomepage: boolean;
  previousPage: FlatPageLink | null;
  nextPage: FlatPageLink | null;
}

export function loadConfig(): SiteConfig {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw) as SiteConfig;
}

export function fileToUrl(relMdPath: string): string {
  const normalized = relMdPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized === 'index.md') {
    return '/';
  }
  const withoutExt = normalized.replace(/\.md$/i, '');
  if (withoutExt.endsWith('/index')) {
    return `/${withoutExt.slice(0, -'/index'.length)}/`;
  }
  return `/${withoutExt}/`;
}

export function humanizeFilename(relMdPath: string): string {
  const base = path.posix.basename(relMdPath, '.md');
  if (base.toLowerCase() === 'index') {
    return 'Home';
  }
  if (/^[A-Z0-9]+$/.test(base)) {
    return base;
  }
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function extractPageTitle(relMdPath: string, explicitTitle?: string): string {
  if (explicitTitle) {
    return explicitTitle;
  }
  const absPath = path.join(DOCS_DIR, relMdPath);
  if (fs.existsSync(absPath)) {
    const content = fs.readFileSync(absPath, 'utf-8');
    const firstNonEmptyLine = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstNonEmptyLine) {
      const match = firstNonEmptyLine.match(/^#{1,3}\s*(.+)$/);
      if (match && match[1]) {
        return match[1].replace(/\*\*/g, '').trim();
      }
    }
  }
  return humanizeFilename(relMdPath);
}

export function buildNav(
  items: NavConfigItem[],
  currentFile: string,
  flatPages: FlatPageLink[]
): ResolvedNavItem[] {
  return items.map((item) => {
    if (item.children && item.children.length > 0) {
      const children = buildNav(item.children, currentFile, flatPages);
      const isActive = children.some((child) => child.active);
      return {
        title: item.title ?? '',
        url: '#',
        active: isActive,
        children,
      };
    }

    const file = item.file ?? 'index.md';
    const url = fileToUrl(file);
    const title = extractPageTitle(file, item.title);
    flatPages.push({ title, file, url });

    return {
      title,
      file,
      url,
      active: file.toLowerCase() === currentFile.toLowerCase(),
      children: [],
    };
  });
}

export function findFileCaseInsensitive(baseDir: string, relPath: string): string | null {
  const segments = relPath.split('/').filter(Boolean);
  let current = baseDir;

  for (const segment of segments) {
    const exact = path.join(current, segment);
    if (fs.existsSync(exact)) {
      current = exact;
      continue;
    }
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
      return null;
    }
    const entries = fs.readdirSync(current);
    const matched = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
    if (!matched) {
      return null;
    }
    current = path.join(current, matched);
  }

  return fs.existsSync(current) && fs.statSync(current).isFile() ? current : null;
}

export function resolveDocAssetPath(rawUrl: string, currentMdRelPath: string): string {
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  const [pathPart, hashPart] = trimmed.split('#');
  const [cleanPath, queryPart] = pathPart.split('?');
  const suffix = `${queryPart ? `?${queryPart}` : ''}${hashPart ? `#${hashPart}` : ''}`;

  const decodedPath = (() => {
    try {
      return decodeURIComponent(cleanPath);
    } catch {
      return cleanPath;
    }
  })();

  const mdDir = path.posix.dirname(currentMdRelPath.replace(/\\/g, '/'));
  const baseDir = mdDir === '.' ? '/' : `/${mdDir}`;
  const resolvedPosix = path.posix.resolve(baseDir, decodedPath);

  if (/\.md$/i.test(resolvedPosix)) {
    const candidateRel = resolvedPosix.replace(/^\/+/, '');
    const matchedMd = findFileCaseInsensitive(DOCS_DIR, candidateRel);
    if (matchedMd) {
      const actualRel = path.relative(DOCS_DIR, matchedMd).replace(/\\/g, '/');
      return `${fileToUrl(actualRel)}${suffix}`;
    }
    return `${fileToUrl(candidateRel)}${suffix}`;
  }

  const relFromDocs = resolvedPosix.replace(/^\/+/, '');
  const candidates = [
    relFromDocs,
    relFromDocs.startsWith('nav/') ? relFromDocs : `nav/${relFromDocs}`,
    relFromDocs.startsWith('assets/') ? relFromDocs : `assets/${relFromDocs}`,
    relFromDocs.replace(/^([^/]+)\/assets\//, 'assets/$1/'),
  ];

  for (const candidate of candidates) {
    const matched = findFileCaseInsensitive(DOCS_DIR, candidate);
    if (matched) {
      const actualRel = path.relative(DOCS_DIR, matched).replace(/\\/g, '/');
      const encoded = actualRel
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      return `/${encoded}${suffix}`;
    }
  }

  const fallbackEncoded = relFromDocs
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/${fallbackEncoded}${suffix}`;
}

export function preprocessMarkdown(rawMarkdown: string): string {
  const lines = rawMarkdown.split(/\r?\n/);
  let inCodeFence = false;

  const processedLines = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      return line;
    }
    if (inCodeFence) {
      return line;
    }

    let nextLine = line;
    nextLine = nextLine.replace(/^(\s*#{1,6})([^\s#])/, '$1 $2');
    nextLine = nextLine.replace(/\*\*([^*\n]+?)\s+\*\*/g, '**$1**');
    nextLine = nextLine.replace(/(\[[^\]]+\]\([^)]+\))\{:[^}]+\}/g, '$1');
    return nextLine;
  });

  return processedLines.join('\n');
}

export function rewriteHtmlUrls(html: string, currentMdRelPath: string): string {
  return html.replace(
    /\b(href|src)=("([^"]*)"|'([^']*)')/gi,
    (_fullMatch, attr: string, _quoted: string, doubleVal?: string, singleVal?: string) => {
      const rawUrl = doubleVal ?? singleVal ?? '';
      const resolved = resolveDocAssetPath(rawUrl, currentMdRelPath);
      return `${attr}="${resolved}"`;
    }
  );
}

export function renderMarkdownFile(relMdPath: string): string {
  const absPath = path.join(DOCS_DIR, relMdPath);
  const raw = fs.readFileSync(absPath, 'utf-8');
  const preprocessed = preprocessMarkdown(raw);
  const html = marked.parse(preprocessed, {
    gfm: true,
    breaks: false,
  }) as string;
  return rewriteHtmlUrls(html, relMdPath);
}

export function resolveMarkdownForRequest(reqPath: string): string | null {
  const cleaned = reqPath.replace(/^\/+|\/+$/g, '');
  const candidates: string[] = [];

  if (!cleaned) {
    candidates.push('index.md');
  } else if (/\.md$/i.test(cleaned)) {
    candidates.push(cleaned);
  } else {
    candidates.push(`${cleaned}.md`, `${cleaned}/index.md`);
  }

  for (const candidate of candidates) {
    const matched = findFileCaseInsensitive(DOCS_DIR, candidate);
    if (matched) {
      return path.relative(DOCS_DIR, matched).replace(/\\/g, '/');
    }
  }
  return null;
}

export function buildPageContext(config: SiteConfig, relMdPath: string): {
  config: SiteConfig;
  nav: ResolvedNavItem[];
  page: PageViewModel;
} {
  const flatPages: FlatPageLink[] = [];
  const nav = buildNav(config.nav, relMdPath, flatPages);

  const navIndex = flatPages.findIndex(
    (entry) => entry.file.toLowerCase() === relMdPath.toLowerCase()
  );
  const previousPage = navIndex > 0 ? flatPages[navIndex - 1] : null;
  const nextPage =
    navIndex >= 0 && navIndex < flatPages.length - 1 ? flatPages[navIndex + 1] : null;

  const navEntry = navIndex >= 0 ? flatPages[navIndex] : null;
  const title = navEntry ? navEntry.title : extractPageTitle(relMdPath);
  const content = renderMarkdownFile(relMdPath);

  const page: PageViewModel = {
    title,
    content,
    isHomepage: relMdPath.toLowerCase() === 'index.md',
    previousPage,
    nextPage,
  };

  return { config, nav, page };
}

export function listAllMarkdownFiles(dir = DOCS_DIR, prefix = ''): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listAllMarkdownFiles(abs, rel));
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      results.push(rel);
    }
  }
  return results;
}
