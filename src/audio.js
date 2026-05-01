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
    root: 130.81, bpm: 68,
    chords: [[0,3,7,10],[5,8,12,15],[3,7,10,14],[7,10,14,17]],
    melodyScale: [0,3,5,7,10,12,15], melodyOct: 2, swing: 0.6,
    bassStyle: 'slow', crackle: 0.012
  },
  { // 1 Sunflower Beach — C major, bright warm
    root: 130.81, bpm: 78,
    chords: [[0,4,7,12],[5,9,12,17],[7,11,14,19],[9,12,16,21]],
    melodyScale: [0,2,4,7,9,12,14], melodyOct: 2.5, swing: 0.48,
    bassStyle: 'bounce', crackle: 0.008
  },
  { // 2 Sakura Cove — Bm, gentle mysterious
    root: 123.47, bpm: 72,
    chords: [[0,3,7,10],[5,8,12,14],[8,12,15,19],[3,7,10,12]],
    melodyScale: [0,2,3,7,9,12,14], melodyOct: 2.2, swing: 0.55,
    bassStyle: 'slow', crackle: 0.01
  },
  { // 3 Cozy Village — C, warm folksy
    root: 130.81, bpm: 76,
    chords: [[0,4,7,12],[5,9,12,17],[9,12,16,19],[7,11,14,17]],
    melodyScale: [0,2,4,7,9,12,14], melodyOct: 2.3, swing: 0.5,
    bassStyle: 'bounce', crackle: 0.015
  },
  { // 4 Crystal Cave — Ab, eerie sparse
    root: 103.83, bpm: 58,
    chords: [[0,3,6,10],[5,8,11,15],[8,11,15,18],[3,6,10,13]],
    melodyScale: [0,3,5,6,10,12,15], melodyOct: 1.8, swing: 0.7,
    bassStyle: 'sparse', crackle: 0.006
  },
  { // 5 Lavender Highlands — Am, airy floaty
    root: 110, bpm: 70,
    chords: [[0,3,7,12],[5,8,12,15],[7,10,14,17],[3,7,10,14]],
    melodyScale: [0,2,3,7,9,10,12], melodyOct: 2.4, swing: 0.52,
    bassStyle: 'slow', crackle: 0.009
  },
];

function semitone(base, semi) { return base * Math.pow(2, semi/12); }

// ── Lofi instrument voices ─────────────────────────────────
function playPianoNote(freq, time, dur, vol=0.18) {
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq*2.01;
  const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = freq*3.0;
  const g = gainNode(0); connectWarm(g, 0.35);
  [o1,o2,o3].forEach((o,i) => {
    const og = gainNode([1, 0.4, 0.15][i]); o.connect(og); og.connect(g); o.start(time); o.stop(time+dur+0.4);
  });
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vol, time+0.015);
  g.gain.setValueAtTime(vol*0.6, time+0.08);
  g.gain.exponentialRampToValueAtTime(0.001, time+dur+0.35);
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
    const bassRoot2 = semitone(root, chord[0]);
    if (bassStyle === 'bounce') {
      playBassNote(bassRoot, barStart, beat*1.2);
      playBassNote(bassRoot2*1.5, barStart+beat*2+beat*0.5*swing, beat*0.8, 0.16);
      playBassNote(bassRoot2, barStart+beat*3, beat*0.7, 0.14);
    } else if (bassStyle === 'sparse') {
      playBassNote(bassRoot, barStart, beat*1.8);
      if (Math.random() > 0.4) playBassNote(bassRoot2, barStart+beat*2.5, beat*1.2, 0.16);
    } else {
      playBassNote(bassRoot, barStart, beat*1.5);
      playBassNote(bassRoot2, barStart+beat*2, beat*1.8);
    }

    // Chord pads: soft strum on beat 1, lighter hit on beat 3
    chord.forEach((semi, i) => {
      const freq = semitone(root * melodyOct, semi);
      playPianoNote(freq, barStart + i*0.018, beat*1.6, 0.10);
      if (Math.random() > 0.3) playPianoNote(freq, barStart+beat*2 + i*0.015, beat*1.2, 0.07);
    });

    // Melody: 3-5 notes per bar from scale, syncopated timing
    const numNotes = 3 + Math.floor(Math.random()*3);
    const usedBeats = new Set();
    for (let n = 0; n < numNotes; n++) {
      let beatPos;
      let tries = 0;
      do { beatPos = Math.floor(Math.random()*8) * beat*0.5; tries++; } while (usedBeats.has(beatPos) && tries < 10);
      usedBeats.add(beatPos);
      const swingAdj = (Math.round(beatPos/(beat*0.5)) % 2 === 1) ? beat*0.5*(swing-0.5)*0.4 : 0;
      const semi = melodyScale[Math.floor(Math.random()*melodyScale.length)];
      const oct = Math.random() > 0.25 ? 2 : 1;
      const freq = semitone(root * (melodyOct + (oct-2)*0.5), semi);
      playPianoNote(freq, barStart + beatPos + swingAdj, beat*0.55, 0.13 + Math.random()*0.06);
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
      active = false;
      if (rafId) clearTimeout(rafId);
      masterG.gain.linearRampToValueAtTime(0, ctx.currentTime+2);
    }
  };
}

export function setIslandMusic(islandId) {
  if (!ctx || islandId === currentIslandId) return;
  currentIslandId = islandId;
  if (musicScheduler) { musicScheduler.stop(); musicScheduler = null; }
  setTimeout(() => {
    if (!ctx || muted) return;
    musicScheduler = buildLofiScheduler(islandId);
    musicScheduler.start();
  }, 1600);
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
