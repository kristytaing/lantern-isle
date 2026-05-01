// ============================================================
// AUDIO ENGINE — Lofi procedural Web Audio API
// ============================================================
let ctx = null, muted = false, masterGain = null, reverbNode = null;
let musicScheduler = null;
let currentIslandId = -1;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ctx.createGain(); masterGain.gain.value = 0.45;
  masterGain.connect(ctx.destination);
  reverbNode = buildReverb();
}

// ── Reverb via convolver ───────────────────────────────────
function buildReverb() {
  const convolver = ctx.createConvolver();
  const len = ctx.sampleRate * 2.2;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.5);
  }
  convolver.buffer = buf;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  convolver.connect(wet); wet.connect(masterGain);
  return { input: convolver };
}

function gainNode(v=1) { const g = ctx.createGain(); g.gain.value = v; return g; }
function filterNode(freq=900, type='lowpass') {
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; return f;
}

// Route a node through warm lowpass + optional reverb send
function connectWarm(source, reverbSend=0.4) {
  const lp = filterNode(1400, 'lowpass');
  source.connect(lp); lp.connect(masterGain);
  if (reverbSend > 0 && reverbNode) {
    const send = gainNode(reverbSend);
    source.connect(send); send.connect(reverbNode.input);
  }
}

// ── Island music configs ───────────────────────────────────
// Each island: root, chords (semitone offsets from root), BPM, melody style
const ISLAND_MUSIC = [
  { // 0 Mossy Forest — Cm, slow dreamy
    root: 130.81, bpm: 62,
    chords: [[0,3,7],[5,8,12],[3,7,10],[7,10,14]],
    melodyOct: 2, swing: 0.58,
    bassStyle: 'slow', crackle: 0.010
  },
  { // 1 Sunflower Beach — C major, warm gentle
    root: 130.81, bpm: 72,
    chords: [[0,4,7],[5,9,12],[4,7,11],[7,11,14]],
    melodyOct: 2.5, swing: 0.46,
    bassStyle: 'bounce', crackle: 0.007
  },
  { // 2 Sakura Cove — Bm, gentle flowing
    root: 123.47, bpm: 66,
    chords: [[0,3,7],[5,8,12],[7,10,14],[3,7,10]],
    melodyOct: 2.2, swing: 0.54,
    bassStyle: 'slow', crackle: 0.009
  },
  { // 3 Cozy Village — C, warm folksy
    root: 130.81, bpm: 74,
    chords: [[0,4,7],[5,9,12],[9,12,16],[7,10,14]],
    melodyOct: 2.3, swing: 0.50,
    bassStyle: 'bounce', crackle: 0.013
  },
  { // 4 Crystal Cave — Ab, eerie sparse
    root: 103.83, bpm: 54,
    chords: [[0,3,7],[5,8,12],[8,11,15],[3,7,10]],
    melodyOct: 1.8, swing: 0.65,
    bassStyle: 'sparse', crackle: 0.005
  },
  { // 5 Lavender Highlands — Am, airy floaty
    root: 110, bpm: 66,
    chords: [[0,3,7],[5,8,12],[7,10,14],[3,7,10]],
    melodyOct: 2.4, swing: 0.50,
    bassStyle: 'slow', crackle: 0.008
  },
];

function semitone(base, semi) { return base * Math.pow(2, semi/12); }

// ── Lofi instrument voices ─────────────────────────────────
function playPianoNote(freq, time, dur, vol=0.18) {
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq*2.005;
  const g = gainNode(0); connectWarm(g, 0.38);
  [[o1,1],[o2,0.3]].forEach(([o,w]) => {
    const og = gainNode(w); o.connect(og); og.connect(g); o.start(time); o.stop(time+dur+0.6);
  });
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vol, time+0.025);
  g.gain.setValueAtTime(vol*0.55, time+0.12);
  g.gain.exponentialRampToValueAtTime(0.001, time+dur+0.55);
}

function playBassNote(freq, time, dur, vol=0.22) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq*1.004;
  const g = gainNode(0);
  const lp = filterNode(400, 'lowpass'); g.connect(lp); lp.connect(masterGain);
  [o, o2].forEach(osc => { const og = gainNode(0.5); osc.connect(og); og.connect(g); osc.start(time); osc.stop(time+dur+0.2); });
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vol, time+0.02);
  g.gain.exponentialRampToValueAtTime(0.001, time+dur+0.18);
}

function playKick(time, vol=0.5) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(160, time);
  o.frequency.exponentialRampToValueAtTime(40, time+0.08);
  const g = gainNode(0); g.connect(masterGain);
  o.start(time); o.stop(time+0.12);
  g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.001, time+0.1);
}

