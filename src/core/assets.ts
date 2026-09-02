let publicBase = '/';

function normalizeBase(base: string): string {
  const trimmed = base.trim() || '/';
  if (trimmed === './') return './';
  if (trimmed === '/') return '/';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/** Prefix for models, posters, env maps, and screenshots (e.g. `/Screenframe3D/`). */
export function setPublicBase(base: string): void {
  publicBase = normalizeBase(base);
}

export function getPublicBase(): string {
  return publicBase;
}

/** Join a site-relative path with the current public base. Absolute http(s) URLs pass through. */
export function publicUrl(path: string): string {
  if (!path) return path;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const trimmed = path.replace(/^\/+/, '');
  return `${publicBase}${trimmed}`;
}
