# Apple Music web investigation and Music Lab reconstruction

Date: 15 October 2026 (UTC). Target selected by the user: Apple Music **web**, after a current-user Windows package query found no registered Apple Music app. No claim is made about other Windows accounts or native implementations.

## Captured target and provenance

- URL: https://music.apple.com/ma/new
- Browser: an owned fresh Microsoft Edge browser context, 1440 × 1000; signed out.
- Public rendered text, links, one screenshot and 70 same-host JavaScript responses were captured. No account was accessed, no purchase made and no authorization headers, cookies or ambient environment were exported.
- Local investigation files: `.investigation/target.json`, `scripts.json`, `public-page.txt`, `page-links.json`, `apple-music-desktop.png`, and `captured/`. These files and the temporary REA installation are ignored and excluded from publication.
- Captured entry bundle: `/assets/index~bc39edf62f.js`, SHA-256 `2c140807202b77b5d8e3b502c66bda5e4c1148d7ba025408aa90c8e8640c3679`.
- Focused playback adapter: `/assets/musickit~6689dc788a.js`, 71,816 bytes. Its URL-to-file digest is preserved in `scripts.json`.
- Focused library-pins module: `/assets/libraryPinsAPI~26076a3540.js`, 4,307 bytes.

The browser capture used ordinary Playwright tooling. It is runtime observation, but is not itself a REA Evidence record. The independent implementation contains no copied Apple JavaScript or catalog songs. The discovery extension uses Apple's official iTunes promotional badge alongside provider links.

## REA analysis

REA 6.5.0 analyzed exactly the playback adapter and library-pins module from the retained capture directory. It inventoried 70 files and parsed two selected files (76,123 source bytes); 68 files remained outside the selected source scope. Its summary reports 156 findings. These are static findings, not vulnerability findings or proof that a code path executed.

Complete static Evidence ID:
`ev_299a243d88d75dfb4bff2ac41b1b335be71203efebf0cf652a3d5248c5d8250a`

Summary view Evidence ID:
`ev_6870f18727d709610850663b0682ea2507266f8f36fe372e6078977259919307`

Captured root artifact SHA-256:
`01d189a1402ea963d2d5afddfc811ca2e90a62a5c762a9ed95000b8112e989ed`

Full Evidence is retained in `.investigation/rea-static-evidence.utf8.json`; the original Windows shell output remains in `.investigation/rea-static-evidence.json`. The UTF-8 file corrects the shell's UTF-16 output encoding without rerunning or changing the Evidence content. The owner-generated view is `.investigation/rea-summary.json`.

The analysis explicitly reports partial graph coverage: 68 application unknowns and 5,008 semantic unknowns. Imports through unselected sources, dynamic relationships and obfuscated identifiers remain unresolved. This is a focused investigation, not a complete reverse engineering of Apple Music.

## Findings and implementation decisions

| Question | Evidence and confidence | Music Lab behavior |
| --- | --- | --- |
| What is the primary browsing layout? | Observed signed-out page: a left navigation with Search/Home/New/Radio; editorial shelves; album grids; song rows; a bottom floating player. | Similar sidebar, editorial shelves, album/artist views, song tables and persistent floating transport. Independently branded. |
| How are queue operations organized? | In the captured adapter, static `playNext` and `playLater` methods delegate to prepend/append queue operations through a playback controller. `setQueue`, shuffle and repeat references are present. This establishes code structure, not authenticated execution. | One playback owner controls queue entries, current occurrence, shuffle, repeat, load generations and object URLs. Duplicate queue entries retain distinct identities. |
| What playback state is exposed? | Static adapter contains playback state/time/now-playing event relationships, a volume setter and current-time state. | HTMLAudioElement supplies actual decoded local playback state and timing. State is not advanced by a simulated timer. |
| How does Apple's local cache/database work? | Unknown. The selected web modules do not establish Apple's cache format, offline storage design or native database schema. | Our independent IndexedDB schema stores imported blobs, metadata, playlists and preferences. It is not presented as Apple's recovered schema. |
| Do account playlists and lyrics behave like the recreation? | Apple documentation describes web playlist and lyrics features. They were not exercised in an authenticated Apple account. | Local playlist creation/add/remove/rename/reordering; user-supplied plain/LRC lyrics, synchronized highlighting and seeking. No Apple lyrics access is claimed. |

## Official feature references

