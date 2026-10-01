"use client";

import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
    Swords, Zap, Trophy, Users, Eye, Archive, Newspaper,
    Settings, LogOut, Menu, X, Play, ArrowUpRight, Signal, MonitorPlay,
    Flame, ChevronLeft, ChevronRight, Crown, Target, Loader2,
    Ban, Scissors, FileWarning, PlusCircle, LogIn, Minus, Plus, Hash, Type, AlertCircle, ArrowRight
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Button } from "@/components/ui/button";

/* ---------------- UTILS ---------------- */
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const handleFutureFeature = () => {
    alert("This feature will come in the next version!");
};

const noiseBg = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;

/* ---------------- GAME MODES CONFIG ---------------- */
const GAME_MODES = [
    {
        id: '1v1',
        label: '1V1',
        description: 'Classic Head-to-Head Duel',
        icon: Swords,
        color: 'text-blue-400',
        glow: 'shadow-blue-500/50',
        border: 'border-blue-500',
        bg: 'bg-blue-900/80',
        solid: 'bg-blue-600 hover:bg-blue-500'
    },
    {
        id: 'precision',
        label: 'PRECISION',
        description: 'Strict Character Limit Challenge',
        icon: Target,
        color: 'text-emerald-400',
        glow: 'shadow-emerald-500/50',
        border: 'border-emerald-500',
        bg: 'bg-emerald-900/80',
        solid: 'bg-emerald-600 hover:bg-emerald-500'
    },
    {
        id: 'inverse',
        label: 'INVERSE',
        description: 'Generate via Negative Prompts',
        icon: Ban,
        color: 'text-red-400',
        glow: 'shadow-red-500/50',
        border: 'border-red-500',
        bg: 'bg-red-900/80',
        solid: 'bg-red-600 hover:bg-red-500'
    },
    {
        id: 'remix',
        label: 'REMIX',
        description: 'Creative Img2Img Transformation',
        icon: Scissors,
        color: 'text-purple-400',
        glow: 'shadow-purple-500/50',
        border: 'border-purple-500',
        bg: 'bg-purple-900/80',
        solid: 'bg-purple-600 hover:bg-purple-500'
    },
    {
        id: 'taboo',
        label: 'TABOO',
        description: 'Avoid the Forbidden Keywords',
        icon: FileWarning,
        color: 'text-amber-400',
        glow: 'shadow-amber-500/50',
        border: 'border-amber-500',
        bg: 'bg-amber-900/80',
        solid: 'bg-amber-600 hover:bg-amber-500'
    },
    {
        id: 'team',
        label: 'TEAM BATTLE',
        description: 'Cooperative 2v2 Warfare',
        icon: Users,
        color: 'text-cyan-400',
        glow: 'shadow-cyan-500/50',
        border: 'border-cyan-500',
        bg: 'bg-cyan-900/80',
        solid: 'bg-cyan-600 hover:bg-cyan-500'
    },
];

/* ---------------- RANK CONFIG ---------------- */
const getRankConfig = (elo: number) => {
    if (elo < 1000) return { label: "BRONZE", style: "border-orange-800/50 bg-orange-950/30 text-orange-600", gradient: "from-orange-700 to-orange-900", glowColor: "bg-orange-500", shadow: "shadow-orange-500/20", isStar: false };
    if (elo < 1800) return { label: "SILVER", style: "border-zinc-500/50 bg-zinc-800/40 text-zinc-300", gradient: "from-zinc-400 to-zinc-700", glowColor: "bg-zinc-300", shadow: "shadow-zinc-500/20", isStar: false };
    if (elo < 2400) return { label: "GOLD", style: "border-yellow-500/80 bg-yellow-950/40 text-yellow-400 animate-pulse", gradient: "from-yellow-400 to-yellow-700", glowColor: "bg-yellow-400", shadow: "shadow-yellow-500/40", isStar: false };
    if (elo < 3000) return { label: "DIAMOND", style: "border-cyan-400 bg-cyan-950/40 text-cyan-300 animate-pulse", gradient: "from-cyan-400 to-blue-700", glowColor: "bg-cyan-400", shadow: "shadow-cyan-500/50", isStar: false };
    return { label: "STAR", style: "border-fuchsia-500 bg-fuchsia-950/50 text-fuchsia-200", gradient: "from-fuchsia-500 to-purple-800", glowColor: "bg-fuchsia-400", shadow: "shadow-fuchsia-500/60", isStar: true };
};

