import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import dynamic from 'next/dynamic';
import {
  QrCode,
  Users,
  Briefcase,
  Building2,
  Check,
  ArrowRight,
  UploadCloud,
  X,
  Sparkles,
  Radio,
} from "lucide-react";

const TYPE_META = {
  attendee: { label: "Attendee", color: "var(--cyan)", icon: Users },
  jobseeker: { label: "Job Seeker", color: "var(--amber)", icon: Briefcase },
  employer: { label: "Employer", color: "var(--violet)", icon: Building2 },
};

// Component code is largely unchanged but now syncs to a simple server API (/api/state)
import QRCode from 'qrcode';

export default function ConvergeCheckin() {
  const [view, setView] = useState("kiosk");
  const [employers, setEmployers] = useState([]);
  const [registered, setRegistered] = useState({ attendee: 0, jobseeker: 0 });
  const [importText, setImportText] = useState({ attendee: "", jobseeker: "", employer: "" });
  const [importFeedback, setImportFeedback] = useState({ attendee: "", jobseeker: "", employer: "" });
  const [checkins, setCheckins] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState("form");
  const [form, setForm] = useState({ name: "", type: "attendee", position: "", company: "" });
  const [result, setResult] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  // admin auth
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState("");

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // attempt to refresh auth via HttpOnly refresh cookie; server will return 200 if valid
      fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'refresh' }) })
        .then((r) => { if (r.ok) setAdminAuthed(true); })
        .catch(() => {});
    }
  }, []);

  // load persisted state on mount
  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setEmployers(data.employers || []);
          setRegistered(data.registered || { attendee: 0, jobseeker: 0 });
          setCheckins(data.checkins || []);
        }
      })
      .catch(() => {
        // ignore, start with local state
      });

    // Generate QR code pointing to the check-in form on this site.
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const url = `${origin}/?scan=1`;
      QRCode.toDataURL(url, { margin: 1, width: 320 })
        .then((d) => setQrDataUrl(d))
        .catch(() => setQrDataUrl(null));
    } catch (e) {
      setQrDataUrl(null);
    }

    // open modal automatically if ?scan=1 present (mobile scanner will land here)
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('scan') === '1' || params.get('scan') === 'true') {
        // ensure kiosk view (attendee) and show only the check-in form
        setView('kiosk');
        setTimeout(() => setModalOpen(true), 300);
        // remove query param from history to avoid repeated opens
        const u = new URL(window.location.href);
        u.searchParams.delete('scan');
        window.history.replaceState({}, document.title, u.toString());
      }
    }
    } catch (e) {}

  }, []);

  // Remove snapshot syncing; use granular endpoints for reliability
  // commitNames will call /api/registered
  async function commitNames(kind, names) {
    if (names.length === 0) {
      flashFeedback(kind, "No names found ✕");
      return;
    }
    setRegistered((prev) => ({ ...prev, [kind]: prev[kind] + names.length }));
    flashFeedback(kind, `Imported ${names.length} ✓`);
    try {
    const res = await fetch('/api/registered', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ kind, delta: names.length }) });
      if (res.ok) {
        const data = await res.json();
        if (data.registered) setRegistered(data.registered);
      }
    } catch (e) {
      // ignore network errors; UI is optimistic
    }
  }

  // commitEmployerRows will call /api/employers
  async function commitEmployerRows(pairs) {
    if (pairs.length === 0) {
      flashFeedback('employer', 'No rows found ✕');
      return;
    }

    // optimistic update
    setEmployers((prev) => {
      const next = prev.map((e) => ({ ...e, openings: [...e.openings] }));
      pairs.forEach(({ company, position }) => {
        if (!company) return;
        let existing = next.find((e) => e.name.toLowerCase() === company.toLowerCase());
        if (!existing) {
          existing = { id: Date.now() + Math.random(), name: company, openings: [] };
          next.push(existing);
        }
        if (position && !existing.openings.some((o) => o.toLowerCase() === position.toLowerCase())) {
          existing.openings.push(position);
        }
      });
      return next;
    });

    try {
      const res = await fetch('/api/employers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ pairs }) });
      if (res.ok) {
        const data = await res.json();
        if (data.employers) setEmployers(data.employers);
        if (data.result && data.result.addedCompanies) flashFeedback('employer', `Imported ${data.result.addedCompanies} compan${data.result.addedCompanies===1? 'y':'ies'} ✓`);
      } else {
        flashFeedback('employer', 'Import failed ✕');
      }
    } catch (e) {
      flashFeedback('employer', 'Import failed ✕');
    }
  }

  const openingsList = useMemo(() => {
    const set = new Set();
    employers.forEach((e) => e.openings.forEach((o) => set.add(o)));
    return Array.from(set);
  }, [employers]);

  function findMatch(position) {
    const p = position.trim().toLowerCase();
    if (!p) return null;
    return (
      employers.find((e) => e.openings.some((o) => o.trim().toLowerCase() === p)) || null
    );
  }

  function flashFeedback(kind, message) {
    setImportFeedback((prev) => ({ ...prev, [kind]: message }));
    setTimeout(() => {
      setImportFeedback((prev) => ({ ...prev, [kind]: "" }));
    }, 2500);
  }

  // legacy snapshot commit functions removed; new granular implementations are above


  function handleImport(kind) {
    const text = importText[kind].trim();
    if (!text) {
      flashFeedback(kind, "Nothing pasted yet ✕");
      return;
    }
    if (kind === "employer") {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const pairs = [];
      lines.forEach((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return;
        const name = line.slice(0, idx).trim();
        const opens = line.slice(idx + 1).split(",").map((s) => s.trim()).filter(Boolean);
        if (!name) return;
        if (opens.length === 0) pairs.push({ company: name, position: "" });
        opens.forEach((o) => pairs.push({ company: name, position: o }));
      });
      commitEmployerRows(pairs);
    } else {
      const names = text.split("\n").map((l) => l.trim()).filter(Boolean);
      commitNames(kind, names);
    }
    setImportText((prev) => ({ ...prev, [kind]: "" }));
  }

  async function handleFileImport(kind, file) {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

      if (kind === "employer") {
        const pairs = [];
        rows.forEach((row, i) => {
          const company = String(row[0] ?? "").trim();
          const position = String(row[1] ?? "").trim();
          if (!company) return;
          if (i === 0 && /company|employer/i.test(company) && /position|role|opening/i.test(position)) return;
          pairs.push({ company, position });
        });
        commitEmployerRows(pairs);
      } else {
        const names = [];
        rows.forEach((row, i) => {
          const name = String(row[0] ?? "").trim();
          if (!name) return;
          if (i === 0 && /^name$/i.test(name)) return;
          names.push(name);
        });
        commitNames(kind, names);
      }
    } catch (err) {
      flashFeedback(kind, "Couldn't read that file ✕");
    }
  }

  function openKiosk() {
    setForm({ name: "", type: "attendee", position: "", company: "" });
    setStep("form");
    setModalOpen(true);
  }

  async function submitCheckin() {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const record = {
      id: Date.now(),
      time,
      name: form.name.trim(),
      type: form.type,
      position: form.position.trim(),
      company: form.company.trim(),
      matchedEmployer: null,
      matchedPosition: null,
    };
    if (form.type === "jobseeker") {
      const match = findMatch(form.position);
      if (match) {
        record.matchedEmployer = match.name;
        record.matchedPosition = form.position.trim();
      }
    }
    // optimistic UI
    setCheckins((prev) => [record, ...prev]);
    setResult(record);
    setStep("success");

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (adminAuthed && adminPassword) headers['x-admin-password'] = adminPassword;
      const res = await fetch('/api/checkins', { method: 'POST', headers, body: JSON.stringify(record) });
      if (res.ok) {
        const data = await res.json();
        if (data.checkins) setCheckins(data.checkins);
        if (data.created) setResult(data.created);
      }
    } catch (e) {
      // ignore network errors; UI remains optimistic
    }
  }

  const canSubmit =
    form.name.trim().length > 0 && (form.type !== "jobseeker" || form.position.trim().length > 0);

  const matches = checkins.filter((c) => c.matchedEmployer);

  const analytics = useMemo(() => {
    const byType = { attendee: 0, jobseeker: 0, employer: 0 };
    checkins.forEach((c) => (byType[c.type] += 1));
    const total = checkins.length || 1;

    const jobseekerCheckins = checkins.filter((c) => c.type === "jobseeker");
    const matchedCount = matches.length;
    const unmatchedCount = jobseekerCheckins.length - matchedCount;

    const posCounts = {};
    jobseekerCheckins.forEach((c) => {
      if (!c.position) return;
      posCounts[c.position] = (posCounts[c.position] || 0) + 1;
    });
    const topPositions = Object.entries(posCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const empCounts = {};
    matches.forEach((m) => {
      empCounts[m.matchedEmployer] = (empCounts[m.matchedEmployer] || 0) + 1;
    });
    const topEmployers = Object.entries(empCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const rate = (checkedIn, reg) => (reg > 0 ? Math.min(100, Math.round((checkedIn / reg) * 100)) : 0);
    const checkinRates = [
      { label: "Attendee", color: "var(--cyan)", checkedIn: byType.attendee, registered: registered.attendee },
      { label: "Job Seeker", color: "var(--amber)", checkedIn: byType.jobseeker, registered: registered.jobseeker },
      { label: "Employer", color: "var(--violet)", checkedIn: byType.employer, registered: employers.length },
    ].map((r) => ({ ...r, pct: rate(r.checkedIn, r.registered) }));

    return { byType, total, matchedCount, unmatchedCount, jobseekerTotal: jobseekerCheckins.length, topPositions, topEmployers, checkinRates };
  }, [checkins, matches, registered, employers]);

  // --- UI pieces (QR pattern, Chip, TypeBadge, Buttons) ---
  function QRPattern({ onClick }) {
    // If we generated a real QR data URL, show it; otherwise fall back to the decorative pattern
    if (qrDataUrl) {
      return (
        <div
          onClick={onClick}
          style={{
            width: 190,
            height: 190,
            padding: 16,
            background: "#F5F7FA",
            borderRadius: 16,
            cursor: "pointer",
            boxShadow: "0 0 0 1px var(--border)",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <img src={qrDataUrl} alt="Scan to check in" style={{ width: 158, height: 158, borderRadius: 8 }} />
        </div>
      );
    }

    const size = 12;
    const isFinder = (r, c) =>
      (r < 3 && c < 3) || (r < 3 && c > size - 4) || (r > size - 4 && c < 3);
    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let on;
        if (isFinder(r, c)) {
          const rr = r < 3 ? r : r - (size - 3);
          const cc = c < 3 ? c : c - (size - 3);
          on = rr === 0 || rr === 2 || cc === 0 || cc === 2 || (rr === 1 && cc === 1);
        } else {
          on = (r * 13 + c * 7 + (r % 3) * 5) % 9 < 4;
        }
        cells.push(on);
      }
    }
    return (
      <div
        onClick={onClick}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: 3,
          width: 190,
          height: 190,
          padding: 16,
          background: "#F5F7FA",
          borderRadius: 16,
          cursor: "pointer",
          boxShadow: "0 0 0 1px var(--border)",
        }}
      >
        {cells.map((on, i) => (
          <div
            key={i}
            style={{ background: on ? "#0A0D12" : "transparent", borderRadius: 1 }}
          />
        ))}
      </div>
    );
  }

  function Chip({ color, icon: Icon, label, sub }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "var(--surface)",
            border: `1px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={16} color={color} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </div>
          <div className="cx-mono" style={{ fontSize: 10, color, letterSpacing: 0.5 }}>
            {sub.toUpperCase()}
          </div>
        </div>
      </div>
    );
  }

  function TypeBadge({ type }) {
    const meta = TYPE_META[type];
    const Icon = meta.icon;
    return (
      <div
        className="cx-mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          letterSpacing: 0.5,
          padding: "4px 9px",
          borderRadius: 999,
          border: `1px solid ${meta.color}`,
          color: meta.color,
        }}
      >
        <Icon size={12} />
        {meta.label.toUpperCase()}
      </div>
    );
  }

  const cardStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 24,
  };

  function TabButton({ active, children, ...props }) {
    return (
      <button
        {...props}
        className="cx-display"
        style={{
          padding: "9px 16px",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          border: active ? "1px solid var(--cyan)" : "1px solid var(--border)",
          background: active ? "rgba(79,209,232,0.08)" : "transparent",
          color: active ? "var(--cyan)" : "var(--muted)",
          cursor: "pointer",
        }}
      >
        {children}
      </button>
    );
  }

  function PrimaryButton({ children, disabled, ...props }) {
    return (
      <button
        disabled={disabled}
        {...props}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "center",
          padding: "11px 20px",
          borderRadius: 12,
          border: "none",
          fontSize: 14,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          background: disabled ? "var(--surface2)" : "var(--cyan)",
          color: disabled ? "var(--muted)" : "#06111A",
          opacity: disabled ? 0.7 : 1,
          transition: "transform .12s ease",
        }}
        onMouseDown={(e) => {
          if (!disabled) e.currentTarget.style.transform = "scale(0.98)";
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {children}
      </button>
    );
  }

  const inputStyle = {
    width: "100%",
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "10px 12px",
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
  };

  return (
    <div
      style={{
        "--bg": "#090C11",
        "--surface": "#11151D",
        "--surface2": "#171C26",
        "--border": "#232935",
        "--text": "#E7ECF3",
        "--muted": "#7C879C",
        "--cyan": "#4FD1E8",
        "--amber": "#FFB454",
        "--violet": "#A78BFA",
        "--green": "#34D399",
        background: "var(--bg)",
        color: "var(--text)",
        minHeight: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .cx-display { font-family: 'Space Grotesk', sans-serif; }
        .cx-mono { font-family: 'JetBrains Mono', monospace; }
        @keyframes cx-pulse { 0%,100% { opacity:1; transform: scale(1);} 50% { opacity:.45; transform: scale(1.4);} }
        .cx-pulse-dot { animation: cx-pulse 1.6s ease-in-out infinite; }
        @keyframes cx-fadeUp { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform:translateY(0);} }
        .cx-fade-up { animation: cx-fadeUp .35s ease-out; }
        .cx-scroll::-webkit-scrollbar { width: 6px; }
        .cx-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; }
        textarea::placeholder, input::placeholder { color: #4A5468; }
      `}</style>

      {/* Nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            className="cx-pulse-dot"
            style={{ width: 9, height: 9, borderRadius: 999, background: "var(--cyan)" }}
          />
          <span className="cx-display" style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.5 }}>
            CONVERGE
          </span>
          <span
            className="cx-mono"
            style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1.5, marginLeft: 4 }}
          >
            EVENT ACCESS &amp; MATCH ENGINE
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <TabButton active={view === "kiosk"} onClick={() => setView("kiosk")}>
            Check-in Kiosk
          </TabButton>
          <TabButton
            active={view === "admin"}
            onClick={() => { setView('admin'); }}
          >
            Control Room
          </TabButton>
        </div>
      </div>

      <div style={{ padding: "32px 28px 60px", maxWidth: 1180, margin: "0 auto" }}>
        {view === "kiosk" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 24,
            }}
            className="cx-kiosk-grid"
          >
            <div className="cx-fade-up" style={{ ...cardStyle, textAlign: "center" }}>
              <div className="cx-mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>
                EVENT ACCESS TERMINAL
              </div>
              <h1 className="cx-display" style={{ fontSize: 34, fontWeight: 700, margin: "10px 0 6px" }}>
                Scan to check in
              </h1>
              <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 28, maxWidth: 380, marginInline: "auto" }}>
                Point your camera at the code, or tap the terminal below to simulate a scan at this kiosk.
              </p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
                <QRPattern onClick={openKiosk} />
                <PrimaryButton onClick={openKiosk}>
                  <QrCode size={16} /> Simulate scan
                </PrimaryButton>
              </div>
              <div
                style={{
                  marginTop: 32,
                  display: "flex",
                  justifyContent: "center",
                  gap: 18,
                  flexWrap: "wrap",
                }}
              >
                {Object.entries(TYPE_META).map(([key, meta]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: meta.color }} />
                    <span className="cx-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                      {meta.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="cx-fade-up" style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <Radio size={14} color="var(--green)" />
                <span className="cx-display" style={{ fontSize: 14, fontWeight: 600 }}>
                  Recently checked in
                </span>
              </div>
              {checkins.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                  No one has checked in yet. Simulate a scan to see the floor come alive.
                </div>
              ) : (
                <div
                  className="cx-scroll"
                  style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}
                >
                  {checkins.slice(0, 8).map((c) => (
                    <div
                      key={c.id}
                      className="cx-fade-up"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        gap: 10,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--green)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.name}
                        </div>
                        <div className="cx-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                          {c.time}
                          {c.matchedEmployer ? ` · matched → ${c.matchedEmployer}` : ""}
                        </div>
                      </div>
                      <TypeBadge type={c.type} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }} className="cx-stats-grid">
              {[
                { label: "Attendees registered", value: registered.attendee, color: "var(--cyan)" },
                { label: "Job seekers registered", value: registered.jobseeker, color: "var(--amber)" },
                { label: "Employers onsite", value: employers.length, color: "var(--violet)" },
                { label: "Total checked in", value: checkins.length, color: "var(--green)" },
              ].map((s) => (
                <div key={s.label} style={{ ...cardStyle, padding: 18 }}>
                  <div className="cx-display" style={{ fontSize: 28, fontWeight: 700, color: s.color }}>
                    {s.value}
                  </div>
                  <div className="cx-mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    {s.label.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>

            {/* Bulk import */}
            <div>
              <h2 className="cx-display" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>
                Bulk import
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="cx-import-grid">
                {[
                  { kind: "attendee", title: "Attendees", color: "var(--cyan)", icon: Users, placeholder: "Ada Lovelace\nGrace Hopper\nAlan Turing", hint: "Spreadsheet: one name per row, first column. Or paste one name per line below." },
                  { kind: "jobseeker", title: "Job Seekers", color: "var(--amber)", icon: Briefcase, placeholder: "Chidi Okafor\nMaya Chen\nSam Okoro", hint: "Spreadsheet: one name per row, first column. Or paste one name per line below." },
                  { kind: "employer", title: "Employers", color: "var(--violet)", icon: Building2, placeholder: "Nexora Systems: Frontend Engineer, Product Designer\nVantage Analytics: Data Scientist", hint: "Spreadsheet columns: Company, Position — one row per opening. Or paste \"Company: Position One, Position Two\" below." },
                ].map((p) => (
                  <div key={p.kind} style={{ ...cardStyle, padding: 18, borderTop: `2px solid ${p.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <p.icon size={15} color={p.color} />
                      <span className="cx-display" style={{ fontSize: 13, fontWeight: 600 }}>
                        {p.title}
                      </span>
                    </div>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        justifyContent: "center",
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: `1px solid ${p.color}`,
                        background: `${p.color}14`,
                        color: p.color,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        marginBottom: 12,
                      }}
                    >
                      <UploadCloud size={14} /> Upload spreadsheet (.csv, .xlsx)
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files && e.target.files[0];
                          handleFileImport(p.kind, file);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    <div
                      className="cx-mono"
                      style={{ fontSize: 10, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}
                    >
                      {p.hint}
                      {p.kind !== "employer" && (
                        <> From Google Sheets: File → Download → CSV, then upload here.</>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                      <span className="cx-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                        OR PASTE
                      </span>
                      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    </div>

                    <textarea
                      value={importText[p.kind]}
                      onChange={(e) => setImportText((prev) => ({ ...prev, [p.kind]: e.target.value }))}
                      placeholder={p.placeholder}
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical", fontSize: 13, marginBottom: 8 }}
                    />
                    <button
                      onClick={() => handleImport(p.kind)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        justifyContent: "center",
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: `1px solid ${p.color}`,
                        background: "transparent",
                        color: p.color,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <UploadCloud size={14} /> Import {p.title.toLowerCase()}
                    </button>

                    <div style={{ marginTop: 10, minHeight: 18 }}>
                      {importFeedback[p.kind] ? (
                        <span
                          className="cx-fade-up cx-mono"
                          style={{ fontSize: 11, color: "var(--green)" }}
                        >
                          {importFeedback[p.kind]}
                        </span>
                      ) : (
                        <span className="cx-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                          {p.kind === "employer"
                            ? `${employers.length} compan${employers.length === 1 ? "y" : "ies"} registered`
                            : `${registered[p.kind]} registered`}
                        </span>
                      )}
                    </div>

                    {p.kind === "employer" && employers.length > 0 && (
                      <div
                        className="cx-scroll"
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: "1px solid var(--border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          maxHeight: 140,
                          overflowY: "auto",
                        }}
                      >
                        {employers.map((e) => (
                          <div key={e.id}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{e.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>
                              {e.openings.length > 0 ? e.openings.join(", ") : "No openings listed"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Live feed */}
            <div>
              <h2 className="cx-display" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>
                Live check-in feed
              </h2>
              <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                {checkins.length === 0 ? (
                  <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>
                    Nothing yet. Check-ins from the kiosk will appear here in real time.
                  </div>
                ) : (
                  <div className="cx-scroll" style={{ maxHeight: 360, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr className="cx-mono" style={{ color: "var(--muted)", fontSize: 10, textAlign: "left" }}>
                          <th style={{ padding: "10px 16px" }}>Time</th>
                          <th style={{ padding: "10px 16px" }}>Name</th>
                          <th style={{ padding: "10px 16px" }}>Type</th>
                          <th style={{ padding: "10px 16px" }}>Detail</th>
                          <th style={{ padding: "10px 16px" }}>Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checkins.map((c) => (
                          <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                            <td className="cx-mono" style={{ padding: "10px 16px", color: "var(--muted)" }}>
                              {c.time}
                            </td>
                            <td style={{ padding: "10px 16px", fontWeight: 600, color: "var(--green)" }}>
                              {c.name}
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              <TypeBadge type={c.type} />
                            </td>
                            <td style={{ padding: "10px 16px", color: "var(--muted)" }}>
                              {c.type === "jobseeker"
                                ? `Wants: ${c.position}`
                                : c.type === "employer"
                                ? c.company
                                  ? `Repping: ${c.company}`
                                  : "—"
                                : "—"}
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              {c.type !== "jobseeker" ? (
                                <span style={{ color: "var(--muted)" }}>—</span>
                              ) : c.matchedEmployer ? (
                                <span style={{ color: "var(--violet)", fontSize: 12, fontWeight: 600 }}>
                                  → {c.matchedEmployer}
                                </span>
                              ) : (
                                <span style={{ color: "var(--muted)", fontSize: 12 }}>No match yet</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Match ledger */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Sparkles size={15} color="var(--amber)" />
                <h2 className="cx-display" style={{ fontSize: 16, fontWeight: 600 }}>
                  Match ledger
                </h2>
              </div>
              {matches.length === 0 ? (
                <div style={{ ...cardStyle, color: "var(--muted)", fontSize: 13 }}>
                  No matches yet — job seeker check-ins will appear here the moment they land an
                  open role. Each job seeker is merged with one employer only.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {matches.map((m) => (
                    <div
                      key={m.id}
                      className="cx-fade-up"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 18px",
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        flexWrap: "wrap",
                      }}
                    >
                      <Chip color="var(--amber)" icon={Briefcase} label={m.name} sub="Job seeker" />
                      <div
                        style={{
                          flex: 1,
                          minWidth: 30,
                          height: 2,
                          background:
                            "repeating-linear-gradient(90deg, var(--amber) 0 6px, transparent 6px 12px)",
                        }}
                      />
                      <div
                        className="cx-mono"
                        style={{
                          fontSize: 11,
                          color: "var(--text)",
                          padding: "5px 12px",
                          border: "1px solid var(--border)",
                          borderRadius: 999,
                          background: "var(--surface)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.matchedPosition}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 30,
                          height: 2,
                          background:
                            "repeating-linear-gradient(90deg, var(--violet) 0 6px, transparent 6px 12px)",
                        }}
                      />
                      <Chip color="var(--violet)" icon={Building2} label={m.matchedEmployer} sub="Employer" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Analytics */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span className="cx-mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 2 }}>
                  BACKEND ONLY
                </span>
              </div>
              <h2 className="cx-display" style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>
                Attendance analytics
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <div>
                  <h3 className="cx-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                    Demographics
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
                    Based on {analytics.total} check-in{analytics.total === 1 ? "" : "s"} so far.
                  </p>
                  {checkins.length === 0 ? (
                    <div style={cardStyle}>
                      <div style={{ color: "var(--muted)", fontSize: 13 }}>
                        No check-ins yet — demographics will populate as people scan in at the kiosk.
                      </div>
                    </div>
                  ) : (
                    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 14 }}>
                      {Object.entries(TYPE_META).map(([key, meta]) => {
                        const count = analytics.byType[key];
                        const pct = Math.round((count / analytics.total) * 100);
                        return (
                          <div key={key}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                <meta.icon size={14} color={meta.color} />
                                {meta.label}
                              </span>
                              <span className="cx-mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                                {count} · {pct}%
                              </span>
                            </div>
                            <div style={{ height: 8, borderRadius: 999, background: "var(--surface2)", overflow: "hidden" }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: "100%",
                                  background: meta.color,
                                  borderRadius: 999,
                                  transition: "width .4s ease",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="cx-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
                    Check-in rate vs. registered
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="cx-import-grid">
                    {analytics.checkinRates.map((r) => (
                      <div key={r.label} style={{ ...cardStyle, padding: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</span>
                          <span className="cx-display" style={{ fontSize: 18, fontWeight: 700, color: r.color }}>
                            {r.pct}%
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: "var(--surface2)", overflow: "hidden", marginBottom: 8 }}>
                          <div style={{ width: `${r.pct}%`, height: "100%", background: r.color, borderRadius: 999 }} />
                        </div>
                        <div className="cx-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                          {r.checkedIn} checked in / {r.registered} registered
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="cx-display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
                    Job seeker matching
                  </h3>
                  {analytics.jobseekerTotal === 0 ? (
                    <div style={cardStyle}>
                      <div style={{ color: "var(--muted)", fontSize: 13 }}>
                        No job seekers checked in yet.
                      </div>
                    </div>
                  ) : (
                    <div style={{ ...cardStyle, padding: 18 }}>
                      <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
                        <div
                          style={{
                            width: `${Math.round((analytics.matchedCount / analytics.jobseekerTotal) * 100)}%`,
                            background: "var(--violet)",
                          }}
                        />
                        <div
                          style={{
                            width: `${Math.round((analytics.unmatchedCount / analytics.jobseekerTotal) * 100)}%`,
                            background: "var(--surface2)",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--violet)", display: "inline-block" }} />
                          Matched — {analytics.matchedCount}
                        </span>
                        <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--surface2)", border: "1px solid var(--border)", display: "inline-block" }} />
                          Awaiting a match — {analytics.unmatchedCount}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="cx-kiosk-grid">
                  <div>
                    <h3 className="cx-display" style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                      Most requested positions
                    </h3>
                    {analytics.topPositions.length === 0 ? (
                      <div style={cardStyle}>
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>No positions requested yet.</div>
                      </div>
                    ) : (
                      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
                        {analytics.topPositions.map(([pos, count]) => (
                          <div key={pos} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13 }}>{pos}</span>
                            <span
                              className="cx-mono"
                              style={{ fontSize: 11, color: "var(--amber)", border: "1px solid var(--amber)", borderRadius: 999, padding: "2px 9px" }}
                            >
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="cx-display" style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                      Employers making the most matches
                    </h3>
                    {analytics.topEmployers.length === 0 ? (
                      <div style={cardStyle}>
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>No matches yet.</div>
                      </div>
                    ) : (
                      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
                        {analytics.topEmployers.map(([name, count]) => (
                          <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13 }}>{name}</span>
                            <span
                              className="cx-mono"
                              style={{ fontSize: 11, color: "var(--violet)", border: "1px solid var(--violet)", borderRadius: 999, padding: "2px 9px" }}
                            >
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {adminModalOpen && (
        <div
          onClick={() => setAdminModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(4,6,10,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="cx-fade-up"
            style={{
              ...cardStyle,
              width: "100%",
              maxWidth: 420,
              position: "relative",
            }}
          >
            <button
              onClick={() => setAdminModalOpen(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
            <div style={{ marginBottom: 8 }} className="cx-mono">ADMIN SIGN-IN</div>
            <h3 className="cx-display" style={{ marginTop: 0 }}>Sign in to Control Room</h3>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="Email"
              style={{ ...inputStyle, marginTop: 12 }}
            />
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Password"
              style={{ ...inputStyle, marginTop: 8 }}
            />
            {adminAuthError && (
              <div style={{ color: 'var(--amber)', marginTop: 8 }}>{adminAuthError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setAdminModalOpen(false)} style={{ flex: 1 }}>Cancel</button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'login', email: adminEmail, password: adminPassword }) });
                    if (res.ok) {
                      setAdminAuthed(true);
                      setAdminModalOpen(false);
                      setView('admin');
                    } else {
                      const data = await res.json();
                      setAdminAuthError(data.error || 'Invalid credentials');
                    }
                  } catch (e) {
                    setAdminAuthError('Network error');
                  }
                }}
                style={{ flex: 1, background: 'var(--cyan)', color: '#06111A', border: 'none', padding: '9px 12px', borderRadius: 8 }}
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(4,6,10,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="cx-fade-up"
            style={{
              ...cardStyle,
              width: "100%",
              maxWidth: 420,
              position: "relative",
            }}
          >
            <button
              onClick={() => setModalOpen(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>

            {step === "form" ? (
              <>
                <div className="cx-mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1.5 }}>
                  CHECK-IN
                </div>
                <h2 className="cx-display" style={{ fontSize: 20, fontWeight: 700, margin: "6px 0 20px" }}>
                  Welcome — who's checking in?
                </h2>

                <label style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, display: "block" }}>
                  Full name, code (e.g. CF001...) or phone
                </label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Doe or CF00123 or +15551234567"
                  style={{ ...inputStyle, marginBottom: 18 }}
                />

                <label style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, display: "block" }}>
                  I am a...
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
                  {Object.entries(TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    const active = form.type === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setForm((f) => ({ ...f, type: key }))}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                          padding: "12px 6px",
                          borderRadius: 12,
                          border: active ? `1px solid ${meta.color}` : "1px solid var(--border)",
                          background: active ? "var(--surface2)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <Icon size={17} color={active ? meta.color : "var(--muted)"} />
                        <span style={{ fontSize: 11, color: active ? meta.color : "var(--muted)", fontWeight: 600 }}>
                          {meta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {form.type === "jobseeker" && (
                  <div className="cx-fade-up" style={{ marginBottom: 18 }}>
                    <label style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, display: "block" }}>
                      What position are you looking for?
                    </label>
                    <input
                      list="cx-openings"
                      value={form.position}
                      onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                      placeholder="e.g. Frontend Engineer"
                      style={inputStyle}
                    />
                    <datalist id="cx-openings">
                      {openingsList.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                    <div className="cx-mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                      We'll check every employer's open roles instantly.
                    </div>
                  </div>
                )}

                {form.type === "employer" && (
                  <div className="cx-fade-up" style={{ marginBottom: 18 }}>
                    <label style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, display: "block" }}>
                      Representing which company? (optional)
                    </label>
                    <input
                      list="cx-employers"
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder="e.g. Nexora Systems"
                      style={inputStyle}
                    />
                    <datalist id="cx-employers">
                      {employers.map((e) => (
                        <option key={e.id} value={e.name} />
                      ))}
                    </datalist>
                  </div>
                )}

                <PrimaryButton disabled={!canSubmit} onClick={submitCheckin} style={{ width: "100%" }}>
                  Check in <ArrowRight size={15} />
                </PrimaryButton>
              </>
            ) : (
              <div className="cx-fade-up" style={{ textAlign: "center", padding: "10px 0" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: "rgba(52,211,153,0.12)",
                    border: "1px solid var(--green)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <Check size={24} color="var(--green)" />
                </div>
                <h2 className="cx-display" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                  You're checked in, {result?.name.split(" ")[0]}!
                </h2>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <TypeBadge type={result?.type} />
                </div>

                {result?.type === "jobseeker" &&
                  (result?.matchedEmployer ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 16,
                        borderRadius: 14,
                        background: "var(--surface2)",
                        border: "1px solid var(--violet)",
                        textAlign: "left",
                      }}
                    >
                      <div className="cx-mono" style={{ fontSize: 10, color: "var(--amber)", letterSpacing: 1 }}>
                        MATCH FOUND
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, margin: "6px 0 2px" }}>
                        {result.matchedEmployer}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        is hiring for {result.matchedPosition}. You've been merged with this employer.
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 16,
                        borderRadius: 14,
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        color: "var(--muted)",
                        fontSize: 12,
                        textAlign: "left",
                      }}
                    >
                      No employer has "{result?.position}" open right now — we'll keep checking as
                      more employers check in.
                    </div>
                  ))}

                <PrimaryButton onClick={() => setModalOpen(false)} style={{ width: "100%", marginTop: 20 }}>
                  Done
                </PrimaryButton>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 880px) {
          .cx-kiosk-grid { grid-template-columns: 1fr !important; }
          .cx-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .cx-import-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
