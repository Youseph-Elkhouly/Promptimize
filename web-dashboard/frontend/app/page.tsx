"use client";
import { useState, useMemo } from "react";
import {
  Zap, Plus, Trash2, RefreshCw, AlertTriangle, Info,
  ChevronRight, ChevronDown, Check, Folder, Brain,
} from "lucide-react";
import { optimizePrompt } from "@/lib/api";
import type { OptimizeResponse } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Codebase {
  id: string;
  name: string;
  path: string;
  calls: number;
  spend: number;
  savedPct: number;
  color: string;
  history: { label: string; cost: number; saved: number }[];
}

interface MemoryEntry {
  id: string;
  type: "context" | "constraint" | "preference";
  content: string;
  codebase: string;
  ts: string;
}

interface ApiCall {
  id: string;
  label: string;
  file: string;
  tokens: number;
  costPerRun: number;
  model: string;
  prompt: string;
  impact: "critical" | "high" | "medium" | "low";
  codebase: string;
}

// ── Demo data ──────────────────────────────────────────────────────────────────

// Seeded LCG — same seed always produces the same sequence (no hydration mismatch)
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const HISTORY_LABELS = [
  "Apr 27","Apr 28","Apr 29","Apr 30","May 1","May 2",
  "May 3","May 4","May 5","May 6","May 7","May 8","May 9","May 10",
];

function makeHistory(base: number, drop: number, seed: number): { label: string; cost: number; saved: number }[] {
  const rng = seededRng(seed);
  return HISTORY_LABELS.map((lbl, idx) => {
    const jitter = (rng() - 0.5) * base * 0.18;
    const isOpt  = idx >= 8; // optimization applied from day 9 onward
    const cost   = Math.max(0.5, isOpt ? base * drop + jitter : base + jitter);
    const saved  = isOpt ? +(base - cost).toFixed(2) : 0;
    return { label: lbl, cost: +cost.toFixed(2), saved };
  });
}

const CODEBASES: Codebase[] = [
  { id: "cb1", name: "sample-ai-app",       path: "examples/sample-ai-app",      calls: 8,  spend: 0.034, savedPct: 31, color: "#3ecf8e", history: makeHistory(8,  0.62, 1001) },
  { id: "cb2", name: "legacy-classifier",   path: "src/legacy_classifier.py",    calls: 24, spend: 0.189, savedPct: 44, color: "#ffa94d", history: makeHistory(42, 0.54, 2002) },
  { id: "cb3", name: "batch-processor",     path: "src/batch_processor.py",      calls: 61, spend: 0.421, savedPct: 38, color: "#74c0fc", history: makeHistory(95, 0.60, 3003) },
  { id: "cb4", name: "customer-service-bot",path: "src/customer_service_bot.ts", calls: 19, spend: 0.097, savedPct: 27, color: "#cc5de8", history: makeHistory(22, 0.71, 4004) },
];

const INITIAL_MEMORY: MemoryEntry[] = [
  { id: "m1", type: "context",    content: "This is a SaaS task-management app with a FastAPI backend and Next.js frontend.", codebase: "cb1", ts: "May 9" },
  { id: "m2", type: "constraint", content: "All API responses must stay under 500 tokens to meet latency SLA.", codebase: "cb1", ts: "May 9" },
  { id: "m3", type: "preference", content: "Prefer gpt-4o-mini over gpt-4o unless reasoning quality is critical.", codebase: "cb2", ts: "May 8" },
  { id: "m4", type: "constraint", content: "legacy_classifier.py cannot be refactored this sprint — optimization must be prompt-only.", codebase: "cb2", ts: "May 8" },
  { id: "m5", type: "context",    content: "batch_processor.py processes ~60k documents per day; cost scales linearly.", codebase: "cb3", ts: "May 7" },
  { id: "m6", type: "preference", content: "Return structured JSON for all classification calls — downstream parser expects it.", codebase: "cb3", ts: "May 7" },
];