export default function Home() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [elo, setElo] = useState(1200);

    // NEW: Stats State
    const [stats, setStats] = useState({ won: 0, lost: 0, winRate: 0 });

    // UI States
    const [activeTab, setActiveTab] = useState<'ranked' | 'unranked'>('ranked');
    const [roundCount, setRoundCount] = useState(5);

    // MODAL STATES
    const [showHostModal, setShowHostModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);

    // HOST INPUTS
    const [roomNameInput, setRoomNameInput] = useState("");
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);

    // JOIN INPUTS
    const [joinCode, setJoinCode] = useState("");
    const [joinError, setJoinError] = useState("");
    const [joinLoading, setJoinLoading] = useState(false);

    // ROTATION STATE
    const [rotationIndex, setRotationIndex] = useState(0);

    // Derived Active Index
    const totalModes = GAME_MODES.length;
    const activeModeIndex = ((rotationIndex % totalModes) + totalModes) % totalModes;
    const currentMode = GAME_MODES[activeModeIndex];

    /* ---------------- AUTH & DATA ---------------- */
    useEffect(() => {
        const checkUser = async () => {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
                router.replace("/auth");
            } else {
                setIsLoading(false);
                const uid = data.session.user.id;
                setUserId(uid);

                // 1. Fetch User ELO
                const { data: userData } = await supabase.from('users').select('elo').eq('id', uid).single();
                if (userData) setElo(userData.elo);

                // 2. Fetch & Calculate Stats
                // We assume a 'matches' table or similar where player history is stored
                // Adjust column names (player1_id, player2_id, winner_id, status) based on your exact schema
                const { data: matches } = await supabase
                    .from('matches')
                    .select('winner_id')
                    .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
                    .eq('status', 'finished'); // Only count finished matches

                if (matches) {
                    let won = 0;
                    let lost = 0;
                    matches.forEach(match => {
                        if (match.winner_id === uid) {
                            won++;
                        } else if (match.winner_id) { // If there is a winner but it's not me
                            lost++;
                        }
                    });
                    const total = won + lost;
                    const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
                    setStats({ won, lost, winRate });
                }
            }
        };
        checkUser();
    }, [router]);

    /* ---------------- ROTATION HANDLERS ---------------- */
    const rotateRight = useCallback(() => setRotationIndex((prev) => prev + 1), []);
    const rotateLeft = useCallback(() => setRotationIndex((prev) => prev - 1), []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (showHostModal || showJoinModal) return;
            if (e.key === "ArrowRight") rotateRight();
            if (e.key === "ArrowLeft") rotateLeft();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [rotateRight, rotateLeft, showHostModal, showJoinModal]);


    /* ---------------- API HANDLERS ---------------- */

    // --- HOST ROOM LOGIC ---
    const confirmHostRoom = async () => {
        if (!roomNameInput.trim() || !userId) return;

        setIsCreatingRoom(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch("/api/room/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: roomNameInput,
                    user_id: userId,
                    total_rounds: roundCount,
                    mode: currentMode.id,
                    is_ranked: activeTab === 'ranked'
                }),
            });

            const json = await res.json();

            if (json.roomId) {
                try { await navigator.clipboard.writeText(json.roomId); } catch (e) { }
                router.push(`/room/${json.roomId}?host=true`);
            }
        } catch (error) {
            console.error("Failed to create room:", error);
        } finally {
            setIsCreatingRoom(false);
        }
    };

    // --- JOIN ROOM LOGIC ---
    const handleJoinSubmit = async () => {
        if (!joinCode || !userId) return;
        setJoinLoading(true);
        setJoinError("");

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch("/api/room/join", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    room_id: joinCode,
                    user_id: userId,
                }),
            });

            const json = await res.json();

            if (!json.success) {
                setJoinError(json.error || "Failed to join room.");
            } else {
                router.push(`/room/${json.roomId}`);
            }
        } catch (err) {
            setJoinError("Connection failed. Please try again.");
        } finally {
            setJoinLoading(false);
        }
    };

    const handleLogout = async () => { await supabase.auth.signOut(); router.push("/auth"); };
    const incrementRounds = () => setRoundCount((prev) => Math.min(prev + 1, 10));
    const decrementRounds = () => setRoundCount((prev) => Math.max(prev - 1, 1));

    if (isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>;

    const rank = getRankConfig(elo);
    const RADIUS = 140;
    const ICON_SIZE = 56;
    const CENTER_OFFSET = ICON_SIZE / 2;
    const RING_TOP_POSITION = "60%";

    return (
        <div className="h-screen bg-[#050505] bg-[radial-gradient(ellipse_at_center,_#232329_0%,_#050505_100%)] text-zinc-100 font-sans selection:bg-blue-500/30 overflow-hidden flex">

            {/* GLOBAL NOISE TEXTURE */}
            <div className="fixed inset-0 pointer-events-none z-0 mix-blend-overlay opacity-30" style={{ backgroundImage: noiseBg }}></div>

            {/* LEFT SIDEBAR - Increased width by 15% (64 * 1.15 = 73.6 -> w-[294px]) */}
            <aside className="hidden lg:flex w-[294px] flex-col border-r border-white/5 bg-[#050505]/80 backdrop-blur-md h-screen relative z-10">
                <div className="p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white text-black rounded-lg flex items-center justify-center"><Swords size={18} fill="currentColor" /></div>
                        <span className="font-bold text-xl tracking-tight">PromptBattles</span>
                    </div>
                </div>
                <div className="flex-1 px-3 space-y-1 overflow-y-auto py-4">
                    <SidebarLink icon={<Play size={20} fill="currentColor" />} label="Play" active />
                    <SidebarLink icon={<Zap size={20} />} label="Daily Puzzle" onClick={handleFutureFeature} />
                    <SidebarLink icon={<Trophy size={20} />} label="Leaderboard" onClick={handleFutureFeature} />
                    <SidebarLink icon={<Users size={20} />} label="Friends" onClick={handleFutureFeature} />
                    <SidebarLink icon={<Eye size={20} />} label="Watch" onClick={handleFutureFeature} />
                    <SidebarLink icon={<Archive size={20} />} label="Archive" onClick={handleFutureFeature} />
                    <SidebarLink icon={<Newspaper size={20} />} label="News" onClick={handleFutureFeature} />
                </div>
                <div className="p-4 mt-auto border-t border-white/5 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-500 text-xs font-medium px-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />1,420 Online</div>
                    <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => router.push('/profile')}>
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold border border-white/10">P1</div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-bold text-white truncate">Player One</div><div className="text-xs text-zinc-500">Lvl 12 • Creator</div></div>
                        <Settings size={16} className="text-zinc-600 group-hover:text-white transition-colors" />
                    </div>
                </div>
            </aside>

            {/* CENTER STAGE WRAPPER - SCALED TO 80% */}
            <div className="flex-1 h-screen overflow-hidden relative z-10">
                <div className="w-[125%] h-[125%] origin-top-left scale-[0.8] overflow-y-auto">
                    {/* CENTER STAGE */}
                    <main className="min-h-full flex flex-col items-center p-4 md:p-8">
                        <div className="lg:hidden w-full flex justify-between items-center mb-6">
                            <div className="flex items-center gap-2 font-bold text-xl"><Swords size={20} /> PromptBattles</div>
                            <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(!isMenuOpen)}><Menu /></Button>
                        </div>

                        <div className="w-full max-w-[883px] space-y-6">

                            {/* --- BATTLE ARENA CONTAINER --- */}
                            <div className="w-full bg-[#18181b] rounded-3xl p-6 md:p-8 border border-white/5 shadow-2xl relative overflow-hidden min-h-[700px] flex flex-col">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                                {/* --- RANKED / UNRANKED TOGGLE --- */}
                                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40">
                                    <div className="bg-[#09090b] p-1 rounded-full flex items-center shadow-xl border border-white/10 backdrop-blur-md">
                                        <button onClick={() => setActiveTab('unranked')} className={cn("px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-300", activeTab === 'unranked' ? "bg-zinc-800 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300")}>Unranked</button>
                                        <button onClick={() => setActiveTab('ranked')} className={cn("px-5 py-1.5 rounded-full text-xs font-bold transition-all duration-300", activeTab === 'ranked' ? "bg-zinc-800 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300")}>Ranked</button>
                                    </div>
                                </div>

                                {/* --- REVOLVER SELECTOR AREA --- */}
                                <div className="flex-1 relative w-full h-full">

                                    {/* NAVIGATION ARROWS */}
                                    <button onClick={rotateLeft} className="absolute left-4 z-30 p-4 rounded-full bg-black/20 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all group active:scale-95" style={{ top: RING_TOP_POSITION, transform: 'translateY(-50%)' }}><ChevronLeft className="w-8 h-8 text-zinc-500 group-hover:text-white transition-colors" /></button>
                                    <button onClick={rotateRight} className="absolute right-4 z-30 p-4 rounded-full bg-black/20 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all group active:scale-95" style={{ top: RING_TOP_POSITION, transform: 'translateY(-50%)' }}><ChevronRight className="w-8 h-8 text-zinc-500 group-hover:text-white transition-colors" /></button>

                                    <div className="absolute inset-0 flex flex-col items-center">
                                        {/* 1. SELECTION BOX */}
                                        <div className="absolute left-1/2 z-0 flex flex-col items-center gap-2" style={{ top: RING_TOP_POSITION, transform: `translate(-50%, -50%) translateY(-${RADIUS}px)` }}>
                                            <div className="w-20 h-20 rounded-2xl border border-white/20 bg-gradient-to-b from-white/5 to-transparent shadow-[0_0_30px_rgba(255,255,255,0.05)]"></div>
                                            <motion.div
                                                key={activeModeIndex}
                                                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                transition={{ duration: 0.2, ease: "easeOut" }}
                                                className="absolute -top-36 w-80 text-center pointer-events-none"
                                            >
                                                <div className="text-3xl font-black text-white italic tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">{currentMode.label}</div>
                                                <div className="text-xs text-zinc-400 font-bold tracking-[0.2em] uppercase mt-2">{currentMode.description}</div>
                                            </motion.div>
                                        </div>

                                        {/* 2. THE ICONS */}
                                        <div className="absolute inset-0 z-20 pointer-events-none">
                                            {GAME_MODES.map((mode, index) => {
                                                const angleStep = 360 / totalModes;
                                                const thetaDegrees = ((index - rotationIndex) * angleStep) - 90;
                                                const thetaRadians = (thetaDegrees * Math.PI) / 180;
                                                const x = (RADIUS * Math.cos(thetaRadians)) - CENTER_OFFSET;
                                                const y = (RADIUS * Math.sin(thetaRadians)) - CENTER_OFFSET;
                                                const dist = Math.min(Math.abs(index - activeModeIndex), totalModes - Math.abs(index - activeModeIndex));
                                                const isInteractive = dist === 0;

                                                return (
                                                    <motion.div
                                                        key={mode.id}
                                                        initial={false}
                                                        className={cn("absolute left-1/2 w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors duration-300", isInteractive ? cn(mode.bg, mode.border, mode.glow, "shadow-2xl z-30 ring-1 ring-white/50") : "bg-[#09090b]/50 border-zinc-800")}
                                                        style={{ top: RING_TOP_POSITION, zIndex: isInteractive ? 30 : 10 }}
                                                        animate={{ x, y, scale: isInteractive ? 1.3 : dist === 1 ? 0.9 : 0.6, opacity: isInteractive ? 1 : dist === 1 ? 0.5 : 0.15, filter: isInteractive ? 'grayscale(0%)' : dist === 1 ? 'grayscale(60%)' : 'grayscale(100%) blur(1px)' }}
                                                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                                    >
                                                        <mode.icon className={cn("w-6 h-6", isInteractive ? mode.color : "text-zinc-500")} />
                                                    </motion.div>
                                                );
                                            })}
                                        </div>

                                        {/* 3. CENTER ELO CIRCLE */}
                                        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center z-40" style={{ top: RING_TOP_POSITION, transform: 'translate(-50%, -50%)' }}>
                                            <motion.div className="absolute w-48 h-48 rounded-full" animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
                                                <div className={cn("w-full h-full rounded-full opacity-40 blur-xl", rank.shadow)}></div>
                                                <div className={cn("absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full blur-md", rank.glowColor)}></div>
                                            </motion.div>
                                            <motion.div className={cn("relative z-10 w-36 h-36 rounded-full bg-gradient-to-br flex flex-col items-center justify-center shadow-2xl border-4 border-white/5", rank.gradient)}>
                                                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-12 bg-white/10 rounded-full blur-lg"></div>
                                                <div className="text-center z-20">
                                                    <div className="text-4xl font-black text-white drop-shadow-md tracking-tighter">{elo}</div>
                                                    <div className="text-[10px] font-bold text-white/60 tracking-[0.3em] uppercase mt-1">{rank.label}</div>
                                                </div>
                                            </motion.div>
                                        </div>

                                        {/* 4. ACTION BUTTONS ROW */}
                                        <div className="absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center gap-6 w-full px-8" style={{ top: RING_TOP_POSITION, transform: `translate(-50%, 0) translateY(${RADIUS + 50}px)` }}>

                                            {/* CREATE BUTTON */}
                                            <motion.button
                                                onClick={() => setShowHostModal(true)}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                className={cn("flex-1 h-12 rounded-xl font-bold text-sm text-white shadow-xl flex items-center justify-center gap-2 transition-all duration-300", currentMode.solid)}
                                            >
                                                <PlusCircle className="w-4 h-4" /> CREATE ROOM
                                            </motion.button>

                                            {/* JOIN BUTTON */}
                                            <motion.button onClick={() => setShowJoinModal(true)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex-1 h-12 bg-zinc-800 hover:bg-zinc-700 border border-white/5 rounded-xl font-bold text-sm text-zinc-100 shadow-xl flex items-center justify-center gap-2 transition-all duration-300">
                                                <LogIn className="w-4 h-4" /> JOIN ROOM
                                            </motion.button>
                                        </div>

                                    </div>
                                </div>
                            </div>

                            {/* BOTTOM GRID */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-[#18181b] rounded-3xl p-6 border border-white/5 relative group cursor-pointer hover:border-amber-500/30 transition-all" onClick={handleFutureFeature}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500"><Zap size={20} fill="currentColor" /></div>
                                        <div className="bg-amber-500/10 text-amber-500 text-[10px] font-bold px-2 py-1 rounded">04:22:10 LEFT</div>
                                    </div>
                                    <div className="space-y-1"><h3 className="font-bold text-zinc-100">Daily Prompt</h3><p className="text-sm text-zinc-400">"Cyberpunk Renaissance"</p></div>
                                    <div className="mt-4 flex items-center text-xs font-bold text-amber-500 gap-1 group-hover:gap-2 transition-all">SOLVE NOW <ArrowUpRight size={12} /></div>
                                </div>
                                <div className="bg-[#18181b] rounded-3xl p-6 border border-white/5 relative group cursor-pointer hover:border-emerald-500/30 transition-all" onClick={handleFutureFeature}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500"><Trophy size={20} fill="currentColor" /></div>
                                        <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-1 rounded">SEASON 2</div>
                                    </div>
                                    <div className="space-y-1"><h3 className="font-bold text-zinc-100">Tournaments</h3><p className="text-sm text-zinc-400">$500 Prize Pool</p></div>
                                    <div className="mt-4 flex items-center text-xs font-bold text-emerald-500 gap-1 group-hover:gap-2 transition-all">VIEW RANK <ArrowUpRight size={12} /></div>
                                </div>
                            </div>

                        </div>
                    </main>
                </div>
            </div>

            {/* RIGHT SIDEBAR - Increased width by 15% (80 * 1.15 = 92 -> w-[368px]) */}
            <aside className="hidden xl:flex w-[368px] flex-col border-l border-white/5 bg-[#050505]/80 backdrop-blur-md h-screen p-6 overflow-y-auto relative z-10">
                <div className="flex justify-between items-center mb-6"><span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">My Stats</span><button className="text-[10px] font-bold border border-zinc-700 rounded px-2 py-1 text-zinc-400 hover:text-white" onClick={handleFutureFeature}>DETAIL</button></div>
                <div className="bg-[#18181b] rounded-2xl p-5 border border-white/5 mb-6 shadow-lg relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-500">P1</div>
                            <div><div className="font-bold text-white">Player One</div><div className="text-xs text-blue-400 font-bold">{elo} ELO</div></div>
                        </div>
                        {(() => { const { label, style, isStar } = getRankConfig(elo); return (<motion.div animate={isStar ? { opacity: [1, 0.7, 1], scale: [1, 1.05, 1], filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"] } : {}} transition={isStar ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : {}} className={cn("px-3 py-1 rounded-lg border text-[10px] font-black tracking-widest uppercase shadow-lg transition-all duration-500", style)}>{label}</motion.div>) })()}
                    </div>

                    {/* DYNAMIC PROGRESS BAR */}
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-6 overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.winRate}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-blue-500 rounded-full"
                        />
                    </div>

                    {/* DYNAMIC STATS GRID */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-[#09090b] rounded-lg p-2 text-center border border-zinc-800">
                            <div className="text-emerald-500 font-bold text-lg leading-none">{stats.won}</div>
                            <div className="text-[9px] text-zinc-500 font-bold mt-1 uppercase">Won</div>
                        </div>
                        <div className="bg-[#09090b] rounded-lg p-2 text-center border border-zinc-800">
                            <div className="text-red-500 font-bold text-lg leading-none">{stats.lost}</div>
                            <div className="text-[9px] text-zinc-500 font-bold mt-1 uppercase">Lost</div>
                        </div>
                        <div className="bg-[#09090b] rounded-lg p-2 text-center border border-zinc-800">
                            <div className="text-white font-bold text-lg leading-none">{stats.winRate}%</div>
                            <div className="text-[9px] text-zinc-500 font-bold mt-1 uppercase">Win %</div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Recent</span><span className="text-[10px] text-zinc-600 font-bold">ALL MODES</span></div>
                <div className="space-y-2 mb-8"><RecentMatch outcome="win" opponent="Opponent 1" mode="RAPID • 10M" change="+12" /><RecentMatch outcome="loss" opponent="Opponent 2" mode="RAPID • 10M" change="-8" /><RecentMatch outcome="loss" opponent="Opponent 3" mode="RAPID • 10M" change="-8" /></div>
                <button className="w-full text-[10px] font-bold text-zinc-500 hover:text-white mb-8 transition-colors" onClick={handleFutureFeature}>VIEW FULL ARCHIVE</button>
                <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-2"><Signal size={12} className="animate-pulse" /> Live Now</span><div className="w-2 h-2 rounded-full bg-red-500 animate-ping" /></div>
                <div className="bg-[#18181b] rounded-2xl p-4 border border-white/5 relative overflow-hidden group cursor-pointer shadow-lg" onClick={handleFutureFeature}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" /><div className="absolute inset-0 bg-zinc-800 opacity-50 z-0" />
                    <div className="relative z-20"><div className="flex justify-between items-center text-xs font-bold text-zinc-300 mb-6"><span className="bg-black/50 px-2 py-1 rounded">P1 Kuro</span><span className="text-[9px] text-zinc-400">VS</span><span className="bg-black/50 px-2 py-1 rounded">Alice P1</span></div><div className="w-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold py-2 rounded flex items-center justify-center gap-2 transition-colors"><MonitorPlay size={12} /> SPECTATE MATCH</div></div>
                </div>
            </aside>

            {/* ... (Modals & Mobile Menu remain unchanged) ... */}
            <AnimatePresence>
                {/* HOST MODAL */}
                {showHostModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#18181b] w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-2xl relative overflow-hidden">
                            <button onClick={() => setShowHostModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X size={24} /></button>

                            <div className="flex flex-col items-center text-center mb-6 mt-2">
                                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg border", currentMode.bg, currentMode.border)}>
                                    <currentMode.icon size={32} className="text-white" />
                                </div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Create Room</h2>
                                <p className="text-zinc-400 text-sm mt-1">{currentMode.label} • {activeTab.toUpperCase()}</p>
                            </div>

                            <div className="mb-4 space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 ml-1">Room Name</label>
                                <div className="relative">
                                    <Type className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Ex: Late Night Battle"
                                        value={roomNameInput}
                                        onChange={(e) => setRoomNameInput(e.target.value)}
                                        className="w-full bg-[#09090b] border border-white/10 rounded-xl pl-12 pr-4 py-4 font-bold text-white placeholder:text-zinc-700 focus:outline-none focus:border-white/30 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="mb-6 space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 ml-1">Total Rounds</label>
                                <div className="flex items-center gap-3">
                                    <button onClick={decrementRounds} className="w-14 h-14 bg-[#09090b] border border-white/10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-all active:scale-95"><Minus size={20} /></button>
                                    <div className="flex-1 h-14 bg-[#09090b] border border-white/10 rounded-xl flex items-center justify-center font-mono font-bold text-xl text-white">{roundCount}</div>
                                    <button onClick={incrementRounds} className="w-14 h-14 bg-[#09090b] border border-white/10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-all active:scale-95"><Plus size={20} /></button>
                                </div>
                            </div>

                            <button
                                onClick={confirmHostRoom}
                                disabled={isCreatingRoom || !roomNameInput.trim()}
                                className={cn(
                                    "w-full py-4 rounded-xl font-black text-white shadow-lg flex items-center justify-center gap-2 transition-all",
                                    currentMode.solid,
                                    (isCreatingRoom || !roomNameInput.trim()) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                {isCreatingRoom ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />}
                                {isCreatingRoom ? "CREATING..." : "START LOBBY"}
                            </button>
                        </motion.div>
                    </motion.div>
                )}

                {/* JOIN MODAL */}
                {showJoinModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#18181b] w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-2xl relative">
                            <button onClick={() => setShowJoinModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X size={24} /></button>

                            <div className="flex flex-col items-center text-center mb-8 mt-2">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4 shadow-lg border border-white/5">
                                    <Hash size={32} className="text-white" />
                                </div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Join Arena</h2>
                                <p className="text-zinc-400 text-sm mt-1">Enter the invitation code to join</p>
                            </div>

                            <div className="flex flex-col gap-6">
                                <div className="space-y-2">
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-white transition-colors">
                                            <Hash size={20} />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="CODE"
                                            value={joinCode}
                                            onChange={(e) => {
                                                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
                                                setJoinCode(val);
                                                setJoinError("");
                                            }}
                                            onKeyDown={(e) => { if (e.key === "Enter" && joinCode) handleJoinSubmit(); }}
                                            className="w-full bg-[#09090b] border border-white/10 rounded-xl pl-12 pr-4 py-4 text-2xl text-white font-mono tracking-widest placeholder:text-zinc-800 focus:outline-none focus:border-white/30 transition-all uppercase"
                                            maxLength={36}
                                        />
                                    </div>
                                </div>

                                <div className="h-4 -mt-2">
                                    <AnimatePresence mode="wait">
                                        {joinError && (
                                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center justify-center gap-2 text-red-400 text-xs font-medium">
                                                <AlertCircle size={14} /> {joinError}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <button
                                    onClick={handleJoinSubmit}
                                    disabled={joinLoading || !joinCode}
                                    className="w-full h-14 text-lg font-bold rounded-xl bg-zinc-100 text-black hover:bg-white hover:scale-[1.02] transition-all shadow-lg disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                                >
                                    {joinLoading ? <Loader2 className="animate-spin" size={20} /> : <span className="flex items-center gap-2">Enter Room <ArrowRight size={20} strokeWidth={2.5} /></span>}
                                    {joinLoading && "Connecting..."}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MOBILE MENU */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-[#09090b]/95 z-50 flex flex-col p-6 lg:hidden">
                        <div className="flex justify-between items-center mb-8"><span className="font-bold text-xl">Menu</span><Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(false)}><X /></Button></div>
                        <div className="space-y-4">
                            <SidebarLink icon={<Play size={20} />} label="Play" active onClick={() => setIsMenuOpen(false)} />
                            <SidebarLink icon={<Zap size={20} />} label="Daily Puzzle" onClick={handleFutureFeature} />
                            <SidebarLink icon={<Trophy size={20} />} label="Leaderboard" onClick={handleFutureFeature} />
                            <Button variant="destructive" className="w-full mt-8" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /> Sign Out</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SidebarLink({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
    return (<button onClick={onClick} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200", active ? "bg-[#18181b] text-white shadow-sm border border-white/5" : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5")}>{icon}{label}</button>)
}

function RecentMatch({ outcome, opponent, mode, change }: { outcome: 'win' | 'loss', opponent: string, mode: string, change: string }) {
    return (<div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"><div className="flex items-center gap-3"><div className={cn("w-2 h-2 rounded-full", outcome === 'win' ? "bg-emerald-500" : "bg-red-500")} /><div><div className="text-sm font-bold text-zinc-300 group-hover:text-white">{opponent}</div><div className="text-[10px] font-bold text-zinc-600 uppercase">{mode}</div></div></div><div className={cn("text-xs font-bold", outcome === 'win' ? "text-emerald-500" : "text-red-500")}>{change}</div></div>)
}