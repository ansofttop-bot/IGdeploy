import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type UseVoiceInputOptions = {
  value: string;
  onChange: (next: string) => void;
  locale: string;
  t: (key: string) => string;
  onBeforeStart?: () => boolean;
};

function joinText(base: string, addition: string): string {
  const cleanAdd = addition.trim();
  if (!cleanAdd) return base;
  const trimmedBase = base.trimEnd();
  if (!trimmedBase) return cleanAdd;
  return `${trimmedBase} ${cleanAdd}`;
}

function pickSupportedRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore unsupported check errors
    }
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const b64 = result.includes(",") ? result.split(",").pop() || "" : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read audio"));
    reader.readAsDataURL(blob);
  });
}

const MAX_RECORDING_MS = 60_000;

export function useVoiceInput({
  value,
  onChange,
  locale,
  t,
  onBeforeStart,
}: UseVoiceInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const valueRef = useRef(value);
  valueRef.current = value;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const localeRef = useRef(locale);
  localeRef.current = locale;

  const tRef = useRef(t);
  tRef.current = t;

  const onBeforeStartRef = useRef(onBeforeStart);
  onBeforeStartRef.current = onBeforeStart;

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const maxTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const modeRef = useRef<"speech" | "recorder" | null>(null);
  const manualStopRef = useRef(false);
  const baseTextRef = useRef("");
  const finalTextRef = useRef("");
  const interimTextRef = useRef("");
  const hasAnySpeechResultRef = useRef(false);

  const clearMaxTimer = useCallback(() => {
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const releaseMediaStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore track stop errors
      }
    }
  }, []);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    clearMaxTimer();

    if (modeRef.current === "speech" && recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      modeRef.current = null;
      // Commit any pending interim text cleanly so nothing spoken is lost on stop
      const committed = joinText(
        joinText(baseTextRef.current, finalTextRef.current),
        interimTextRef.current,
      );
      if (committed !== valueRef.current && (finalTextRef.current || interimTextRef.current)) {
        onChangeRef.current(committed);
      }
      try {
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {}
      }
      setIsRecording(false);
      return;
    }

    if (modeRef.current === "recorder" && recorderRef.current) {
      const recorder = recorderRef.current;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          releaseMediaStream();
          recorderRef.current = null;
          modeRef.current = null;
          setIsRecording(false);
        }
      } else {
        releaseMediaStream();
        recorderRef.current = null;
        modeRef.current = null;
        setIsRecording(false);
      }
      return;
    }

    releaseMediaStream();
    modeRef.current = null;
    setIsRecording(false);
  }, [clearMaxTimer, releaseMediaStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearMaxTimer();
      try {
        recognitionRef.current?.abort();
      } catch {}
      recognitionRef.current = null;
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.ondataavailable = null;
          recorderRef.current.onstop = null;
          recorderRef.current.stop();
        }
      } catch {}
      recorderRef.current = null;
      releaseMediaStream();
    };
  }, [clearMaxTimer, releaseMediaStream]);

  const startRecorderFallback = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error(tRef.current("Voice input is not supported in this browser"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      baseTextRef.current = valueRef.current;

      const preferredMime = pickSupportedRecorderMime();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      modeRef.current = "recorder";
      manualStopRef.current = false;

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onerror = () => {
        clearMaxTimer();
        releaseMediaStream();
        recorderRef.current = null;
        modeRef.current = null;
        if (mountedRef.current) {
          setIsRecording(false);
          toast.error(tRef.current("Voice transcription failed"));
        }
      };

      recorder.onstop = () => {
        clearMaxTimer();
        const recordedMime = recorder.mimeType || preferredMime || "audio/webm";
        const chunks = chunksRef.current;
        chunksRef.current = [];
        recorderRef.current = null;
        modeRef.current = null;
        releaseMediaStream();

        if (!mountedRef.current) return;
        setIsRecording(false);

        const blob = new Blob(chunks, { type: recordedMime });
        if (blob.size < 250) {
          toast.error(tRef.current("No speech detected"));
          return;
        }

        setIsTranscribing(true);
        void (async () => {
          try {
            const audioBase64 = await blobToBase64(blob);
            const res = await fetch("/api/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audioBase64,
                mimeType: recordedMime,
                lang: localeRef.current,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
            if (!mountedRef.current) return;
            if (!res.ok) {
              toast.error(data.error || tRef.current("Voice transcription failed"));
              return;
            }
            const transcript = (data.text || "").trim();
            if (!transcript) {
              toast.error(tRef.current("No speech detected"));
              return;
            }
            onChangeRef.current(joinText(valueRef.current, transcript));
          } catch {
            if (mountedRef.current) {
              toast.error(tRef.current("Voice transcription failed"));
            }
          } finally {
            if (mountedRef.current) {
              setIsTranscribing(false);
            }
          }
        })();
      };

      recorder.start(250);
      setIsRecording(true);
      maxTimerRef.current = window.setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (err: any) {
      releaseMediaStream();
      modeRef.current = null;
      if (mountedRef.current) {
        setIsRecording(false);
        const name = String(err?.name || "");
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          toast.error(tRef.current("Microphone permission denied"));
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          toast.error(tRef.current("Microphone not found"));
        } else {
          toast.error(tRef.current("Voice input is not supported in this browser"));
        }
      }
    }
  }, [clearMaxTimer, releaseMediaStream]);

  const start = useCallback(() => {
    if (isTranscribing) return;
    if (onBeforeStartRef.current && !onBeforeStartRef.current()) return;

    const SpeechRecCtor: (new () => SpeechRecognitionLike) | undefined =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
        : undefined;

    if (!SpeechRecCtor) {
      void startRecorderFallback();
      return;
    }

    try {
      const rec = new SpeechRecCtor();
      rec.lang = localeRef.current || "ru-RU";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      baseTextRef.current = valueRef.current;
      finalTextRef.current = "";
      interimTextRef.current = "";
      hasAnySpeechResultRef.current = false;
      manualStopRef.current = false;
      recognitionRef.current = rec;
      modeRef.current = "speech";

      let fellBackToRecorder = false;

      rec.onstart = () => {
        if (!mountedRef.current) return;
        setIsRecording(true);
      };

      rec.onresult = (ev: any) => {
        if (!mountedRef.current || recognitionRef.current !== rec) return;
        hasAnySpeechResultRef.current = true;
        let finalJoined = "";
        let interimJoined = "";
        for (let i = 0; i < ev.results.length; i++) {
          const result = ev.results[i];
          const transcript = result?.[0]?.transcript ?? "";
          if (!transcript) continue;
          if (result.isFinal) {
            finalJoined = joinText(finalJoined, transcript);
          } else {
            interimJoined = joinText(interimJoined, transcript);
          }
        }
        finalTextRef.current = finalJoined;
        interimTextRef.current = interimJoined;
        const combined = joinText(joinText(baseTextRef.current, finalJoined), interimJoined);
        onChangeRef.current(combined);
      };

      rec.onerror = (ev: any) => {
        if (!mountedRef.current || recognitionRef.current !== rec) return;
        const code = String(ev?.error || "");

        // Seamless fallback to MediaRecorder + /api/transcribe when Web Speech service fails
        if (
          !hasAnySpeechResultRef.current &&
          (code === "network" ||
            code === "service-not-allowed" ||
            code === "language-not-supported" ||
            code === "aborted")
        ) {
          fellBackToRecorder = true;
          recognitionRef.current = null;
          modeRef.current = null;
          try {
            rec.abort();
          } catch {}
          setIsRecording(false);
          void startRecorderFallback();
          return;
        }

        recognitionRef.current = null;
        modeRef.current = null;
        setIsRecording(false);

        if (code === "not-allowed") {
          toast.error(tRef.current("Microphone permission denied"));
        } else if (code === "audio-capture") {
          toast.error(tRef.current("Microphone not found"));
        } else if (code === "no-speech") {
          toast.error(tRef.current("No speech detected"));
        } else if (code && code !== "aborted") {
          toast.error(tRef.current("Voice transcription failed"));
        }
      };

      rec.onend = () => {
        if (fellBackToRecorder) return;
        if (recognitionRef.current === rec) {
          recognitionRef.current = null;
          modeRef.current = null;
        }
        if (mountedRef.current) {
          if (!manualStopRef.current && interimTextRef.current) {
            const committed = joinText(
              joinText(baseTextRef.current, finalTextRef.current),
              interimTextRef.current,
            );
            onChangeRef.current(committed);
          }
          setIsRecording(false);
        }
      };

      rec.start();
      setIsRecording(true);
    } catch {
      recognitionRef.current = null;
      modeRef.current = null;
      setIsRecording(false);
      void startRecorderFallback();
    }
  }, [isTranscribing, startRecorderFallback]);

  const toggle = useCallback(() => {
    if (isRecording) {
      stop();
    } else {
      start();
    }
  }, [isRecording, start, stop]);

  return {
    isRecording,
    isTranscribing,
    toggle,
    stop,
  };
}
