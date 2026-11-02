import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogResponse, providerUrl, searchCatalog } from '../src/catalog.js';
import { safeArtwork } from '../src/domain.js';
import { validateTrack, validatePlaylist } from '../src/library.js';
import { spotifyLibraryTracks } from '../src/discovery.js';
import playlist from '../src/spotify-playlist.json' with { type: 'json' };

const song = { kind:'song', trackId:1234, trackName:'A Song', artistName:'An Artist', collectionName:'An Album',
  trackTimeMillis:180000, trackViewUrl:'https://music.apple.com/ma/album/a-song/123?i=1234',
  artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/example/100x100bb.jpg',
  previewUrl:'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/example.m4a' };

test('provider boundary retains original identity, full duration and explicit missing preview', () => {
  const result=parseCatalogResponse({resultCount:2,results:[song,{...song,trackId:5678,previewUrl:undefined}]},{now:1700000000000});
  assert.equal(result.tracks[0].duration,180);
  assert.equal(result.tracks[0].externalUrl,song.trackViewUrl);
  assert.equal(result.tracks[0].previewUrl,song.previewUrl);
  assert.equal(result.tracks[1].previewUrl,null);
  assert.equal(result.tracks[0].url,undefined);
  result.tracks.forEach(validateTrack);
});

test('malformed rows retain partial usable results and do not admit foreign hosts or protocols', () => {
  const result=parseCatalogResponse({resultCount:4,results:[song,{...song,trackId:'1234'},{...song,trackId:4,trackViewUrl:'javascript:alert(1)'},{...song,trackId:5,trackTimeMillis:NaN}]});
  assert.equal(result.tracks.length,1);
  assert.equal(result.skipped,3);
  assert.throws(()=>parseCatalogResponse({results:'not an array'}),/unreadable/);
  for(const url of ['http://music.apple.com/song','https://music.apple.com.attacker.test/song','https://name:pass@music.apple.com/song','https://music.apple.com:8080/song'])assert.equal(providerUrl(url,'itunes'),null);
  assert.equal(providerUrl('https://audio-ssl.itunes.apple.com/song','itunes','content'),null);
  assert.equal(safeArtwork('https://i.scdn.co.attacker.test/cover'),'/artwork/default.svg');
  assert.equal(safeArtwork(song.artworkUrl100),song.artworkUrl100);
  assert.throws(()=>validatePlaylist({id:'p',name:'P',trackIds:[],createdAt:0,sourceUrl:'javascript:alert(1)'}),/source/);
});

test('search preserves the Morocco store, supports cancellation and reports HTTP failure', async () => {
  const controller=new AbortController();
  const query='catalog-boundary-test-'+Date.now();
  await searchCatalog(query,{signal:controller.signal,fetcher:async(url,options)=>{
    assert.equal(url.searchParams.get('country'),'MA');
    assert.equal(url.searchParams.get('term'),query);
    assert.equal(options.signal,controller.signal);
    assert.equal(options.credentials,'omit');
    return {ok:true,json:async()=>({resultCount:1,results:[song]})};
  }});
  await assert.rejects(searchCatalog(query+'failure',{fetcher:async()=>({ok:false,status:429})}),/busy/);
  const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(searchCatalog(query+'cancelled',{signal:cancelled.signal,fetcher:async()=>({ok:true,json:async()=>({resultCount:1,results:[song]})})}),{name:'AbortError'});
});

test('Spotify snapshot preserves order and coverage without inventing albums or audio', () => {
  assert.equal(playlist.tracks.length,100);
  assert.equal(playlist.totalTrackCount,1239);
  assert.equal(playlist.coverage.complete,false);
  const tracks=spotifyLibraryTracks(playlist,1700000000000);
  tracks.forEach(validateTrack);
  assert.equal(tracks[0].title,'Gorah');
  assert.equal(tracks[99].providerId,playlist.tracks[99].spotifyId);
  const unknown=playlist.tracks.findIndex(track=>track.album===null);
  assert.equal(tracks[unknown].album,'');
  assert.equal(tracks[unknown].artwork,null);
  assert.ok(tracks.every(track=>track.url===undefined&&track.previewUrl===null));
});