const ALL_API_CALLS: ApiCall[] = [
  { id: "ac1", label: "analyzeTaskPriority()",   file: "app.ts:158",                tokens: 134, costPerRun: 0.000039, model: "gemini-1.5-flash", impact: "low",      codebase: "cb1", prompt: "Analyze these tasks and rank them by urgency. Reply with a short ordered list." },
  { id: "ac2", label: "generateCompletionNote()", file: "app.ts:163",               tokens: 62,  costPerRun: 0.000017, model: "gemini-1.5-flash", impact: "low",      codebase: "cb1", prompt: "Write a one-sentence upbeat completion note for this finished task." },
  { id: "ac3", label: "analyze_report()",        file: "legacy_classifier.py:44",   tokens: 1240,costPerRun: 0.0062,   model: "gpt-4-turbo",      impact: "high",     codebase: "cb2", prompt: `You are an expert financial analyst with over 20 years of experience analyzing corporate earnings reports, balance sheets, income statements, and cash flow statements. Your job is to produce a comprehensive, structured, multi-section analysis that covers:\n\n1. Executive Summary — a high-level overview of the company's financial health.\n2. Revenue Analysis — break down total revenue by segment.\n3. Profitability Metrics — gross margin, operating margin, EBITDA margin.\n4. Balance Sheet Health — current ratio, quick ratio, debt-to-equity.\n5. Cash Flow Assessment — operating cash flow vs net income divergence.` },
  { id: "ac4", label: "deep_analysis_claude()",  file: "legacy_classifier.py:37",   tokens: 1680,costPerRun: 0.0084,   model: "claude-3-opus",    impact: "critical", codebase: "cb2", prompt: `Perform a comprehensive multi-dimensional analysis of the following document. Your analysis must cover:\n\nSECTION 1 — CONTENT ANALYSIS\nIdentify the primary thesis, supporting arguments, logical structure, and rhetorical devices employed.\n\nSECTION 2 — FACTUAL ACCURACY\nCross-reference all factual claims against your training knowledge.\n\nSECTION 3 — BIAS DETECTION\nIdentify any political, cultural, commercial, or cognitive biases present.\n\nSECTION 4 — RECOMMENDATIONS\nSuggest specific improvements to strengthen the document's credibility.` },
  { id: "ac5", label: "process_documents()",     file: "batch_processor.py:22",     tokens: 820, costPerRun: 0.0041,   model: "gpt-4o",           impact: "high",     codebase: "cb3", prompt: `You are a document classification and summarization specialist. For each document provided, you must:\n\n1. Classify it into exactly one of the following categories: Legal, Financial, Technical, Marketing, HR, Executive, Customer Support, Other.\n2. Extract the top 5 key entities mentioned.\n3. Write a 3-sentence executive summary.\n4. Assign an urgency score from 1-10.\n\nReturn your response as structured JSON.` },
  { id: "ac6", label: "tag_support_tickets()",   file: "batch_processor.py:38",     tokens: 540, costPerRun: 0.0027,   model: "gpt-4o",           impact: "high",     codebase: "cb3", prompt: `You are a customer support triage assistant. Given a support ticket, assign priority (P0/P1/P2/P3), product area, issue type, sentiment, and estimated resolution time. Also determine if escalation is needed. Return a structured JSON response.` },
  { id: "ac7", label: "handleCustomerMessage()", file: "customer_service_bot.ts:44", tokens: 640, costPerRun: 0.0032,  model: "gpt-4o",           impact: "medium",   codebase: "cb4", prompt: `You are an advanced customer service AI agent for Acme Corp. Your responsibilities:\n- Resolve billing disputes, subscription changes, and refund requests\n- Troubleshoot technical issues using step-by-step diagnostic procedures\n- Escalate to human agents when: the customer requests it, legal/compliance issues arise, or you cannot resolve the issue after 3 attempts\n- Always verify customer identity before accessing account information` },
];

// ── Constants ──────────────────────────────────────────────────────────────────