- [Search the Apple Music web catalog or library](https://support.apple.com/guide/music-web/search-for-music-apdmca22e054/web)
- [Play songs from your library](https://support.apple.com/guide/music-web/play-songs-from-your-library-apdm5cce24ab/web)
- [Create, edit and delete web playlists](https://support.apple.com/guide/music-web/create-edit-and-delete-playlists-apdmc7b0b200/web)
- [Queue songs on the web](https://support.apple.com/guide/music-web/queue-up-your-songs-apdm275ada6c/web)
- [Shuffle and repeat](https://support.apple.com/guide/music-web/shuffle-or-repeat-songs-apdm4eda40a9/web)
- [Web lyrics](https://support.apple.com/guide/music-web/view-lyrics-apdm5e4a7164/web)
- [MusicKit](https://developer.apple.com/musickit/)

These sources explain documented features; they do not establish the private implementation. MusicKit v3 documentation requires a valid developer token to configure the SDK, and an authorized subscribed user for full catalog playback. The user selected local-file playback first and has no developer token, so catalog/account integration is deliberately deferred. No token was copied from Apple's web player or reused.

## Public discovery extension

The subsequent user request added [this Spotify playlist](https://open.spotify.com/playlist/0Ib5yW5nbZmedSolfzFbZr?si=tDClqRzfT_2CvPeWiPUj-w), images, improved discovery design, and real music search. This extension uses documented public discovery and an official embed; it does not establish authenticated Apple or Spotify account behavior.

- Observed in a fresh signed-out Edge context: **Echoes of the Unknown**, owner **Хамза**, description **Somewhere between Peace and Chaos**, and a displayed total of **1,239 songs**. The public embed's `__NEXT_DATA__.props.pageProps.state.data.entity.trackList` supplied the first **100 ordered entries**. Only the first five album names and individual artworks were visible in the public page. The remaining **1,139 entries** were not observed. The source JSON preserves URLs, observation time, coverage and provenance. Public preview URLs were observed but are not used or published by this implementation.
- Observed live: Apple's [public Search API](https://performance-partners.apple.com/search-api), queried with `country=MA`, returns real music metadata, source links, artwork and optional promotional previews. The browser workflow returned 30 results for Radiohead and verified real preview time advancement. These are promotional samples, not full catalog playback or MusicKit authorization.
- Implementation: catalog references persist separately from audio files, retain provider identity and original artwork URLs, and never enter the local audio queue. The preview dialog does not auto-advance; previews are streamed, not downloaded or cached. Original content links and the [official iTunes badge](https://tools.applemediaservices.com/api/badges/get-it-on-itunes/badge/en-us?size=150x50) accompany Apple promotional assets. Preview attribution is shown. Spotify metadata links back to Spotify and the official embed owns provider playback, consistent with the [Spotify developer policy](https://developer.spotify.com/policy).
- Presentation: an Apple Music inspired sidebar and typography, a playlist-cover hero, real album covers, editorial [concert photography](https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f) and [night-street photography](https://images.unsplash.com/photo-1519608487953-e999c86e7455), responsive discovery cards, light/dark styling, and separate library/catalog search. CDN higher-resolution display variants were checked with successful live image responses; saved provider URLs remain unchanged.

Unverified: full-track playback inside provider accounts, all 1,239 playlist entries, automatic Spotify synchronization, long-term availability of public previews, and native player parity. Search terms are sent to Apple when catalog search is selected; embeds and remote artwork make requests to their providers. Imported audio stays local.

## Reconstruction coverage

Implemented: local-file import and metadata/artwork parsing; actual audio playback and seek; volume; previous/next; shuffle; repeat-off/all/one; queue next/last/reorder/remove/clear; albums and artists; accent-insensitive search; favorites; recently played; create/rename/delete/reorder playlists; editable metadata; local plain/LRC lyrics; light/dark appearance; responsive navigation; browser-local persistence and Media Session controls where supported.

Local stations shuffle the user's own matching tracks and repeat the queue. They are not Apple live radio or Apple's recommendation algorithm. Eight short original synthesized demo recordings and SVG artworks are included; they are not Apple catalog content.

Unknown/deferred: authenticated Apple behavior, MusicKit runtime integration, full Apple catalog playback, Apple-provided lyrics, Apple's recommendation/dispatch/backend internals, native iPhone/Windows parity, cross-device sync, billing and AirPlay. A close interface and verified local workflows do not establish an exact Apple Music replacement.

## Validation scope

See the project README and tests for completed local checks. No Apple account or real MusicKit integration was tested. A browser's metadata parser support does not establish playback support for every codec; unsupported files report an actionable playback error. IndexedDB storage can be cleared or evicted by the browser and is not a backup. No comparative performance benchmark against Apple's authenticated player was run; CPU, peak memory and whole-task agent-token costs were not measured.
