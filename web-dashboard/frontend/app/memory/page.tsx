"use client";
import { useEffect, useState } from "react";
import { getMemoryInsights, saveProjectContext } from "@/lib/api";

const PROJECT_ID = "sample-ai-app";

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-[#444] uppercase tracking-widest mb-2 font-mono">{children}</div>;
}

function Divider() {
  return <hr className="border-0 border-t border-[#1a1a1a] my-6" />;
}

export default function MemoryPage() {
  const [insights, setInsights]     = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [projectName, setProjectName] = useState("Sample AI App");
  const [budget, setBudget]         = useState("100");
  const [style, setStyle]           = useState("balanced");
  const [rules, setRules]           = useState(
    "Do not over-compress customer-facing prompts\nPreserve JSON output formats\nKeep step-by-step instructions intact"
  );
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

  const loadInsights = () =>
    getMemoryInsights(PROJECT_ID)
      .then(setInsights)
      .finally(() => setLoading(false));

  useEffect(() => { loadInsights(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveProjectContext(PROJECT_ID, {
        projectName,
        budget: parseFloat(budget) || 100,
        optimizationStyle: style,
        rules: rules.split("\n").filter(Boolean),
      });
      setSaved(true);
      await loadInsights();
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-white font-bold text-lg mb-1">Memory</h1>
        <p className="text-[#444] text-xs">
          Project context saved here is retrieved before every optimization — making the AI
          smarter about your codebase over time.
        </p>
      </div>

      {/* Current insights */}
      <div className="mb-6">
        <Label>Current memory</Label>
        <div className="border border-[#1a1a1a] bg-[#0d0d0d]">
          {loading ? (
            <div className="p-4 text-[#333] text-xs font-mono">Loading…</div>
          ) : insights.length === 0 ? (
            <div className="p-4 text-[#333] text-xs font-mono">No memory yet. Save context below.</div>
          ) : (
            <ul className="divide-y divide-[#1a1a1a]">
              {insights.map((insight, i) => (
                <li key={i} className="px-4 py-3 text-xs text-[#888] font-mono flex gap-3">
                  <span className="text-[#333] shrink-0">→</span>
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Divider />

      {/* Context form */}
      <div className="mb-6">
        <Label>Project context</Label>
        <p className="text-[11px] text-[#333] mb-4 font-mono leading-relaxed">
          These settings are included in every optimization call. Rules tell the optimizer
          what constraints to respect.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Label>Project name</Label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-black border border-[#1a1a1a] text-white text-xs px-3 py-2 focus:border-white focus:outline-none font-mono"
            />
          </div>
          <div>
            <Label>Monthly budget (USD)</Label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full bg-black border border-[#1a1a1a] text-white text-xs px-3 py-2 focus:border-white focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="mb-4">
          <Label>Default optimization style</Label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="bg-black border border-[#1a1a1a] text-white text-xs px-3 py-2 focus:border-white focus:outline-none"
          >
            {["balanced", "aggressive", "safe"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="mb-6">
          <Label>Rules — one per line</Label>
          <p className="text-[10px] text-[#333] mb-2 font-mono">
            These become hard constraints for the optimizer. Be specific.
          </p>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={6}
            className="w-full bg-black border border-[#1a1a1a] text-white text-xs font-mono px-4 py-3 focus:border-white focus:outline-none resize-none leading-relaxed"
            placeholder="Do not remove JSON output requirements&#10;Keep legal disclaimers intact&#10;Preserve step-by-step format"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-white text-black text-xs font-semibold px-6 py-2.5 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save to memory"}
        </button>
      </div>
    </div>
  );
}
