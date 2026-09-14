"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Analysis = {
  document_id: string;
  overall_ai_likelihood: number;
  confidence: string;
  word_count: number;
  sections: Array<{
    chunk_index: number;
    page: number;
    score: number | null;
    confidence: string;
    reason: string;
  }>;
  note: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

type HistoryEntry = {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
};

// One entry per uploaded document. Everything scoped to a single document
// (its chat thread, its analysis, its history, its editable draft) lives
// here so the app can hold several documents open at once and switch
// between them — each one still just talks to the existing single-document
// /api/upload, /api/analyze and /api/chat endpoints under the hood.
type DocumentEntry = {
  id: string;
  file: File;
  filename: string;
  url: string;
  analysis: Analysis | null;
  analyzing: boolean;
  thinking: boolean;
  messages: Message[];
  history: HistoryEntry[];
  editText: string;
  editIsOriginal: boolean; // true = editText holds the real file content (.txt)
};

type Theme = "dark" | "light";

type ActionKind = "focus" | "send" | "prefill" | "history" | "soon";

type ActionItem = {
  id: string;
  icon: string;
  label: string;
  kind: ActionKind;
  prompt?: string;
};

// Every "send" / "prefill" action rides the existing /api/chat endpoint —
// no backend changes. "soon" items genuinely need backend work (auth,
// storage, true cross-document search) and are shown disabled rather than
// faked.
const AI_ACTIONS: ActionItem[] = [
  { id: "ask", icon: "💬", label: "Ask / discuss document", kind: "focus" },
  {
    id: "summary",
    icon: "📄",
    label: "Smart summary",
    kind: "send",
    prompt: "Give me a concise, well-structured summary of this document.",
  },
  {
    id: "generate",
    icon: "✨",
    label: "Generate content",
    kind: "prefill",
    prompt: "Using this document as reference, generate ",
  },
  {
    id: "email",
    icon: "📧",
    label: "Email/message drafting",
    kind: "prefill",
    prompt: "Draft a professional email based on this document that ",
  },
  {
    id: "rewrite",
    icon: "✍️",
    label: "Smart rewrite",
    kind: "send",
    prompt: "Rewrite this document's key points in clearer, more natural language.",
  },
  {
    id: "insights",
    icon: "🔍",
    label: "Document insights",
    kind: "send",
    prompt: "What are the most important insights and takeaways from this document?",
  },
  {
    id: "citations",
    icon: "📌",
    label: "Citation/source references",
    kind: "send",
    prompt:
      "List the key claims in this document along with the section or page each comes from.",
  },
  { id: "compare", icon: "🔄", label: "Document comparison", kind: "soon" },
  {
    id: "extract",
    icon: "📊",
    label: "Structured extraction",
    kind: "send",
    prompt: "Extract the key data from this document into a structured table.",
  },
  {
    id: "translate",
    icon: "🌐",
    label: "Translation",
    kind: "prefill",
    prompt: "Translate the key points of this document into ",
  },
  {
    id: "quiz",
    icon: "🎓",
    label: "Quiz generation",
    kind: "send",
    prompt: "Create a short 5-question quiz based on this document to test understanding.",
  },
  {
    id: "mindmap",
    icon: "🧠",
    label: "Mind map",
    kind: "send",
    prompt: "Outline this document as a hierarchical mind map using nested bullet points.",
  },
  {
    id: "presentation",
    icon: "🎤",
    label: "Presentation generation",
    kind: "send",
    prompt: "Turn this document into a slide-by-slide presentation outline.",
  },
  {
    id: "resume",
    icon: "💼",
    label: "Resume/job matching",
    kind: "prefill",
    prompt: "Compare this document against the following job description and assess the fit: ",
  },
  {
    id: "accounts",
    icon: "🔐",
    label: "User accounts & private workspaces",
    kind: "soon",
  },
  {
    id: "kb",
    icon: "📚",
    label: "Multi-document knowledge bases",
    kind: "soon",
  },
  {
    id: "history",
    icon: "📈",
    label: "Document history & version comparison",
    kind: "history",
  },
];

