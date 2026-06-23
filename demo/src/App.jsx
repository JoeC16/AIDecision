import { useState, useEffect, useRef } from "react";

const PALETTE = {
  bg: "#0A0E1A",
  surface: "#111827",
  surfaceHigh: "#1A2235",
  border: "#1E2D40",
  accent: "#00D4AA",
  accentDim: "#00D4AA22",
  amber: "#F59E0B",
  red: "#EF4444",
  textPrimary: "#F1F5F9",
  textSecondary: "#64748B",
  textMuted: "#374151",
};

const FAKE_DECISIONS = Array.from({ length: 47 }, (_, i) => ({
  id: `DEC-${String(2001 + i).padStart(4, "0")}`,
  systemId: i % 3 === 0 ? "credit-scoring-v2" : i % 3 === 1 ? "fraud-detection-v1" : "loan-eligibility-v3",
  model: i % 3 === 0 ? "gpt-4o-2024-08-06" : i % 3 === 1 ? "claude-sonnet-4-6" : "gpt-4o-mini-2024-07-18",
  timestamp: new Date(Date.now() - (47 - i) * 3600000 * 2.3).toISOString(),
  inputSummary: i % 3 === 0 ? "Credit application: applicant age 34, income £42k, 3yr history" : i % 3 === 1 ? "Transaction £2,340 flagged: velocity anomaly detected" : "Loan request £85,000, LTV 72%, employment verified",
  output: i % 3 === 0 ? (i % 5 === 0 ? "DECLINED — insufficient credit history" : "APPROVED — risk score 0.23") : i % 3 === 1 ? (i % 4 === 0 ? "BLOCK — confidence 0.94" : "PASS — confidence 0.12") : (i % 6 === 0 ? "REFER — manual review required" : "APPROVED — risk band B"),
  hash: `sha256:${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`,
  verified: true,
  riskTier: i % 3 === 0 ? "high" : i % 3 === 1 ? "high" : "limited",
  latency: Math.floor(Math.random() * 180 + 40),
}));

const SYSTEMS = [
  { id: "credit-scoring-v2", name: "Credit Scoring v2", riskTier: "high", decisions: 18, lastActive: "2 min ago", status: "active" },
  { id: "fraud-detection-v1", name: "Fraud Detection v1", riskTier: "high", decisions: 16, lastActive: "8 min ago", status: "active" },
  { id: "loan-eligibility-v3", name: "Loan Eligibility v3", riskTier: "limited", decisions: 13, lastActive: "23 min ago", status: "active" },
];

function HashReveal({ hash, active }) {
  const [revealed, setRevealed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) { setRevealed(""); setDone(false); return; }
    setRevealed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setRevealed(hash.slice(0, i));
      if (i >= hash.length) { clearInterval(interval); setDone(true); }
    }, 18);
    return () => clearInterval(interval);
  }, [hash, active]);
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: done ? PALETTE.accent : PALETTE.textSecondary, letterSpacing: "0.02em", wordBreak: "break-all" }}>
      {active ? revealed : hash}
      {active && !done && <span style={{ opacity: 0.6, animation: "blink 0.5s step-end infinite" }}>█</span>}
    </span>
  );
}

