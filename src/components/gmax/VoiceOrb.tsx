import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { searchCatalog } from "@/lib/gmax/search";
import { useLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";

type Phase = "idle" | "listening" | "thinking" | "done";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechResultEvent = {
  results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
};

function getRecognition(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[.,!?।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip wake / filler words from a command. */
function cleanCommand(raw: string) {
  let t = normalize(raw);
  t = t
    .replace(
      /^(hey |hi |hello |ok |okay )?(gmax|gemini|google|siri)\s*/i,
      "",
    )
    .replace(/^(please|pls)\s+/i, "")
    .trim();
  return t;
}

export function VoiceOrb() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("Tap the orb, then speak");
  const recRef = useRef<SpeechRec | null>(null);
  const activeRef = useRef(false);

  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const playTrack = usePlayer((s) => s.playTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const current = usePlayer((s) => s.current);

  const stopListening = useCallback(() => {
    activeRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    try {
      recRef.current?.abort();
    } catch {
      /* */
    }
  }, []);

  const runCommand = useCallback(
    async (transcript: string) => {
      const t = cleanCommand(transcript);
      setHeard(transcript);
      setPhase("thinking");
      setReply("…");

      // Pause / stop
      if (
        /\b(pause|stop|band karo|band|ruk|ruk jao|pause karo|stop karo)\b/i.test(
          t,
        )
      ) {
        if (isPlaying) toggle();
        setReply("Paused");
        setPhase("done");
        return;
      }

      // Resume / play current
      if (
        /\b(resume|continue|chaloo?|chalao|play karo)\b/i.test(t) &&
        !/\b(song|gana|playlist|track)\b/i.test(t) &&
        current
      ) {
        if (!isPlaying) toggle();
        setReply("Playing");
        setPhase("done");
        return;
      }

      // Next
      if (
        /\b(next|skip|aage|agla|next song|agla gana|agli)\b/i.test(t)
      ) {
        next();
        setReply("Next track");
        setPhase("done");
        return;
      }

      // Previous
      if (/\b(previous|back|peeche|pichla|last song)\b/i.test(t)) {
        previous();
        setReply("Previous track");
        setPhase("done");
        return;
      }

      // Play playlist by name
      const plMatch = t.match(
        /(?:playlist|play list)\s+(?:named\s+|bolke\s+)?(.+)$/i,
      ) || t.match(/(?:meri|my)\s+playlist\s+(.+)$/i);
      if (plMatch?.[1] || /\bplaylist\b/i.test(t)) {
        const nameQ = normalize(plMatch?.[1] || t.replace(/.*playlist\s*/i, ""));
        const lists = useLibrary.getState().playlists;
        const hit =
          lists.find((p) => normalize(p.name) === nameQ) ||
          lists.find((p) => normalize(p.name).includes(nameQ) && nameQ.length > 1) ||
          (nameQ.length < 2 && lists[0]) ||
          null;
        if (hit?.tracks?.length) {
          await playTrack(hit.tracks[0]!, {
            tracks: hit.tracks,
            label: hit.name,
          });
          setReply(`Playing playlist ${hit.name}`);
          setPhase("done");
          return;
        }
        if (/\bplaylist\b/i.test(t) && !nameQ) {
          setReply("Say: playlist and the name");
          setPhase("done");
          return;
        }
      }

      // Play liked / favorites
      if (/\b(liked|likes|favorites|favourite|pasand)\b/i.test(t)) {
        const liked = useLibrary.getState().liked;
        if (liked.length) {
          await playTrack(liked[0]!, { tracks: liked, label: "Liked" });
          setReply("Playing liked songs");
          setPhase("done");
          return;
        }
      }

      // Play song by name — strip leading verbs
      let songQ = t
        .replace(
          /^(play|chalao|chaloo|bajao|baja|sunao|put on|gaana|gana|song)\s+/i,
          "",
        )
        .replace(/\s+(chalao|chaloo|bajao|play|song|gana)$/i, "")
        .trim();

      if (!songQ || songQ.length < 2) {
        setReply("Say a song name, or pause / next");
        setPhase("done");
        return;
      }

      try {
        const results = await searchCatalog(songQ, { limit: 8 });
        const track = results.tracks[0];
        if (!track) {
          setReply(`No results for “${songQ}”`);
          setPhase("done");
          return;
        }
        await playTrack(track, {
          tracks: results.tracks,
          label: "Voice",
        });
        setReply(`Playing ${track.title}`);
        setPhase("done");
      } catch {
        setReply("Search failed. Try again.");
        setPhase("done");
      }
    },
    [current, isPlaying, next, playTrack, previous, toggle],
  );

  const startListening = useCallback(() => {
    const rec = getRecognition();
    if (!rec) {
      setReply("Voice not supported in this browser");
      setPhase("done");
      return;
    }
    stopListening();
    recRef.current = rec;
    rec.lang = "en-IN"; // works for Hindi-English mix on many devices
    rec.continuous = false;
    rec.interimResults = true;
    activeRef.current = true;
    setPhase("listening");
    setHeard("");
    setReply("Listening…");

    rec.onresult = (ev) => {
      let interim = "";
      let finalTxt = "";
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i];
        const piece = row?.[0]?.transcript || "";
        if (row?.isFinal) finalTxt += piece + " ";
        else interim += piece;
      }
      const shown = (finalTxt || interim).trim();
      if (shown) setHeard(shown);
      if (finalTxt.trim()) {
        activeRef.current = false;
        void runCommand(finalTxt.trim());
      }
    };

    rec.onerror = (ev) => {
      activeRef.current = false;
      const err = ev.error || "error";
      if (err === "not-allowed") setReply("Mic permission denied");
      else if (err === "no-speech") setReply("Didn't catch that");
      else setReply("Mic error");
      setPhase("done");
    };

    rec.onend = () => {
      if (activeRef.current) {
        // Auto-restart once if still expecting speech
        try {
          rec.start();
        } catch {
          activeRef.current = false;
          setPhase((p) => (p === "listening" ? "done" : p));
        }
      }
    };

    try {
      rec.start();
    } catch {
      setReply("Could not start mic");
      setPhase("done");
    }
  }, [runCommand, stopListening]);

  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  const onOrbTap = () => {
    if (!open) {
      setOpen(true);
      startListening();
      return;
    }
    if (phase === "listening") {
      stopListening();
      setPhase("idle");
      setReply("Stopped");
      return;
    }
    startListening();
  };

  return (
    <>
      {/* Panel when active */}
      {open ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-[150px] z-[70] flex justify-end sm:bottom-[140px]">
          <div className="pointer-events-auto max-w-[min(100%,280px)] rounded-2xl border border-white/10 bg-black/80 px-3 py-2.5 shadow-xl backdrop-blur-md">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-sky-300">
                GMAX Voice
              </span>
              <button
                type="button"
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-white/10"
                onClick={() => {
                  stopListening();
                  setOpen(false);
                  setPhase("idle");
                }}
                aria-label="Close voice"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-[12px] text-fg/90">{reply}</p>
            {heard ? (
              <p className="mt-1 text-[11px] text-muted">“{heard}”</p>
            ) : null}
            <p className="mt-1.5 text-[10px] text-muted/80">
              Try: “play Sidhu song” · “next” · “pause” · “playlist Workout”
            </p>
          </div>
        </div>
      ) : null}

      {/* Gemini-style orb — bottom right above tab bar */}
      <button
        type="button"
        onClick={onOrbTap}
        aria-label="Voice control"
        className="absolute bottom-[88px] right-3 z-[70] grid size-[56px] place-items-center rounded-full shadow-[0_8px_28px_rgba(56,189,248,0.35)] transition-transform active:scale-95 sm:bottom-[84px]"
        style={{
          background:
            phase === "listening"
              ? "radial-gradient(circle at 30% 30%, #7dd3fc, #2563eb 55%, #1e3a8a)"
              : "radial-gradient(circle at 30% 30%, #38bdf8, #3b82f6 50%, #1d4ed8)",
          boxShadow:
            phase === "listening"
              ? "0 0 0 6px rgba(56,189,248,0.25), 0 8px 28px rgba(37,99,235,0.45)"
              : "0 8px 28px rgba(37,99,235,0.4)",
        }}
      >
        {phase === "listening" ? (
          <span className="relative grid size-full place-items-center">
            <span className="absolute size-10 animate-ping rounded-full bg-sky-300/30" />
            <Mic size={26} className="relative text-white" />
          </span>
        ) : phase === "thinking" ? (
          <span className="size-6 animate-pulse rounded-full bg-white/80" />
        ) : open ? (
          <MicOff size={24} className="text-white/90" />
        ) : (
          <Mic size={26} className="text-white" />
        )}
      </button>
    </>
  );
}