function playSnare(time, vol=0.22) {
  const buf = ctx.createBuffer(1, ctx.sampleRate*0.15, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length, 1.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = filterNode(3000, 'highpass');
  const g = gainNode(vol); src.connect(lp); lp.connect(g); g.connect(masterGain);
  src.start(time); src.stop(time+0.15);
}

function playHihat(time, vol=0.07, open=false) {
  const buf = ctx.createBuffer(1, ctx.sampleRate*(open?0.18:0.04), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = filterNode(8000, 'highpass');
  const g = gainNode(0); src.connect(hp); hp.connect(g); g.connect(masterGain);
  g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.001, time+(open?0.16:0.035));
  src.start(time); src.stop(time+(open?0.2:0.05));
}

// Vinyl crackle
function scheduleVinylCrackle(startTime, duration, intensity) {
  const numPops = Math.floor(duration * 12 * intensity * 10);
  for (let i = 0; i < numPops; i++) {
    const t = startTime + Math.random() * duration;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate*0.008), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let j = 0; j < d.length; j++) d[j] = (Math.random()*2-1) * Math.pow(1-j/d.length, 3);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = gainNode(intensity * (0.3 + Math.random()*0.7));
    src.connect(g); g.connect(masterGain);
    src.start(t); src.stop(t+0.01);
  }
}

// ── Main scheduler ─────────────────────────────────────────
function buildLofiScheduler(islandId) {
  const cfg = ISLAND_MUSIC[islandId] || ISLAND_MUSIC[0];
  const { root, bpm, chords, melodyScale, melodyOct, swing, bassStyle, crackle } = cfg;
  const beat = 60 / bpm;
  const bar = beat * 4;
  let active = false, startTime = 0, chordIdx = 0;
  let rafId = null, scheduledUntil = 0;
  const LOOKAHEAD = 0.3;

  function scheduleBar(barStart) {
    const chord = chords[chordIdx % chords.length];
    chordIdx++;

    // Bass line
    const bassRoot = semitone(root, chord[0]);
    if (bassStyle === 'bounce') {
      playBassNote(bassRoot, barStart, beat*1.4);
      if (Math.random() > 0.35) playBassNote(bassRoot, barStart+beat*2.5, beat*1.0, 0.15);
    } else if (bassStyle === 'sparse') {
      playBassNote(bassRoot, barStart, beat*2.2);
      if (Math.random() > 0.5) playBassNote(bassRoot, barStart+beat*3, beat*1.0, 0.14);
    } else {
      playBassNote(bassRoot, barStart, beat*2.0);
      if (Math.random() > 0.4) playBassNote(bassRoot, barStart+beat*2.5, beat*1.4, 0.15);
    }

    // Chord pads: gentle strum on beat 1, optional soft repeat on beat 3
    chord.forEach((semi, i) => {
      const freq = semitone(root * melodyOct, semi);
      playPianoNote(freq, barStart + i*0.022, beat*2.2, 0.085);
      if (Math.random() > 0.55) playPianoNote(freq, barStart+beat*2.5 + i*0.018, beat*1.4, 0.055);
    });

    // Melody: chord-aware, 1-2 notes per bar, long gentle durations
    // Only pick semitones that belong to the current chord (+ octave up)
    const melodyPool = [];
    chord.forEach(semi => { melodyPool.push(semi); melodyPool.push(semi + 12); });
    const numNotes = Math.random() > 0.45 ? 2 : 1;
    const usedBeats = new Set();
    for (let n = 0; n < numNotes; n++) {
      const beatChoices = [0, beat, beat*1.5, beat*2, beat*3];
      let beatPos = beatChoices[Math.floor(Math.random()*beatChoices.length)];
      if (usedBeats.has(beatPos)) beatPos = beatChoices[(Math.floor(Math.random()*beatChoices.length)+2)%beatChoices.length];
      usedBeats.add(beatPos);
      const swingAdj = (beatPos > 0) ? beat*0.5*(swing-0.5)*0.3 : 0;
      const semi = melodyPool[Math.floor(Math.random()*melodyPool.length)];
      const freq = semitone(root * melodyOct, semi);
      const noteDur = beat * (1.6 + Math.random()*1.2);
      playPianoNote(freq, barStart + beatPos + swingAdj, noteDur, 0.11 + Math.random()*0.04);
    }

    // Vinyl crackle over the bar
    scheduleVinylCrackle(barStart, bar, crackle);
  }

  function tick() {
    if (!active) return;
    const now = ctx.currentTime;
    while (scheduledUntil < now + LOOKAHEAD + bar) {
      scheduleBar(scheduledUntil);
      scheduledUntil += bar;
    }
    rafId = setTimeout(tick, 100);
  }

  const masterG = gainNode(0); masterG.connect(masterGain);

  return {
    start() {
      active = true;
      startTime = ctx.currentTime + 0.05;
      scheduledUntil = startTime;
      masterG.gain.linearRampToValueAtTime(1, ctx.currentTime+2.5);
      tick();
    },
    stop() {
      active = false; // immediately stops tick() from scheduling any more notes
      if (rafId) clearTimeout(rafId);
      masterG.gain.cancelScheduledValues(ctx.currentTime);
      masterG.gain.setValueAtTime(masterG.gain.value, ctx.currentTime);
      masterG.gain.linearRampToValueAtTime(0, ctx.currentTime+3.0);
    }
  };
}