function VerifiedBadge({ verified }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: verified ? "#00D4AA15" : "#EF444415", border: `1px solid ${verified ? "#00D4AA40" : "#EF444440"}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, color: verified ? PALETTE.accent : PALETTE.red, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, letterSpacing: "0.05em" }}>
      {verified ? "✓ VERIFIED" : "✗ TAMPERED"}
    </span>
  );
}

function RiskBadge({ tier }) {
  const colors = { high: { bg: "#EF444415", border: "#EF444440", text: "#EF4444" }, limited: { bg: "#F59E0B15", border: "#F59E0B40", text: "#F59E0B" }, minimal: { bg: "#00D4AA15", border: "#00D4AA40", text: "#00D4AA" } };
  const c = colors[tier] || colors.minimal;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, color: c.text, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
      {tier}
    </span>
  );
}

function SDKPanel() {
  const [copied, setCopied] = useState(false);
  const code = `import aidecision\n\nclient = aidecision.wrap(\n    openai_client,\n    system_id="credit-scoring-v2"\n)\n\n# Your existing code — unchanged\nresponse = client.chat.completions.create(\n    model="gpt-4o",\n    messages=[{"role": "user", "content": prompt}]\n)\n\n# Every decision now logged, hashed,\n# and timestamped automatically.`;
  return (
    <div style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${PALETTE.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.05em" }}>PYTHON SDK — 3 LINES TO INTEGRATE</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ background: "none", border: `1px solid ${PALETTE.border}`, borderRadius: 4, padding: "4px 10px", color: copied ? PALETTE.accent : PALETTE.textSecondary, fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: "20px", fontSize: 13, lineHeight: 1.7, color: PALETTE.textPrimary, fontFamily: "'IBM Plex Mono', monospace", overflowX: "auto", background: "#0D1421" }}>
        <code>{code.split("\n").map((line, i) => {
          if (line.startsWith("import") || line.startsWith("from")) return <span key={i} style={{ color: "#7DD3FC" }}>{line}{"\n"}</span>;
          if (line.includes("aidecision.wrap") || line.includes("system_id")) return <span key={i} style={{ color: PALETTE.accent }}>{line}{"\n"}</span>;
          if (line.startsWith("#")) return <span key={i} style={{ color: PALETTE.textSecondary }}>{line}{"\n"}</span>;
          if (line.includes('"') || line.includes("'")) return <span key={i} style={{ color: "#FCD34D" }}>{line}{"\n"}</span>;
          return <span key={i} style={{ color: PALETTE.textPrimary }}>{line}{"\n"}</span>;
        })}</code>
      </pre>
    </div>
  );
}

function DecisionModal({ decision, onClose }) {
  const [hashActive, setHashActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHashActive(true), 400);
    return () => clearTimeout(t);
  }, []);

  const exportPDF = () => {
    const content = `AI DECISION AUDIT RECORD\n${"=".repeat(60)}\n\nEvidential Reference: ${decision.id}\nIssued by: AiDecision Audit Infrastructure\nDocument Status: CRYPTOGRAPHICALLY VERIFIED\n\n${"─".repeat(60)}\nDECISION METADATA\n${"─".repeat(60)}\n\nDecision ID:     ${decision.id}\nAI System:       ${decision.systemId}\nModel Version:   ${decision.model}\nTimestamp:       ${new Date(decision.timestamp).toUTCString()}\nRisk Tier:       ${decision.riskTier.toUpperCase()} (EU AI Act Annex III)\nLatency:         ${decision.latency}ms\n\n${"─".repeat(60)}\nINPUT RECORD\n${"─".repeat(60)}\n\n${decision.inputSummary}\n\n${"─".repeat(60)}\nDECISION OUTPUT\n${"─".repeat(60)}\n\n${decision.output}\n\n${"─".repeat(60)}\nCRYPTOGRAPHIC INTEGRITY\n${"─".repeat(60)}\n\nIntegrity Hash:  ${decision.hash}\nVerification:    PASSED — record unmodified since capture\nTimestamp Auth:  RFC 3161 compliant\nStorage:         WORM-compliant, EU-resident (Frankfurt)\n\n${"─".repeat(60)}\nREGULATORY STATEMENT\n${"─".repeat(60)}\n\nThis record constitutes a complete, tamper-evident audit trail\nfor the above AI-assisted decision, captured at the moment of\nexecution. This document is suitable for submission to national\ncompetent authorities under EU AI Act Article 12 (Record-keeping)\nand Article 26 (Obligations of deployers).\n\nRetention period: 10 years from date of capture.\n\n${"─".repeat(60)}\nGenerated: ${new Date().toUTCString()}\nAiDecision Audit Infrastructure — audit.aidecision.io`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${decision.id}-audit-record.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }} onClick={onClose}>
      <div style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 12, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${PALETTE.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", marginBottom: 4 }}>AUDIT RECORD</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: PALETTE.textPrimary, fontFamily: "'IBM Plex Mono', monospace" }}>{decision.id}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <VerifiedBadge verified={decision.verified} />
            <button onClick={onClose} style={{ background: "none", border: `1px solid ${PALETTE.border}`, borderRadius: 6, width: 32, height: 32, color: PALETTE.textSecondary, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["AI System", decision.systemId],
              ["Model Version", decision.model],
              ["Timestamp", new Date(decision.timestamp).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" })],
              ["Risk Tier", null, <RiskBadge key="r" tier={decision.riskTier} />],
              ["Response Latency", `${decision.latency}ms`],
              ["Storage", "EU — Frankfurt (WORM)"],
            ].map(([label, value, node]) => (
              <div key={label} style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 6, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", marginBottom: 6 }}>{label.toUpperCase()}</div>
                {node || <div style={{ fontSize: 13, color: PALETTE.textPrimary, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>}
              </div>
            ))}
          </div>

          <div style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", marginBottom: 8 }}>INPUT RECORD</div>
            <div style={{ fontSize: 13, color: PALETTE.textPrimary, lineHeight: 1.6 }}>{decision.inputSummary}</div>
          </div>

          <div style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", marginBottom: 8 }}>DECISION OUTPUT</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: decision.output.startsWith("APPROVED") ? PALETTE.accent : decision.output.startsWith("DECLINED") || decision.output.startsWith("BLOCK") ? PALETTE.red : PALETTE.amber, fontFamily: "'IBM Plex Mono', monospace" }}>{decision.output}</div>
          </div>

          <div style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.accent}22`, borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em" }}>INTEGRITY HASH — SHA-256</div>
              <VerifiedBadge verified={true} />
            </div>
            <HashReveal hash={decision.hash} active={hashActive} />
            <div style={{ marginTop: 8, fontSize: 11, color: PALETTE.textSecondary }}>Record unmodified since capture · RFC 3161 timestamped · EU-resident storage</div>
          </div>

          <button onClick={exportPDF} style={{ background: PALETTE.accent, color: "#0A0E1A", border: "none", borderRadius: 8, padding: "14px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter, sans-serif", letterSpacing: "0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            ↓ Export Evidence Package
          </button>
          <div style={{ fontSize: 11, color: PALETTE.textSecondary, textAlign: "center", marginTop: -8 }}>Generates a regulator-ready audit document — EU AI Act Article 12 compliant</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("explorer");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [liveCount, setLiveCount] = useState(47);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveCount(c => c + 1);
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  const filtered = FAKE_DECISIONS.filter(d =>
    d.id.toLowerCase().includes(search.toLowerCase()) ||
    d.systemId.toLowerCase().includes(search.toLowerCase()) ||
    d.output.toLowerCase().includes(search.toLowerCase()) ||
    d.model.toLowerCase().includes(search.toLowerCase())
  ).slice().reverse();

  return (
    <div style={{ minHeight: "100vh", background: PALETTE.bg, color: PALETTE.textPrimary, fontFamily: "Inter, -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1E2D40; border-radius: 3px; }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulseGlow { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        .decision-row:hover { background: #1A2235 !important; cursor: pointer; }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: Inter, sans-serif; font-size: 13px; font-weight: 500; padding: 8px 0; transition: color 0.15s; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${PALETTE.border}`, padding: "0 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: PALETTE.accent, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#0A0E1A", fontFamily: "'IBM Plex Mono', monospace" }}>⬡</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>AiDecision</span>
            <span style={{ fontSize: 11, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", background: PALETTE.surfaceHigh, border: `1px solid ${PALETTE.border}`, borderRadius: 4, padding: "2px 6px" }}>AUDIT INFRASTRUCTURE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: PALETTE.accent, animation: pulse ? "pulseGlow 0.6s ease" : "none" }} />
              <span style={{ fontSize: 12, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace" }}>
                <span style={{ color: pulse ? PALETTE.accent : PALETTE.textPrimary, transition: "color 0.3s" }}>{liveCount.toLocaleString()}</span> decisions logged
              </span>
            </div>
            <div style={{ width: 1, height: 20, background: PALETTE.border }} />
            <div style={{ fontSize: 12, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace" }}>Acme Financial Ltd</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${PALETTE.border}`, padding: "0 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 28 }}>
          {[["explorer", "Decision Explorer"], ["inventory", "System Inventory"], ["sdk", "SDK Integration"]].map(([key, label]) => (
            <button key={key} className="tab-btn" onClick={() => setTab(key)} style={{ color: tab === key ? PALETTE.accent : PALETTE.textSecondary, borderBottom: `2px solid ${tab === key ? PALETTE.accent : "transparent"}`, paddingBottom: 14, paddingTop: 14 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px" }}>

        {/* Decision Explorer */}
        {tab === "explorer" && (
          <div style={{ animation: "fadeIn 0.2s ease" }}>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Decision Explorer</h1>
              <p style={{ margin: 0, color: PALETTE.textSecondary, fontSize: 14 }}>Search, verify, and export audit records for any AI decision. Regulator-ready in seconds.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                ["Total Decisions", liveCount.toLocaleString(), PALETTE.accent],
                ["Verified Clean", `${liveCount.toLocaleString()}`, PALETTE.accent],
                ["High-Risk Systems", "2", PALETTE.amber],
                ["Avg Latency", "94ms", PALETTE.textPrimary],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "16px 18px" }}>
                  <div style={{ fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", marginBottom: 8 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${PALETTE.border}` }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by decision ID, system, model, or outcome..."
                  style={{ width: "100%", background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 6, padding: "10px 14px", color: PALETTE.textPrimary, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", outline: "none" }}
                />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                      {["Decision ID", "System", "Model", "Timestamp", "Output", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", fontWeight: 600, whiteSpace: "nowrap" }}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 20).map((d, i) => (
                      <tr key={d.id} className="decision-row" onClick={() => setSelected(d)} style={{ borderBottom: `1px solid ${PALETTE.border}`, background: "transparent", transition: "background 0.1s" }}>
                        <td style={{ padding: "12px 16px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: PALETTE.accent, whiteSpace: "nowrap" }}>{d.id}</td>
                        <td style={{ padding: "12px 16px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: PALETTE.textPrimary, whiteSpace: "nowrap" }}>{d.systemId}</td>
                        <td style={{ padding: "12px 16px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: PALETTE.textSecondary, whiteSpace: "nowrap" }}>{d.model}</td>
                        <td style={{ padding: "12px 16px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: PALETTE.textSecondary, whiteSpace: "nowrap" }}>{new Date(d.timestamp).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: d.output.startsWith("APPROVED") || d.output.startsWith("PASS") ? PALETTE.accent : d.output.startsWith("DECLINED") || d.output.startsWith("BLOCK") ? PALETTE.red : PALETTE.amber, fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap" }}>{d.output.split(" — ")[0]}</td>
                        <td style={{ padding: "12px 16px" }}><VerifiedBadge verified={d.verified} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div style={{ padding: "48px 24px", textAlign: "center", color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>No decisions match your search</div>
                )}
              </div>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${PALETTE.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace" }}>Showing {Math.min(20, filtered.length)} of {filtered.length} records</span>
                <span style={{ fontSize: 11, color: PALETTE.textSecondary }}>Click any row to view full audit record and export evidence package</span>
              </div>
            </div>
          </div>
        )}

        {/* System Inventory */}
        {tab === "inventory" && (
          <div style={{ animation: "fadeIn 0.2s ease" }}>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>System Inventory</h1>
              <p style={{ margin: 0, color: PALETTE.textSecondary, fontSize: 14 }}>Every AI system in your organisation. Classified, monitored, audit-ready.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
              {[["AI Systems Registered", "3"], ["High-Risk (Annex III)", "2"], ["Compliant Systems", "3 / 3"]].map(([label, value]) => (
                <div key={label} style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "16px 18px" }}>
                  <div style={{ fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.1em", marginBottom: 8 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: PALETTE.accent, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {SYSTEMS.map(sys => (
                <div key={sys.id} style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE.accent }} />
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{sys.name}</span>
                        <RiskBadge tier={sys.riskTier} />
                      </div>
                      <div style={{ fontSize: 12, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", marginLeft: 18 }}>{sys.id}</div>
                    </div>
                    <VerifiedBadge verified={true} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {[
                      ["Decisions Logged", sys.decisions.toString()],
                      ["Last Activity", sys.lastActive],
                      ["EU AI Act Article", "12 — Record Keeping"],
                      ["Audit Status", "Active"],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 6, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: PALETTE.textSecondary, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.08em", marginBottom: 4 }}>{label.toUpperCase()}</div>
                        <div style={{ fontSize: 13, color: PALETTE.textPrimary, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {sys.riskTier === "high" && (
                    <div style={{ marginTop: 14, background: "#F59E0B08", border: `1px solid #F59E0B22`, borderRadius: 6, padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: PALETTE.amber, fontSize: 12 }}>⚠</span>
                      <span style={{ fontSize: 12, color: PALETTE.textSecondary, lineHeight: 1.5 }}>High-risk system under EU AI Act Annex III. Full audit trail active. Human oversight documentation required by December 2027.</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SDK Integration */}
        {tab === "sdk" && (
          <div style={{ animation: "fadeIn 0.2s ease" }}>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>SDK Integration</h1>
              <p style={{ margin: 0, color: PALETTE.textSecondary, fontSize: 14 }}>Three lines of code. Every AI decision logged, hashed, and audit-ready from that moment forward.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
              {[["Integration Time", "~5 min"], ["Lines of Code", "3"], ["Latency Added", "< 5ms"], ["Data Residency", "EU — Frankfurt"]].map(([label, value]) => (
                <div key={label} style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: PALETTE.textSecondary }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: PALETTE.accent, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
                </div>
              ))}
            </div>

            <SDKPanel />

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                ["What gets captured", "Input payload, model version, output, timestamp, decision ID, system ID — at the moment of execution."],
                ["How integrity is proved", "SHA-256 hash of every record. Hash stored separately from data. Any tampering is immediately detectable."],
                ["What you can export", "Regulator-ready evidence package per decision. Suitable for EU AI Act Article 12 submissions and legal proceedings."],
              ].map(([title, body]) => (
                <div key={title} style={{ background: PALETTE.surface, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: PALETTE.textPrimary, marginBottom: 8 }}>{title}</div>
                  <div style={{ fontSize: 13, color: PALETTE.textSecondary, lineHeight: 1.6 }}>{body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && <DecisionModal decision={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