const IMPACT_COLOR: Record<string, string> = { critical: "#fff", high: "#aaa", medium: "#666", low: "#444" };
const IMPACT_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const MEM_TYPE_COLOR: Record<string, string> = { context: "#74c0fc", constraint: "#ffa94d", preference: "#3ecf8e" };

// ── SVG Memory Graph ───────────────────────────────────────────────────────────

function MemoryGraph({ codebases, selected }: { codebases: Codebase[]; selected: string[] }) {
  const [hovered, setHovered] = useState<{ x: number; y: number; label: string; val: string } | null>(null);
  const W = 700; const H = 160; const PAD = { top: 12, right: 16, bottom: 28, left: 40 };
  const active = codebases.filter((c) => selected.includes(c.id));

  const allVals = active.flatMap((c) => c.history.map((h) => h.cost));
  const maxY = allVals.length ? Math.max(...allVals) * 1.15 : 10;
  const pts = 14;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  function xPos(i: number) { return r2(PAD.left + (i / (pts - 1)) * (W - PAD.left - PAD.right)); }
  function yPos(v: number) { return r2(PAD.top + (1 - v / maxY) * (H - PAD.top - PAD.bottom)); }

  const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 160 }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yPos(v)} y2={yPos(v)} stroke="#1a1a1a" strokeWidth="1" />
            <text x={PAD.left - 6} y={yPos(v) + 4} textAnchor="end" fill="#2a2a2a" fontSize="9">
              ${v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Optimization event marker at day 9 (i=8 from right → i=5 from left in 14-day window) */}
        <line x1={xPos(8)} x2={xPos(8)} y1={PAD.top} y2={H - PAD.bottom} stroke="#2a2a2a" strokeWidth="1" strokeDasharray="3,3" />
        <text x={xPos(8)} y={PAD.top - 2} textAnchor="middle" fill="#2e2e2e" fontSize="8">optimized</text>

        {/* X axis labels — show first, mid, last */}
        {[0, 4, 8, 13].map((i) => (
          active[0] && (
            <text key={i} x={xPos(i)} y={H - PAD.bottom + 14} textAnchor="middle" fill="#2a2a2a" fontSize="8">
              {active[0].history[i]?.label ?? ""}
            </text>
          )
        ))}

        {/* Lines */}
        {active.map((cb) => {
          const d = cb.history.map((h, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yPos(h.cost)}`).join(" ");
          return (
            <g key={cb.id}>
              <path d={d} fill="none" stroke={cb.color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85" />
              {cb.history.map((h, i) => (
                <circle
                  key={i}
                  cx={xPos(i)} cy={yPos(h.cost)} r="3"
                  fill={cb.color} fillOpacity="0.15" stroke={cb.color} strokeWidth="1"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHovered({ x: xPos(i), y: yPos(h.cost), label: `${cb.name} · ${h.label}`, val: `$${h.cost.toFixed(2)}` })}
                />
              ))}
            </g>
          );
        })}

        {/* Tooltip */}
        {hovered && (
          <g>
            <rect x={hovered.x + 6} y={hovered.y - 18} width={120} height={28} rx="2" fill="#111" stroke="#2a2a2a" />
            <text x={hovered.x + 12} y={hovered.y - 7} fill="#888" fontSize="8">{hovered.label}</text>
            <text x={hovered.x + 12} y={hovered.y + 4} fill="#fff" fontSize="9" fontWeight="bold">{hovered.val}</text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-1 flex-wrap">
        {active.map((cb) => (
          <div key={cb.id} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: cb.color }} />
            <span className="text-[10px]" style={{ color: cb.color }}>{cb.name}</span>
          </div>
        ))}
        {active.length === 0 && <span className="text-[10px] text-[#2a2a2a]">Select a codebase to view history</span>}
      </div>
    </div>
  );
}

// ── Optimize modal ─────────────────────────────────────────────────────────────

function OptimizeModal({ prompt, model, label, onClose }: { prompt: string; model: string; label: string; onClose: () => void }) {
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try { setResult(await optimizePrompt("demo", prompt, model, "balanced")); }
    catch { setError("Backend offline — start the backend to use AI optimization."); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
          <div>
            <div className="text-white text-sm font-medium">{label}</div>
            <div className="text-[#444] text-xs font-mono mt-0.5">model: {model}</div>
          </div>
          <button onClick={onClose} className="text-[#444] hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#444] mb-2">Current prompt</div>
            <pre className="bg-[#111] border border-[#1a1a1a] p-3 text-xs text-[#666] font-mono whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">{prompt}</pre>
          </div>
          {!result && !loading && (
            <button onClick={run} className="flex items-center gap-2 bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-[#ddd] transition-colors">
              <Zap className="w-3.5 h-3.5" /> Optimize with AI
            </button>
          )}
          {loading && <div className="flex items-center gap-2 text-[#555] text-xs"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Optimizing…</div>}
          {error && <div className="border border-[#2a1a1a] bg-[#110a0a] p-3 text-xs text-[#884444]">{error}</div>}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Original tokens", value: result.originalTokens },
                  { label: "Optimized tokens", value: result.optimizedTokens },
                  { label: "Token savings",    value: `${result.savingsPercent}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#111] border border-[#1a1a1a] p-3">
                    <div className="text-white text-lg font-bold tabular-nums">{value}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[#444] mt-1">{label}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#444] mb-2">Why it works</div>
                <p className="text-[#888] text-xs leading-relaxed">{result.explanation}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white mb-2">Optimized prompt</div>
                <pre className="bg-[#111] border border-white p-3 text-xs text-white font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">{result.optimizedPrompt}</pre>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#1a1a1a]">
                <div className="text-[#444] text-xs">Est. monthly savings: <span className="text-white">${result.estimatedMonthlySavings.toFixed(2)}</span></div>
                <button onClick={() => navigator.clipboard.writeText(result.optimizedPrompt)} className="text-xs text-[#555] hover:text-white border border-[#222] hover:border-[#444] px-3 py-1.5 transition-colors">Copy</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [selected, setSelected]     = useState<string[]>(["cb1", "cb2"]);
  const [memory, setMemory]         = useState<MemoryEntry[]>(INITIAL_MEMORY);
  const [newMem, setNewMem]         = useState("");
  const [newMemType, setNewMemType] = useState<MemoryEntry["type"]>("context");
  const [callsOpen, setCallsOpen]   = useState(false);
  const [modal, setModal]           = useState<{ prompt: string; model: string; label: string } | null>(null);

  function toggleCb(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  function addMemory() {
    if (!newMem.trim()) return;
    const cb = selected[0] ?? "cb1";
    setMemory((m) => [...m, {
      id: `m${Date.now()}`, type: newMemType, content: newMem.trim(),
      codebase: cb, ts: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }]);
    setNewMem("");
  }

  function deleteMemory(id: string) { setMemory((m) => m.filter((e) => e.id !== id)); }

  const activeCbs = CODEBASES.filter((c) => selected.includes(c.id));
  const visibleMemory = memory.filter((m) => selected.includes(m.codebase));
  const visibleCalls  = ALL_API_CALLS.filter((c) => selected.includes(c.codebase));

  const totalSaved = useMemo(() =>
    activeCbs.reduce((s, c) => s + c.spend * (c.savedPct / 100), 0), [activeCbs]);
  const totalSpend = useMemo(() =>
    activeCbs.reduce((s, c) => s + c.spend, 0), [activeCbs]);
  const avgSaved   = useMemo(() =>
    activeCbs.length ? Math.round(activeCbs.reduce((s, c) => s + c.savedPct, 0) / activeCbs.length) : 0,
    [activeCbs]);
  const totalCalls = useMemo(() =>
    activeCbs.reduce((s, c) => s + c.calls, 0), [activeCbs]);

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col">
      {modal && <OptimizeModal {...modal} onClose={() => setModal(null)} />}

      {/* Top bar */}
      <div className="border-b border-[#111] px-6 py-3 flex items-center gap-3 bg-[#050505]">
        <span className="text-white text-sm font-bold tracking-wide">Promptimize</span>
        <span className="text-[#222] text-xs border border-[#1a1a1a] px-2 py-0.5">v0.1</span>
        <div className="ml-auto flex items-center gap-4 text-[10px] text-[#333] uppercase tracking-widest">
          <span>Dashboard</span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Left sidebar: codebase selector ── */}
        <div className="w-56 border-r border-[#111] flex flex-col bg-[#030303]">
          <div className="px-4 py-3 border-b border-[#111]">
            <div className="text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]">Codebases</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {CODEBASES.map((cb) => {
              const isOn = selected.includes(cb.id);
              return (
                <button
                  key={cb.id}
                  onClick={() => toggleCb(cb.id)}
                  className={`w-full text-left px-4 py-3 border-b border-[#0d0d0d] transition-colors hover:bg-[#0d0d0d] group ${isOn ? "bg-[#0a0a0a]" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ borderColor: isOn ? cb.color : "#222", backgroundColor: isOn ? cb.color + "20" : "transparent" }}
                    >
                      {isOn && <Check className="w-2 h-2" style={{ color: cb.color }} />}
                    </div>
                    <Folder className="w-3 h-3 flex-shrink-0" style={{ color: isOn ? cb.color : "#333" }} />
                    <span className="text-xs truncate" style={{ color: isOn ? cb.color : "#444" }}>{cb.name}</span>
                  </div>
                  {isOn && (
                    <div className="mt-1.5 ml-5 space-y-0.5">
                      <div className="text-[9px] text-[#2a2a2a] truncate">{cb.path}</div>
                      <div className="flex gap-3">
                        <span className="text-[9px]" style={{ color: cb.color + "99" }}>{cb.calls} calls</span>
                        <span className="text-[9px] text-[#333]">-{cb.savedPct}%</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-[#111] text-[9px] text-[#222]">
            {selected.length}/{CODEBASES.length} selected
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-6 space-y-8">

            {/* ── Savings summary ── */}
            <div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a] mb-3">Savings overview</div>
              <div className="grid grid-cols-4 gap-px bg-[#111]">
                {[
                  { label: "Total saved",  val: `$${totalSaved.toFixed(3)}`,  sub: "across selected",   accent: "#3ecf8e" },
                  { label: "Current spend",val: `$${totalSpend.toFixed(3)}`,  sub: "per run",            accent: "#fff" },
                  { label: "Avg reduction",val: `${avgSaved}%`,               sub: "token savings",      accent: "#ffa94d" },
                  { label: "API calls",    val: totalCalls.toString(),         sub: "in selected repos",  accent: "#74c0fc" },
                ].map(({ label, val, sub, accent }) => (
                  <div key={label} className="bg-[#060606] p-4">
                    <div className="text-xl font-bold tabular-nums" style={{ color: accent }}>{val}</div>
                    <div className="text-[9px] uppercase tracking-widest text-[#333] mt-1">{label}</div>
                    <div className="text-[9px] text-[#222] mt-0.5">{sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Memory graph ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]">Cost history · last 14 days</div>
                <div className="text-[9px] text-[#222]">dashed line = optimization applied</div>
              </div>
              <div className="bg-[#060606] border border-[#111] p-4">
                <MemoryGraph codebases={CODEBASES} selected={selected} />
              </div>
            </div>

            {/* ── Project memory ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-3 h-3 text-[#2a2a2a]" />
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a]">Project memory</div>
                <span className="text-[9px] text-[#1e1e1e] border border-[#1a1a1a] px-1.5">{visibleMemory.length}</span>
              </div>

              {/* Add new memory */}
              <div className="flex gap-2 mb-3">
                <select
                  value={newMemType}
                  onChange={(e) => setNewMemType(e.target.value as MemoryEntry["type"])}
                  className="bg-[#0a0a0a] border border-[#1a1a1a] text-[10px] px-2 py-1.5 text-[#555] outline-none"
                >
                  <option value="context">context</option>
                  <option value="constraint">constraint</option>
                  <option value="preference">preference</option>
                </select>
                <input
                  value={newMem}
                  onChange={(e) => setNewMem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMemory()}
                  placeholder="Add a memory entry for the selected codebase…"
                  className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] text-xs text-[#999] px-3 py-1.5 outline-none placeholder-[#222] focus:border-[#2a2a2a]"
                />
                <button
                  onClick={addMemory}
                  className="flex items-center gap-1.5 border border-[#1a1a1a] px-3 py-1.5 text-[10px] text-[#555] hover:text-white hover:border-[#333] transition-colors"
                >
                  <Plus className="w-3 h-3" /> Save
                </button>
              </div>

              {/* Memory list */}
              <div className="space-y-px">
                {visibleMemory.length === 0 && (
                  <div className="text-[10px] text-[#1e1e1e] py-4 text-center border border-[#0d0d0d]">
                    No memory entries for selected codebases.
                  </div>
                )}
                {visibleMemory.map((entry) => {
                  const cb = CODEBASES.find((c) => c.id === entry.codebase);
                  return (
                    <div key={entry.id} className="flex items-start gap-3 bg-[#060606] border border-[#0e0e0e] px-4 py-2.5 group hover:border-[#181818]">
                      <div className="flex-shrink-0 mt-0.5">
                        <span
                          className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 font-bold"
                          style={{ color: MEM_TYPE_COLOR[entry.type], border: `1px solid ${MEM_TYPE_COLOR[entry.type]}30`, background: `${MEM_TYPE_COLOR[entry.type]}08` }}
                        >
                          {entry.type}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#888] leading-relaxed">{entry.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {cb && <span className="text-[9px]" style={{ color: cb.color + "60" }}>{cb.name}</span>}
                          <span className="text-[9px] text-[#222]">{entry.ts}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteMemory(entry.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#333] hover:text-[#ff6b6b] flex-shrink-0 mt-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── API Calls ── */}
            <div>
              <button
                onClick={() => setCallsOpen((v) => !v)}
                className="flex items-center gap-2 mb-3 group"
              >
                {callsOpen ? <ChevronDown className="w-3 h-3 text-[#2a2a2a]" /> : <ChevronRight className="w-3 h-3 text-[#2a2a2a]" />}
                <div className="text-[9px] uppercase tracking-[0.2em] text-[#2a2a2a] group-hover:text-[#444] transition-colors">API calls</div>
                <span className="text-[9px] text-[#1e1e1e] border border-[#1a1a1a] px-1.5">{visibleCalls.length}</span>
              </button>

              {callsOpen && (
                <div className="space-y-px">
                  {visibleCalls.map((call) => {
                    const cb = CODEBASES.find((c) => c.id === call.codebase);
                    return (
                      <div key={call.id} className="flex items-center justify-between bg-[#060606] border border-[#0e0e0e] px-4 py-2 group hover:border-[#181818]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: IMPACT_COLOR[call.impact] + "88" }} />
                          <span className="text-xs text-[#888] font-mono">{call.label}</span>
                          <span className="text-[9px] text-[#2a2a2a] font-mono truncate">{call.file}</span>
                          {cb && <span className="text-[9px] hidden sm:block" style={{ color: cb.color + "50" }}>{cb.name}</span>}
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-[10px] text-[#333]">{call.tokens.toLocaleString()} tok</span>
                          <span className="text-[10px] text-[#444]">${call.costPerRun.toFixed(4)}</span>
                          <span
                            className="text-[9px] px-1.5"
                            style={{ color: IMPACT_COLOR[call.impact] + "88", border: `1px solid ${IMPACT_COLOR[call.impact]}18` }}
                          >
                            {IMPACT_LABEL[call.impact]}
                          </span>
                          <button
                            onClick={() => setModal({ prompt: call.prompt, model: call.model, label: call.label })}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#444] hover:text-white"
                          >
                            <Zap className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
