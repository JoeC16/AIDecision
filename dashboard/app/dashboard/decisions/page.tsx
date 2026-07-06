import { createClient } from "@/lib/supabase/server";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: { system?: string; env?: string; page?: string };
}) {
  const supabase = createClient();
  const page = Math.max(1, parseInt(searchParams.page ?? "1"));
  const pageSize = 25;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("decision_events")
    .select("id, decision_id, system_id, model, provider, environment, hash_verified, captured_at, latency_ms", { count: "exact" })
    .order("captured_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (searchParams.system) query = query.eq("system_id", searchParams.system);
  if (searchParams.env) query = query.eq("environment", searchParams.env);

  const { data: decisions, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Decisions</h1>
        <p className="text-gray-400 text-sm mt-1">
          {count != null ? `${count.toLocaleString()} total` : ""}
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {!decisions || decisions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-400 text-sm">No decisions recorded yet.</p>
            <p className="text-gray-600 text-xs mt-1">Use the Python SDK with a valid API key to start capturing events.</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-800">
              {decisions.map((d) => (
                <div key={d.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-xs font-mono text-gray-300 truncate flex-1">{d.decision_id}</p>
                    <span className={`text-xs flex-shrink-0 ${d.hash_verified ? "text-green-400" : "text-red-400"}`}>
                      {d.hash_verified ? "✓ verified" : "✗ mismatch"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {d.system_id} · {d.model || d.provider || "—"} · {d.environment}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{formatDate(d.captured_at)}</p>
                  {d.latency_ms != null && (
                    <p className="text-xs text-gray-600">{d.latency_ms.toFixed(0)} ms</p>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Decision ID</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">System</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Model</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Environment</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Latency</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Verified</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Captured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {decisions.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 max-w-[180px] truncate">{d.decision_id}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{d.system_id}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{d.model || d.provider || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          d.environment === "production" ? "bg-gray-800 text-gray-300" : "bg-yellow-900/40 text-yellow-400"
                        }`}>
                          {d.environment}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {d.latency_ms != null ? `${d.latency_ms.toFixed(0)} ms` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${d.hash_verified ? "text-green-400" : "text-red-400"}`}>
                          {d.hash_verified ? "✓" : "✗"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(d.captured_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
                <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  {page > 1 && (
                    <a href={`?page=${page - 1}`} className="text-xs text-blue-400 hover:text-blue-300">
                      ← Prev
                    </a>
                  )}
                  {page < totalPages && (
                    <a href={`?page=${page + 1}`} className="text-xs text-blue-400 hover:text-blue-300">
                      Next →
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
