import { safeArtwork } from './domain.js';

// Public provider boundaries. Catalog metadata never becomes a local audio file.
export function providerUrl(value, provider, kind = 'content') {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname;
    if (provider === 'itunes' && kind === 'preview' && host === 'audio-ssl.itunes.apple.com') return value;
    if (provider === 'itunes' && kind === 'content' && ['music.apple.com', 'itunes.apple.com'].includes(host)) return value;
    if (provider === 'spotify' && kind === 'content' && host === 'open.spotify.com' && /^\/(track|playlist)\/[A-Za-z0-9]{22}$/.test(url.pathname)) return value;
  } catch { /* Unknown URLs remain unavailable. */ }
  return null;
}

export function parseCatalogResponse(raw, { now = Date.now(), country = 'MA' } = {}) {
  if (!raw || !Array.isArray(raw.results) || !Number.isInteger(raw.resultCount) || raw.resultCount < 0) {
    throw new Error('The music catalog returned an unreadable response. Please try again.');
  }
  const tracks = [], seen = new Set();
  let skipped = 0;
  for (const item of raw.results.slice(0, 30)) {
    const externalUrl = providerUrl(item?.trackViewUrl, 'itunes');
    if (item?.kind !== 'song' || !Number.isSafeInteger(item.trackId) || item.trackId <= 0
      || typeof item.trackName !== 'string' || !item.trackName.trim() || typeof item.artistName !== 'string'
      || !externalUrl || typeof item.trackTimeMillis !== 'number' || !Number.isFinite(item.trackTimeMillis) || item.trackTimeMillis < 0) {
      skipped++;
      continue;
    }
    const id = `itunes:${item.trackId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    tracks.push({ id, title: item.trackName, artist: item.artistName,
      album: typeof item.collectionName === 'string' ? item.collectionName : '',
      genre: typeof item.primaryGenreName === 'string' ? item.primaryGenreName : '',
      duration: item.trackTimeMillis / 1000, source: 'catalog', provider: 'itunes', providerId: String(item.trackId),
      externalUrl, previewUrl: providerUrl(item.previewUrl, 'itunes', 'preview'),
      artwork: typeof item.artworkUrl100 === 'string' && safeArtwork(item.artworkUrl100) === item.artworkUrl100 ? item.artworkUrl100 : null,
      explicit: item.trackExplicitness === 'explicit', country, fetchedAt: now,
      favorite: false, addedAt: now, lastPlayed: 0, lyrics: '',
    });
  }
  return { tracks, skipped, fetchedAt: now };
}

const cache = new Map();
export async function searchCatalog(query, { signal, fetcher = fetch, country = 'MA' } = {}) {
  const term = query.trim();
  if (term.length < 2 || term.length > 200) throw new Error('Search with 2–200 characters.');
  const key = JSON.stringify([country, term.toLocaleLowerCase()]);
  const retained = cache.get(key);
  if (retained && Date.now() - retained.fetchedAt < 300000) return retained;
  const url = new URL('https://itunes.apple.com/search');
  url.search = new URLSearchParams({ term, country, media: 'music', entity: 'song', limit: '30', explicit: 'Yes' });
  const response = await fetcher(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(response.status === 429 ? 'The catalog is busy. Wait a moment and try again.' : 'The music catalog is unavailable. Please try again.');
  const result = parseCatalogResponse(await response.json(), { country });
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
  cache.delete(key);
  cache.set(key, result);
  while (cache.size > 20) cache.delete(cache.keys().next().value);
  return result;
}

export const isLocalAudio = track => ['local', 'demo'].includes(track?.source);
