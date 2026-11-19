import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  BookOpen,
  Lightbulb,
  HelpCircle,
  Loader2,
  Plus,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  MistakeRecord,
  SUBJECTS,
  Subject,
  Textbook,
  TextbookChunk,
  TutorMessage,
  TutorSession,
  getSubjectLabel,
} from '../types/learnpro';

interface Props {
  uid: string;
  studentName: string;
  grade: string;
  initialSubject: Subject;
  initialTopic: string;
  initialTextbookId: string;
  textbooks: Textbook[];
  chunksByBook: Record<string, TextbookChunk[]>;
  mistakes: MistakeRecord[];
  onVisualizeTopic?: (subject: Subject, query: string) => void;
}

export const AdaptiveTutorView: React.FC<Props> = ({
  uid,
  studentName,
  grade,
  initialSubject,
  initialTopic,
  initialTextbookId,
  textbooks,
  chunksByBook,
  mistakes,
  onVisualizeTopic,
}) => {
  const [subject, setSubject] = useState<Subject>(initialSubject);
  const [topicTitle, setTopicTitle] = useState<string>(initialTopic || 'Equivalent Fractions');
  const [sessions, setSessions] = useState<TutorSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastHint, setLastHint] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSubject(initialSubject);
    if (initialTopic) setTopicTitle(initialTopic);
  }, [initialSubject, initialTopic]);

  // Listen to user's tutor sessions
  useEffect(() => {
    const toMs = (t: unknown): number => {
      if (t && typeof t === 'object' && 'toMillis' in t && typeof (t as { toMillis: () => number }).toMillis === 'function') {
        return (t as { toMillis: () => number }).toMillis();
      }
      return 0;
    };

    const q = query(collection(db, 'tutorSessions'), where('ownerId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TutorSession));
        list.sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt));
        setSessions(list);
        if (!activeSessionId && list.length > 0) {
          setActiveSessionId(list[0].id);
          setSubject(list[0].subject);
          setTopicTitle(list[0].topicTitle);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tutorSessions')
    );
    return () => unsub();
  }, [uid, activeSessionId]);

  // Listen to messages for active session
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    const toMs = (t: unknown): number => {
      if (t && typeof t === 'object' && 'toMillis' in t && typeof (t as { toMillis: () => number }).toMillis === 'function') {
        return (t as { toMillis: () => number }).toMillis();
      }
      return 0;
    };
    const q = query(
      collection(db, 'tutorSessions', activeSessionId, 'messages'),
      where('ownerId', '==', uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TutorMessage));
        list.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        setMessages(list);
        window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `tutorSessions/${activeSessionId}/messages`)
    );
    return () => unsub();
  }, [activeSessionId, uid]);

  const activeBook =
    textbooks.find((t) => t.id === initialTextbookId && t.subject === subject) ||
    textbooks.find((t) => t.subject === subject) ||
    null;

  const subjectChunks: TextbookChunk[] = textbooks
    .filter((t) => t.subject === subject)
    .flatMap((t) => chunksByBook[t.id] || []);

  const hasSubjectTextbook = Boolean(activeBook && subjectChunks.length > 0);

  async function startNewSession(subj: Subject = subject, topic: string = topicTitle) {
    setErrorMsg(null);
    const book = textbooks.find((t) => t.subject === subj);
    if (!book || (chunksByBook[book.id] || []).length === 0) {
      setErrorMsg(
        `No uploaded textbook found for ${getSubjectLabel(subj)}. Only uploaded textbook syllabus is active.`
      );
      return null;
    }
    const sessionId = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'tutorSessions', sessionId), {
        ownerId: uid,
        subject: subj,
        topicTitle: topic.slice(0, 180) || `${subj} Study`,
        textbookId: book.id,
        messageCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'tutorSessions', sessionId, 'messages'), {
        ownerId: uid,
        sessionId,
        role: 'tutor',
        content: `Hi ${studentName}! Let's explore **${topic || subj}** together step by step. Tell me what part feels confusing, or try explaining what you already picture in your head!`,
        checkQuestion: `What is one thing you already know or noticed about ${topic || subj}?`,
        citations: [],
        createdAt: serverTimestamp(),
      });
      setActiveSessionId(sessionId);
      setLastHint(null);
      setShowHint(false);
      return sessionId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `tutorSessions/${sessionId}`);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setErrorMsg(null);
    setSending(true);
    try {
      let sid = activeSessionId;
      if (!sid) {
        const created = await startNewSession(subject, topicTitle);
        if (!created) {
          setSending(false);
          return;
        }
        sid = created;
      }

      // Save student message
      await addDoc(collection(db, 'tutorSessions', sid, 'messages'), {
        ownerId: uid,
        sessionId: sid,
        role: 'student',
        content: trimmed.slice(0, 6000),
        createdAt: serverTimestamp(),
      });
      setInput('');

      const recentMistakes = mistakes
        .filter((m) => m.subject === subject && !m.resolved)
        .slice(0, 3)
        .map((m) => `${m.topicTitle}: ${m.misunderstanding}`);

      const resp = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          subject,
          topicTitle,
          studentName,
          grade,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          chunks: subjectChunks.slice(0, 60).map((c) => ({
            id: c.id,
            subject: c.subject,
            chapterTitle: c.chapterTitle,
            topicTitle: c.topicTitle,
            pageNumber: c.pageNumber,
            content: c.content,
            embedding: c.embedding,
          })),
          recentMistakes,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Tutor request failed.');
      }

      setLastHint(data.hint || null);
      setShowHint(false);

      await addDoc(collection(db, 'tutorSessions', sid, 'messages'), {
        ownerId: uid,
        sessionId: sid,
        role: 'tutor',
        content: String(data.reply || '').slice(0, 6000),
        checkQuestion: String(data.checkQuestion || '').slice(0, 500),
        citations: Array.isArray(data.citations) ? data.citations.slice(0, 5) : [],
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'tutorSessions', sid), {
        messageCount: messages.length + 2,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not reach AI Tutor.');
    } finally {
      setSending(false);
    }
  }

  const starterPrompts = [
    `Explain ${topicTitle} with an everyday example`,
    `I read the textbook paragraph on ${topicTitle} but don't get what it means`,
    `Give me a hint to solve a ${topicTitle} question step by step`,
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Adaptive AI Tutor</h1>
          <p className="text-sm text-slate-600">
            Patient, textbook-grounded guidance that explains with everyday examples and checks understanding before giving answers
          </p>
        </div>
        <button
          type="button"
          onClick={() => startNewSession(subject, topicTitle)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Tutor Session
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Subject, Topic & Past Sessions */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as Subject)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {getSubjectLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Current Topic Focus</label>
            <input
              type="text"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              placeholder="e.g. Topic from uploaded textbook"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            {hasSubjectTextbook && activeBook ? (
              <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
                <BookOpen className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="truncate">
                  Textbook-only: {activeBook.title} ({subjectChunks.length} passages)
                </span>
              </div>
            ) : (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1">
                No {getSubjectLabel(subject)} textbook uploaded yet. Tutor only teaches from uploaded textbooks.
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="text-xs font-semibold text-slate-500">Recent Tutor Sessions</div>
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-500">
                Ask your first question on the right or click New Tutor Session to begin.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSessionId(s.id);
                      setSubject(s.subject);
                      setTopicTitle(s.topicTitle);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                      s.id === activeSessionId
                        ? 'bg-sky-50 border-sky-300 text-sky-900 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="truncate">{s.topicTitle}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {s.subject} · {s.messageCount} messages
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Main Chat Canvas */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[540px] max-h-[700px]">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
            <div className="text-sm font-bold text-slate-900">
                {getSubjectLabel(subject)} · {topicTitle || 'Textbook Topic'}
              </div>
              <div className="text-xs text-slate-500">
                Strict Textbook-Only Syllabus · Step-by-step guidance mode
              </div>
            </div>
            {lastHint && (
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                {showHint ? 'Hide Visual Hint' : 'Show Visual Hint'}
              </button>
            )}
          </div>

          {showHint && lastHint && (
            <div className="mx-5 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <strong>Visual Hint: </strong>
              {lastHint}
            </div>
          )}

          {/* Message Feed */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!hasSubjectTextbook && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <strong>Waiting for Teacher PDF Upload:</strong> Your teacher has not uploaded the <strong>{getSubjectLabel(subject)}</strong> textbook yet. Only uploaded textbook syllabus is enabled—switch to an uploaded subject or wait for Teacher upload after publishing.
              </div>
            )}

            {messages.length === 0 && hasSubjectTextbook && (
              <div className="space-y-4 py-6">
                <p className="text-sm text-slate-600">
                  Ask anything you found tricky in your uploaded <strong>{getSubjectLabel(subject)}</strong> textbook. I will break it down into small steps with real-life examples and cite the exact textbook pages!
                </p>
                <div className="flex flex-wrap gap-2">
                  {starterPrompts.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInput(p)}
                      className="text-left px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'student' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                    m.role === 'student'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  {m.content}

                  {m.role === 'tutor' && m.checkQuestion && (
                    <div className="mt-3 pt-3 border-t border-slate-200 flex items-start gap-2 text-xs text-sky-900 font-medium">
                      <HelpCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Check Understanding: </strong>
                        {m.checkQuestion}
                      </span>
                    </div>
                  )}
                </div>

                {m.role === 'tutor' && (
                  <div className="mt-2 max-w-[85%] flex flex-wrap items-center gap-2">
                    {onVisualizeTopic && hasSubjectTextbook && (
                      <button
                        type="button"
                        onClick={() => onVisualizeTopic(subject, topicTitle)}
                        className="px-2.5 py-1.5 bg-sky-50 border border-sky-200 rounded-lg text-[11px] font-semibold text-sky-800 hover:bg-sky-100 inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Sparkles className="w-3 h-3 text-sky-600" />
                        Draw Animated Visual for This
                      </button>
                    )}
                    {m.citations &&
                      m.citations.map((cit, idx) => (
                        <div
                          key={idx}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-1.5"
                          title={cit.excerpt}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>
                            {cit.chapterTitle} · <span className="font-mono font-semibold">Page {cit.pageNumber}</span>
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                Searching uploaded textbook passages and preparing a visual step-by-step reply...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="p-4 border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={input}
              disabled={!hasSubjectTextbook}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                hasSubjectTextbook
                  ? 'Type what confuses you in your uploaded textbook...'
                  : `Upload ${getSubjectLabel(subject)} textbook PDF first...`
              }
              className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!hasSubjectTextbook || !input.trim() || sending}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
