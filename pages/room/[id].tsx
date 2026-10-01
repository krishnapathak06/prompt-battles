"use client";

import { useRouter } from "next/router";
import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Copy, Check, ClipboardCheck, Settings2, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

/* ---------------- UTILS ---------------- */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const noiseBg = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

/* ---------------- TYPES ---------------- */
type Player = {
  user_id: string;
  is_host?: boolean;
  is_ready?: boolean;
  users?: { name: string; elo?: number } | { name: string; elo?: number }[] | null;
  battle_scores?: { total_score: number } | { total_score: number }[] | null;
};

type PromptResult = {
  id: string;
  prompt_text: string;
  scores?: number;
  justification?: string;
  user_id: string;
  users?: { name: string } | null;
};

type BattlePhase = "waiting" | "submission" | "results" | "finished";

/* ---------------- COMPONENT ---------------- */

export default function RoomPage() {
  const router = useRouter();
  const { id } = router.query;
  const roomId = typeof id === "string" ? id : null;

  /* --- STATE --- */
  const [isRestoring, setIsRestoring] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [battlePhase, setBattlePhase] = useState<BattlePhase>("waiting");

  const [timeLeft, setTimeLeft] = useState(60);
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<PromptResult[]>([]);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);

  const [battleId, setBattleId] = useState<string | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [totalRounds, setTotalRounds] = useState<number>(3);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHostPopup, setShowHostPopup] = useState(false);

  // ELO State
  const [eloChange, setEloChange] = useState<number | null>(null);
  const [isRankedGame, setIsRankedGame] = useState(false);

  const [timerRoundId, setTimerRoundId] = useState<string | null>(null);
  const [nextRoundTimer, setNextRoundTimer] = useState<number | null>(null);

  const promptTextRef = useRef(promptText);
  const hasScoredRound = useRef<string | null>(null);
  useEffect(() => {
    promptTextRef.current = promptText;
  }, [promptText]);

  /* ---------------- AUTH ---------------- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  /* ---------------- HYDRATION ---------------- */
  useEffect(() => {
    if (!roomId || !userId) return;

    const hydrateState = async () => {
      setIsRestoring(true);

      try {
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("total_rounds")
          .eq("id", roomId)
          .single();

        if (roomError) throw roomError;

        const { data: allBattles } = await supabase
          .from("battles")
          .select("*")
          .eq("room_id", roomId);

        let latestBattle = allBattles?.find(b => b.status === 'active');
        if (!latestBattle) latestBattle = allBattles?.find(b => b.status === 'finished');
        if (!latestBattle && allBattles && allBattles.length > 0) latestBattle = allBattles[0];

        if (!latestBattle || latestBattle.status === 'waiting') {
          setTotalRounds(roomData.total_rounds);
          setBattlePhase("waiting");
          setIsRestoring(false);
          return;
        }

        setBattleId(latestBattle.id);
        setRoundNumber(latestBattle.current_round);
        setTotalRounds(latestBattle.total_rounds || roomData.total_rounds);

        if (latestBattle.status === 'finished') {
          setBattlePhase("finished");
          setIsRestoring(false);
          return;
        }

        if (latestBattle.status === 'active') {
          const { data: roundData, error: roundError } = await supabase
            .from("rounds")
            .select("*")
            .eq("battle_id", latestBattle.id)
            .eq("round_number", latestBattle.current_round)
            .maybeSingle();

          if (roundError || !roundData) {
            setIsRestoring(false);
            return;
          }

          setCurrentRoundId(roundData.id);
          setActiveRoundId(roundData.id);

          if (roundData.image_id) {
            const { data: imageData } = await supabase
              .from("images")
              .select("url")
              .eq("id", roundData.image_id)
              .maybeSingle();

            if (imageData) setImageURL(imageData.url);
          }

          let calculatedTimeLeft = 60;
          const startTime = roundData.started_at || roundData.created_at;

          if (startTime) {
            const roundStartTime = new Date(startTime).getTime();
            const now = Date.now();
            const elapsed = Math.floor((now - roundStartTime) / 1000);
            calculatedTimeLeft = Math.max(0, 60 - elapsed);
          }

          setTimeLeft(calculatedTimeLeft);

          const { data: userPrompt } = await supabase
            .from("prompts")
            .select("prompt_text")
            .eq("round_id", roundData.id)
            .eq("user_id", userId)
            .maybeSingle();

          if (userPrompt) {
            setPromptText(userPrompt.prompt_text);
            setSubmitted(true);
          }

          if (calculatedTimeLeft === 0) {
            const { count } = await supabase
              .from("prompts")
              .select("*", { count: 'exact', head: true })
              .eq("round_id", roundData.id)
              .not("scores", "is", null);

            if (count && count > 0) {
              setBattlePhase("results");
              const { data: resultData } = await supabase
                .from("prompts")
                .select(`id, prompt_text, scores, justification, user_id, users(name)`)
                .eq("round_id", roundData.id)
                .order("scores", { ascending: false });
              setResults((resultData as unknown as PromptResult[]) || []);
            } else {
              setBattlePhase("submission");
              setLoadingEval(true);
            }
          } else {
            setBattlePhase("submission");
            setLoadingEval(false);
          }
        }

      } catch (e) {
        console.error("Hydration Error:", e);
        setBattlePhase("waiting");
      } finally {
        setIsRestoring(false);
      }
    };

    hydrateState();
  }, [roomId, userId]);

  /* ---------------- DATA FETCHING ---------------- */
  /* ---------------- DATA FETCHING ---------------- */
  const loadPlayers = useCallback(async () => {
    if (!roomId || !userId) return;

    // We fetch players normally
    const { data: playersData, error } = await supabase
      .from("room_players")
      .select(`user_id, is_host, is_ready, users(name, elo)`)
      .eq("room_id", roomId);

    if (error || !playersData) {
      console.error("Error loading players:", error);
      return;
    }

    // Then we fetch scores for the CURRENT battle if one exists
    let scoresMap: Record<string, { score: number, rank: number }> = {};
    if (battleId) {
      const { data: scoresData } = await supabase
        .from("battle_scores")
        .select("user_id, total_score, rank")
        .eq("battle_id", battleId);

      if (scoresData) {
        scoresData.forEach(s => {
          scoresMap[s.user_id] = { score: s.total_score, rank: s.rank };
        });
      }
    }

    // Merge and Sort by score descending
    const mergedPlayers = playersData.map(p => ({
      ...p,
      battle_scores: scoresMap[p.user_id] ? { total_score: scoresMap[p.user_id].score, rank: scoresMap[p.user_id].rank } : { total_score: 0, rank: 0 }
    })).sort((a, b) => (scoresMap[b.user_id]?.score || 0) - (scoresMap[a.user_id]?.score || 0));

    setPlayers((mergedPlayers as unknown as Player[]) || []);
  }, [roomId, userId, battleId]);

  /* ---------------- HANDLERS ---------------- */

  const getPlayerScore = (p: Player) => {
    if (!p.battle_scores) return 0;
    if (Array.isArray(p.battle_scores)) {
      return p.battle_scores[0]?.total_score || 0;
    }
    return (p.battle_scores as { total_score: number }).total_score || 0;
  };

  const getPlayerElo = (p: Player) => {
    if (!p.users) return 1200;
    if (Array.isArray(p.users)) {
      return p.users[0]?.elo || 1200;
    }
    return (p.users as { elo?: number }).elo || 1200;
  };

  const getPlayerName = (p: Player) => {
    if (!p.users) return "Anonymous";
    if (Array.isArray(p.users)) {
      return p.users[0]?.name || "Anonymous";
    }
    return (p.users as { name: string }).name || "Anonymous";
  };

  const me = players.find((p) => p.user_id === userId);
  const isHost = me?.is_host === true;
  const isReady = me?.is_ready === true;
  const allPlayersReady = players.length === 1
    ? true
    : players.filter(p => !p.is_host).every(p => p.is_ready);

  const myResult = results.find((r) => r.user_id === userId);

  const handleCopy = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUpdateRounds = async (rounds: number) => {
    if (!isHost || !roomId) return;
    setTotalRounds(rounds);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/room/update-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ room_id: roomId, total_rounds: rounds }),
    });
  };

  const handleStart = async () => {
    try {
      setIsStarting(true);
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/battle/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ room_id: roomId, user_id: userId, total_rounds: totalRounds }),
      });
    } catch (error) {
      console.error(error);
      setIsStarting(false);
    }
  };

  const handleReady = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/room/ready", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ room_id: roomId, user_id: userId, is_ready: !isReady }),
    });
  };

  const triggerScoring = useCallback(() => {
    if (!isHost) return;
    if (hasScoredRound.current === currentRoundId) return;
    hasScoredRound.current = currentRoundId;

    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/battle/score-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ room_id: roomId, round_id: currentRoundId, image_url: imageURL, battle_id: battleId }),
      }).catch(() => setLoadingEval(false));
    });
  }, [roomId, currentRoundId, imageURL, isHost]);

  const handleSubmit = async () => {
    setSubmitted(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/battle/submit-prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({
        room_id: roomId,
        battle_id: battleId,
        round_id: currentRoundId,
        user_id: userId,
        prompt_text: promptText
      }),
    });
  };

  const handleAutoSubmit = useCallback(async () => {
    setSubmitted(true);
    const finalPrompt = promptTextRef.current;

    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/battle/submit-prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({
        room_id: roomId,
        battle_id: battleId,
        round_id: currentRoundId,
        user_id: userId,
        prompt_text: finalPrompt || ""
      }),
    });

    triggerScoring();
  }, [roomId, currentRoundId, userId, triggerScoring, battleId]);

  const handleNextRound = useCallback(() => {
    setIsTransitioning(true);
    setResults([]); setPromptText(""); setSubmitted(false); setTimeLeft(0); setImageURL(null);

    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/battle/advance-round", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          room_id: roomId,
          battle_id: battleId,
          user_id: userId
        }),
      }).catch(() => setIsTransitioning(false));
    });
  }, [roomId, userId, battleId]);

  /* ---------------- EFFECTS & REALTIME ---------------- */

  useEffect(() => {
    if (!roomId || !userId) return;
    loadPlayers();

    const playersChannel = supabase
      .channel(`room-players-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, () => loadPlayers())
      .subscribe();

    const scoresChannel = supabase
      .channel(`battle-scores-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_scores", filter: `battle_id=eq.${battleId}` }, () => {
        if (battleId) loadPlayers();
      })
      .subscribe();

    const settingsChannel = supabase
      .channel(`room-settings-${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new && payload.new.total_rounds) {
            setTotalRounds(payload.new.total_rounds);
          }
        }
      )
      .subscribe();

    const gameChannel = supabase
      .channel(`room-phase-${roomId}`)
      .on("broadcast", { event: "phase_update" }, (payload) => {
        setBattleId(payload.payload.battle_id);
        setTotalRounds(payload.payload.total_rounds);

        setIsStarting(false);
        setIsTransitioning(false);
        setBattlePhase("submission");
        setTimeLeft(payload.payload.time);
        setImageURL(payload.payload.image_url);

        setCurrentRoundId(payload.payload.round_id);
        setActiveRoundId(payload.payload.round_id);
        setResults([]);
        setPromptText("");
        setSubmitted(false);
        setNextRoundTimer(null);
        setTimerRoundId(null);
        setRoundNumber(payload.payload.round_number);
        setLoadingEval(false);
        setEloChange(null); // Reset delta on new round
      })

      .on("broadcast", { event: "results_ready" }, async (payload) => {
        setLoadingEval(false);
        if (activeRoundId && payload.payload.round_id !== activeRoundId) return;

        await loadPlayers();

        const { data } = await supabase
          .from("prompts")
          .select(`id, prompt_text, scores, justification, user_id, users(name)`)
          .eq("round_id", payload.payload.round_id)
          .order("scores", { ascending: false });

        setResults((data as unknown as PromptResult[]) || []);
        setBattlePhase("results");

        if (roundNumber && roundNumber < totalRounds) {
          if (timerRoundId !== payload.payload.round_id) {
            setTimerRoundId(payload.payload.round_id);
            setNextRoundTimer(15);
          }
        } else {
          setNextRoundTimer(null);
        }
      })
      .on("broadcast", { event: "game_finished" }, async () => {
        setIsTransitioning(false);
        await loadPlayers();
        setBattlePhase("finished");
        setNextRoundTimer(null);
        setTimerRoundId(null);
        setEloChange(null); // Reset before calc

        // =========================================================
        // ✅ ELO UPDATE, DELTA CALCULATION & SINGLE PLAYER CHECK
        // =========================================================

        // A. Fetch FINAL scores
        const { data: finalPlayers } = await supabase
          .from("room_players")
          .select(`user_id, users(elo), battle_scores(total_score)`)
          .eq("room_id", roomId);

        // B. Gatekeeper: Check for Single Player
        if (!finalPlayers || finalPlayers.length < 2) {
          console.log("Single player session detected. ELO update skipped.");
          setIsRankedGame(false);
          return;
        }

        setIsRankedGame(true);

        const myData = finalPlayers.find(p => p.user_id === userId);
        if (!myData) return;

        // C. Capture OLD ELO before update
        let oldElo = 1200;
        if (myData.users) {
          if (Array.isArray(myData.users)) oldElo = myData.users[0]?.elo || 1200;
          else oldElo = (myData.users as any).elo || 1200;
        }

        // D. Determine Rank
        const getScore = (p: any) => {
          const scores = p.battle_scores;
          if (Array.isArray(scores)) return scores[0]?.total_score || 0;
          return scores?.total_score || 0;
        };

        const sorted = [...finalPlayers].sort((a, b) => getScore(b) - getScore(a));
        const myRank = sorted.findIndex(p => p.user_id === userId); // 0 = 1st place

        // E. Determine Result
        const isWinner = myRank === 0;
        const result = isWinner ? 'win' : 'loss';

        const opponentIndex = isWinner ? 1 : 0;
        const opponent = sorted[opponentIndex];

        let opponentElo = 1200;
        if (opponent && opponent.users) {
          if (Array.isArray(opponent.users)) {
            opponentElo = opponent.users[0]?.elo || 1200;
          } else {
            opponentElo = (opponent.users as any).elo || 1200;
          }
        }

        // F. Calculate Avg Score
        const myTotalScore = getScore(myData);
        const avgScore = totalRounds > 0 ? (myTotalScore / totalRounds) : 0;

        // G. Trigger Update & Capture Result for UI
        const { data: newElo } = await supabase.rpc('update_elo', {
          p_user_id: userId,
          p_opponent_elo: opponentElo,
          p_result: result,
          p_ai_score: avgScore,
          p_wpm: 0,
          p_word_count: 0,
          p_streak: isWinner ? 1 : 0
        });

        // H. Update the UI state with the difference
        if (newElo !== null && newElo !== undefined) {
          setEloChange(newElo - oldElo);
        }
        // =========================================================

      })
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(gameChannel);
    };
  }, [roomId, userId, activeRoundId, roundNumber, totalRounds, loadPlayers, timerRoundId]);

  /* ---------------- TIMER LOGIC ---------------- */
  useEffect(() => {
    if (battlePhase !== "submission") return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setLoadingEval(true);
          if (!submitted) handleAutoSubmit();
          else if (isHost) triggerScoring();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [battlePhase, submitted, isHost, handleAutoSubmit, triggerScoring]);

  useEffect(() => {
    if (nextRoundTimer === null) return;
    if (nextRoundTimer === 0) {
      setNextRoundTimer(null);
      if (isHost) handleNextRound();
      else {
        setIsTransitioning(true);
        setResults([]); setPromptText(""); setSubmitted(false); setTimeLeft(0); setImageURL(null);
      }
      return;
    }
    const t = setTimeout(() => setNextRoundTimer((v) => (v ? v - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [nextRoundTimer, handleNextRound, isHost]);

  /* ---------------- UI RENDER ---------------- */

  if (isRestoring) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-orange-500/30 flex flex-col overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 mix-blend-overlay" style={{ backgroundImage: noiseBg }}></div>
      <div className="fixed top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-zinc-800/30 blur-[150px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-orange-900/10 blur-[150px] rounded-full pointer-events-none" />

      {/* --- HEADER --- */}
      <header className="relative z-50 h-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md flex items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-xs font-bold shadow-lg">B</div>
          <span className="font-medium tracking-tight text-zinc-400">Battle Room</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          {battlePhase !== "waiting" && roundNumber !== null && roundNumber > 0 && (
            <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-2 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-sm font-semibold tracking-wide text-zinc-200">
                ROUND {roundNumber} <span className="text-zinc-500">/ {totalRounds}</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          {battlePhase === "submission" && !isTransitioning && (
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Time Left</p>
                <p className={cn("text-xl font-mono font-bold leading-none", timeLeft < 10 ? "text-red-500" : "text-zinc-200")}>{timeLeft}s</p>
              </div>
              <div className="w-10 h-10 relative flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="20" cy="20" r="18" className="stroke-zinc-800" strokeWidth="3" fill="none" />
                  <circle cx="20" cy="20" r="18" className={cn("transition-all duration-1000", timeLeft < 10 ? "stroke-red-500" : "stroke-orange-500")} strokeWidth="3" fill="none" strokeDasharray="113" strokeDashoffset={113 - (113 * timeLeft) / 60} />
                </svg>
              </div>
            </div>
          )}
          <div className="h-8 w-[1px] bg-white/10 mx-2 hidden lg:block" />
          <div className="flex items-center -space-x-2">
            {players.slice(0, 3).map(p => (
              <div key={p.user_id} className="w-8 h-8 rounded-full border border-[#09090b] bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400">
                {getPlayerName(p)[0] || "?"}
              </div>
            ))}
            {players.length > 3 && <div className="w-8 h-8 rounded-full border border-[#09090b] bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400">+{players.length - 3}</div>}
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="relative z-10 flex-1 flex flex-col p-6 lg:p-8 max-w-[1800px] mx-auto w-full">

        {/* VIEW: WAITING ROOM */}
        {battlePhase === "waiting" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 animate-in fade-in zoom-in duration-500">
            <div className="text-center space-y-4">
              <h1 className="text-5xl lg:text-7xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-zinc-100 to-zinc-600">The Lobby</h1>
              <p className="text-zinc-400 text-lg">Waiting for the host to initialize the sequence.</p>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100">
              {isHost ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                    <Settings2 size={12} /> Match Length (Rounds)
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 bg-[#121214] border border-white/10 p-2 rounded-xl shadow-lg max-w-[320px]">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                      <button
                        key={num}
                        onClick={() => handleUpdateRounds(num)}
                        className={cn(
                          "w-9 h-9 rounded-lg text-sm font-bold transition-all border border-transparent",
                          totalRounds === num
                            ? "bg-zinc-700 text-white shadow-inner border-white/10 scale-105"
                            : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2 bg-[#121214] border border-white/10 rounded-full text-zinc-500 text-sm font-medium">
                  Match Length: <span className="text-orange-500 font-bold">{totalRounds} Rounds</span>
                </div>
              )}
            </div>

            <div className="relative group cursor-pointer animate-in zoom-in-50 fade-in duration-500 slide-in-from-bottom-2" onClick={handleCopy}>
              <div className="flex items-center gap-4 bg-[#121214] border border-white/10 rounded-full pl-6 pr-2 py-2 shadow-2xl hover:border-orange-500/50 hover:bg-white/5 transition-all">
                <div className="flex flex-col items-start">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Room Code</span>
                  <span className="font-mono text-xl tracking-widest text-white">{roomId}</span>
                </div>
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-all", copied ? "bg-green-500 text-black" : "bg-white/10 text-zinc-400 group-hover:bg-white/20 group-hover:text-white")}>
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </div>
              </div>
              {copied && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-green-500 font-mono animate-in fade-in slide-in-from-top-1 whitespace-nowrap">
                  Copied to clipboard!
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3 max-w-2xl mt-4">
              {players.map(p => (
                <div key={p.user_id} className={cn("px-4 py-2 rounded-lg border flex items-center gap-2 transition-all", p.is_ready ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-zinc-900 border-zinc-800 text-zinc-500")}>
                  <span className={cn("w-2 h-2 rounded-full", p.is_ready ? "bg-emerald-500" : "bg-zinc-600")} />
                  {getPlayerName(p) || "Anonymous"} {p.is_host && "👑"}
                </div>
              ))}
            </div>
            <div className="mt-8">
              {isHost ? (
                <Button
                  onClick={handleStart}
                  disabled={!allPlayersReady || isStarting}
                  className="h-14 px-8 text-lg rounded-full bg-zinc-100 text-black hover:bg-white hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                >
                  {isStarting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      Initiating...
                    </span>
                  ) : "Start Battle"}
                </Button>
              ) : (
                <Button
                  onClick={handleReady}
                  className={cn("h-14 px-8 text-lg rounded-full transition-all hover:scale-105", isReady ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20" : "bg-zinc-100 text-black hover:bg-white")}
                >
                  {isReady ? "Cancel Ready" : "I am Ready"}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* VIEW: BATTLE */}
        {battlePhase === "submission" && !isTransitioning && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 h-full items-stretch animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#121214] rounded-2xl border border-white/5 p-4 flex items-center justify-center relative overflow-hidden group shadow-2xl min-h-[50vh]">
              {imageURL ? <img src={imageURL} alt="Subject" className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg z-10" /> : <div className="animate-pulse text-zinc-700">Loading Image Data...</div>}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] opacity-50" />
            </div>
            <div className="flex flex-col gap-6 justify-center max-w-xl mx-auto w-full">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-zinc-100">Describe the Image</h2>
                <p className="text-zinc-500 text-sm">Be precise. The AI judge values detail and stylistic accuracy.</p>
              </div>
              <div className="relative">
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  disabled={submitted}
                  placeholder="Type your prompt here..."
                  className="w-full h-64 bg-[#121214] border border-white/10 rounded-xl p-6 text-lg text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-orange-500/50 resize-none transition-all shadow-inner font-light leading-relaxed"
                />
                {submitted && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] rounded-xl flex items-center justify-center border border-white/5">
                    <div className="bg-zinc-900 border border-zinc-700 px-4 py-2 rounded-full text-zinc-300 flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />Prompt Locked</div>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-600 font-mono">ID: {userId?.slice(0, 8)}</span>
                <Button onClick={handleSubmit} disabled={!promptText || submitted} className="h-12 px-8 rounded-lg bg-zinc-100 text-black font-medium hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitted ? "Waiting for timer..." : "Lock In Prompt ↵"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: RESULTS */}
        {battlePhase === "results" && !loadingEval && (
          <div className="flex-1 flex flex-col items-center justify-start gap-10 pt-10 animate-in slide-in-from-bottom-8 duration-700">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-2">Round Analysis</h2>
              <p className="text-zinc-500">Scores calculated by AI Judge</p>
            </div>
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Round Analysis</h3>
                {results.map((r, i) => (
                  <div key={r.id} className={cn("p-4 rounded-xl flex items-center gap-4 transition-all", i === 0 ? "bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20" : "bg-[#121214] border border-white/5")}>
                    <div className={cn("w-8 h-8 rounded flex items-center justify-center font-bold text-sm", i === 0 ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-500")}>{i + 1}</div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className={cn("font-medium", i === 0 ? "text-orange-200" : "text-zinc-300")}>{r.users?.name || "Anonymous"}</span>
                        <span className="font-mono font-bold text-emerald-400">+{r.scores}</span>
                      </div>
                      <div className="h-1 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
                        <div className={cn("h-full rounded-full", i === 0 ? "bg-orange-500" : "bg-zinc-600")} style={{ width: `${(r.scores || 0)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                <div className="bg-[#121214] border border-white/5 p-6 rounded-xl flex flex-col h-full">
                  <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Battle Standings</h3>
                  <div className="flex-1 space-y-3">
                    {players.slice(0, 5).map((p, i) => (
                      <div key={p.user_id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-zinc-600">#{i + 1}</span>
                          <span className="text-zinc-300 font-medium">{getPlayerName(p)}</span>
                        </div>
                        <span className="font-mono font-bold text-orange-500">{getPlayerScore(p)}</span>
                      </div>
                    ))}
                  </div>
                  {myResult && (
                    <div className="mt-6 pt-6 border-t border-white/5">
                      <h4 className="text-[10px] uppercase text-zinc-500 mb-2">Judge's Note for You</h4>
                      <p className="text-zinc-400 text-sm italic italic leading-relaxed pl-3 border-l-2 border-orange-500/30">"{myResult.justification}"</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {nextRoundTimer !== null && (
              <div className="fixed bottom-0 left-0 w-full h-1 bg-zinc-800">
                <motion.div initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 15, ease: "linear" }} className="h-full bg-orange-500" />
              </div>
            )}

            {roundNumber === totalRounds && nextRoundTimer === null && (
              <Button onClick={handleNextRound} className="mt-8 bg-zinc-100 text-black hover:bg-white hover:scale-105 transition-all h-12 px-8 rounded-full">Final Podium &rarr;</Button>
            )}
          </div>
        )}

        {/* VIEW: FINISHED */}
        {battlePhase === "finished" && (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[80vh] w-full animate-in fade-in duration-700">
            <div className="text-center mb-12 relative z-10">
              <h1 className="text-6xl lg:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 drop-shadow-sm tracking-tighter italic">VICTORY</h1>
              <p className="text-zinc-400 text-lg mt-2 font-light">The results are in.</p>

              {/* ✅ ELO NOTIFICATION POPUP ✅ */}
              <div className="mt-6 flex justify-center h-12">
                {!isRankedGame ? (
                  <div className="px-4 py-2 rounded-full bg-zinc-800/50 border border-zinc-700 text-zinc-500 text-sm font-bold flex items-center gap-2">
                    <Minus size={16} /> UNRANKED MATCH
                  </div>
                ) : eloChange !== null ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "px-6 py-2 rounded-full border-2 text-xl font-black flex items-center gap-3 shadow-2xl backdrop-blur-md",
                      eloChange > 0 ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" :
                        eloChange < 0 ? "bg-red-500/10 border-red-500 text-red-500" :
                          "bg-zinc-800/50 border-zinc-700 text-zinc-400"
                    )}
                  >
                    {eloChange > 0 ? <TrendingUp size={24} /> : eloChange < 0 ? <TrendingDown size={24} /> : <Minus size={24} />}
                    <span>{eloChange > 0 ? "+" : ""}{eloChange} ELO</span>
                  </motion.div>
                ) : null}
              </div>
              {/* --------------------------- */}

            </div>
            <div className="flex items-end justify-center gap-4 lg:gap-8 w-full max-w-4xl mb-12 px-4 h-[400px]">
              {players.length > 1 && (() => {
                const sorted = [...players].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
                const p2 = sorted[1];
                if (!p2) return null;
                return (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "60%", opacity: 1 }} transition={{ delay: 0.5, duration: 0.8, type: "spring" }} className="flex flex-col items-center justify-end w-1/3 max-w-[200px]">
                    <div className="mb-4 flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-full border-2 border-zinc-500 bg-zinc-800 flex items-center justify-center text-xl font-bold text-zinc-300 shadow-xl">
                        {getPlayerName(p2)[0] || "?"}
                      </div>
                      <span className="text-zinc-400 font-bold truncate max-w-full">{getPlayerName(p2)}</span>
                    </div>
                    <div className="w-full h-full bg-gradient-to-t from-zinc-800 to-zinc-600 rounded-t-lg border-t border-zinc-500 relative flex items-end justify-center pb-4 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                      <span className="text-4xl font-black text-zinc-400/20 absolute top-2">2</span>
                      <span className="text-2xl font-bold text-white">{getPlayerScore(p2)}</span>
                    </div>
                  </motion.div>
                )
              })()}

              {(() => {
                const p1 = [...players].sort((a, b) => getPlayerScore(b) - getPlayerScore(a))[0];
                if (!p1) return null;
                return (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "80%", opacity: 1 }} transition={{ delay: 0.8, duration: 0.8, type: "spring" }} className="flex flex-col items-center justify-end w-1/3 max-w-[220px] z-10">
                    <div className="mb-4 flex flex-col items-center gap-2 relative">
                      <div className="absolute -top-10 text-5xl animate-bounce">👑</div>
                      <div className="w-24 h-24 rounded-full border-4 border-yellow-400 bg-zinc-800 flex items-center justify-center text-3xl font-bold text-white shadow-[0_0_30px_rgba(250,204,21,0.4)]">
                        {getPlayerName(p1)[0] || "?"}
                      </div>
                      <span className="text-yellow-400 font-bold text-xl truncate max-w-full">{getPlayerName(p1)}</span>
                    </div>
                    <div className="w-full h-full bg-gradient-to-t from-orange-600 via-yellow-500 to-yellow-300 rounded-t-xl border-t border-yellow-200 relative flex items-end justify-center pb-6 shadow-[0_0_50px_rgba(234,179,8,0.3)]">
                      <span className="text-6xl font-black text-white/30 absolute top-4">1</span>
                      <span className="text-4xl font-black text-black">{getPlayerScore(p1)}</span>
                    </div>
                  </motion.div>
                )
              })()}

              {players.length > 2 && (() => {
                const p3 = [...players].sort((a, b) => getPlayerScore(b) - getPlayerScore(a))[2];
                if (!p3) return null;
                return (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "45%", opacity: 1 }} transition={{ delay: 0.2, duration: 0.8, type: "spring" }} className="flex flex-col items-center justify-end w-1/3 max-w-[200px]">
                    <div className="mb-4 flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-full border-2 border-orange-800 bg-zinc-800 flex items-center justify-center text-xl font-bold text-orange-700 shadow-xl">
                        {getPlayerName(p3)[0] || "?"}
                      </div>
                      <span className="text-orange-800/80 font-bold truncate max-w-full">{getPlayerName(p3)}</span>
                    </div>
                    <div className="w-full h-full bg-gradient-to-t from-orange-900 to-orange-700 rounded-t-lg border-t border-orange-600 relative flex items-end justify-center pb-4 shadow-[0_0_30px_rgba(194,65,12,0.1)]">
                      <span className="text-4xl font-black text-black/20 absolute top-2">3</span>
                      <span className="text-2xl font-bold text-orange-100">{getPlayerScore(p3)}</span>
                    </div>
                  </motion.div>
                )
              })()}
            </div>
            {players.length > 3 && (
              <div className="w-full max-w-md bg-white/5 rounded-xl border border-white/5 p-4 mb-8 max-h-40 overflow-y-auto">
                <h3 className="text-xs uppercase text-zinc-500 font-bold mb-3 tracking-wider">Honorable Mentions</h3>
                {[...players].sort((a, b) => getPlayerScore(b) - getPlayerScore(a)).slice(3).map((p, i) => (
                  <div key={p.user_id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                    <span className="text-zinc-400 flex items-center gap-3">
                      <span className="text-xs font-mono opacity-50">#{i + 4}</span>
                      {getPlayerName(p)}
                    </span>
                    <span className="text-zinc-500 font-mono">{getPlayerScore(p)}</span>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              className="h-12 px-8 rounded-full border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-300 transition-all hover:scale-105"
              onClick={async () => {
                if (isHost) {
                  await fetch("/api/room/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ room_id: roomId }),
                  });
                }
                window.location.reload();
              }}
            >
              {isHost ? "Play Again" : "Return to Lobby"}
            </Button>
          </div>
        )}

      </main>

      {/* --- OVERLAYS --- */}

      <AnimatePresence>
        {showHostPopup && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -50, x: "-50%" }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="fixed top-8 left-1/2 z-[200] bg-white text-black px-6 py-3 rounded-full shadow-2xl flex items-center gap-3"
          >
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white">
              <ClipboardCheck size={14} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm leading-none">Room Created</span>
              <span className="text-[10px] text-zinc-500">Code copied to clipboard</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isTransitioning && battlePhase !== 'finished' && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 border-4 border-zinc-800 border-t-orange-500 rounded-full animate-spin" />
            <div className="text-center space-y-2">
              <p className="text-white font-bold tracking-widest text-xl animate-pulse">
                {roundNumber === totalRounds ? "CALCULATING CHAMPION..." : "GENERATING NEXT ROUND..."}
              </p>
              <p className="text-zinc-500 text-sm font-mono">
                {roundNumber === totalRounds ? "Finalizing scores & leaderboard" : "Preparing image data"}
              </p>
            </div>
          </div>
        </div>
      )}

      {loadingEval && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center">
          <div className="bg-[#121214] border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm text-center">
            <div className="mx-auto w-10 h-10 mb-4 rounded-full bg-orange-500/20 flex items-center justify-center"><span className="w-2 h-2 bg-orange-500 rounded-full animate-ping" /></div>
            <h3 className="text-xl font-bold text-white mb-2">Judge AI is Thinking</h3>
            <p className="text-zinc-500 text-sm">Analyzing semantic similarity and creativity...</p>
          </div>
        </div>
      )}
    </div>
  );
}