#!/usr/bin/env python3
"""
tuNota — Audio del video showcase v2.
Genera, con solo la stdlib:
  · musica-v2.wav  — cama ambiental (pads Am7–Fmaj7–Cmaj7–G6 + arpeglo pentatónico + bajo)
  · sfx-v2.wav     — efectos sincronizados con sfx.json (teclas, clics, pops, magia, alarma…)
  · mezcla-v2.wav  — la mezcla final para muxar con el video
Uso: python3 audio-v2.py [dir_grabaciones]
"""
import json, math, os, random, struct, sys, wave
from array import array

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
REC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'recordings')
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

sfx = json.load(open(os.path.join(REC, 'sfx.json')))
trims = json.load(open(os.path.join(REC, 'trims.json')))

# ---------------------------------------------------------------- timeline --
order = [s['name'] for s in sfx['scenes']]
dur = {s['name']: s['dur'] for s in sfx['scenes']}
offset, acc = {}, 0.0
for name in order:
    offset[name] = acc
    acc += dur[name]
TOTAL = acc + 0.4
print(f'escenas: {len(order)} · duración total: {TOTAL:.1f}s')

# ------------------------------------------------------------------- música --
# Progresión Am7 – Fmaj7 – Cmaj7 – G6 (frecuencias en Hz).
def nf(semi_from_a440):
    return 440.0 * (2 ** (semi_from_a440 / 12.0))
A2, C3, D3, E3, F2, G2, B2 = nf(-24), nf(-21), nf(-19), nf(-17), nf(-28), nf(-26), nf(-22)
CHORDS = [
    [A2, C3, E3, G2],   # Am7
    [F2, A2, C3, E3],   # Fmaj7
    [C3, E3, G2, B2],   # Cmaj7
    [G2, B2, D3, E3],   # G6
]
ROOTS = [A2, F2, C3 / 2, G2]
CHORD_T = 4.4
PENTA = [nf(-12), nf(-9), nf(-7), nf(-5), nf(-2), nf(0), nf(3), nf(5)]  # Am pentatónica hacia arriba

def render_music(n0, n1):
    """Renderiza la cama musical para las muestras [n0, n1). Devuelve (L, R)."""
    L, R = array('d', [0.0]) * 0, array('d', [0.0]) * 0
    L = array('d', (0.0 for _ in range(n1 - n0)))
    R = array('d', (0.0 for _ in range(n1 - n0)))
    # --- pads + bajo ---
    for i in range(n1 - n0):
        n = n0 + i
        t = n / SR
        pos = (t % (CHORD_T * 4)) / CHORD_T
        ci = int(pos)
        frac = pos - ci
        # envolvente del acorde: ataque 0.9s, suelta 1.1s (solape suave entre acordes)
        env = min(1.0, frac * CHORD_T / 0.9) * min(1.0, (1 - frac) * CHORD_T / 1.1)
        env = env * env * (3 - 2 * env)  # smoothstep
        chord = CHORDS[ci]
        prev = CHORDS[(ci - 1) % 4]
        s = 0.0
        ph = t * 2 * math.pi
        for k in range(4):
            s += math.sin(ph * chord[k] + k * 0.4) * env
            s += math.sin(ph * prev[k] + k * 0.4) * (1 - env) * 0.8
            s += 0.22 * math.sin(ph * chord[k] * 2) * env
        s *= 0.055
        # bajo (raíz, una octava por debajo del primer grado disponible)
        b = ROOTS[ci] / 2
        s += 0.045 * math.sin(ph * b) * env + 0.045 * math.sin(ph * (ROOTS[(ci - 1) % 4] / 2)) * (1 - env)
        # trémolo lento
        s *= 1.0 + 0.10 * math.sin(ph * 0.11)
        L[i] += s
        R[i] += s
    # --- arpeglo pentatónico (patrón reproducible) ---
    rng = random.Random(20260726)
    step = 0.545
    notes = []
    tt = 1.2
    mel = [0, 2, 4, 3, 5, 4, 2, 1]
    mi = 0
    while tt < TOTAL - 2:
        if rng.random() < 0.72:
            idx = (mel[mi % len(mel)] + rng.choice([0, 0, 1, 2])) % len(PENTA)
            notes.append((tt + rng.uniform(-0.02, 0.02), PENTA[idx], rng.uniform(0.7, 1.0)))
        mi += 1
        tt += step * rng.choice([1, 1, 1, 2])
    for (t0, f, vel) in notes:
        start = int(t0 * SR)
        dur_s = 0.85
        nd = int(dur_s * SR)
        for j in range(nd):
            n = start + j
            if n < n0 or n >= n1:
                continue
            tj = j / SR
            a = math.exp(-tj * 5.2) * min(1.0, tj / 0.008)
            v = (math.sin(2 * math.pi * f * tj) + 0.35 * math.sin(4 * math.pi * f * tj)) * a * 0.075 * vel
            i = n - n0
            pan = 0.06 * math.sin(t0 * 3.7)
            L[i] += v * (1 - pan)
            R[i] += v * (1 + pan)
    # --- fundidos global de la música ---
    FI, FO = 2.2, 4.5
    for i in range(n1 - n0):
        t = (n0 + i) / SR
        g = min(1.0, t / FI) * min(1.0, max(0.0, (TOTAL - t) / FO))
        L[i] *= g
        R[i] *= g
    return L, R

# --------------------------------------------------------------------- sfx --
def tone(f0, f1, dur_s, vol, curve='sin', decay=6.0, attack=0.006, harm2=0.0):
    n = int(dur_s * SR)
    out = array('d', (0.0 for _ in range(n)))
    for j in range(n):
        t = j / SR
        f = f0 + (f1 - f0) * (j / max(1, n - 1))
        v = math.sin(2 * math.pi * f * t)
        if harm2:
            v += harm2 * math.sin(4 * math.pi * f * t)
        a = min(1.0, t / attack) * math.exp(-t * decay)
        out[j] = v * a * vol
    return out

