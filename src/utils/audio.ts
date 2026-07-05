// Sound synthesizer using Web Audio API to prevent issues with missing files or cross-origin restrictions.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Play a short click/tick sound for the wheel rotation
export function playTickSound(frequency = 400) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.warn('Audio play tick error:', e);
  }
}

// Play a beautiful win fanfare
export function playFanfareSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Series of notes: C4 (261.63), E4 (329.63), G4 (392.00), C5 (523.25)
    const notes = [
      { freq: 261.63, delay: 0, duration: 0.12 },
      { freq: 329.63, delay: 0.12, duration: 0.12 },
      { freq: 392.00, delay: 0.24, duration: 0.12 },
      { freq: 523.25, delay: 0.36, duration: 0.5 }
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.delay);

      gainNode.gain.setValueAtTime(0, now + note.delay);
      gainNode.gain.linearRampToValueAtTime(0.15, now + note.delay + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.duration);
    });
  } catch (e) {
    console.warn('Audio play fanfare error:', e);
  }
}

// Play a starting/spinning swoosh sound
export function playStartSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.warn('Audio play start error:', e);
  }
}
