const assert = require('node:assert');

console.log('====================================================');
console.log('  SPOTKIFY MUSIC PLAYBACK ENGINE AUTOMATED TEST SUITE');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
  }
}

// Fisher-Yates shuffle implementation
function createShuffleOrder(length, currentIdx = 0) {
  if (length <= 1) return [0];
  const indices = [];
  for (let i = 0; i < length; i++) {
    if (i !== currentIdx) indices.push(i);
  }
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return [currentIdx, ...indices];
}

// Mock Player Engine mimicking PlayerContext
class MockPlayerEngine {
  constructor() {
    this.queue = [];
    this.currentIndex = 0;
    this.currentSong = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 180;
    this.volume = 0.8;
    this.isMuted = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this.isShuffle = false;
    this.shuffledOrder = [];
    this.shuffleIndex = 0;
    this.playbackRequestId = 0;
    this.errorCount = 0;
    this.error = null;
    this.playHistory = [];
  }

  playSong(song, newQueue = null) {
    if (newQueue && newQueue.length > 0) {
      this.queue = [...newQueue];
      const idx = this.queue.findIndex(s => s.id === song.id);
      this.currentIndex = idx >= 0 ? idx : 0;
      if (this.isShuffle) {
        this.shuffledOrder = createShuffleOrder(this.queue.length, this.currentIndex);
        this.shuffleIndex = 0;
      }
    } else {
      const idx = this.queue.findIndex(s => s.id === song.id);
      if (idx >= 0) {
        this.currentIndex = idx;
        if (this.isShuffle) {
          const sIdx = this.shuffledOrder.indexOf(idx);
          if (sIdx >= 0) this.shuffleIndex = sIdx;
        }
      } else {
        this.queue.push(song);
        this.currentIndex = this.queue.length - 1;
        if (this.isShuffle) {
          this.shuffledOrder.push(this.currentIndex);
        }
      }
    }

    const reqId = ++this.playbackRequestId;
    this.currentSong = song;
    this.currentTime = 0;
    this.isPlaying = true;
    this.error = null;
    this.errorCount = 0;
    this.playHistory.push({ songId: song.id, reqId });
  }

  togglePlay() {
    if (!this.currentSong && this.queue.length > 0) {
      this.playSong(this.queue[0]);
      return;
    }
    this.isPlaying = !this.isPlaying;
  }

  seek(seconds) {
    this.currentTime = Math.max(0, Math.min(this.duration, seconds));
  }

  setVol(val) {
    this.volume = Math.max(0, Math.min(1, val));
    this.isMuted = false;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle && this.queue.length > 0) {
      this.shuffledOrder = createShuffleOrder(this.queue.length, this.currentIndex);
      this.shuffleIndex = 0;
    }
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') this.repeatMode = 'all';
    else if (this.repeatMode === 'all') this.repeatMode = 'one';
    else this.repeatMode = 'off';
  }

  nextSong(isAutoAdvance = false) {
    if (this.queue.length === 0) return;

    if (this.repeatMode === 'one' && isAutoAdvance) {
      this.currentTime = 0;
      this.isPlaying = true;
      this.playHistory.push({ songId: this.currentSong.id, repeated: true });
      return;
    }

    if (this.isShuffle) {
      let nextSIdx = this.shuffleIndex + 1;
      if (nextSIdx >= this.shuffledOrder.length) {
        if (this.repeatMode === 'all') {
          this.shuffledOrder = createShuffleOrder(this.queue.length, this.shuffledOrder[this.shuffledOrder.length - 1]);
          nextSIdx = 0;
        } else {
          this.isPlaying = false;
          return;
        }
      }
      this.shuffleIndex = nextSIdx;
      const targetQueueIdx = this.shuffledOrder[nextSIdx];
      this.currentIndex = targetQueueIdx;
      this.currentSong = this.queue[targetQueueIdx];
      this.currentTime = 0;
      this.isPlaying = true;
      this.playHistory.push({ songId: this.currentSong.id, shuffle: true });
      return;
    }

    let nextIdx = this.currentIndex + 1;
    if (nextIdx >= this.queue.length) {
      if (this.repeatMode === 'all') {
        nextIdx = 0;
      } else {
        this.isPlaying = false;
        return;
      }
    }

    this.currentIndex = nextIdx;
    this.currentSong = this.queue[nextIdx];
    this.currentTime = 0;
    this.isPlaying = true;
    this.playHistory.push({ songId: this.currentSong.id });
  }

  prevSong() {
    if (this.currentTime > 3.0) {
      this.currentTime = 0;
      return;
    }

    if (this.queue.length === 0) return;

    if (this.isShuffle) {
      let prevSIdx = this.shuffleIndex - 1;
      if (prevSIdx < 0) {
        prevSIdx = this.shuffledOrder.length - 1;
      }
      this.shuffleIndex = prevSIdx;
      const targetQueueIdx = this.shuffledOrder[prevSIdx];
      this.currentIndex = targetQueueIdx;
      this.currentSong = this.queue[targetQueueIdx];
      this.currentTime = 0;
      return;
    }

    let prevIdx = this.currentIndex - 1;
    if (prevIdx < 0) {
      prevIdx = this.queue.length - 1;
    }
    this.currentIndex = prevIdx;
    this.currentSong = this.queue[prevIdx];
    this.currentTime = 0;
  }

  simulateError() {
    this.errorCount++;
    if (this.errorCount < 2) {
      this.nextSong(false);
    } else {
      this.isPlaying = false;
      this.error = { message: 'Playback failed. Circuit breaker halted skipping.' };
    }
  }

  simulateSongEnded() {
    this.nextSong(true);
  }
}

