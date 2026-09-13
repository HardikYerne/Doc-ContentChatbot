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

type Theme = "dark" | "light";

type ActionKind = "focus" | "send" | "prefill" | "history" | "soon";

type ActionItem = {
  id: string;
  icon: string;
  label: string;
  kind: ActionKind;
  prompt?: string;
};

type HistoryEntry = {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
};

// Every "send" / "prefill" action rides the existing /api/chat endpoint —
// no backend changes. "soon" items genuinely need backend work (auth,
// storage, multi-doc comparison) and are shown disabled rather than faked.
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

export default function Home() {
  const [theme, setTheme] = useState<Theme>("dark");

  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState("");
  const [filename, setFilename] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const [fileUrl, setFileUrl] = useState("");

  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionCenterRef = useRef<HTMLDivElement | null>(null);

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

  // ---- Keep a viewable URL for whichever file is currently selected ----
  useEffect(() => {
    if (!file) {
      setFileUrl("");
      return;
    }

    const url = URL.createObjectURL(file);
    setFileUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const viewDocument = () => {
    if (fileUrl) window.open(fileUrl, "_blank", "noopener,noreferrer");
  };

  // ---- History: load per-document from localStorage, save on change ----
  useEffect(() => {
    if (!documentId) {
      setHistory([]);
      return;
    }

    try {
      const stored = window.localStorage.getItem(`qm-history-${documentId}`);
      setHistory(stored ? JSON.parse(stored) : []);
    } catch {
      setHistory([]);
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId) return;
    window.localStorage.setItem(
      `qm-history-${documentId}`,
      JSON.stringify(history)
    );
  }, [history, documentId]);

  const clearHistory = () => {
    setHistory([]);
    if (documentId) {
      window.localStorage.removeItem(`qm-history-${documentId}`);
    }
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

  const selectFile = (selectedFile: File | null) => {
    if (!selectedFile) return;

    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    const validExtension = /\.(pdf|docx|txt)$/i.test(selectedFile.name);

    if (!allowed.includes(selectedFile.type) && !validExtension) {
      setError("Please upload a PDF, DOCX, or TXT file.");
      return;
    }

    setError("");
    setFile(selectedFile);
    setAnalysis(null);
    setMessages([]);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0] || null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    selectFile(e.dataTransfer.files?.[0] || null);
  };

  const uploadDocument = async () => {
    if (!file) return;

    setUploading(true);
    setError("");
    setAnalysis(null);
    setMessages([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      setDocumentId(data.document_id);
      setFilename(data.filename);

      await analyzeDocument(data.document_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const analyzeDocument = async (id: string) => {
    setAnalyzing(true);
    setError("");

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

      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Reveals text word-by-word in the last message, purely on the client.
  // Backend behavior (fetch + full JSON response) is unchanged.
  const streamAssistantReply = (fullText: string) => {
    const words = fullText.split(" ");
    let i = 0;

    setMessages((current) => [
      ...current,
      { role: "assistant", content: "", streaming: true },
    ]);

    if (streamTimerRef.current) clearInterval(streamTimerRef.current);

    streamTimerRef.current = setInterval(() => {
      i += 1;

      setMessages((current) => {
        const updated = [...current];
        const lastIndex = updated.length - 1;
        const revealed = words.slice(0, i).join(" ");

        updated[lastIndex] = {
          role: "assistant",
          content: revealed,
          streaming: i < words.length,
        };

        return updated;
      });

      if (i >= words.length && streamTimerRef.current) {
        clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
      }
    }, 45);
  };

  const sendQuestion = async (rawQuestion: string) => {
    const userMessage = rawQuestion.trim();
    if (!userMessage || !documentId || thinking) return;

    setQuestion("");
    setMessages((current) => [
      ...current,
      { role: "user", content: userMessage },
    ]);
    setThinking(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: documentId,
          message: userMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Chat request failed.");
      }

      const answerText = data.answer || "I couldn't generate an answer.";

      setThinking(false);
      streamAssistantReply(answerText);

      setHistory((current) => [
        ...current,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          question: userMessage,
          answer: answerText,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setThinking(false);
      setError(err instanceof Error ? err.message : "Chat request failed.");
    }
  };

  const [pendingTemplate, setPendingTemplate] = useState("");

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

  const resetDocument = () => {
    setFile(null);
    setDocumentId("");
    setFilename("");
    setAnalysis(null);
    setMessages([]);
    setQuestion("");
    setError("");
    setPendingTemplate("");
  };

  const busy = thinking || messages.some((m) => m.streaming);
  const isUnfinishedTemplate =
    pendingTemplate !== "" && question.trim() === pendingTemplate.trim();

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
        <aside className="sidebar">
          <div className="eyebrow">DOCUMENT</div>

          {!documentId ? (
            <div
              className={`upload-card ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="upload-icon">↑</div>

              <h2>Drop your document</h2>

              <p>or choose a file from your computer</p>

              <label className="browse-button">
                Browse files
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileChange}
                  hidden
                />
              </label>

              <div className="supported">
                PDF <span>•</span> DOCX <span>•</span> TXT
              </div>

              {file && (
                <div className="selected-file">
                  <div className="selected-file-info">
                    <strong>{file.name}</strong>
                    <small>{formatBytes(file.size)}</small>
                  </div>

                  <div className="selected-file-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={viewDocument}
                      disabled={!fileUrl}
                    >
                      View document
                    </button>

                    <button onClick={uploadDocument} disabled={uploading}>
                      {uploading ? "Uploading..." : "Analyze document"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="document-card">
              <div className="document-icon">PDF</div>

              <div className="document-info">
                <strong>{filename}</strong>
                <span>
                  {analysis
                    ? `${analysis.word_count.toLocaleString()} words`
                    : "Processing document..."}
                </span>
              </div>

              <div className="document-card-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={viewDocument}
                  disabled={!fileUrl}
                >
                  View document
                </button>

                <button className="secondary-button" onClick={resetDocument}>
                  New document
                </button>
              </div>
            </div>
          )}

          {(analyzing || analysis) && (
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
        </aside>

        <section className="chat-panel">
          <div className="chat-panel-header">
            <div className="eyebrow">RAG ASSISTANT</div>
            <h2>Chat with your document</h2>
          </div>

          <div className="chat-card">
            <div className="chat-messages" ref={chatMessagesRef}>
              {messages.length === 0 ? (
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
                    : "Ask a question about your document..."
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
                  🎙
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
              >
                ↑
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
              <h3>History</h3>
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

            {history.length === 0 ? (
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
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";

  const units = ["Bytes", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
