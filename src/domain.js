export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
export function formatTime(seconds) { if (!Number.isFinite(seconds) || seconds < 0) return '0:00'; const value = Math.floor(seconds); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
export function shuffled(values, random = Math.random) { const result = [...values]; for (let index = result.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [result[index], result[swap]] = [result[swap], result[index]]; } return result; }
export function searchTracks(tracks, query) { const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(); const terms = normalize(query.trim()).split(/\s+/).filter(Boolean); return tracks.filter(track => { const text = normalize([track.title,track.artist,track.album,track.genre].join(' ')); return terms.every(term => text.includes(term)); }); }
export function parseLyrics(raw) {
  if (typeof raw !== 'string' || raw.length > 100000) throw new Error('Lyrics must contain at most 100,000 characters.');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/); const result = []; let offset = 0;
  for (const line of lines) { const match = line.match(/^\[offset:([+-]?\d+)\]$/i); if (match) offset = Number(match[1]) / 1000; }
  for (const line of lines) {
    const times = [...line.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    const text = line.replace(/\[\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?\]/g, '').trim();
    for (const time of times) result.push({ time: Math.max(0, Number(time[1]) * 60 + Number(time[2]) + Number(`0.${time[3] || '0'}`) + offset), text });
  }
  return result.length ? { timed: true, lines: result.sort((a,b) => a.time - b.time) } : { timed: false, lines: lines.filter(line => !/^\[(?:ar|al|ti|by|offset):/i.test(line)).map(text => ({ time: null, text })) };
}
export function currentLyricIndex(lines, seconds) { let result = -1; for (let index = 0; index < lines.length; index++) { if (lines[index].time === null || lines[index].time > seconds) break; result = index; } return result; }
export function moveItem(values, from, to) { if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= values.length || to >= values.length) return [...values]; const result = [...values]; const [item] = result.splice(from,1); result.splice(to,0,item); return result; }
export function safeArtwork(value) {
  if (typeof value !== 'string') return '/artwork/default.svg';
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) || /^\/artwork\/[a-z0-9-]+\.svg$/.test(value)) return value;
  try {
    const url = new URL(value);
    const allowed = /^(?:is\d+-ssl\.mzstatic\.com|i\.scdn\.co|image-cdn-fa\.spotifycdn\.com)$/;
    if (value.length <= 4096 && url.protocol === 'https:' && !url.username && !url.password && !url.port && allowed.test(url.hostname)) return value;
  } catch { /* Keep unrecognized artwork unavailable. */ }
  return '/artwork/default.svg';
}

// Display derivatives only: saved records retain the exact provider artwork URL.
// Both image variants were checked against the live CDN during implementation.
export function displayArtwork(value) {
  const admitted = safeArtwork(value);
  try {
    const url = new URL(admitted);
    if (/^is\d+-ssl\.mzstatic\.com$/.test(url.hostname)) url.pathname = url.pathname.replace(/\/100x100bb\.jpg$/, '/600x600bb.jpg');
    else if (url.hostname === 'i.scdn.co') url.pathname = url.pathname.replace('/ab67616d00004851', '/ab67616d0000b273');
    return url.href;
  } catch { return admitted; }
}
