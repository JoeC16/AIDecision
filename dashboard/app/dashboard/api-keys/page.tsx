import { createClient } from "@/lib/supabase/server";
import { revokeApiKey } from "@/app/actions";
import CreateKeyForm from "./CreateKeyForm";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default async function ApiKeysPage() {
  const supabase = createClient();
  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, revoked_at")
    .order("created_at", { ascending: false });

  const activeKeys = keys?.filter((k) => !k.revoked_at) ?? [];
  const revokedKeys = keys?.filter((k) => k.revoked_at) ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">API Keys</h1>
        <p className="text-gray-400 text-sm mt-1">
          Keys authenticate the Python SDK. The plaintext key is shown once at creation.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4">Create new key</h2>
        <CreateKeyForm />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-800">
          <h2 className="text-sm font-semibold">
            Active keys{" "}
            <span className="text-gray-500 font-normal">({activeKeys.length})</span>
          </h2>
        </div>

        {activeKeys.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No active keys. Create one above.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {activeKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between px-5 py-4 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-200">{key.name}</p>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">
                    {key.key_prefix}… · Created {formatDate(key.created_at)}
                  </p>
                </div>
                <form action={async () => {
                  "use server";
                  await revokeApiKey(key.id);
                }}>
                  <button
                    type="submit"
                    className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-900/50 hover:border-red-800 transition-colors flex-shrink-0"
                  >
                    Revoke
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {revokedKeys.length > 0 && (
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-500">
              Revoked keys ({revokedKeys.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-800">
            {revokedKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between px-5 py-4 gap-4 opacity-50">
                <div>
                  <p className="text-sm text-gray-400 line-through">{key.name}</p>
                  <p className="text-xs font-mono text-gray-600 mt-0.5">
                    {key.key_prefix}… · Revoked {formatDate(key.revoked_at!)}
                  </p>
                </div>
                <span className="text-xs text-gray-600 flex-shrink-0">revoked</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
