import { shuffled, moveItem } from './domain.js';
import { isLocalAudio } from './catalog.js';

// One owner for audio, queue position, object URLs and asynchronous track loads.
export class MusicPlayer extends EventTarget {
  constructor({ findTrack, readBlob, audio = new Audio(), urls = URL, random = Math.random }) {
    super(); this.findTrack = findTrack; this.readBlob = readBlob; this.audio = audio; this.urls = urls; this.random = random;
    this.queue = []; this.index = -1; this.repeat = 'off'; this.shuffle = false; this.originalQueue = []; this.generation = 0; this.objectUrl = null; this.loading = false; this.error = ''; this.audio.preload = 'metadata'; this.previousVolume = 0.75; this.audio.volume = .75;
    for (const type of ['timeupdate','durationchange','play','pause','volumechange','waiting','canplay']) audio.addEventListener(type, () => this.emit(type));
    audio.addEventListener('error', () => { this.loading = false; this.error = 'This audio could not be played. The browser may not support its format, or the file may be damaged.'; this.emit('error'); });
    audio.addEventListener('ended', () => { void this.next(false).catch(error => this.fail(error)); });
  }
  get track() { return this.findTrack(this.queue[this.index]?.trackId) || null; }
  get isPlaying() { return !this.audio.paused && !this.audio.ended; }
  get time() { return Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0; }
  get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : this.track?.duration || 0; }
  emit(type = 'change') { this.dispatchEvent(new CustomEvent('update', { detail: { type } })); }
  fail(error) { this.error = error instanceof Error ? error.message : 'Playback failed.'; this.loading = false; this.emit('error'); }
  async setQueue(ids, startIndex = 0, autoplay = true) {
    const selectedIndex = Math.min(Math.max(0,startIndex),Math.max(0,ids.length-1));
    const valid = ids.map((trackId,sourceIndex)=>({trackId,sourceIndex})).filter(entry=>isLocalAudio(this.findTrack(entry.trackId))); this.queue = valid.map(({trackId}) => ({ id: crypto.randomUUID(), trackId })); this.originalQueue = [...this.queue];
    const nextIndex = valid.findIndex(entry=>entry.sourceIndex>=selectedIndex);
    this.index = valid.length ? nextIndex>=0?nextIndex:valid.length-1 : -1;
    if (this.shuffle && valid.length) { const current = this.queue[this.index]; this.queue = [current, ...shuffled(this.queue.filter(entry => entry.id !== current.id), this.random)]; this.index = 0; }
    if (!valid.length) { this.stop(); return; } await this.load(autoplay);
  }
  async load(autoplay = true) {
    const generation = ++this.generation, track = this.track;
    this.audio.pause(); this.loading = true; this.error = ''; this.emit('track');
    try {
      if (!track) throw new Error('Choose a track to start listening.');
      let source = track.url;
      let objectUrl = null;
      if (track.source === 'local') { const blob = await this.readBlob(track.id); if (!blob) throw new Error('This file is no longer in local storage. Import it again to play it.'); if (generation !== this.generation) return; objectUrl = this.urls.createObjectURL(blob); source = objectUrl; }
      if (generation !== this.generation) { if (objectUrl) this.urls.revokeObjectURL(objectUrl); return; }
      if (typeof source !== 'string' || (!source.startsWith('/audio/') && !source.startsWith('blob:'))) throw new Error('The audio source is unavailable.');
      const previous = this.objectUrl; this.objectUrl = objectUrl; this.audio.src = source; this.audio.load(); if (previous) this.urls.revokeObjectURL(previous);
      if (autoplay) await this.audio.play();
      if (generation !== this.generation) return;
      this.loading = false; this.emit('loaded');
    } catch (error) { if (generation === this.generation) { this.fail(error); throw error; } }
  }
  async toggle() { if (!this.track) return; if (this.isPlaying) this.audio.pause(); else { this.error = ''; await this.audio.play(); } this.emit(); }
  async next(manual = true) {
    if (!this.queue.length) return;
    if (!manual && this.repeat === 'one') { this.audio.currentTime = 0; await this.audio.play(); return; }
    if (this.index + 1 < this.queue.length) this.index++;
    else if (this.repeat === 'all') this.index = 0;
    else { this.audio.pause(); this.emit('ended'); return; }
    await this.load(true);
  }
  async previous() { if (!this.queue.length) return; if (this.time > 3) { this.seek(0); return; } this.index = Math.max(0, this.index - 1); await this.load(true); }
  seek(seconds) { if (this.audio.src && Number.isFinite(seconds)) { this.audio.currentTime = Math.min(this.duration, Math.max(0, seconds)); this.emit('timeupdate'); } }
  setVolume(volume) { if (Number.isFinite(volume)) { this.audio.volume = Math.min(1, Math.max(0, volume)); if (volume > 0) this.previousVolume = this.audio.volume; } }
  mute() { this.setVolume(this.audio.volume ? 0 : this.previousVolume); }
  toggleShuffle() { this.shuffle = !this.shuffle; const current = this.queue[this.index]; if (current) { if (this.shuffle) { this.queue = [current,...shuffled(this.queue.filter(entry => entry.id !== current.id),this.random)]; this.index = 0; } else { const order = new Map(this.originalQueue.map((entry,index) => [entry.id,index])); this.queue.sort((a,b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity)); this.index = this.queue.findIndex(entry => entry.id === current.id); } } this.emit('queue'); }
  cycleRepeat() { this.repeat = { off:'all',all:'one',one:'off' }[this.repeat]; this.emit('queue'); }
  enqueue(id, next = false) { if (!isLocalAudio(this.findTrack(id))) return; const current = this.queue[this.index]; const entry = { id: crypto.randomUUID(),trackId:id }; this.queue.splice(next ? this.index + 1 : this.queue.length,0,entry); const originalPosition = this.originalQueue.findIndex(item => item.id === current?.id); this.originalQueue.splice(next ? originalPosition + 1 : this.originalQueue.length,0,entry); if (this.index === -1) { this.index = 0; void this.load(false).catch(error => this.fail(error)); } this.emit('queue'); }
  async jump(index) { if (index < 0 || index >= this.queue.length) return; this.index = index; await this.load(true); }
  move(from,to) { const current = this.queue[this.index]; this.queue = moveItem(this.queue,from,to); this.index = this.queue.findIndex(entry => entry.id === current?.id); if (!this.shuffle) this.originalQueue = [...this.queue]; this.emit('queue'); }
  remove(index) { const entry = this.queue[index]; if (!entry) return; if (index === this.index) { this.queue.splice(index,1); this.originalQueue = this.originalQueue.filter(item => item.id !== entry.id); if (!this.queue.length) this.stop(); else { this.index = Math.min(index,this.queue.length-1); void this.load(this.isPlaying).catch(error => this.fail(error)); } } else { this.queue.splice(index,1); if (index < this.index) this.index--; this.originalQueue = this.originalQueue.filter(item => item.id !== entry.id); this.emit('queue'); } }
  clearUpcoming() { this.queue = this.queue.slice(0, this.index + 1); this.originalQueue = [...this.queue]; this.emit('queue'); }
  forget(id) { for (let index = this.queue.length-1; index >= 0; index--) if (this.queue[index].trackId === id) this.remove(index); }
  stop() { ++this.generation; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); if (this.objectUrl) this.urls.revokeObjectURL(this.objectUrl); this.objectUrl = null; this.queue = []; this.originalQueue = []; this.index = -1; this.loading = false; this.error = ''; this.emit('track'); }
}
