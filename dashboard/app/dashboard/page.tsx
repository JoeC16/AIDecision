import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

async function getStats(supabase: ReturnType<typeof createClient>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, todayCount, keys, verified] = await Promise.all([
    supabase.from("decision_events").select("*", { count: "exact", head: true }),
    supabase.from("decision_events").select("*", { count: "exact", head: true }).gte("captured_at", today.toISOString()),
    supabase.from("api_keys").select("*", { count: "exact", head: true }).is("revoked_at", null),
    supabase.from("decision_events").select("*", { count: "exact", head: true }).eq("hash_verified", true),
  ]);

  const totalCount = total.count ?? 0;
  return {
    total: totalCount,
    today: todayCount.count ?? 0,
    activeKeys: keys.count ?? 0,
    verifiedPct: totalCount > 0 ? Math.round(((verified.count ?? 0) / totalCount) * 100) : 100,
  };
}

async function getRecentDecisions(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("decision_events")
    .select("id, decision_id, system_id, model, provider, environment, hash_verified, captured_at")
    .order("captured_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

export default async function DashboardPage() {
  const supabase = createClient();
  const [stats, recent] = await Promise.all([
    getStats(supabase),
    getRecentDecisions(supabase),
  ]);

  const statCards = [
    { label: "Total decisions", value: stats.total.toLocaleString(), color: "text-white" },
    { label: "Today", value: stats.today.toLocaleString(), color: "text-blue-400" },
    { label: "Active API keys", value: stats.activeKeys.toLocaleString(), color: "text-white" },
    { label: "Hash verified", value: `${stats.verifiedPct}%`, color: stats.verifiedPct === 100 ? "text-green-400" : "text-yellow-400" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-gray-400 text-sm mt-1">Your AI decision audit dashboard</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="font-semibold text-sm">Recent decisions</h2>
          <Link href="/dashboard/decisions" className="text-xs text-blue-400 hover:text-blue-300">
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm font-medium">No decisions yet</p>
            <p className="text-gray-600 text-xs mt-1 mb-4">Create an API key and wrap your AI client to start capturing decisions.</p>
            <Link href="/dashboard/api-keys" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors">
              Create API key →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {recent.map((d) => (
              <div key={d.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-gray-200 truncate">{d.decision_id}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{d.system_id} · {d.model || d.provider}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    d.environment === "production" ? "bg-gray-800 text-gray-300" : "bg-yellow-900/40 text-yellow-400"
                  }`}>
                    {d.environment}
                  </span>
                  <span className={`text-xs ${d.hash_verified ? "text-green-400" : "text-red-400"}`}>
                    {d.hash_verified ? "✓" : "✗"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
