import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SoundRecord } from '../../assets/store';
import { audioContext, playRecorded, unlockAudio } from '../../audio/audio';
import {
  MAX_SOUND_MS,
  WAV_PREFIX,
  base64ToBytes,
  decodeWav,
  peaks,
  soundName,
  toWavDataUrl,
} from '../../audio/wav';

interface Props {
  initial: SoundRecord | null;
  /** Names of the other sounds (must stay unique). */
  takenNames: string[];
  author: string;
  onSave: (sound: SoundRecord) => void;
  onDelete?: (() => void) | undefined;
}

interface Clip {
  samples: Float32Array;
  sampleRate: number;
}

const BARS = 64;

/** Id and timestamp of a saved recording (called from event handlers only). */
function stamp(existingId: string | undefined): { id: string; createdAt: number } {
  const now = Date.now();
  return { id: existingId ?? `snd.${now.toString(36)}`, createdAt: now };
}

function fromRecord(sound: SoundRecord): Clip | null {
  if (!sound.dataUrl.startsWith(WAV_PREFIX)) return null;
  const { samples, sampleRate } = decodeWav(base64ToBytes(sound.dataUrl.slice(WAV_PREFIX.length)));
  return { samples, sampleRate };
}

function mono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++)
      out[i] = (out[i] ?? 0) + (data[i] ?? 0) / buffer.numberOfChannels;
  }
  return out;
}

/** Sound dialog (SPEC 8.2): record up to 3 s, trim start and end, set volume and name. */
export function SoundEditor({ initial, takenNames, author, onSave, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const sec = (ms: number) =>
    (ms / 1000).toLocaleString(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const [clip, setClip] = useState<Clip | null>(() => (initial ? fromRecord(initial) : null));
  const durationMs = clip ? (clip.samples.length / clip.sampleRate) * 1000 : 0;
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(() => durationMs);
  const [gain, setGain] = useState(1);
  const [name, setName] = useState(initial?.name ?? t('workshop.sound.defaultName'));
  const [recording, setRecording] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  // Stop the microphone when the editor closes.
  useEffect(
    () => () => {
      const r = recorder.current;
      if (r && r.state !== 'inactive') r.stop();
    },
    [],
  );

  const bars = useMemo(() => (clip ? peaks(clip.samples, BARS) : []), [clip]);
  const clean = soundName(name);
  const taken = takenNames.includes(clean) && clean !== initial?.name;
  const valid = !!clip && clean.length > 0 && !taken && end - start >= 50;

  const record = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) return setError('workshop.sound.noMic');
    if (typeof MediaRecorder === 'undefined') return setError('workshop.sound.noRecorder');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError('workshop.sound.noMic');
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const started = Date.now();
    const timer = setInterval(() => setRecording(Date.now() - started), 100);
    rec.onstop = async () => {
      clearInterval(timer);
      stream.getTracks().forEach((tr) => tr.stop());
      setRecording(null);
      const ctx = audioContext();
      try {
        if (!ctx) throw new Error('no audio');
        const buffer = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
        const samples = mono(buffer).slice(
          0,
          Math.floor((MAX_SOUND_MS / 1000) * buffer.sampleRate),
        );
        setClip({ samples, sampleRate: buffer.sampleRate });
        setStart(0);
        setEnd((samples.length / buffer.sampleRate) * 1000);
        setSaved(false);
      } catch {
        setError('workshop.sound.decodeFailed');
      }
    };
    recorder.current = rec;
    rec.start();
    setRecording(0);
    setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, MAX_SOUND_MS);
  };

  const stop = () => {
    const r = recorder.current;
    if (r && r.state !== 'inactive') r.stop();
  };

  const dataUrl = () => (clip ? toWavDataUrl(clip.samples, clip.sampleRate, start, end, gain) : '');

  const play = () => {
    if (!clip) return;
    unlockAudio();
    playRecorded(`preview:${Date.now()}`, dataUrl());
  };

  const save = () => {
    if (!valid) return;
    onSave({
      ...stamp(initial?.id),
      name: clean,
      dataUrl: dataUrl(),
      durationMs: Math.round(end - start),
      author: initial?.author ?? author,
    });
    setSaved(true);
  };

  const pct = (ms: number) => (durationMs > 0 ? (ms / durationMs) * 100 : 0);
  return (
    <div className="sound-editor">
      <div className="sound-record">
        {recording === null ? (
          <button
            type="button"
            className="mic-btn"
            aria-label={t('workshop.sound.record')}
            onClick={() => void record()}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path
                d="M5 11a7 7 0 0 0 14 0M12 18v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : (
          <button type="button" className="mic-btn recording" onClick={stop}>
            {t('workshop.sound.stop')}
          </button>
        )}
        <div className="sound-wave-wrap">
          <svg
            className="sound-wave"
            viewBox={`0 0 ${BARS * 6} 60`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t('workshop.sound.waveform')}
          >
            {clip && (
              <>
                <rect
                  x={0}
                  y={0}
                  width={(pct(start) / 100) * BARS * 6}
                  height={60}
                  className="wave-cut"
                />
                <rect
                  x={(pct(end) / 100) * BARS * 6}
                  y={0}
                  width={BARS * 6 - (pct(end) / 100) * BARS * 6}
                  height={60}
                  className="wave-cut"
                />
              </>
            )}
            {bars.map((p, i) => {
              const h = Math.max(2, p * 56);
              return <rect key={i} x={i * 6 + 1} y={30 - h / 2} width={4} height={h} rx={2} />;
            })}
          </svg>
          <p className="hint">
            {recording !== null
              ? t('workshop.sound.recording', { seconds: sec(recording) })
              : clip
                ? t('workshop.sound.length', { length: sec(end - start) })
                : t('workshop.sound.hint')}
          </p>
        </div>
      </div>
      {error && <p className="form-error">{t(error)}</p>}
      {clip && (
        <div className="sound-controls">
          <label>
            <span className="label">{t('workshop.sound.start')}</span>
            <input
              type="range"
              min={0}
              max={durationMs}
              step={10}
              value={start}
              onChange={(e) => setStart(Math.min(Number(e.target.value), end - 50))}
            />
          </label>
          <label>
            <span className="label">{t('workshop.sound.end')}</span>
            <input
              type="range"
              min={0}
              max={durationMs}
              step={10}
              value={end}
              onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 50))}
            />
          </label>
          <label>
            <span className="label">
              {t('workshop.sound.volume')} {Math.round(gain * 100)} %
            </span>
            <input
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={gain}
              onChange={(e) => setGain(Number(e.target.value))}
            />
          </label>
        </div>
      )}
      <label>
        <span className="label">{t('workshop.sound.name')}</span>
        <input
          className="input input-small"
          value={name}
          maxLength={30}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      {taken && <p className="form-error">{t('workshop.sound.nameTaken')}</p>}
      {clean.length === 0 && <p className="form-error">{t('workshop.sound.nameMissing')}</p>}
      {clean && <code className="hint">{t('workshop.sound.usage', { name: clean })}</code>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-soft" disabled={!clip} onClick={play}>
          {t('workshop.sound.play')}
        </button>
        {onDelete && (
          <button type="button" className="btn btn-soft" onClick={onDelete}>
            {t('workshop.sound.delete')}
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={save}>
          {saved ? t('workshop.sound.saved') : t('workshop.sound.save')}
        </button>
      </div>
    </div>
  );
}
