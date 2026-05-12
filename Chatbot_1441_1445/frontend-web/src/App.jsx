import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const WELCOME = { role: "assistant", content: "Hello! I'm your AI assistant. How can I help you today? 🌸" };

function AIFace({ state, size = 64 }) {
  const s = size;
  const cx = s / 2, cy = s / 2, r = s * 0.42;
  return (
    <div className={`face face--${state}`} style={{ width: s, height: s }}>
      <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s}>
        <defs>
          <radialGradient id={`fg${s}`} cx="45%" cy="38%" r="60%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fdf2f8" />
            <stop offset="100%" stopColor="#fce7f3" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#fg${s})`} />
        {/* cheeks */}
        <ellipse cx={cx - r * 0.42} cy={cy + r * 0.22} rx={r * 0.2} ry={r * 0.13} fill="#fbcfe8" opacity={state === "happy" ? 0.85 : 0.45} />
        <ellipse cx={cx + r * 0.42} cy={cy + r * 0.22} rx={r * 0.2} ry={r * 0.13} fill="#fbcfe8" opacity={state === "happy" ? 0.85 : 0.45} />
        {/* eyes */}
        {state === "happy" ? <>
          <path d={`M ${cx-r*0.38} ${cy-r*0.08} Q ${cx-r*0.2} ${cy-r*0.25} ${cx-r*0.02} ${cy-r*0.08}`} stroke="#be185d" strokeWidth={r*0.08} fill="none" strokeLinecap="round" />
          <path d={`M ${cx+r*0.02} ${cy-r*0.08} Q ${cx+r*0.2} ${cy-r*0.25} ${cx+r*0.38} ${cy-r*0.08}`} stroke="#be185d" strokeWidth={r*0.08} fill="none" strokeLinecap="round" />
        </> : <>
          <ellipse cx={cx - r*0.26} cy={cy - r*0.1} rx={r*0.14} ry={state === "thinking" ? r*0.08 : r*0.15} fill="#be185d" className="eye" />
          <ellipse cx={cx + r*0.26} cy={cy - r*0.1} rx={r*0.14} ry={state === "thinking" ? r*0.08 : r*0.15} fill="#be185d" className="eye" />
          <circle cx={cx - r*0.21} cy={cy - r*0.15} r={r*0.05} fill="white" opacity="0.85" />
          <circle cx={cx + r*0.31} cy={cy - r*0.15} r={r*0.05} fill="white" opacity="0.85" />
        </>}
        {/* mouth */}
        {state === "happy" && <path d={`M ${cx-r*0.32} ${cy+r*0.26} Q ${cx} ${cy+r*0.48} ${cx+r*0.32} ${cy+r*0.26}`} stroke="#be185d" strokeWidth={r*0.08} fill="none" strokeLinecap="round" />}
        {state === "thinking" && <path d={`M ${cx-r*0.22} ${cy+r*0.3} Q ${cx} ${cy+r*0.28} ${cx+r*0.22} ${cy+r*0.3}`} stroke="#be185d" strokeWidth={r*0.07} fill="none" strokeLinecap="round" />}
        {state === "talking" && <ellipse cx={cx} cy={cy+r*0.32} rx={r*0.18} ry={r*0.13} fill="#f9a8d4" className="mouth-talk" />}
        {state === "idle" && <path d={`M ${cx-r*0.26} ${cy+r*0.28} Q ${cx} ${cy+r*0.38} ${cx+r*0.26} ${cy+r*0.28}`} stroke="#be185d" strokeWidth={r*0.07} fill="none" strokeLinecap="round" />}
        {/* thinking dots */}
        {state === "thinking" && <>
          <circle cx={cx-r*0.22} cy={cy+r*0.55} r={r*0.08} fill="#f472b6" className="td1" />
          <circle cx={cx} cy={cy+r*0.55} r={r*0.08} fill="#f472b6" className="td2" />
          <circle cx={cx+r*0.22} cy={cy+r*0.55} r={r*0.08} fill="#f472b6" className="td3" />
        </>}
      </svg>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [username, setUsername] = useState(() => localStorage.getItem("username") || "");
  const [authMode, setAuthMode] = useState("login");
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([WELCOME]);
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [faceState, setFaceState] = useState("idle");
  const [error, setError] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [pendingNew, setPendingNew] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef(null);
  const isAuthed = Boolean(token);

  const sessionMap = useMemo(() => Object.fromEntries(sessions.map(s => [s.id, s])), [sessions]);

  useEffect(() => { if (isAuthed) loadSessions(); }, [isAuthed]);
  useEffect(() => { if (isAuthed && activeSessionId) loadHistory(activeSessionId); }, [isAuthed, activeSessionId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (busy) { setFaceState("thinking"); return; }
    const last = messages.at(-1);
    if (last?.role === "assistant" && last.content !== "...") {
      setFaceState("talking");
      const t1 = setTimeout(() => setFaceState("happy"), 1200);
      const t2 = setTimeout(() => setFaceState("idle"), 3500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [busy, messages]);

  async function api(path, opts = {}) {
    const r = await fetch(`${API_URL}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers } });
    if (!r.ok) throw new Error(await r.text());
    return r.status === 204 ? null : r.json();
  }

  async function handleAuth(e) {
    e.preventDefault(); setError("");
    const fd = new FormData(e.target);
    const body = { username: fd.get("username"), password: fd.get("password") };
    try {
      if (authMode === "login") {
        const d = await (await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
        if (!d.access_token) { setError("Invalid credentials."); return; }
        localStorage.setItem("token", d.access_token); localStorage.setItem("username", body.username);
        setToken(d.access_token); setUsername(body.username); setMessages([WELCOME]);
      } else {
        const r = await fetch(`${API_URL}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) { setError("Registration failed. Username may exist."); return; }
        setAuthMode("login");
      }
    } catch { setError("Cannot reach backend. Is it running?"); }
  }

  function logout() {
    ["token","username"].forEach(k => localStorage.removeItem(k));
    setToken(""); setUsername(""); setSessions([]); setActiveSessionId(null); setMessages([WELCOME]); setInputValue(""); setError("");
  }

  async function loadSessions() {
    try {
      const data = await api("/sessions"); setSessions(data);
      if (!data.length) { setActiveSessionId(null); setMessages([WELCOME]); return; }
      if (!pendingNew && (!activeSessionId || !data.find(s => s.id === activeSessionId))) setActiveSessionId(data[0].id);
    } catch { setError("Could not load sessions."); }
  }

  async function loadHistory(id) {
    try {
      const data = await api(`/sessions/${id}/history`);
      const msgs = data.flatMap(d => [{ role: "user", content: d.user_message }, { role: "assistant", content: d.bot_response }]);
      setMessages(msgs.length ? msgs : [WELCOME]);
    } catch { setError("Could not load history."); }
  }

  async function newChat() { setPendingNew(true); setActiveSessionId(null); setMessages([WELCOME]); }

  async function rename(id) {
    if (!renameVal.trim()) return;
    try {
      const s = await api(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ name: renameVal.trim() }) });
      setSessions(p => p.map(x => x.id === s.id ? s : x)); setRenamingId(null); setRenameVal("");
    } catch { setError("Rename failed."); }
  }

  async function deleteSession(id) {
    try {
      await api(`/sessions/${id}`, { method: "DELETE" });
      const next = sessions.filter(s => s.id !== id); setSessions(next);
      if (activeSessionId === id) { next.length ? setActiveSessionId(next[0].id) : (setActiveSessionId(null), setMessages([WELCOME])); }
    } catch { setError("Delete failed."); }
  }

  async function send(e) {
    e.preventDefault();
    if (!inputValue.trim() || busy) return;
    setError(""); setBusy(true);
    let sid = activeSessionId;
    if (!sid) {
      try {
        const s = await api("/sessions", { method: "POST", body: JSON.stringify({ name: `Chat ${new Date().toLocaleString()}` }) });
        setSessions(p => [s, ...p]); setActiveSessionId(s.id); setPendingNew(false); sid = s.id;
      } catch { setError("Could not start chat."); setBusy(false); return; }
    }
    const msg = inputValue.trim(); setInputValue("");
    setMessages(p => [...p.filter(m => m !== WELCOME), { role: "user", content: msg }, { role: "assistant", content: "..." }]);
    try {
      const d = await api("/chat", { method: "POST", body: JSON.stringify({ message: msg, session_id: sid }) });
      setMessages(p => { const n = [...p]; if (n.at(-1)?.role === "assistant") n[n.length-1] = { role: "assistant", content: d.response }; return n; });
    } catch { setMessages(p => p.slice(0,-1)); setError("Failed to send."); }
    finally { setBusy(false); }
  }

  if (!isAuthed) return (
    <div className="auth-page">
      <div className="auth-blob a1"/><div className="auth-blob a2"/>
      <div className="auth-box">
        <div className="auth-top">
          <AIFace state="happy" size={72} />
          <div>
            <h1 className="auth-title">Welcome back!</h1>
            <p className="auth-sub">Your AI assistant is ready 🌸</p>
          </div>
        </div>
        <div className="tab-row">
          <button type="button" className={`tabx ${authMode==="login"?"on":""}`} onClick={()=>setAuthMode("login")}>Sign In</button>
          <button type="button" className={`tabx ${authMode==="register"?"on":""}`} onClick={()=>setAuthMode("register")}>Register</button>
        </div>
        <form onSubmit={handleAuth} className="auth-form">
          <label className="lbl">Username<input name="username" type="text" required placeholder="Enter username" className="inp" /></label>
          <label className="lbl">Password<input name="password" type="password" required placeholder="••••••••" className="inp" /></label>
          {error && <div className="err">{error}</div>}
          <button type="submit" className="cta">{authMode==="login" ? "Sign In →" : "Create Account →"}</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className={`shell ${sidebarOpen?"":"no-sidebar"}`}>
      {/* ── SIDEBAR ── */}
      <nav className={`nav ${sidebarOpen?"":"nav-off"}`}>
        <div className="nav-top">
          <div className="nav-brand">
            <div className="brand-pip"/>
            <span className="brand-label">Sakura AI</span>
            <button className="sq-btn" onClick={()=>setSidebarOpen(false)}>✕</button>
          </div>
          <div className="who">
            <div className="who-av">{username[0]?.toUpperCase()}</div>
            <span className="who-name">{username}</span>
          </div>
          <button className="new-btn" onClick={newChat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New Chat
          </button>
          <div className="sess-list">
            {!sessions.length && <p className="no-sess">No chats yet</p>}
            {sessions.map(s => (
              <div key={s.id} className={`sess ${s.id===activeSessionId?"sess-on":""}`}>
                {renamingId===s.id ? (
                  <div className="ren-row">
                    <input value={renameVal} onChange={e=>setRenameVal(e.target.value)} className="ren-inp" placeholder="New name"/>
                    <button className="sq-btn ok" onClick={()=>rename(s.id)}>✓</button>
                  </div>
                ) : (
                  <button className="sess-btn" onClick={()=>{setActiveSessionId(s.id);setPendingNew(false);}}>
                    <span className="sess-pip"/>
                    <span className="sess-nm">{s.name||"Untitled"}</span>
                  </button>
                )}
                <div className="sess-acts">
                  <button className="sq-btn" onClick={()=>{setRenamingId(s.id);setRenameVal(s.name);}}>✎</button>
                  <button className="sq-btn del" onClick={()=>deleteSession(s.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button className="sign-out" onClick={logout}>Sign out</button>
      </nav>

      {/* ── MAIN ── */}
      <div className="main">
        {/* Header */}
        <div className="topbar">
          <div className="topbar-l">
            {!sidebarOpen && <button className="sq-btn menu" onClick={()=>setSidebarOpen(true)}>☰</button>}
            <AIFace state={faceState} size={46} />
            <div>
              <div className="chat-nm">{activeSessionId ? (sessionMap[activeSessionId]?.name||"Chat") : "New Chat"}</div>
              <div className="chat-sub">qwen:1.8b · local</div>
            </div>
          </div>
          <div className={`badge ${busy?"badge-busy":"badge-ok"}`}>
            <span className="badge-dot"/>
            {busy ? "Thinking..." : "Online"}
          </div>
        </div>

        {/* Messages */}
        <div className="msgs">
          {messages.map((m,i) => (
            <div key={i} className={`row row-${m.role}`}>
              {m.role==="assistant" && <div className="av-ai">✿</div>}
              <div className={`bub bub-${m.role}`}>
                {m.content==="..." ? <span className="dots"><span/><span/><span/></span> : m.content}
              </div>
              {m.role==="user" && <div className="av-u">{username[0]?.toUpperCase()}</div>}
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <form className="bar" onSubmit={send}>
          {error && <div className="bar-err">{error}</div>}
          <div className="bar-row">
            <input
              className="bar-inp"
              value={inputValue}
              onChange={e=>setInputValue(e.target.value)}
              placeholder="Type a message... 🌸"
              disabled={busy}
              autoFocus
            />
            <button type="submit" className="bar-send" disabled={busy||!inputValue.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
