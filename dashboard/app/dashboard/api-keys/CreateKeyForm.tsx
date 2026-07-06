"use client";

import { useState, useTransition } from "react";
import { createApiKey } from "@/app/actions";

export default function CreateKeyForm() {
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const { key } = await createApiKey(name);
        setCreatedKey(key);
        setName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create key");
      }
    });
  }

  function handleCopy() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (createdKey) {
    return (
      <div className="bg-green-950/50 border border-green-800/60 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-green-400 text-sm font-semibold">API key created</p>
        </div>
        <p className="text-gray-400 text-xs mb-3">Copy it now — it won&apos;t be shown again.</p>
        <div className="bg-gray-900 rounded-xl p-3 font-mono text-sm break-all text-white mb-3">
          {createdKey}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <button
            onClick={() => setCreatedKey(null)}
            className="px-4 text-sm text-gray-400 hover:text-gray-200 rounded-xl border border-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Key name (e.g. Production)"
        className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
        required
        maxLength={80}
      />
      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap"
      >
        {isPending ? "Creating…" : "Create key"}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </form>
  );
}
