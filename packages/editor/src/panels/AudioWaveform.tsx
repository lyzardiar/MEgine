import { useEffect, useMemo, useState } from 'react';
import {
  audioWaveformRevision,
  loadAudioWaveform,
  sampleAudioWaveform,
  subscribeAudioWaveforms,
  type AudioWaveformData,
} from '../audioWaveform';

export function AudioWaveform(props: {
  path: string;
  clipIn: number;
  pitch: number;
  duration: number;
  looped: boolean;
}) {
  const [waveform, setWaveform] = useState<AudioWaveformData | null>(null);
  const [revision, setRevision] = useState(audioWaveformRevision);

  useEffect(() => subscribeAudioWaveforms(() => setRevision(audioWaveformRevision())), []);
  useEffect(() => {
    let cancelled = false;
    setWaveform(null);
    if (!props.path) return () => { cancelled = true; };
    void loadAudioWaveform(props.path)
      .then((loaded) => {
        if (!cancelled) setWaveform(loaded);
      })
      .catch(() => {
        if (!cancelled) setWaveform(null);
      });
    return () => { cancelled = true; };
  }, [props.path, revision]);

  const path = useMemo(() => {
    if (!waveform) return '';
    return sampleAudioWaveform(
      waveform,
      props.clipIn,
      props.pitch,
      props.duration,
      props.looped,
    ).map((peak, index, samples) => {
      const x = (index + 0.5) / samples.length * 100;
      const top = 12 - Math.max(-1, Math.min(1, peak.max)) * 10;
      const bottom = 12 - Math.max(-1, Math.min(1, peak.min)) * 10;
      return `M${x.toFixed(3)} ${top.toFixed(3)}V${bottom.toFixed(3)}`;
    }).join('');
  }, [props.clipIn, props.duration, props.looped, props.pitch, waveform]);

  if (!path) return null;
  return (
    <svg className="sequencer-audio-waveform" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
