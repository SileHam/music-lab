# Music Lab

An independent, local-first music player built after inspecting Apple Music's web player. The reference is https://music.apple.com/ma/new; [the investigation report](docs/apple-music-investigation.md) distinguishes runtime observations, focused REA static findings, implementation choices and unknowns.

## Use it

Play the included original demo instrumentals, or choose **Import Music** to add your own audio. MP3, M4A, AAC, FLAC, Ogg/Opus and WAV metadata are supported by `music-metadata`; actual playback depends on the browser codec. Create playlists from the sidebar, add songs through their options, and open the queue or lyrics controls in the player. On small screens, tap the now-playing artwork and use its queue/lyrics controls.

Imported audio blobs, track metadata, playlists, favorites and preferences are stored in this browser's IndexedDB. Files are not uploaded or synchronized between devices. Keep your original files backed up; clearing site data removes the saved library. Requesting persistent storage depends on browser policy. No account is required for local playback; hosting access may require signing in to the private Site.

The user chose local-file playback first. Apple Music catalog/account playback and Apple lyrics are not connected. A future MusicKit integration requires a valid developer token and appropriate account authorization. Music Lab is not an Apple product and contains no copied Apple player code or catalog audio.

## Discover real music

Choose **Find music** or **Search → Discover music** to search Apple's public iTunes catalog for the Morocco storefront. Results include real artist/song/album metadata, artwork, explicit labels, promotional previews when supplied, and an official iTunes badge linking to the original track. Add results to your library, then use the song's options to add them to a playlist. Preview audio streams directly from Apple and is never saved as a blob or placed in the continuous local queue. The preview's actual decoded duration is separate from the full track duration.

**Echoes of the Unknown** is pinned in the sidebar with its cover, official Spotify player, and provider links. On 15 October 2026, the public page reported 1,239 songs; its public embed exposed the first 100 entries. **Save 100 available songs** atomically saves those ordered metadata references as a local playlist. The other 1,139 entries have not been imported. Unknown albums and artwork stay unknown. This snapshot does not automatically synchronize with Spotify, download songs, or edit the Spotify account.

Full provider playback depends on the provider's authorization, subscription and regional availability. The app does not represent previews or saved links as full playable local songs. Existing local imports and playlists remain in the same IndexedDB database.

Catalog requests are debounced, cancelled on changed input/navigation, rate-spaced, time-limited, and cached in memory for five minutes with at most 20 queries and 30 results per query. Responses and persisted provider URLs are validated at their owning boundaries. Artwork uses supported CDN display derivatives while retaining the original provider URLs in storage. The editorial photographs load from Unsplash; provider artwork and embeds require a network connection.

## Development

Use an existing Node.js 22.12+ or 24.x runtime. Install the locked dependencies with `npm ci`; `npm run dev` starts Vite. This machine's preview used `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort` because of an installed Windows npm shim issue. No global toolchain was changed.

`npm run build` generates the original demo audio and investigation page, then emits a static deployment in `dist/`. The generated WAV files are ignored; their deterministic generator is the source. The public `.openai/hosting.json` retains non-secret build configuration; configure your own hosting identity before deployment. `.investigation/`, `.sites-runtime/`, `node_modules/` and `dist/` are ignored; private local files and REA captures must not be published as source.

## Verification

- `npm test`: malformed metadata/file validation, real WAV metadata parsing, explicit partial stored-record handling, lyrics formats/offsets, search, artwork boundaries, queue identity, stale async playback loads and object URL cleanup.
- `npm run test:browser`: end-to-end browser workflow using an existing Microsoft Edge through Playwright. Set `MUSIC_PLAYWRIGHT_MODULE` to an installed Playwright module if it is not in this checkout. Screenshots are retained in ignored `.sites-runtime/qa/`.
- `npm run test:discovery`: live Morocco catalog search and actual preview time advancement; artwork/badge loading; save-to-library and playlist persistence; Spotify embed and 100-entry snapshot; metadata-only audio storage; provider queue exclusion; recoverable network errors; phone layout. This requires an internet connection and live providers.
- Browser tests exercise real audio time advancement from both bundled WAV and imported IndexedDB Blob, seek, transport, favorites, playlists, queue controls, search history, lyrics, persistence, deletion cleanup, appearance and mobile layout.

No real Apple Music account, catalog playback, Apple lyrics, cross-device sync or native app parity has been verified. A simulated browser quota exception verifies transaction rollback; actual device-storage exhaustion and eviction are unverified. Synthetic unit fixtures establish resource-ownership semantics, not physical audio output quality.

## Source ownership

- `src/library.js`: IndexedDB transactions, stored-data validation, metadata parsing and import admission.
- `src/player.js`: one audio element, queue occurrence identity, object URLs and load generations.
- `src/domain.js`: lyrics, literal search, formatting, ordering and artwork admission.
- `src/catalog.js`: public search transport, bounded metadata cache, response parsing, provider URLs and local-audio classification.
- `src/discovery.js`, `src/discovery.css`: discovery views, provider attribution, and promotional preview presentation.
- `src/spotify-playlist.json`: provenance-bearing public playlist snapshot with explicit partial coverage.
- `src/main.js`: presentation and user workflows; it uses owner operations instead of interpreting raw audio bytes.
- `scripts/generate-demo.mjs`: reproducible original audio and vector artwork. The starter collection contains eight 28-second recordings, not full commercial songs.

Imported metadata patches run within one readwrite database transaction and cannot recreate a deleted track or change source ownership. Track deletion also removes saved audio and playlist references atomically. Source and album identity are kept separate from display names: equal album titles from different artists have distinct group identities.