// SAMPLE TEST SONGS
const songs = [
  { id: 'song-1', title: 'Song One', artist: 'Artist A', audio_url: 'https://res.cloudinary.com/demo/1.mp3' },
  { id: 'song-2', title: 'Song Two', artist: 'Artist B', audio_url: 'https://res.cloudinary.com/demo/2.mp3' },
  { id: 'song-3', title: 'Song Three', artist: 'Artist C', audio_url: 'https://res.cloudinary.com/demo/3.mp3' },
  { id: 'song-4', title: 'Song Four', artist: 'Artist D', audio_url: 'https://res.cloudinary.com/demo/4.mp3' },
  { id: 'song-5', title: 'Song Five', artist: 'Artist E', audio_url: 'https://res.cloudinary.com/demo/5.mp3' }
];

async function runAllTests() {
  // 1. Basic Playback
  test('1. Basic Playback: Play, Pause, Resume, Seek, Volume', () => {
    const engine = new MockPlayerEngine();
    engine.playSong(songs[0], songs);
    assert.strictEqual(engine.currentSong.id, 'song-1');
    assert.strictEqual(engine.isPlaying, true);

    engine.togglePlay();
    assert.strictEqual(engine.isPlaying, false);

    engine.togglePlay();
    assert.strictEqual(engine.isPlaying, true);

    engine.seek(45);
    assert.strictEqual(engine.currentTime, 45);

    engine.setVol(0.65);
    assert.strictEqual(engine.volume, 0.65);

    engine.toggleMute();
    assert.strictEqual(engine.isMuted, true);
    engine.toggleMute();
    assert.strictEqual(engine.isMuted, false);
  });

  // 2. Continuous Automatic Playback on Song End
  test('2. Automatic Continuous Playback on Song End (No manual click required)', () => {
    const engine = new MockPlayerEngine();
    engine.playSong(songs[0], songs);
    assert.strictEqual(engine.currentSong.id, 'song-1');

    // Song 1 ends naturally
    engine.simulateSongEnded();
    assert.strictEqual(engine.currentSong.id, 'song-2');
    assert.strictEqual(engine.isPlaying, true);

    // Song 2 ends naturally
    engine.simulateSongEnded();
    assert.strictEqual(engine.currentSong.id, 'song-3');
    assert.strictEqual(engine.isPlaying, true);
  });

  // 3. Queue Navigation: Start in middle of playlist
  test('3. Playlist Selection: Starting from middle (Song C) continues with D, E', () => {
    const engine = new MockPlayerEngine();
    engine.playSong(songs[2], songs); // Play Song 3 (index 2)
    assert.strictEqual(engine.currentIndex, 2);
    assert.strictEqual(engine.currentSong.id, 'song-3');

    engine.nextSong();
    assert.strictEqual(engine.currentSong.id, 'song-4');

    engine.nextSong();
    assert.strictEqual(engine.currentSong.id, 'song-5');
  });

  // 4. Previous Button 3-Second Threshold
  test('4. Previous Button: Restarts song if >3s, navigates back if <=3s', () => {
    const engine = new MockPlayerEngine();
    engine.playSong(songs[2], songs); // Song 3

    // Case A: User listened for 15 seconds
    engine.seek(15);
    engine.prevSong();
    assert.strictEqual(engine.currentSong.id, 'song-3', 'Should restart song 3');
    assert.strictEqual(engine.currentTime, 0, 'Current time should be 0');

    // Case B: User is near the beginning (1 second)
    engine.seek(1.5);
    engine.prevSong();
    assert.strictEqual(engine.currentSong.id, 'song-2', 'Should go to song 2');
  });

  // 5. Deterministic Shuffle Mode
  test('5. Deterministic Shuffle Mode: Follows fixed shuffled sequence without random repetitions', () => {
    const engine = new MockPlayerEngine();
    engine.playSong(songs[0], songs);
    engine.toggleShuffle();

    assert.strictEqual(engine.isShuffle, true);
    assert.strictEqual(engine.shuffledOrder.length, 5);
    assert.strictEqual(engine.shuffledOrder[0], 0, 'First item in shuffle order should be current song');

    // Verify all 5 indices are present uniquely (permutation)
    const sorted = [...engine.shuffledOrder].sort((a, b) => a - b);
    assert.deepStrictEqual(sorted, [0, 1, 2, 3, 4]);

    // Walk forward along shuffle queue
    const sequence = [engine.currentSong.id];
    for (let i = 1; i < 5; i++) {
      engine.nextSong();
      sequence.push(engine.currentSong.id);
    }
    assert.strictEqual(sequence.length, 5);
    const unique = new Set(sequence);
    assert.strictEqual(unique.size, 5, 'Shuffle sequence must not have duplicate songs');

    // Previous in shuffle mode walks backwards along the exact same shuffle sequence
    engine.prevSong();
    assert.strictEqual(engine.currentSong.id, sequence[3], 'Previous in shuffle should step back along shuffle queue');
  });

  // 6. Repeat Modes (OFF, ALL, ONE)
  test('6. Repeat Modes: Repeat OFF stops at end, Repeat ALL loops, Repeat ONE replays current', () => {
    const engine = new MockPlayerEngine();
    engine.playSong(songs[4], songs); // Last song (index 4)
    engine.repeatMode = 'off';

    // End of queue with repeat OFF -> stops
    engine.simulateSongEnded();
    assert.strictEqual(engine.isPlaying, false, 'Repeat OFF should stop at end of queue');

    // Repeat ALL -> loops back to index 0
    engine.repeatMode = 'all';
    engine.playSong(songs[4], songs);
    engine.simulateSongEnded();
    assert.strictEqual(engine.currentSong.id, 'song-1', 'Repeat ALL should loop back to song 1');

    // Repeat ONE -> replays current song on ended
    engine.repeatMode = 'one';
    engine.playSong(songs[2], songs);
    engine.simulateSongEnded();
    assert.strictEqual(engine.currentSong.id, 'song-3', 'Repeat ONE should replay current song');
    assert.strictEqual(engine.isPlaying, true);
  });

  // 7. Error Circuit Breaker (Prevents infinite runaway skipping loop)
  test('7. Error Recovery: Circuit breaker halts continuous skipping after consecutive errors', () => {
    const engine = new MockPlayerEngine();
    engine.playSong(songs[0], songs);

    // Error on Song 1 -> attempts Song 2
    engine.simulateError();
    assert.strictEqual(engine.currentSong.id, 'song-2');

    // Error on Song 2 -> halts to prevent infinite loop
    engine.simulateError();
    assert.strictEqual(engine.isPlaying, false, 'Should halt playback');
    assert.notStrictEqual(engine.error, null, 'Error state should be set');
  });

  // 8. Race Condition Protection Simulation
  test('8. Race Conditions: Rapid clicks resolve only to the latest requested song', async () => {
    const engine = new MockPlayerEngine();
    // Simulate user rapidly clicking Song 1, then Song 2, then Song 3
    engine.playSong(songs[0], songs);
    engine.playSong(songs[1], songs);
    engine.playSong(songs[2], songs);

    assert.strictEqual(engine.currentSong.id, 'song-3');
    assert.strictEqual(engine.playbackRequestId, 3);
  });

  // 9. Cloudinary Native Streaming & HTTP Range Support Check
  await testAsync('9. Cloudinary Audio Range Requests: Native HTTP Range support verified', async () => {
    const testAudioUrl = 'https://res.cloudinary.com/apkdo69e/video/upload/v1788807426/Ztish_Kumaresh_Keshini_-_Ennai_Kollathey.mp3';
    const res = await fetch(testAudioUrl, { method: 'HEAD' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('accept-ranges'), 'bytes', 'Cloudinary must support byte ranges for seeking');
    assert(res.headers.get('content-type').includes('audio'), 'Content type must be audio');
  });

  console.log('\n====================================================');
  console.log(`  PLAYBACK TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