def noise_hit(dur_s, vol, decay=14.0, seed=1, lp=0.25):
    rng = random.Random(seed)
    n = int(dur_s * SR)
    out = array('d', (0.0 for _ in range(n)))
    y = 0.0
    for j in range(n):
        t = j / SR
        y += lp * (rng.uniform(-1, 1) - y)  # paso-bajo simple
        out[j] = y * math.exp(-t * decay) * vol
    return out

def sweep_noise(dur_s, vol, seed=2):
    """Ruido con barrido ascendente de brillo (whoosh), normalizado a pico."""
    rng = random.Random(seed)
    n = int(dur_s * SR)
    out = array('d', (0.0 for _ in range(n)))
    y = 0.0
    for j in range(n):
        x = j / n
        lp = 0.05 + 0.6 * x * x                      # se abre hacia agudos
        xin = rng.uniform(-1, 1)
        y += lp * (xin - y)
        env = math.sin(math.pi * min(1.0, x)) ** 1.3  # sube y baja
        out[j] = (0.55 * y + 0.45 * xin * lp) * env
    peak = max(0.001, max(abs(v) for v in out))
    for j in range(n):
        out[j] = out[j] / peak * vol
    return out

def chime(freqs, dur_s, vol, gap=0.0, decay=5.5):
    n = int((dur_s + gap * len(freqs)) * SR)
    out = array('d', (0.0 for _ in range(n)))
    for k, f in enumerate(freqs):
        off = int(gap * k * SR)
        w = tone(f, f, dur_s, vol, decay=decay)
        for j in range(len(w)):
            out[off + j] += w[j]
    return out

def bank():
    b = {}
    b['key'] = [tone(1750 + i * 90, 1750 + i * 90, 0.035, 0.21, decay=60, attack=0.003, harm2=0.25) for i in range(8)]
    b['keyEnter'] = [tone(1250, 1150, 0.06, 0.28, decay=30, attack=0.004)]
    b['click'] = [noise_hit(0.05, 0.28, decay=60, seed=7, lp=0.5)]
    b['pop'] = [tone(500, 920, 0.085, 0.30, decay=22, attack=0.004)]
    b['ding'] = [chime([880, 1174.66], 0.42, 0.26, gap=0.07)]
    b['success'] = [chime([659.26, 830.61, 987.77], 0.5, 0.24, gap=0.075)]
    b['magic'] = [chime([1567.98, 1760.0, 1975.53, 2217.46, 2489.02, 2793.83], 0.55, 0.16, gap=0.055)]
    b['whoosh'] = [sweep_noise(0.5, 0.42, seed=3)]
    b['search'] = [sweep_noise(0.75, 0.38, seed=5)]
    b['run'] = [tone(330, 660, 0.15, 0.32, decay=16, attack=0.01, harm2=0.3)]
    b['draw'] = [noise_hit(0.2, 0.13, decay=10, seed=9, lp=0.16)]
    b['alarm'] = [chime([880, 1174.66, 1567.98, 880, 1174.66, 1567.98], 0.5, 0.30, gap=0.16)]
    b['intro'] = [sweep_noise(0.65, 0.40, seed=11)]
    return b

BANK = bank()
variant = {}

def render_sfx(n0, n1):
    L = array('d', (0.0 for _ in range(n1 - n0)))
    R = array('d', (0.0 for _ in range(n1 - n0)))
    for e in sfx['events']:
        name = e['name']
        if name not in BANK:
            name = 'click'
        gt = offset[e['scene']] + e['t']
        start = int(gt * SR)
        if start >= n1:
            continue
        vi = variant.get(name, 0)
        w = BANK[name][vi % len(BANK[name])]
        variant[name] = vi + 1
        pan = 0.05 if (vi % 2 == 0) else -0.05
        for j in range(len(w)):
            n = start + j
            if n < n0:
                continue
            if n >= n1:
                break
            i = n - n0
            L[i] += w[j] * (1 - pan)
            R[i] += w[j] * (1 + pan)
    return L, R

# -------------------------------------------------------------------- mezcla --
def soft(x):
    return math.tanh(x * 1.15) / 1.15

mL = wave.open(os.path.join(OUT, 'musica-v2.wav'), 'wb')
sL = wave.open(os.path.join(OUT, 'sfx-v2.wav'), 'wb')
mx = wave.open(os.path.join(OUT, 'mezcla-v2.wav'), 'wb')
for w in (mL, sL, mx):
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)

CHUNK = SR  # 1 segundo por bloque
n = 0
totalN = int(TOTAL * SR)
while n < totalN:
    n1 = min(totalN, n + CHUNK)
    mLch, mRch = render_music(n, n1)
    sLch, sRch = render_sfx(n, n1)
    mb, sb, xb = array('h'), array('h'), array('h')
    for i in range(n1 - n):
        ml, mr = mLch[i], mRch[i]
        sl, sr = sLch[i], sRch[i]
        mb.append(int(max(-1, min(1, ml)) * 32767))
        mb.append(int(max(-1, min(1, mr)) * 32767))
        sb.append(int(max(-1, min(1, sl)) * 32767))
        sb.append(int(max(-1, min(1, sr)) * 32767))
        xb.append(int(max(-1, min(1, soft(ml + sl))) * 32767))
        xb.append(int(max(-1, min(1, soft(mr + sr))) * 32767))
    mL.writeframes(mb.tobytes())
    sL.writeframes(sb.tobytes())
    mx.writeframes(xb.tobytes())
    n = n1
for w in (mL, sL, mx):
    w.close()
print('audio →', OUT)
