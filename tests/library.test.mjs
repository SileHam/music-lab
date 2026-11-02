import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseBlob } from 'music-metadata';
import { describeAudioFile, normalizeAudioMetadata, validateTrack, validatePlaylist, parseLibraryRecords, applyTrackPatch } from '../src/library.js';

function audioFile(name, type = '', content = 'audio') {
  return Object.assign(new Blob([content], { type }), { name });
}

test('accepts known audio extensions when the browser omits the MIME type', () => {
  assert.deepEqual(describeAudioFile(audioFile('My lecture.M4A')), {
    name: 'My lecture.M4A', fallbackTitle: 'My lecture',
  });
  assert.equal(describeAudioFile(audioFile('Track.custom', 'audio/mpeg')).fallbackTitle, 'Track');
});

test('rejects empty, non-audio, and oversized files before parsing or writing', () => {
  assert.throws(() => describeAudioFile(audioFile('empty.mp3', 'audio/mpeg', '')), /empty/);
  assert.throws(() => describeAudioFile(audioFile('notes.pdf', 'application/pdf')), /Unsupported/);
  const oversized = audioFile('huge.mp3');
  Object.defineProperty(oversized, 'size', { value: 200 * 1024 * 1024 + 1 });
  assert.throws(() => describeAudioFile(oversized), /200 MiB/);
  assert.throws(() => describeAudioFile({ name: 'pretend.mp3', size: 4 }), /Choose an audio file/);
});

test('normalizes parsed text once and preserves Unicode track names', () => {
  const normalized = normalizeAudioMetadata({
    common: { title: '  موسيقى\n الدراسة ', artist: '  Artist\tName ', album: ' My  Album ', genre: [' Jazz ', null, '\nStudy'] },
    format: { duration: 150.25 },
  }, audioFile('fallback.mp3'));
  assert.deepEqual(normalized, {
    title: 'موسيقى الدراسة', artist: 'Artist Name', album: 'My Album', genre: 'Jazz, Study', duration: 150.25,
  });
});

test('malformed metadata retains a useful filename fallback and finite duration', () => {
  for (const duration of [NaN, Infinity, -1, '120', undefined]) {
    assert.deepEqual(normalizeAudioMetadata({ common: { title: 42, genre: 'Jazz' }, format: { duration } }, audioFile('Chapter.02.wav')), {
      title: 'Chapter.02', artist: 'Unknown Artist', album: 'Local imports', genre: 'Local music', duration: 0,
    });
  }
});

const savedTrack = () => ({ id: 'my-track', title: ' My title ', artist: 'Artist', album: 'Album', genre: 'Jazz', duration: 28,
  favorite: false, addedAt: 1700000000000, lastPlayed: 0, source: 'local', artwork: null, lyrics: '[00:01.00]  Original line\r\n' });

test('validates saved tracks without changing source strings or raw lyrics', () => {
  const track = savedTrack();
  assert.equal(validateTrack(track), track);
  assert.equal(track.title, ' My title ');
  assert.equal(track.lyrics, '[00:01.00]  Original line\r\n');
  for (const patch of [{ artist: 5 }, { duration: Infinity }, { favorite: 'yes' }, { addedAt: -1 }, { source: 'remote' },
    { lyrics: 'x'.repeat(100001) }, { url: 'https://example.com/song.mp3' }, { artwork: 'https://example.com/cover.jpg' }]) {
    assert.throws(() => validateTrack({ ...track, ...patch }));
  }
  assert.doesNotThrow(() => validateTrack({ ...track, source: 'demo', url: '/audio/demo-1.wav', artwork: '/artwork/casa.svg' }));
  assert.throws(() => validateTrack({ ...track, source: 'demo', url: '/audio/../private.wav' }), /bundled/);
});

test('validates playlist references and dates while preserving intentional duplicate entries', () => {
  const playlist = { id: 'playlist', name: ' My list ', trackIds: ['one', 'one'], createdAt: 0 };
  assert.equal(validatePlaylist(playlist), playlist);
  assert.throws(() => validatePlaylist({ ...playlist, trackIds: ['one', null] }), /references/);
  assert.throws(() => validatePlaylist({ ...playlist, createdAt: 'yesterday' }), /timestamp/);
});

test('track patches preserve newer unrelated values and reject identity changes or missing tracks', () => {
  const current = { ...savedTrack(), favorite: true, title: 'A newer title' };
  const updated = applyTrackPatch(current, { lastPlayed: 1700000000001 });
  assert.equal(updated.favorite, true);
  assert.equal(updated.title, 'A newer title');
  assert.equal(updated.lastPlayed, 1700000000001);
  assert.equal(current.lastPlayed, 0);
  for (const patch of [{ id: 'replacement' }, { source: 'demo' }, { url: '/audio/demo-1.wav' }, { addedAt: 0 }, { extra: true }]) {
    assert.throws(() => applyTrackPatch(current, patch), /cannot modify/);
  }
  assert.throws(() => applyTrackPatch(current, { duration: NaN }), /duration/);
  assert.throws(() => applyTrackPatch(undefined, { favorite: true }, 'removed'), /removed/);
});

test('loads valid records alongside explicit warnings without changing malformed source records', () => {
  const goodTrack = savedTrack();
  const badTrack = { ...savedTrack(), id: ' bad ', title: 42 };
  const records = {
    tracks: [goodTrack, badTrack, null],
    playlists: [{ id: 'list', name: 'My list', trackIds: [goodTrack.id], createdAt: 0 }, { id: 'bad-list', name: 3 }],
    settings: [{ key: 'volume', value: 0.4 }, { key: 'searchHistory', value: 'not a list' }, { key: 'hiddenDemos', value: [] }],
  };
  const original = structuredClone(records);
  const parsed = parseLibraryRecords(records);
  assert.deepEqual(parsed.tracks, [goodTrack]);
  assert.deepEqual(parsed.storedTrackIds, [goodTrack.id, badTrack.id]);
  assert.equal(parsed.playlists.length, 1);
  assert.equal(parsed.settings.volume, 0.4);
  assert.equal('searchHistory' in parsed.settings, false);
  assert.equal(parsed.warnings.length, 4);
  assert.ok(parsed.warnings.every((message) => message.includes('saved data was kept')));
  assert.deepEqual(records, original);
});

test('rejects corrupt artwork base64 and oversized decoded images', () => {
  const track = savedTrack();
  assert.doesNotThrow(() => validateTrack({ ...track, artwork: 'data:image/png;base64,AA==' }));
  assert.throws(() => validateTrack({ ...track, artwork: 'data:image/png;base64,A' }), /base64/);
  assert.throws(() => validateTrack({ ...track, artwork: 'data:image/png;base64,====' }), /base64/);
  const oversizedImage = `data:image/png;base64,${'A'.repeat(Math.ceil((5 * 1024 * 1024 + 3) / 3) * 4)}`;
  assert.throws(() => validateTrack({ ...track, artwork: oversizedImage }), /oversized|5 MiB/);
});

test('parses the real bundled WAV with music-metadata before constructing import metadata', async () => {
  const audio = await readFile(new URL('../public/audio/demo-1.wav', import.meta.url));
  const file = audioFile('Demo recording.wav', 'audio/wav', audio);
  const metadata = await parseBlob(file, { duration: true });
  const normalized = normalizeAudioMetadata(metadata, file);
  assert.equal(metadata.format.container, 'WAVE');
  assert.ok(Math.abs(normalized.duration - 28) < 0.001);
  assert.equal(normalized.title, 'Demo recording');
});