export function setIslandMusic(islandId) {
  if (!ctx || islandId === currentIslandId) return;
  currentIslandId = islandId;
  if (musicScheduler) { musicScheduler.stop(); musicScheduler = null; }
  setTimeout(() => {
    if (!ctx || muted || currentIslandId !== islandId) return;
    musicScheduler = buildLofiScheduler(islandId);
    musicScheduler.start();
  }, 3800);
}

export function startExploreMusic() {
  if (!ctx || musicScheduler) return;
  const id = currentIslandId < 0 ? 0 : currentIslandId;
  currentIslandId = id;
  musicScheduler = buildLofiScheduler(id);
  if (!muted) musicScheduler.start();
}

export function startAmbientLayer() {}
export function stopAmbientLayer() {}

// ── SFX (unchanged) ───────────────────────────────────────
function note(freq, type='sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o;
}

export function sfxCrystalCollect() {
  if (!ctx || muted) return;
  const times = [0, 0.1, 0.2], freqs = [523.25, 659.25, 783.99];
  times.forEach((t, i) => {
    const o = note(freqs[i], 'triangle'), g = gainNode(0);
    o.connect(g); g.connect(masterGain); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.3);
    g.gain.setValueAtTime(0, ctx.currentTime+t);
    g.gain.linearRampToValueAtTime(0.22, ctx.currentTime+t+0.04);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime+t+0.28);
    const o2 = note(freqs[i]*2, 'sine'), g2 = gainNode(0);
    o2.connect(g2); g2.connect(masterGain); o2.start(ctx.currentTime+t); o2.stop(ctx.currentTime+t+0.25);
    g2.gain.setValueAtTime(0, ctx.currentTime+t);
    g2.gain.linearRampToValueAtTime(0.08, ctx.currentTime+t+0.03);
    g2.gain.linearRampToValueAtTime(0, ctx.currentTime+t+0.2);
  });
}

export function sfxLanternPulse() {
  if (!ctx || muted) return;
  const o = note(220, 'sine'), g = gainNode(0);
  o.connect(g); g.connect(masterGain);
  o.start(); g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.3, ctx.currentTime+0.08);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime+0.6);
  o.frequency.linearRampToValueAtTime(110, ctx.currentTime+0.6);
  o.stop(ctx.currentTime+0.65);
}

export function sfxFootstep() {
  if (!ctx || muted) return;
  const o = note(180+Math.random()*40, 'sine'), g = gainNode(0);
  o.connect(g); g.connect(masterGain); o.start();
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime+0.07);
  o.stop(ctx.currentTime+0.08);
}

export function sfxDialogue() {
  if (!ctx || muted) return;
  const o = note(880, 'sine'), g = gainNode(0);
  o.connect(g); g.connect(masterGain); o.start();
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime+0.12);
  o.stop(ctx.currentTime+0.13);
}

export function sfxShrine() {
  if (!ctx || muted) return;
  [261.63, 329.63, 392, 523.25].forEach((f, i) => {
    const o = note(f, 'triangle'), g = gainNode(0);
    o.connect(g); g.connect(masterGain);
    o.start(ctx.currentTime+i*0.06); o.stop(ctx.currentTime+i*0.06+2);
    g.gain.setValueAtTime(0, ctx.currentTime+i*0.06);
    g.gain.linearRampToValueAtTime(0.18, ctx.currentTime+i*0.06+0.1);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime+i*0.06+1.8);
  });
}

export function sfxClick() {
  if (!ctx || muted) return;
  const o = note(600, 'sine'), g = gainNode(0.08);
  o.connect(g); g.connect(masterGain); o.start();
  g.gain.linearRampToValueAtTime(0, ctx.currentTime+0.06);
  o.stop(ctx.currentTime+0.07);
}

export function sfxWin() {
  if (!ctx || muted) return;
  [523.25,659.25,783.99,1046.5,783.99,880,1046.5].forEach((f,i) => {
    const o = note(f, 'triangle'), g = gainNode(0);
    o.connect(g); g.connect(masterGain);
    o.start(ctx.currentTime+i*0.18); o.stop(ctx.currentTime+i*0.18+0.55);
    g.gain.setValueAtTime(0, ctx.currentTime+i*0.18);
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime+i*0.18+0.06);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime+i*0.18+0.5);
  });
}

export function sfxIslandArrive() {
  if (!ctx || muted) return;
  [392, 493.88, 587.33, 783.99].forEach((f, i) => {
    const o = note(f, 'triangle'), g = gainNode(0);
    o.connect(g); g.connect(masterGain);
    o.start(ctx.currentTime+i*0.12); o.stop(ctx.currentTime+i*0.12+0.55);
    g.gain.setValueAtTime(0, ctx.currentTime+i*0.12);
    g.gain.linearRampToValueAtTime(0.14, ctx.currentTime+i*0.12+0.06);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime+i*0.12+0.5);
  });
}

export function toggleMute() {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.45;
  return muted;
}
export function isMuted() { return muted; }