// Minimal shape of the Web Speech API so this compiles without extra
// @types packages. Voice input degrades gracefully where unsupported.
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function loadHistory(id: string): HistoryEntry[] {
  try {
    const stored = window.localStorage.getItem(`qm-history-${id}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(id: string, history: HistoryEntry[]) {
  try {
    window.localStorage.setItem(`qm-history-${id}`, JSON.stringify(history));
  } catch {
    // best-effort only
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>("dark");

  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [activeId, setActiveId] = useState("");

  const [question, setQuestion] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState("");

  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionCenterRef = useRef<HTMLDivElement | null>(null);

  const active = documents.find((d) => d.id === activeId) || null;
  const messages = active?.messages ?? [];
  const history = active?.history ?? [];
  const analysis = active?.analysis ?? null;
  const analyzing = active?.analyzing ?? false;
  const thinking = active?.thinking ?? false;
  const documentId = active?.id ?? "";
  const filename = active?.filename ?? "";
  const fileUrl = active?.url ?? "";

  const busy = thinking || messages.some((m) => m.streaming);
  const isUnfinishedTemplate =
    pendingTemplate !== "" && question.trim() === pendingTemplate.trim();

  // ---- Theme ----
  useEffect(() => {
    const stored = window.localStorage.getItem("qm-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("qm-theme", next);
      return next;
    });
  };

  const updateDoc = (
    id: string,
    updater: (doc: DocumentEntry) => DocumentEntry
  ) => {
    setDocuments((docs) => docs.map((d) => (d.id === id ? updater(d) : d)));
  };

  // Revoke every object URL on unmount only — per-document URLs are
  // revoked individually when that document is removed.
  useEffect(() => {
    return () => {
      documents.forEach((d) => URL.revokeObjectURL(d.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewDocument = () => {
    if (fileUrl) window.open(fileUrl, "_blank", "noopener,noreferrer");
  };

  const clearHistory = () => {
    if (!active) return;
    updateDoc(active.id, (d) => ({ ...d, history: [] }));
    saveHistory(active.id, []);
  };

  // ---- Close the action center when clicking outside it ----
  useEffect(() => {
    if (!actionCenterOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        actionCenterRef.current &&
        !actionCenterRef.current.contains(e.target as Node)
      ) {
        setActionCenterOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionCenterOpen]);

  // ---- Auto-scroll the chat pane only ----
  useEffect(() => {
    const el = chatMessagesRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, thinking]);

  // ---- Voice input (Web Speech API) ----
  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setVoiceSupported(false);
      return;
    }

    setVoiceSupported(true);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = "";
      let isFinal = false;

      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }

      setQuestion(transcript);

      if (isFinal) {
        setListening(false);
        setTimeout(() => sendQuestion(transcript), 150);
      }
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    setQuestion("");
    setListening(true);
    recognitionRef.current.start();
  };

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, []);

  const validateFile = (candidate: File) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    const validExtension = /\.(pdf|docx|txt)$/i.test(candidate.name);
    return allowed.includes(candidate.type) || validExtension;
  };

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const valid = incoming.filter(validateFile);

    if (valid.length === 0) {
      setError("Please upload PDF, DOCX, or TXT files.");
      return;
    }

    setError("");
    setUploadProgress({ current: 0, total: valid.length });

    let lastUploadedId = "";

    for (let i = 0; i < valid.length; i++) {
      setUploadProgress({ current: i + 1, total: valid.length });
      const newId = await uploadOne(valid[i]);
      if (newId) lastUploadedId = newId;
    }

    setUploadProgress(null);

    if (lastUploadedId) {
      setActiveId(lastUploadedId);
      setSidebarCollapsed(true);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Uploads a single file through the existing /api/upload + /api/analyze
  // endpoints (unchanged) and adds it as a new document entry. Returns the
  // new document's id so the caller can decide which one to activate.
  const uploadOne = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || `Upload failed for ${file.name}.`);
      }

      const id: string = data.document_id;
      const isPlainText = /\.txt$/i.test(file.name) || file.type === "text/plain";
      const editText = isPlainText ? await readFileAsText(file).catch(() => "") : "";

      const entry: DocumentEntry = {
        id,
        file,
        filename: data.filename || file.name,
        url: URL.createObjectURL(file),
        analysis: null,
        analyzing: true,
        thinking: false,
        messages: [],
        history: loadHistory(id),
        editText,
        editIsOriginal: isPlainText,
      };

      setDocuments((docs) => [...docs, entry]);
      analyzeDocument(id);

      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Upload failed for ${file.name}.`);
      return null;
    }
  };

  const analyzeDocument = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Analysis failed.");
      }

      updateDoc(id, (d) => ({ ...d, analysis: data, analyzing: false }));
    } catch (err) {
      updateDoc(id, (d) => ({ ...d, analyzing: false }));
      setError(err instanceof Error ? err.message : "Analysis failed.");
    }
  };

  // Reveals text word-by-word in the last message of the given document,
  // purely on the client. Backend behavior (fetch + full JSON response)
  // is unchanged.
  const streamAssistantReply = (targetId: string, fullText: string) => {
    const words = fullText.split(" ");
    let i = 0;

    updateDoc(targetId, (d) => ({
      ...d,
      messages: [...d.messages, { role: "assistant", content: "", streaming: true }],
    }));

    if (streamTimerRef.current) clearInterval(streamTimerRef.current);

    streamTimerRef.current = setInterval(() => {
      i += 1;
      const revealed = words.slice(0, i).join(" ");
      const done = i >= words.length;

      updateDoc(targetId, (d) => {
        const updated = [...d.messages];
        const lastIndex = updated.length - 1;
        if (lastIndex < 0) return d;
        updated[lastIndex] = {
          role: "assistant",
          content: revealed,
          streaming: !done,
        };
        return { ...d, messages: updated };
      });

      if (done && streamTimerRef.current) {
        clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
      }
    }, 45);
  };

  const sendQuestion = async (rawQuestion: string) => {
    const userMessage = rawQuestion.trim();
    const targetId = activeId;
    const targetDoc = documents.find((d) => d.id === targetId);
    if (!userMessage || !targetId || (targetDoc && targetDoc.thinking)) return;

    setQuestion("");
    updateDoc(targetId, (d) => ({
      ...d,
      messages: [...d.messages, { role: "user", content: userMessage }],
      thinking: true,
    }));
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: targetId,
          message: userMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Chat request failed.");
      }

      const answerText = data.answer || "I couldn't generate an answer.";

      updateDoc(targetId, (d) => {
        const newHistory = [
          ...d.history,
          {
            id: makeId(),
            question: userMessage,
            answer: answerText,
            timestamp: Date.now(),
          },
        ];
        saveHistory(targetId, newHistory);
        return { ...d, thinking: false, history: newHistory };
      });

      streamAssistantReply(targetId, answerText);
    } catch (err) {
      updateDoc(targetId, (d) => ({ ...d, thinking: false }));
      setError(err instanceof Error ? err.message : "Chat request failed.");
    }
  };

  const askQuestion = () => {
    if (isUnfinishedTemplate) return;
    sendQuestion(question);
  };

  const handleAction = (action: ActionItem) => {
    if (action.kind === "soon") return;

    setActionCenterOpen(false);

    if (action.kind === "history") {
      setHistoryOpen(true);
      return;
    }

    if (!documentId) return;

    if (action.kind === "focus") {
      setPendingTemplate("");
      textareaRef.current?.focus();
      return;
    }

    if (action.kind === "send" && action.prompt) {
      setPendingTemplate("");
      sendQuestion(action.prompt);
      return;
    }

    if (action.kind === "prefill" && action.prompt) {
      // These prompts are deliberately incomplete ("Translate this document
      // into ", "Draft an email that ...") — the user needs to add the
      // missing detail. We block sending until they do, instead of letting
      // an unfinished template go straight to the model.
      setQuestion(action.prompt);
      setPendingTemplate(action.prompt);
      textareaRef.current?.focus();
    }
  };

  const removeDocument = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (doc) URL.revokeObjectURL(doc.url);

    setDocuments((docs) => docs.filter((d) => d.id !== id));

    if (activeId === id) {
      const remaining = documents.filter((d) => d.id !== id);
      setActiveId(remaining.length > 0 ? remaining[remaining.length - 1].id : "");
    }

    setQuestion("");
    setPendingTemplate("");
    setError("");
  };

  const clearAllDocuments = () => {
    documents.forEach((d) => URL.revokeObjectURL(d.url));
    setDocuments([]);
    setActiveId("");
    setQuestion("");
    setPendingTemplate("");
    setError("");
    setSidebarCollapsed(false);
  };

  // ---- Live edit + export (client-only, no backend involved) ----
  const updateEditText = (text: string) => {
    if (!active) return;
    updateDoc(active.id, (d) => ({ ...d, editText: text }));
  };

  const insertLatestReply = () => {
    if (!active) return;
    const lastAssistant = [...active.messages]
      .reverse()
      .find((m) => m.role === "assistant" && !m.streaming);
    if (lastAssistant) {
      updateDoc(active.id, (d) => ({ ...d, editText: lastAssistant.content }));
    }
  };

  const resetEditText = async () => {
    if (!active) return;
    if (active.editIsOriginal) {
      const text = await readFileAsText(active.file).catch(() => "");
      updateDoc(active.id, (d) => ({ ...d, editText: text }));
    } else {
      updateDoc(active.id, (d) => ({ ...d, editText: "" }));
    }
  };

  const downloadEditedDocument = () => {
    if (!active) return;

    const base = active.filename.replace(/\.[^./\\]+$/, "");
    const blob = new Blob([active.editText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${base}-edited.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/logo.png" alt="QuantumMines logo" />
          </div>
          <div>
            <div className="brand-name">QuantumMines</div>
            <div className="brand-subtitle">AI Document Intelligence</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="status-cluster" ref={actionCenterRef}>
            <div className="status-pill">
              <span className="status-dot" />
              AI analysis ready
            </div>

            <button
              type="button"
              className="chevron-toggle"
              onClick={() => setActionCenterOpen((open) => !open)}
              aria-label="Open AI action center"
              aria-expanded={actionCenterOpen}
            >
              <span className={`chevron ${actionCenterOpen ? "open" : ""}`}>
                ⌄
              </span>
            </button>

            {actionCenterOpen && (
              <div className="action-panel">
                <div className="action-panel-header">
                  <span>AI Action Center</span>
                  {!documentId && (
                    <span className="action-panel-hint">Upload a document first</span>
                  )}
                </div>

                <div className="action-grid">
                  {AI_ACTIONS.map((action) => {
                    const isSoon = action.kind === "soon";
                    const needsDocument =
                      action.kind !== "history" && !documentId;

                    return (
                      <button
                        type="button"
                        key={action.id}
                        className={`action-tile ${isSoon ? "soon" : ""}`}
                        onClick={() => handleAction(action)}
                        disabled={isSoon || needsDocument}
                        title={isSoon ? "Coming soon — needs backend support" : action.label}
                      >
                        <span className="action-icon">{action.icon}</span>
                        <span className="action-label">{action.label}</span>
                        {isSoon && <span className="soon-badge">Soon</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="workspace">
        <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-expanded={!sidebarCollapsed}
          >
            <span>
              {documents.length > 0
                ? `${documents.length} document${documents.length > 1 ? "s" : ""}`
                : "Documents & analysis"}
            </span>
            <span className={`chevron ${sidebarCollapsed ? "" : "open"}`}>
              ⌄
            </span>
          </button>

          <div className="sidebar-body">
            <div className="section-heading">
              <div className="eyebrow">DOCUMENTS</div>
              {documents.length > 0 && (
                <button type="button" className="ghost-button small" onClick={clearAllDocuments}>
                  Clear all
                </button>
              )}
            </div>

            {documents.length > 0 && (
              <div className="doc-list">
                {documents.map((doc) => (
                  <button
                    type="button"
                    key={doc.id}
                    className={`doc-list-item ${doc.id === activeId ? "active" : ""}`}
                    onClick={() => setActiveId(doc.id)}
                  >
                    <span className="doc-list-icon">📄</span>
                    <span className="doc-list-name">{doc.filename}</span>
                    {doc.analyzing && <span className="doc-list-spinner" />}
                    <span
                      className="doc-list-remove"
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${doc.filename}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDocument(doc.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          removeDocument(doc.id);
                        }
                      }}
                    >
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div
              className={`upload-card ${documents.length > 0 ? "compact" : ""} ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {documents.length === 0 && (
                <>
                  <div className="upload-icon">↑</div>
                  <h2>Drop your documents</h2>
                  <p>or choose files from your computer</p>
                </>
              )}

              <label className="browse-button">
                {documents.length > 0 ? "+ Add documents" : "Browse files"}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  multiple
                  onChange={handleFileChange}
                  hidden
                />
              </label>

              {documents.length === 0 && (
                <div className="supported">
                  PDF <span>•</span> DOCX <span>•</span> TXT <span>•</span> multiple at once
                </div>
              )}

              {uploadProgress && (
                <div className="upload-progress">
                  Uploading {uploadProgress.current} of {uploadProgress.total}...
                </div>
              )}
            </div>

            {active && (
              <div className="document-card">
                <div className="document-icon">PDF</div>

                <div className="document-info">
                  <strong>{filename}</strong>
                  <span>
                    {analysis
                      ? `${analysis.word_count.toLocaleString()} words`
                      : analyzing
                        ? "Processing document..."
                        : "Ready"}
                  </span>
                </div>

                <div className="document-card-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={viewDocument}
                    disabled={!fileUrl}
                  >
                    View
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditorOpen(true)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => removeDocument(active.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            {active && (analyzing || analysis) && (
              <div className="dashboard-block">
                <div className="section-heading">
                  <div className="eyebrow">ANALYSIS</div>

                  {analyzing && (
                    <div className="processing">
                      <span className="spinner" />
                      Analyzing...
                    </div>
                  )}
                </div>

                {analysis && (
                  <>
                    <div className="stats-grid">
                      <div className="stat-card primary-stat">
                        <div className="stat-label">AI likelihood</div>

                        <div className="score-row">
                          <div className="big-score">
                            {analysis.overall_ai_likelihood}%
                          </div>

                          <div
                            className={`confidence ${analysis.confidence.toLowerCase()}`}
                          >
                            {analysis.confidence}
                          </div>
                        </div>

                        <div className="progress-track">
                          <div
                            className="progress-value"
                            style={{
                              width: `${analysis.overall_ai_likelihood}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="stat-card">
                        <div className="stat-label">Word count</div>
                        <div className="stat-number">
                          {analysis.word_count.toLocaleString()}
                        </div>
                      </div>

                      <div className="stat-card">
                        <div className="stat-label">Sections analyzed</div>
                        <div className="stat-number">
                          {analysis.sections.length}
                        </div>
                      </div>
                    </div>

                    <div className="analysis-card">
                      <div className="card-header">
                        <h3>AI likelihood by section</h3>
                        <p>Statistical text signals, not proof of authorship.</p>
                      </div>

                      <div className="section-list">
                        {analysis.sections.map((section) => (
                          <div className="section-row" key={section.chunk_index}>
                            <div className="section-meta">
                              <span>Section {section.chunk_index + 1}</span>
                              <small>Page {section.page}</small>
                            </div>

                            <div className="section-bar">
                              <div
                                className="section-bar-value"
                                style={{
                                  width: `${section.score ?? 0}%`,
                                }}
                              />
                            </div>

                            <div className="section-score">
                              {section.score !== null
                                ? `${section.score}%`
                                : "N/A"}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="analysis-note">
                        <span>i</span>
                        {analysis.note}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>

        <section className="chat-panel">
          <div className="chat-panel-header">
            <div className="eyebrow">RAG ASSISTANT</div>
            <h2>{active ? `Chat — ${filename}` : "Chat with your document"}</h2>
          </div>

          <div className="chat-card">
            <div className="chat-messages" ref={chatMessagesRef}>
              {!active ? (
                <div className="empty-chat">
                  <div className="chat-orb">
                    <img src="/logo.png" alt="" />
                  </div>

                  <h3>Upload a document to get started</h3>

                  <p>
                    You can add more than one — each keeps its own chat,
                    analysis, and edit draft. Switch between them any time
                    from the list on the left.
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-chat">
                  <div className="chat-orb">
                    <img src="/logo.png" alt="" />
                  </div>

                  <h3>Ask anything about this document</h3>

                  <p>
                    QuantumMines retrieves the most relevant sections before
                    generating an answer.
                  </p>

                  <div className="suggestions">
                    <button
                      onClick={() =>
                        setQuestion("What is this document about?")
                      }
                    >
                      What is this document about?
                    </button>

                    <button
                      onClick={() =>
                        setQuestion(
                          "What tools and technologies are mentioned?"
                        )
                      }
                    >
                      What technologies are mentioned?
                    </button>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    className={`message ${message.role}`}
                    key={`${message.role}-${index}`}
                  >
                    <div className="message-label">
                      {message.role === "user" ? "You" : "QuantumMines AI"}
                    </div>

                    <div className="message-bubble">
                      {message.content}
                      {message.streaming && <span className="caret" />}
                    </div>
                  </div>
                ))
              )}

              {thinking && (
                <div className="message assistant">
                  <div className="message-label">QuantumMines AI</div>
                  <div className="message-bubble thinking">
                    <span className="thinking-text">Thinking</span>
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                </div>
              )}
            </div>

            <div className="chat-input-area">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    askQuestion();
                  }
                }}
                placeholder={
                  listening
                    ? "Listening..."
                    : documentId
                      ? "Ask a question about your document..."
                      : "Upload a document to start chatting..."
                }
                rows={1}
                disabled={!documentId}
              />

              {voiceSupported && (
                <button
                  type="button"
                  className={`mic-button ${listening ? "listening" : ""}`}
                  onClick={toggleListening}
                  disabled={!documentId || busy}
                  aria-label={listening ? "Stop voice input" : "Ask by voice"}
                  title={listening ? "Stop voice input" : "Ask by voice"}
                >
                  {listening ? (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                      <path
                        d="M5 11a7 7 0 0 0 14 0"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 18v3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              )}

              <button
                className="send-button"
                onClick={askQuestion}
                disabled={
                  !question.trim() || busy || !documentId || isUnfinishedTemplate
                }
                title={
                  isUnfinishedTemplate
                    ? "Finish the sentence before sending"
                    : undefined
                }
                aria-label="Send message"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 19V5M12 5l-6 6M12 5l6 6"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className={`chat-hint ${isUnfinishedTemplate ? "warn" : ""}`}>
              {isUnfinishedTemplate
                ? "✏️ Finish the sentence above — add the language, name, job description, or detail this needs — then send."
                : `Press Enter to send • Shift + Enter for a new line${
                    voiceSupported ? " • Tap the mic to ask out loud" : ""
                  }`}
            </div>
          </div>
        </section>
      </div>

      {historyOpen && (
        <div className="history-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="history-panel-header">
              <h3>History{active ? ` — ${filename}` : ""}</h3>
              <div className="history-panel-actions">
                {history.length > 0 && (
                  <button className="ghost-button" onClick={clearHistory}>
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close history"
                >
                  ✕
                </button>
              </div>
            </div>

            {!active ? (
              <p className="history-empty">Upload and select a document first.</p>
            ) : history.length === 0 ? (
              <p className="history-empty">
                Questions you ask about this document will show up here.
              </p>
            ) : (
              <div className="history-list">
                {history
                  .slice()
                  .reverse()
                  .map((item) => (
                    <div className="history-item" key={item.id}>
                      <div className="history-time">
                        {formatTime(item.timestamp)}
                      </div>
                      <div className="history-question">{item.question}</div>
                      <div className="history-answer">{item.answer}</div>
                      <button
                        type="button"
                        className="ghost-button small"
                        onClick={() => {
                          setHistoryOpen(false);
                          sendQuestion(item.question);
                        }}
                        disabled={busy}
                      >
                        Ask again
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editorOpen && active && (
        <div className="history-overlay" onClick={() => setEditorOpen(false)}>
          <div
            className="history-panel editor-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="history-panel-header">
              <h3>Edit — {filename}</h3>
              <div className="history-panel-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setEditorOpen(false)}
                  aria-label="Close editor"
                >
                  ✕
                </button>
              </div>
            </div>

            {!active.editIsOriginal && (
              <div className="editor-note">
                QuantumMines can only read the original text straight from
                <strong> .txt</strong> files here — this document is a PDF or
                DOCX, so this starts as a blank draft rather than its real
                content. Use an Action Center item like Summary or Rewrite to
                generate a starting point, then pull it in below, or just
                write your own notes.
              </div>
            )}

            <div className="editor-toolbar">
              <button
                type="button"
                className="ghost-button small"
                onClick={insertLatestReply}
                disabled={!messages.some((m) => m.role === "assistant" && !m.streaming)}
              >
                Insert latest AI reply
              </button>

              <button type="button" className="ghost-button small" onClick={resetEditText}>
                Reset
              </button>
            </div>

            <textarea
              className="editor-textarea"
              value={active.editText}
              onChange={(e) => updateEditText(e.target.value)}
              placeholder={
                active.editIsOriginal
                  ? "Original document text — edit freely."
                  : "Start writing, or use the buttons above to pull in AI-generated content..."
              }
            />

            <div className="editor-actions">
              <span className="editor-hint">
                Downloads as a new .txt file — the original {filename} is
                never overwritten.
              </span>
              <button
                type="button"
                className="browse-button"
                onClick={downloadEditedDocument}
                disabled={!active.editText.trim()}
              >
                Download edited .txt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
