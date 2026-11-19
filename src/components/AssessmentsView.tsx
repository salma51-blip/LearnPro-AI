import React, { useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  AlertCircle,
  Loader2,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Assessment,
  AssessmentType,
  MistakeRecord,
  SUBJECTS,
  Subject,
  Textbook,
  TextbookChapter,
  TextbookChunk,
  getSubjectLabel,
} from '../types/learnpro';

interface Props {
  uid: string;
  assessments: Assessment[];
  mistakes: MistakeRecord[];
  textbooks: Textbook[];
  chaptersByBook: Record<string, TextbookChapter[]>;
  chunksByBook: Record<string, TextbookChunk[]>;
}

async function compressImageToDataUrl(file: File, maxWidth = 1000, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });
}

export const AssessmentsView: React.FC<Props> = ({
  uid,
  assessments,
  mistakes,
  textbooks,
  chaptersByBook,
  chunksByBook,
}) => {
  const [activeAssessmentId, setActiveAssessmentId] = useState<string>(assessments[0]?.id || '');
  const [filterType, setFilterType] = useState<'all' | AssessmentType>('all');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [handwrittenFile, setHandwrittenFile] = useState<File | null>(null);
  const [handwrittenPreview, setHandwrittenPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Assessment Generator State
  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState<Subject>('Mathematics');
  const [newBookId, setNewBookId] = useState<string>('');
  const [newChapterId, setNewChapterId] = useState<string>('');
  const [newType, setNewType] = useState<AssessmentType>('topic');
  const [newMode, setNewMode] = useState<'digital' | 'handwritten'>('digital');
  const [newTopic, setNewTopic] = useState('');
  const [creating, setCreating] = useState(false);

  const subjectBooks = textbooks.filter((t) => t.subject === newSubject);
  const selectedBook =
    subjectBooks.find((t) => t.id === newBookId) || subjectBooks[subjectBooks.length - 1];
  const selectedBookChapters = selectedBook ? chaptersByBook[selectedBook.id] || [] : [];
  const selectedChapter =
    selectedBookChapters.find((c) => c.id === newChapterId) || selectedBookChapters[0];
  const selectedBookChunks = selectedBook ? chunksByBook[selectedBook.id] || [] : [];
  const hasSubjectTextbook = subjectBooks.length > 0 && selectedBookChunks.length > 0;

  // Mistake Practice Retry State
  const [practiceInputs, setPracticeInputs] = useState<Record<string, string>>({});
  const [practiceFeedback, setPracticeFeedback] = useState<
    Record<string, { isCorrect: boolean; feedback: string; nextTip: string }>
  >({});
  const [verifyingMistakeId, setVerifyingMistakeId] = useState<string | null>(null);

  const filtered = assessments.filter((a) => filterType === 'all' || a.assessmentType === filterType);
  const activeAssessment =
    assessments.find((a) => a.id === activeAssessmentId) || filtered[0] || null;

  async function handleGenerateAssessment(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!hasSubjectTextbook || !selectedBook) {
      setErrorMsg(
        `No uploaded textbook content found for ${getSubjectLabel(newSubject)}. Upload the ${getSubjectLabel(newSubject)} PDF textbook in Teacher Portal first — out-of-textbook syllabus is excluded.`
      );
      return;
    }
    setCreating(true);
    try {
      const book = selectedBook;
      const chapter = selectedChapter;
      const chosenTopic = newTopic.trim() || chapter?.topics?.[0] || `${getSubjectLabel(newSubject)} Practice`;
      const allBookChunks = chunksByBook[book.id] || [];
      const matchingChunks = chapter
        ? allBookChunks.filter(
            (c) =>
              c.chapterTitle.toLowerCase().includes(chapter.title.toLowerCase()) ||
              c.topicTitle.toLowerCase().includes(chosenTopic.toLowerCase())
          )
        : allBookChunks;
      const chunks = matchingChunks.length > 0 ? matchingChunks : allBookChunks;
      if (chunks.length === 0) {
        throw new Error(
          `No indexed passages found in "${book.title}". Re-upload the PDF in Teacher Portal.`
        );
      }
      const weakTopics = mistakes
        .filter((m) => m.subject === newSubject && !m.resolved)
        .map((m) => m.topicTitle);

      const resp = await fetch('/api/assessments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: newSubject,
          assessmentType: newType,
          chapterTitle: chapter?.title || `${newSubject} Syllabus`,
          topicTitle: chosenTopic,
          chunks: chunks.slice(0, 6),
          weakTopics,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Could not generate assessment.');

      const questions = Array.isArray(data.questions) ? data.questions : [];
      const maxScore = Math.max(
        1,
        questions.reduce((s: number, q: { points?: number }) => s + (Number(q.points) || 2), 0)
      );

      let refId = '';
      try {
        const ref = await addDoc(collection(db, 'assessments'), {
          ownerId: uid,
          subject: newSubject,
          title: String(data.title || `${chosenTopic} Test`).slice(0, 180),
          assessmentType: newType,
          chapterTitle: (chapter?.title || `${newSubject} Syllabus`).slice(0, 180),
          topicTitle: chosenTopic.slice(0, 180),
          mode: newMode,
          status: 'pending',
          questions,
          score: 0,
          maxScore,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        refId = ref.id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'assessments');
      }

      setActiveAssessmentId(refId);
      setAnswers({});
      setShowCreate(false);
      setNewTopic('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create assessment.');
    } finally {
      setCreating(false);
    }
  }

  async function saveMistakesToFirestore(
    subject: Subject,
    topicTitle: string,
    rawMistakes: Array<Record<string, string>>
  ) {
    for (const m of rawMistakes.slice(0, 5)) {
      try {
        await addDoc(collection(db, 'mistakes'), {
          ownerId: uid,
          subject,
          topicTitle: topicTitle.slice(0, 180),
          questionPrompt: String(m.questionPrompt || 'Question').slice(0, 1000),
          studentAnswer: String(m.studentAnswer || '(Blank)').slice(0, 1000),
          correctAnswer: String(m.correctAnswer || 'Review textbook').slice(0, 1000),
          misunderstanding: String(m.misunderstanding || 'Conceptual gap').slice(0, 1200),
          simpleExplanation: String(m.simpleExplanation || 'Let us break this down simply.').slice(0, 1500),
          visualHint: String(m.visualHint || 'Picture the concept with real objects.').slice(0, 1200),
          practiceQuestion: String(m.practiceQuestion || 'Try a similar question.').slice(0, 1000),
          practiceAnswer: String(m.practiceAnswer || 'Check step by step').slice(0, 500),
          resolved: false,
          occurrenceCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'mistakes');
      }
    }
  }

  async function handleSubmitDigital() {
    if (!activeAssessment) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const resp = await fetch('/api/assessments/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: activeAssessment.subject,
          topicTitle: activeAssessment.topicTitle,
          questions: activeAssessment.questions,
          studentAnswers: answers,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Evaluation failed.');

      try {
        await updateDoc(doc(db, 'assessments', activeAssessment.id), {
          status: 'graded',
          score: Number(data.score) || 0,
          maxScore: Math.max(1, Number(data.maxScore) || activeAssessment.maxScore),
          evaluation: {
            overallSummary: String(data.overallSummary || ''),
            strengths: String(data.strengths || ''),
            questionResults: Array.isArray(data.questionResults) ? data.questionResults : [],
          },
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `assessments/${activeAssessment.id}`);
      }

      if (Array.isArray(data.mistakes) && data.mistakes.length > 0) {
        await saveMistakesToFirestore(
          activeAssessment.subject,
          activeAssessment.topicTitle,
          data.mistakes
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to evaluate assessment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHandwrittenFile(file);
    try {
      const preview = await compressImageToDataUrl(file, 900, 0.68);
      setHandwrittenPreview(preview);
    } catch {
      setHandwrittenPreview(null);
    }
  }

  async function handleSubmitHandwritten() {
    if (!activeAssessment || !handwrittenFile) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('photo', handwrittenFile);
      formData.append('subject', activeAssessment.subject);
      formData.append('topicTitle', activeAssessment.topicTitle);
      formData.append('questions', JSON.stringify(activeAssessment.questions));

      const resp = await fetch('/api/assessments/evaluate-handwritten', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Handwritten OCR evaluation failed.');

      const nextStatus = data.needsTeacherReview ? 'needs_review' : 'graded';
      const safePreview =
        handwrittenPreview && handwrittenPreview.length < 320000 ? handwrittenPreview : undefined;

      try {
        await updateDoc(doc(db, 'assessments', activeAssessment.id), {
          status: nextStatus,
          score: Number(data.score) || 0,
          maxScore: Math.max(1, Number(data.maxScore) || activeAssessment.maxScore),
          ...(safePreview ? { handwrittenPreview: safePreview } : {}),
          evaluation: {
            overallSummary: String(data.overallSummary || ''),
            transcribedWork: String(data.transcribedWork || ''),
            confidence: Number(data.confidence) || 0.85,
            stepByStepAnalysis: Array.isArray(data.stepByStepAnalysis)
              ? data.stepByStepAnalysis
              : [],
          },
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `assessments/${activeAssessment.id}`);
      }

      if (Array.isArray(data.mistakes) && data.mistakes.length > 0) {
        await saveMistakesToFirestore(
          activeAssessment.subject,
          activeAssessment.topicTitle,
          data.mistakes
        );
      }
      setHandwrittenFile(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process handwritten sheet.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyMistakePractice(m: MistakeRecord) {
    const attempt = (practiceInputs[m.id] || '').trim();
    if (!attempt) return;
    setVerifyingMistakeId(m.id);
    try {
      const resp = await fetch('/api/mistakes/verify-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: m.subject,
          topicTitle: m.topicTitle,
          practiceQuestion: m.practiceQuestion,
          practiceAnswer: m.practiceAnswer,
          studentAttempt: attempt,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Verification failed.');

      setPracticeFeedback((prev) => ({ ...prev, [m.id]: data }));
      if (data.isCorrect) {
        await updateDoc(doc(db, 'mistakes', m.id), {
          resolved: true,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to verify practice attempt.');
    } finally {
      setVerifyingMistakeId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Continuous Written Assessments</h1>
          <p className="text-sm text-slate-600">
            Digital written answers, handwritten notebook photo OCR with step-by-step inspection, and targeted mistake remediation
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generate New Test
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Generator Drawer */}
      {showCreate && (
        <form
          onSubmit={handleGenerateAssessment}
          className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
            <select
              value={newSubject}
              onChange={(e) => {
                setNewSubject(e.target.value as Subject);
                setNewBookId('');
                setNewChapterId('');
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {getSubjectLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Textbook PDF</label>
            <select
              value={selectedBook?.id || ''}
              onChange={(e) => {
                setNewBookId(e.target.value);
                setNewChapterId('');
              }}
              disabled={subjectBooks.length === 0}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg disabled:bg-slate-50"
            >
              {subjectBooks.length === 0 ? (
                <option value="">Pending Teacher Upload</option>
              ) : (
                subjectBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Chapter</label>
            <select
              value={selectedChapter?.id || ''}
              onChange={(e) => setNewChapterId(e.target.value)}
              disabled={selectedBookChapters.length === 0}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg disabled:bg-slate-50"
            >
              {selectedBookChapters.length === 0 ? (
                <option value="">No uploaded chapters</option>
              ) : (
                selectedBookChapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Ch {c.chapterNumber}: {c.title}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Test Cadence</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as AssessmentType)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="topic">Topic-Wise Test</option>
              <option value="daily">Daily Assessment</option>
              <option value="weekly">Weekly Assessment</option>
              <option value="chapter">Chapter-Wise Test</option>
              <option value="revision">Revision Test</option>
              <option value="cumulative">Cumulative Assessment</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Answer Mode</label>
            <select
              value={newMode}
              onChange={(e) => setNewMode(e.target.value as 'digital' | 'handwritten')}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="digital">Digital Written</option>
              <option value="handwritten">Handwritten Notebook Photo</option>
            </select>
          </div>
          {!hasSubjectTextbook && (
            <div className="sm:col-span-2 lg:col-span-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <strong>Pending Textbook Upload:</strong> No textbook PDF has been uploaded for{' '}
              <strong>{getSubjectLabel(newSubject)}</strong> yet. Out-of-textbook syllabus is strictly
              excluded—upload this textbook in Teacher Portal to generate tests for it.
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Specific Topic (Optional — defaults to first topic in selected chapter)
              </label>
              <input
                type="text"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                disabled={!hasSubjectTextbook}
                placeholder={selectedChapter?.topics?.[0] || 'Upload textbook first'}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !hasSubjectTextbook}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-40"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Create Test from Textbook
            </button>
          </div>
        </form>
      )}

      {/* Main Split: Test Queue + Active Test Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'topic', 'daily', 'weekly', 'revision'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded capitalize ${
                  filterType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No tests in this filter yet. Click Generate New Test above.
              </p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setActiveAssessmentId(a.id);
                    setAnswers({});
                    setHandwrittenFile(null);
                    setHandwrittenPreview(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-lg border transition-colors ${
                    activeAssessment?.id === a.id
                      ? 'bg-sky-50 border-sky-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 truncate">{a.title}</span>
                    {a.status === 'graded' ? (
                      <span className="text-xs font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                        {a.score}/{a.maxScore}
                      </span>
                    ) : a.status === 'needs_review' ? (
                      <span className="text-[11px] font-semibold text-amber-700 shrink-0">Review</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-sky-700 shrink-0">Pending</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {getSubjectLabel(a.subject)} · {a.assessmentType} · {a.mode}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Active Test Workspace */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {!activeAssessment ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Select or generate an assessment from your uploaded textbooks to begin.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <div className="text-xs font-semibold text-sky-700">
                    {getSubjectLabel(activeAssessment.subject)} · {activeAssessment.chapterTitle} · {activeAssessment.assessmentType}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">{activeAssessment.title}</h2>
                </div>
                <div className="text-right">
                  {activeAssessment.status === 'graded' && (
                    <div className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 font-mono tabular-nums">
                      <CheckCircle2 className="w-4 h-4" />
                      Score: {activeAssessment.score} / {activeAssessment.maxScore}
                    </div>
                  )}
                  {activeAssessment.status === 'needs_review' && (
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                      <AlertCircle className="w-4 h-4" />
                      Flagged for Teacher Review ({activeAssessment.score}/{activeAssessment.maxScore})
                    </div>
                  )}
                </div>
              </div>

              {/* Pending: Answer Form (Digital OR Handwritten Photo Upload) */}
              {activeAssessment.status === 'pending' && (
                <div className="space-y-5">
                  <div className="space-y-4">
                    {activeAssessment.questions.map((q, idx) => (
                      <div key={q.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-900">
                            {idx + 1}. {q.prompt}
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                            {q.points} pts{q.pageRef ? ` · p.${q.pageRef}` : ''}
                          </span>
                        </div>

                        {activeAssessment.mode === 'digital' && (
                          <>
                            {q.options && q.options.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {q.options.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                                    className={`text-left px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                                      answers[q.id] === opt
                                        ? 'bg-sky-600 text-white border-sky-600'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <textarea
                                rows={3}
                                value={answers[q.id] || ''}
                                onChange={(e) =>
                                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                                }
                                placeholder={
                                  q.type === 'math_working'
                                    ? 'Write your step-by-step working AND final answer...'
                                    : 'Write your answer in complete sentences...'
                                }
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Mode A vs Mode B Action */}
                  {activeAssessment.mode === 'digital' ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <span className="text-xs text-slate-500">
                        AI grades both your working steps and your final answer.
                      </span>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSubmitDigital}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ClipboardCheck className="w-4 h-4" />
                        )}
                        Submit Written Answers
                      </button>
                    </div>
                  ) : (
                    <div className="p-5 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 space-y-4">
                      <div className="flex items-start gap-3">
                        <Camera className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-bold text-slate-900">
                            Upload Photo of Handwritten Notebook Work
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Solve the questions above neatly in your notebook showing all calculation steps, then upload a clear photo for AI OCR & step-by-step inspection.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer">
                          <Upload className="w-4 h-4" />
                          Choose Notebook Photo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoSelected}
                            className="hidden"
                          />
                        </label>
                        {handwrittenFile && (
                          <span className="text-xs text-slate-600">{handwrittenFile.name}</span>
                        )}
                      </div>

                      {handwrittenPreview && (
                        <img
                          src={handwrittenPreview}
                          alt="Uploaded handwritten notebook preview"
                          className="max-h-56 rounded-lg border border-slate-200"
                        />
                      )}

                      <button
                        type="button"
                        disabled={!handwrittenFile || submitting}
                        onClick={handleSubmitHandwritten}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-40"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Run OCR & Evaluate Working Steps
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Graded / Needs Review Report */}
              {activeAssessment.status !== 'pending' && activeAssessment.evaluation && (
                <div className="space-y-5">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-sm">
                    <div className="font-bold text-slate-900">Evaluation Summary</div>
                    <p className="text-slate-700">{activeAssessment.evaluation.overallSummary}</p>
                    {activeAssessment.evaluation.strengths && (
                      <p className="text-xs text-emerald-800 font-medium">
                        <strong>Strengths: </strong>
                        {activeAssessment.evaluation.strengths}
                      </p>
                    )}
                    {activeAssessment.teacherNotes && (
                      <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 p-2.5 rounded-lg mt-2">
                        <strong>Teacher Review Note: </strong>
                        {activeAssessment.teacherNotes}
                      </p>
                    )}
                  </div>

                  {activeAssessment.evaluation.transcribedWork && (
                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
                      <div className="text-xs font-bold text-slate-700">
                        OCR Transcribed Notebook Work
                      </div>
                      <p className="text-xs font-mono text-slate-700 whitespace-pre-line">
                        {activeAssessment.evaluation.transcribedWork}
                      </p>
                    </div>
                  )}

                  {activeAssessment.evaluation.stepByStepAnalysis &&
                    activeAssessment.evaluation.stepByStepAnalysis.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-700">
                          Step-by-Step Working Inspection
                        </div>
                        {activeAssessment.evaluation.stepByStepAnalysis.map((st, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border text-xs ${
                              st.isCorrect
                                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                : 'bg-amber-50/70 border-amber-200 text-amber-950'
                            }`}
                          >
                            <div className="font-bold">
                              {st.stepLabel} — {st.isCorrect ? 'Correct Step' : 'Needs Correction'}
                            </div>
                            <div className="font-mono mt-0.5">Wrote: {st.studentWrote}</div>
                            <div className="mt-1">{st.note}</div>
                          </div>
                        ))}
                      </div>
                    )}

                  {activeAssessment.evaluation.questionResults &&
                    activeAssessment.evaluation.questionResults.length > 0 && (
                      <div className="space-y-2.5">
                        {activeAssessment.evaluation.questionResults.map((qr, i) => (
                          <div
                            key={qr.id || i}
                            className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                              qr.isCorrect
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : 'bg-rose-50/60 border-rose-200'
                            }`}
                          >
                            <div className="flex justify-between font-bold text-slate-900">
                              <span>Question {i + 1}</span>
                              <span className="font-mono tabular-nums">
                                {qr.earnedPoints}/{qr.maxPoints} pts
                              </span>
                            </div>
                            <div className="text-slate-700">{qr.feedback}</div>
                            <div className="text-slate-600">
                              <strong>Working Analysis: </strong>
                              {qr.workingAnalysis}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mistake Analysis & Targeted Remediation Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Mistake Analysis & Guided Remediation
            </h2>
            <p className="text-xs text-slate-500">
              Every missed question is diagnosed for misunderstanding, paired with a visual hint, and practiced until mastered
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            {mistakes.filter((m) => !m.resolved).length} active · {mistakes.filter((m) => m.resolved).length} mastered
          </span>
        </div>

        {mistakes.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">
            No recorded mistakes yet. When you submit an assessment, any conceptual gaps will appear here with visual explanations and retry drills.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mistakes.map((m) => {
              const fb = practiceFeedback[m.id];
              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-xl border space-y-3 ${
                    m.resolved ? 'bg-slate-50 border-slate-200' : 'bg-white border-amber-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-sky-700">
                        {getSubjectLabel(m.subject)} · {m.topicTitle}
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">{m.questionPrompt}</div>
                    </div>
                    {m.resolved ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mastered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 shrink-0">
                        <AlertCircle className="w-3.5 h-3.5" /> Needs Practice
                      </span>
                    )}
                  </div>

                  <div className="text-xs space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <strong className="text-rose-700">Your answer: </strong>
                      <span className="text-slate-700">{m.studentAnswer}</span>
                    </div>
                    <div>
                      <strong className="text-amber-800">Why the mix-up happened: </strong>
                      <span className="text-slate-700">{m.misunderstanding}</span>
                    </div>
                    <div>
                      <strong className="text-slate-900">Simple explanation: </strong>
                      <span className="text-slate-700">{m.simpleExplanation}</span>
                    </div>
                    <div>
                      <strong className="text-sky-700">Visual picture: </strong>
                      <span className="text-slate-700">{m.visualHint}</span>
                    </div>
                  </div>

                  {!m.resolved && (
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-bold text-slate-900">
                        Try a Similar Question: {m.practiceQuestion}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={practiceInputs[m.id] || ''}
                          onChange={(e) =>
                            setPracticeInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                          }
                          placeholder="Type your answer..."
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                        <button
                          type="button"
                          disabled={verifyingMistakeId === m.id}
                          onClick={() => handleVerifyMistakePractice(m)}
                          className="px-3.5 py-1.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {verifyingMistakeId === m.id ? 'Checking...' : 'Check'}
                        </button>
                      </div>
                      {fb && (
                        <div
                          className={`p-2.5 rounded-lg text-xs ${
                            fb.isCorrect
                              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                              : 'bg-amber-50 text-amber-900 border border-amber-200'
                          }`}
                        >
                          <div>{fb.feedback}</div>
                          <div className="mt-1 font-medium">{fb.nextTip}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
