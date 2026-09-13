 "use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Analysis = {
  overall_ai_likelihood: number | null;
  confidence: string;
  word_count: number;
  high_likelihood_sections: Array<any>;
  sections: Array<any>;
  note: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState("");
  const [filename, setFilename] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [rewriteInput, setRewriteInput] = useState("");
  const [rewriteOutput, setRewriteOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload() {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setDocumentId(data.document_id);
      setFilename(data.filename);
      await analyze(data.document_id);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function analyze(id = documentId) {
    if (!id) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API}/api/analyze`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ document_id: id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed");
      setAnalysis(data);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function chat() {
    if (!documentId || !message.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({document_id: documentId, message})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Chat failed");
      setAnswer(data.answer); setSources(data.sources || []);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function rewrite() {
    if (!documentId || !rewriteInput.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API}/api/rewrite`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          document_id: documentId,
          text: rewriteInput,
          instruction: "Make this natural, clear and readable while preserving the exact meaning and facts."
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Rewrite failed");
      setRewriteOutput(data.rewritten);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="container">
      <h1>DocuSense AI</h1>
      <p className="muted">AI-likelihood analysis · RAG document chat · natural rewriting</p>

      <div className="card" style={{marginTop:20}}>
        <h2>1. Upload document</h2>
        <p className="muted">PDF, DOCX, TXT or MD · MVP limit: 8 MB</p>
        <input type="file" accept=".pdf,.docx,.txt,.md" onChange={e => setFile(e.target.files?.[0] || null)} />
        <div className="row" style={{marginTop:12}}>
          <button onClick={upload} disabled={!file || busy}>{busy ? "Processing..." : "Upload & Analyze"}</button>
          {filename && <span className="muted">{filename}</span>}
        </div>
      </div>

      {error && <div className="card" style={{marginTop:20}}><b>Error:</b> {error}</div>}

      {analysis && (
        <div className="card" style={{marginTop:20}}>
          <h2>2. Analysis</h2>
          <div className="grid">
            <div>
              <div className="muted">Overall AI-likelihood estimate</div>
              <div className="score">{analysis.overall_ai_likelihood ?? "—"}%</div>
              <div>Confidence: <b>{analysis.confidence}</b></div>
              <div className="muted">{analysis.word_count} words</div>
            </div>
            <div>
              <div className="muted">High-likelihood sections</div>
              <div className="score">{analysis.high_likelihood_sections.length}</div>
              <div className="muted">Sections with score ≥ 70</div>
            </div>
          </div>
          <p className="muted">{analysis.note}</p>
          <h3>Flagged sections</h3>
          {analysis.high_likelihood_sections.map((s, i) => (
            <div className="section" key={i}>
              <b>Page {s.page} · Chunk {s.chunk_index} · {s.score}%</b>
              <p>{s.reason}</p>
              <button onClick={() => setRewriteInput("Use the flagged document section here after adding the document text to the input below.")}>
                Select for rewrite
              </button>
            </div>
          ))}
        </div>
      )}

      {documentId && <div className="grid" style={{marginTop:20}}>
        <div className="card">
          <h2>3. Chat with document</h2>
          <textarea placeholder="Ask something about your document..." value={message} onChange={e => setMessage(e.target.value)} />
          <button style={{marginTop:10}} onClick={chat} disabled={busy}>Ask</button>
          {answer && <div className="message" style={{marginTop:14}}>{answer}</div>}
          {sources.length > 0 && <p className="muted">Sources: {sources.map(s => `p.${s.page}`).join(", ")}</p>}
        </div>

        <div className="card">
          <h2>4. Natural rewrite</h2>
          <textarea placeholder="Paste a paragraph/section to rewrite..." value={rewriteInput} onChange={e => setRewriteInput(e.target.value)} />
          <button style={{marginTop:10}} onClick={rewrite} disabled={busy}>Rewrite</button>
          {rewriteOutput && <div className="message" style={{marginTop:14}}>{rewriteOutput}</div>}
        </div>
      </div>}
    </main>
  );
}
