import { safeArtwork } from './domain.js';
import { providerUrl } from './catalog.js';

const DATABASE_NAME = 'music-lab-v1';
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const AUDIO_EXTENSION = /\.(?:mp3|mpga|m4a|aac|flac|ogg|oga|opus|wav|wave|aif|aiff|webm)$/i;
let databasePromise;

function storageError(error, action) {
  const name = error?.name;
  if (name === 'QuotaExceededError') {
    return new Error(`Could not ${action}: browser storage is full. Free some storage or remove imported tracks and try again. Existing saved tracks have been preserved.`, { cause: error });
  }
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return new Error(`Could not ${action}: this browser is blocking local storage. Allow site storage or open this app in a regular browser window.`, { cause: error });
  }
  return new Error(`Could not ${action}: ${error?.message || 'local browser storage failed'}.`, { cause: error });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Local music storage is unavailable. Use a browser with IndexedDB enabled.'));
      return;
    }
    let request;
    let rejected = false;
    try {
      request = globalThis.indexedDB.open(DATABASE_NAME, 1);
    } catch (error) {
      reject(storageError(error, 'open your music library'));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const [name, keyPath] of [['tracks', 'id'], ['audio', 'id'], ['playlists', 'id'], ['settings', 'key']]) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath });
      }
    };
    request.onblocked = () => {
      rejected = true;
      reject(new Error('The music library is open in an older tab. Close other Music Lab tabs, then try again.'));
    };
    request.onerror = () => reject(storageError(request.error, 'open your music library'));
    request.onsuccess = () => {
      const database = request.result;
      if (rejected) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

// Resolve only after commit, so request success never masquerades as a saved file.
async function transact(stores, mode, action, execute) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let failure;
    try {
      transaction = database.transaction(stores, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(storageError(failure || transaction.error, action));
      // A request error normally aborts the entire transaction. Keep its actual cause.
      transaction.onerror = (event) => { failure ||= event.target.error; };
      execute(transaction, (value) => { result = value; }, (error) => {
        failure = error;
        transaction.abort();
      });
    } catch (error) {
      if (transaction) {
        failure = error;
        try { transaction.abort(); } catch { reject(storageError(error, action)); }
      } else reject(storageError(error, action));
    }
  });
}

function requireIdentifier(value, label = 'Record') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must have a nonempty string identifier.`);
  return value;
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a record.`);
}

function requireTimestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative timestamp.`);
}

// Validation deliberately preserves names, IDs, and raw lyrics without normalizing saved data.
export function validateTrack(track) {
  requireRecord(track, 'Track');
  requireIdentifier(track.id, 'Track');
  for (const field of ['title', 'artist', 'album', 'genre']) {
    if (typeof track[field] !== 'string') throw new Error(`Track ${field} must be text.`);
  }
  if (!track.title.trim()) throw new Error('Give the track a title.');
  if (typeof track.duration !== 'number' || !Number.isFinite(track.duration) || track.duration < 0) {
    throw new Error('Track duration must be a finite, nonnegative number of seconds.');
  }
  if (typeof track.favorite !== 'boolean') throw new Error('Track favorite must be true or false.');
  requireTimestamp(track.addedAt, 'Track addedAt');
  requireTimestamp(track.lastPlayed, 'Track lastPlayed');
  if (!['local', 'demo', 'catalog'].includes(track.source)) throw new Error('Track source must be local, demo, or catalog.');
  if (track.source === 'catalog') {
    if (!['itunes', 'spotify'].includes(track.provider) || typeof track.providerId !== 'string'
      || !track.providerId || track.id !== `${track.provider}:${track.providerId}`
      || !providerUrl(track.externalUrl, track.provider) || track.url !== undefined) {
      throw new Error('Catalog tracks must retain a valid provider identity and content link.');
    }
    if (track.previewUrl !== null && track.previewUrl !== undefined
      && !providerUrl(track.previewUrl, track.provider, 'preview')) throw new Error('The catalog preview URL is not supported.');
  }
  if (track.source === 'demo' && (typeof track.url !== 'string' || !/^\/audio\/demo-[1-9]\d*\.wav$/.test(track.url))) {
    throw new Error('Demo tracks must reference a bundled /audio/demo-N.wav file.');
  }
  if (track.source === 'local' && track.url !== undefined) {
    throw new Error('Local tracks must use their saved audio blob instead of a URL.');
  }
  if (track.artwork !== undefined && track.artwork !== null) {
    if (typeof track.artwork !== 'string' || track.artwork.length > Math.ceil(MAX_ARTWORK_BYTES / 3) * 4 + 64
      || safeArtwork(track.artwork) !== track.artwork) {
      throw new Error('Track artwork must be a supported provider image, bundled path, or image data URL of at most 5 MiB.');
    }
    if (track.artwork.startsWith('data:')) {
      const encoded = track.artwork.slice(track.artwork.indexOf(',') + 1);
      const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
      const firstPadding = encoded.indexOf('=');
      if (encoded.length % 4 !== 0 || (firstPadding >= 0 && firstPadding !== encoded.length - padding)
        || encoded.length / 4 * 3 - padding > MAX_ARTWORK_BYTES) {
        throw new Error('Track artwork contains malformed or oversized base64 image data.');
      }
    }
  }
  if (typeof track.lyrics !== 'string' || track.lyrics.length > 100000) {
    throw new Error('Track lyrics must be text containing at most 100,000 characters.');
  }
  return track;
}

export function validatePlaylist(playlist) {
  requireRecord(playlist, 'Playlist');
  requireIdentifier(playlist.id, 'Playlist');
  if (typeof playlist.name !== 'string' || !playlist.name.trim()) throw new Error('Give the playlist a name.');
  if (!Array.isArray(playlist.trackIds) || playlist.trackIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('Playlist track references must be nonempty string identifiers.');
  }
  requireTimestamp(playlist.createdAt, 'Playlist createdAt');
  if (playlist.artwork !== undefined && (typeof playlist.artwork !== 'string' || safeArtwork(playlist.artwork) !== playlist.artwork)) {
    throw new Error('Playlist artwork must be a supported image.');
  }
  if (playlist.sourceUrl !== undefined && !providerUrl(playlist.sourceUrl, 'spotify')) {
    throw new Error('Playlist source must be a Spotify content link.');
  }
  return playlist;
}

function validateSetting(record) {
  requireRecord(record, 'Setting');
  requireIdentifier(record.key, 'Setting');
  const { key, value } = record;
  const stringList = (candidate) => Array.isArray(candidate) && candidate.every((item) => typeof item === 'string');
  let valid = true;
  if (key === 'theme') valid = value === 'light' || value === 'dark';
  if (key === 'shuffle') valid = typeof value === 'boolean';
  if (key === 'repeat') valid = ['off', 'one', 'all'].includes(value);
  if (key === 'volume') valid = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  if (key === 'hiddenDemos' || key === 'searchHistory') valid = stringList(value);
  if (key === 'lastQueue') valid = value !== null && typeof value === 'object'
    && stringList(value.ids) && Number.isInteger(value.index)
    && (value.ids.length ? value.index >= 0 && value.index < value.ids.length : value.index === -1);
  if (!valid) throw new Error(`The saved ${key} preference has an invalid value. Choose the preference again to replace it.`);
  return record;
}

export function parseLibraryRecords(records) {
  const result = { tracks: [], playlists: [], settings: Object.create(null), warnings: [], storedTrackIds: [] };
  for (const [store, validate] of [['tracks', validateTrack], ['playlists', validatePlaylist], ['settings', validateSetting]]) {
    if (!Array.isArray(records?.[store])) throw new Error(`Could not read ${store}: the saved store result is not a list. No saved data was changed.`);
    for (const record of records[store]) {
      // Ownership survives malformed metadata. Callers must not mistake an invalid
      // owned record for an absent track and replace it while seeding demo data.
      if (store === 'tracks' && typeof record?.id === 'string' && record.id.trim()) result.storedTrackIds.push(record.id);
      try {
        const parsed = validate(record);
        if (store === 'settings') result.settings[parsed.key] = parsed.value;
        else result[store].push(parsed);
      } catch (error) {
        const identifier = typeof record?.id === 'string' ? record.id : typeof record?.key === 'string' ? record.key : 'unknown identifier';
        result.warnings.push(`Could not load ${store} record “${identifier}”: ${error.message} Its saved data was kept. Restore a valid copy to use it again.`);
      }
    }
  }
  return result;
}

export async function loadLibrary() {
  const records = await transact(['tracks', 'playlists', 'settings'], 'readonly', 'load your music library', (transaction, finish) => {
    const result = { tracks: [], playlists: [], settings: [] };
    transaction.objectStore('tracks').getAll().onsuccess = (event) => { result.tracks = event.target.result; };
    transaction.objectStore('playlists').getAll().onsuccess = (event) => { result.playlists = event.target.result; };
    transaction.objectStore('settings').getAll().onsuccess = (event) => {
      result.settings = event.target.result;
    };
    finish(result);
  });
  return parseLibraryRecords(records);
}

export async function saveTrack(track, blob) {
  validateTrack(track);
  if (blob !== undefined && !(blob instanceof Blob)) throw new Error('Track audio must be a browser Blob.');
  if (blob !== undefined && (blob.size === 0 || blob.size > MAX_AUDIO_BYTES)) {
    throw new Error('Track audio must contain between 1 byte and 200 MiB.');
  }
  return transact(['tracks', 'audio'], 'readwrite', 'save this track', (transaction) => {
    transaction.objectStore('tracks').put(track);
    if (blob !== undefined) transaction.objectStore('audio').put({ id: track.id, blob });
  });
}

const EDITABLE_TRACK_FIELDS = new Set(['title', 'artist', 'album', 'genre', 'lyrics', 'favorite', 'lastPlayed', 'duration', 'artwork']);

export function applyTrackPatch(current, patch, id = current?.id) {
  requireIdentifier(id, 'Track');
  if (current === undefined) throw new Error('This track was removed from the library. Import it again before editing.');
  validateTrack(current);
  if (current.id !== id) throw new Error('The saved track identifier does not match the requested track. No changes were saved.');
  requireRecord(patch, 'Track changes');
  for (const key of Reflect.ownKeys(patch)) {
    if (!EDITABLE_TRACK_FIELDS.has(key)) throw new Error(`Track changes cannot modify ${String(key)}. Only song information, favorites, playback time, duration, and artwork are editable.`);
  }
  return validateTrack({ ...current, ...patch, id });
}

export async function updateTrack(id, patch) {
  requireIdentifier(id, 'Track');
  return transact(['tracks'], 'readwrite', 'update this track', (transaction, finish, abort) => {
    const store = transaction.objectStore('tracks');
    store.get(id).onsuccess = (event) => {
      try {
        const updated = applyTrackPatch(event.target.result, patch, id);
        store.put(updated);
        finish(updated);
      } catch (error) {
        abort(error);
      }
    };
  });
}

export async function getAudioBlob(id) {
  requireIdentifier(id, 'Track');
  return transact(['audio'], 'readonly', 'read this track’s audio', (transaction, finish, abort) => {
    transaction.objectStore('audio').get(id).onsuccess = (event) => {
      const record = event.target.result;
      if (record === undefined) finish(null);
      else if (record.blob instanceof Blob) finish(record.blob);
      else abort(new Error('The saved audio record is damaged. Remove and reimport this track.'));
    };
  });
}

export async function removeTrack(id) {
  requireIdentifier(id, 'Track');
  return transact(['tracks', 'audio', 'playlists'], 'readwrite', 'remove this track', (transaction, finish, abort) => {
    transaction.objectStore('tracks').delete(id);
    transaction.objectStore('audio').delete(id);
    transaction.objectStore('playlists').openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      const playlist = cursor.value;
      if (!Array.isArray(playlist.trackIds)) {
        abort(new Error('A saved playlist has damaged track references. The track was not removed.'));
        return;
      }
      if (playlist.trackIds.includes(id)) cursor.update({ ...playlist, trackIds: playlist.trackIds.filter((trackId) => trackId !== id) });
      cursor.continue();
    };
  });
}

export async function savePlaylist(playlist) {
  validatePlaylist(playlist);
  return transact(['playlists'], 'readwrite', 'save this playlist', (transaction) => {
    transaction.objectStore('playlists').put(playlist);
  });
}

// Commit a collection together, preserving existing edits and malformed owned rows.
export async function saveCatalogPlaylist(tracks, playlist) {
  for (const track of tracks) {
    validateTrack(track);
    if (track.source !== 'catalog') throw new Error('Only catalog links can be saved in this collection.');
  }
  validatePlaylist(playlist);
  return transact(['tracks', 'playlists'], 'readwrite', 'save this collection', (transaction, finish, abort) => {
    const store = transaction.objectStore('tracks');
    for (const track of new Map(tracks.map(track => [track.id, track])).values()) store.get(track.id).onsuccess = (event) => {
      try {
        if (event.target.result === undefined) store.add(track);
        else validateTrack(event.target.result);
      } catch (error) { abort(error); }
    };
    const lists = transaction.objectStore('playlists');
    lists.get(playlist.id).onsuccess = (event) => {
      try {
        if (event.target.result !== undefined) {
          abort(new Error('This collection is already saved. Open it from your playlists.'));
          return;
        }
        lists.add(playlist);
        finish(playlist);
      } catch (error) { abort(error); }
    };
  });
}

export async function addCatalogTrack(track) {
  validateTrack(track);
  if (track.source !== 'catalog') throw new Error('Only a catalog link can be added here.');
  return transact(['tracks'], 'readwrite', 'add this song link', (transaction, finish, abort) => {
    const store = transaction.objectStore('tracks');
    store.get(track.id).onsuccess = (event) => {
      try {
        const existing = event.target.result;
        if (existing === undefined) { store.add(track); finish(track); }
        else { validateTrack(existing); finish(existing); }
      } catch { abort(new Error('The existing song record needs attention. Its saved data was kept.')); }
    };
  });
}

export async function removePlaylist(id) {
  requireIdentifier(id, 'Playlist');
  return transact(['playlists'], 'readwrite', 'remove this playlist', (transaction) => {
    transaction.objectStore('playlists').delete(id);
  });
}

export async function saveSetting(key, value) {
  validateSetting({ key, value });
  return transact(['settings'], 'readwrite', 'save this preference', (transaction) => {
    transaction.objectStore('settings').put({ key, value });
  });
}

function text(value) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
}

// This boundary is shared by import validation and its focused malformed-input tests.
export function describeAudioFile(file) {
  if (!(file instanceof Blob)) throw new Error('Choose an audio file from your device.');
  const name = typeof file.name === 'string' && file.name ? file.name : 'Untitled audio';
  if (!file.size) throw new Error('This file is empty.');
  if (file.size > MAX_AUDIO_BYTES) throw new Error('This file exceeds the 200 MiB per-track import limit.');
  if (!file.type.toLowerCase().startsWith('audio/') && !AUDIO_EXTENSION.test(name)) {
    throw new Error('Unsupported file. Choose MP3, M4A, AAC, FLAC, Ogg, Opus, WAV, AIFF, WebM, or another recognized audio file.');
  }
  return { name, fallbackTitle: text(name.replace(/\.[^.]+$/, '')) || 'Untitled audio' };
}

export function normalizeAudioMetadata(metadata, file) {
  const { fallbackTitle } = describeAudioFile(file);
  const common = metadata?.common;
  const duration = metadata?.format?.duration;
  const genres = Array.isArray(common?.genre) ? common.genre.map(text).filter(Boolean) : [];
  return {
    title: text(common?.title) || fallbackTitle,
    artist: text(common?.artist) || 'Unknown Artist',
    album: text(common?.album) || 'Local imports',
    genre: genres.join(', ') || 'Local music',
    duration: typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : 0,
  };
}

function coverDataUrl(pictures) {
  if (!Array.isArray(pictures)) return null;
  const picture = pictures.find((item) => typeof item?.format === 'string'
    && /^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(item.format)
    && item.data instanceof Uint8Array && item.data.byteLength > 0 && item.data.byteLength <= MAX_ARTWORK_BYTES);
  if (!picture) return null;
  const chunks = [];
  for (let offset = 0; offset < picture.data.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...picture.data.subarray(offset, offset + 0x8000)));
  }
  return `data:${picture.format.toLowerCase()};base64,${btoa(chunks.join(''))}`;
}

export async function importAudioFiles(files, onProgress) {
  const selected = Array.from(files);
  const tracks = [];
  const errors = [];
  let parseBlob;
  for (let index = 0; index < selected.length; index += 1) {
    const file = selected[index];
    const name = typeof file?.name === 'string' ? file.name : 'Unnamed file';
    let status = 'error';
    try {
      describeAudioFile(file);
      parseBlob ||= (await import('music-metadata')).parseBlob;
      const metadata = await parseBlob(file, { duration: true });
      const track = {
        id: crypto.randomUUID(),
        ...normalizeAudioMetadata(metadata, file),
        favorite: false,
        addedAt: Date.now(),
        lastPlayed: 0,
        source: 'local',
        artwork: coverDataUrl(metadata?.common?.picture),
        lyrics: '',
      };
      await saveTrack(track, file);
      tracks.push(track);
      status = 'imported';
    } catch (error) {
      errors.push({ file: name, message: error?.message || 'This audio file could not be imported.' });
    }
    if (typeof onProgress === 'function') onProgress({ completed: index + 1, total: selected.length, file: name, status });
  }
  return { tracks, errors };
}
