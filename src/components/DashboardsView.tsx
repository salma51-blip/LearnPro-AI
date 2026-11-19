import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  AlertCircle,
  Award,
  KeyRound,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { extractPdfInBrowser } from '../lib/pdfClientExtractor';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Assessment,
  AssignedPlan,
  GradeLevel,
  MistakeRecord,
  RevisionItem,
  SUBJECTS,
  SUBJECT_IMAGES,
  Subject,
  TEACHER_EMAIL,
  Textbook,
  TextbookChapter,
  UserWorkspace,
  ViewMode,
  VisualLesson,
  getSubjectLabel,
} from '../types/learnpro';

interface Props {
  uid: string;
  isTeacherAdmin?: boolean;
  teacherPin?: string;
  onUpdateTeacherPin?: (pin: string) => void;
  workspace: UserWorkspace;
  viewMode: ViewMode;
  textbooks: Textbook[];
  chaptersByBook: Record<string, TextbookChapter[]>;
  lessons: VisualLesson[];
  assessments: Assessment[];
  mistakes: MistakeRecord[];
  revisions: RevisionItem[];
  plans: AssignedPlan[];
  onNavigateVisual: (subject: Subject) => void;
  onNavigateAssessments: () => void;
  onNavigateRetention: () => void;
}

export const DashboardsView: React.FC<Props> = ({
  uid,
  isTeacherAdmin = false,
  teacherPin = '1234',
  onUpdateTeacherPin,
  workspace,
  viewMode,
  textbooks,
  chaptersByBook,
  lessons,
  assessments,
  mistakes,
  revisions,
  plans,
  onNavigateVisual,
  onNavigateAssessments,
  onNavigateRetention,
}) => {
  // Teacher PDF Upload State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadSubject, setUploadSubject] = useState<Subject>('Mathematics');
  const [uploadGrade, setUploadGrade] = useState<GradeLevel>('Grade 5');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Teacher Plan Assignment State
  const [assignSubject, setAssignSubject] = useState<Subject>('Mathematics');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignTopic, setAssignTopic] = useState('');
  const [assignType, setAssignType] = useState<'lesson' | 'assessment' | 'revision'>('lesson');
  const [assigning, setAssigning] = useState(false);

  // Teacher Handwritten Review State
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewScores, setReviewScores] = useState<Record<string, number>>({});
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState(teacherPin);
  const [pinSavedNotice, setPinSavedNotice] = useState<string | null>(null);

  async function handlePdfUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!pdfFile) return;
    setErrorMsg(null);
    setUploadStatus('Opening PDF and reading pages...');
    setUploading(true);
    try {
      const extracted = await extractPdfInBrowser(pdfFile, (msg) => setUploadStatus(msg));
      const bookTitle =
        uploadTitle.trim() || pdfFile.name.replace(/\.pdf$/i, '') || `${uploadSubject} Textbook`;

      let data: any = null;

      if (!extracted.pages || extracted.pages.length === 0) {
        if (pdfFile.size <= 12 * 1024 * 1024) {
          setUploadStatus('Reading PDF directly with AI document parser...');
          const formData = new FormData();
          formData.append('file', pdfFile);
          formData.append('subject', uploadSubject);
          formData.append('grade', uploadGrade);
          formData.append('title', bookTitle);

          const fallbackResp = await fetch('/api/textbooks/extract', {
            method: 'POST',
            body: formData,
          });
          const rawFallback = await fallbackResp.text();
          try {
            data = JSON.parse(rawFallback);
          } catch {
            data = {};
          }
          if (!fallbackResp.ok) {
            throw new Error(
              data.error ||
                'No readable text could be extracted from this PDF. Please check that the file is not encrypted or blank.'
            );
          }
        } else {
          throw new Error(
            'No readable text could be extracted from this PDF. Please check that the file is not encrypted or blank.'
          );
        }
      } else {
        setUploadStatus('Organizing chapters & creating RAG vector embeddings...');
        const resp = await fetch('/api/textbooks/structure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: bookTitle,
            subject: uploadSubject,
            grade: uploadGrade,
            pageCount: extracted.pageCount,
            pages: extracted.pages,
          }),
        });
        const rawText = await resp.text();
        try {
          data = JSON.parse(rawText);
        } catch {
          data = {};
        }
        if (!resp.ok) {
          throw new Error(
            data.error ||
              (resp.status === 503
                ? 'The AI model is temporarily experiencing high demand. Please wait a few seconds and try uploading again.'
                : 'PDF structuring failed.')
          );
        }
      }

      const textbookId = `tb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const shareFlag = isTeacherAdmin ? { sharedWithClassroom: true } : {};
      try {
        await setDoc(doc(db, 'textbooks', textbookId), {
          ownerId: uid,
          subject: data.subject,
          title: String(data.title || 'Uploaded Textbook').slice(0, 180),
          grade: data.grade || uploadGrade,
          pageCount: Math.max(1, Number(data.pageCount) || 1),
          chunkCount: Array.isArray(data.chunks) ? data.chunks.length : 0,
          status: 'ready',
          ...shareFlag,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const batch = writeBatch(db);
        (data.chapters || []).slice(0, 20).forEach(
          (
            ch: {
              chapterNumber: number;
              title: string;
              summary: string;
              pageStart: number;
              pageEnd: number;
              topics: string[];
            },
            idx: number
          ) => {
            const chRef = doc(db, 'textbooks', textbookId, 'chapters', `ch_${idx + 1}`);
            const safeSummary =
              String(ch.summary || ch.title || 'Chapter summary').trim().slice(0, 1200) ||
              'Chapter summary';
            batch.set(chRef, {
              ownerId: uid,
              textbookId,
              chapterNumber: ch.chapterNumber || idx + 1,
              title: String(ch.title || `Chapter ${idx + 1}`).slice(0, 180),
              summary: safeSummary,
              pageStart: Math.max(1, Number(ch.pageStart) || 1),
              pageEnd: Math.max(Math.max(1, Number(ch.pageStart) || 1), Number(ch.pageEnd) || 1),
              topics:
                Array.isArray(ch.topics) && ch.topics.length > 0
                  ? ch.topics.slice(0, 15)
                  : ['Core Topic'],
              ...shareFlag,
              createdAt: serverTimestamp(),
            });
          }
        );

        (data.chunks || []).slice(0, 50).forEach(
          (
            chk: {
              chapterTitle: string;
              topicTitle: string;
              pageNumber: number;
              content: string;
              embedding: number[];
            },
            idx: number
          ) => {
            const chkRef = doc(db, 'textbooks', textbookId, 'chunks', `chk_${idx + 1}`);
            const safeContent =
              String(chk.content || chk.topicTitle || 'Textbook excerpt').trim().slice(0, 3800) ||
              'Textbook excerpt';
            batch.set(chkRef, {
              ownerId: uid,
              textbookId,
              subject: data.subject,
              chapterTitle: String(chk.chapterTitle || 'Chapter 1').slice(0, 180),
              topicTitle: String(chk.topicTitle || 'Core Topic').slice(0, 180),
              pageNumber: Math.max(1, Number(chk.pageNumber) || 1),
              content: safeContent,
              embedding:
                Array.isArray(chk.embedding) && chk.embedding.length > 0 ? chk.embedding : [0],
              ...shareFlag,
              createdAt: serverTimestamp(),
            });
          }
        );
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `textbooks/${textbookId}`);
      }

      setUploadStatus(
        `Indexed "${data.title}" (${data.pageCount} pages, ${data.chapters?.length || 0} chapters, ${data.chunks?.length || 0} RAG chunks).`
      );
      setPdfFile(null);
      setUploadTitle('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF upload failed.');
      setUploadStatus(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteTextbook(book: Textbook) {
    setDeletingBookId(book.id);
    setErrorMsg(null);
    try {
      const [chaptersSnap, chunksSnap] = await Promise.all([
        getDocs(collection(db, 'textbooks', book.id, 'chapters')),
        getDocs(collection(db, 'textbooks', book.id, 'chunks')),
      ]);
      const batch = writeBatch(db);
      chaptersSnap.docs.forEach((d) => batch.delete(d.ref));
      chunksSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      await deleteDoc(doc(db, 'textbooks', book.id));
      setUploadStatus(`Removed "${book.title}" from the classroom textbook library.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `textbooks/${book.id}`);
    } finally {
      setDeletingBookId(null);
    }
  }

  async function handleTogglePlan(plan: AssignedPlan) {
    try {
      await updateDoc(doc(db, 'assignedPlans', plan.id), {
        status: plan.status === 'completed' ? 'pending' : 'completed',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assignedPlans/${plan.id}`);
    }
  }

  async function handleAssignPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTitle.trim()) return;
    setAssigning(true);
    try {
      await addDoc(collection(db, 'assignedPlans'), {
        ownerId: uid,
        subject: assignSubject,
        title: assignTitle.trim().slice(0, 180),
        topicTitle: (assignTopic.trim() || `${getSubjectLabel(assignSubject)} Topic`).slice(0, 180),
        itemType: assignType,
        status: 'pending',
        dueDate: new Date().toISOString().slice(0, 10),
        ...(isTeacherAdmin ? { sharedWithClassroom: true } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAssignTitle('');
      setAssignTopic('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'assignedPlans');
    } finally {
      setAssigning(false);
    }
  }

  async function handleSaveTeacherReview(a: Assessment) {
    setSavingReviewId(a.id);
    try {
      const nextScore =
        reviewScores[a.id] !== undefined ? Math.min(a.maxScore, Math.max(0, reviewScores[a.id])) : a.score;
      await updateDoc(doc(db, 'assessments', a.id), {
        status: 'graded',
        score: nextScore,
        teacherNotes: (reviewNotes[a.id] || 'Reviewed and approved by teacher.').slice(0, 2000),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assessments/${a.id}`);
    } finally {
      setSavingReviewId(null);
    }
  }

  const pendingTests = assessments.filter((a) => a.status === 'pending');
  const gradedTests = assessments.filter((a) => a.status === 'graded');
  const needsReviewTests = assessments.filter((a) => a.status === 'needs_review');
  const activeMistakes = mistakes.filter((m) => !m.resolved);
  const dueRevisions = revisions.filter((r) => r.status === 'due');
  const completedLessons = lessons.filter((l) => l.completed);

  const avgTestPct =
    gradedTests.length > 0
      ? Math.round(
          (gradedTests.reduce((s, a) => s + a.score / Math.max(1, a.maxScore), 0) /
            gradedTests.length) *
            100
        )
      : null;

  /* ---------------- STUDENT DASHBOARD ---------------- */
  if (viewMode === 'student') {
    return (
      <div className="space-y-8">
        {/* Welcome Hero Row */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-xs font-semibold text-sky-700">
              {workspace.grade} · {workspace.curriculum}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Welcome back, {workspace.studentName}
            </h1>
            <p className="text-sm text-slate-600">
              Learn step by step with visual models first, then prove what you know with short written checks.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 shrink-0 text-center">
            <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Visual Lessons</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {completedLessons.length}/{lessons.length}
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Pending Tests</div>
              <div className="text-lg font-bold font-mono tabular-nums text-sky-700">
                {pendingTests.length}
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500">Due Revisions</div>
              <div className="text-lg font-bold font-mono tabular-nums text-amber-700">
                {dueRevisions.length}
              </div>
            </div>
          </div>
        </div>

        {/* Subjects Visual Grid (Textbook-Only Syllabus) */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">Your Uploaded Subjects &amp; Textbooks</h2>
            <span className="text-xs text-slate-500">
              Strict Textbook-Only Syllabus · Click any subject to open Visual Studio
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {SUBJECTS.map((subj) => {
              const subjLabel = getSubjectLabel(subj);
              const subjBooks = textbooks.filter((b) => b.subject === subj);
              const subjChapters = subjBooks.flatMap((b) => chaptersByBook[b.id] || []);
              const subjLessons = lessons.filter((l) => l.subject === subj);
              const doneCount = subjLessons.filter((l) => l.completed).length;
              const isReady = subjBooks.length > 0;

              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => onNavigateVisual(subj)}
                  className={`text-left bg-white border rounded-xl overflow-hidden transition-colors group flex flex-col ${
                    isReady
                      ? 'border-slate-200 hover:border-sky-400'
                      : 'border-dashed border-slate-300 opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                    <img
                      src={SUBJECT_IMAGES[subj]}
                      alt={`${subjLabel} textbook visual`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <div className="text-base font-bold text-slate-900">{subjLabel}</div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        {isReady
                          ? subjChapters[0]?.title || subjBooks[0]?.title
                          : 'Pending Teacher Upload'}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600">
                      <span>{isReady ? `${subjChapters.length} chapters` : '0 books'}</span>
                      <span>
                        {isReady ? `${doneCount}/${subjLessons.length} done` : 'Locked'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Today's Plan + Pending Tests + Weak Topics & Revisions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Today's Plan */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">Today&apos;s Learning Plan</h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {plans.filter((p) => p.status === 'completed').length}/{plans.length} done
              </span>
            </div>
            {plans.length === 0 ? (
              <p className="text-xs text-slate-500">No tasks assigned yet today.</p>
            ) : (
              <div className="space-y-2.5">
                {plans.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
                  >
                    <input
                      type="checkbox"
                      checked={p.status === 'completed'}
                      onChange={() => handleTogglePlan(p)}
                      className="mt-0.5 w-4 h-4 accent-sky-600 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs font-semibold ${
                          p.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {p.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {getSubjectLabel(p.subject)} · {p.itemType}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Tests & Previous Results */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">Pending & Recent Tests</h2>
              <button
                type="button"
                onClick={onNavigateAssessments}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                Open All
              </button>
            </div>
            <div className="space-y-2.5">
              {assessments.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{a.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {getSubjectLabel(a.subject)} · {a.assessmentType}
                    </div>
                  </div>
                  {a.status === 'graded' ? (
                    <span className="text-xs font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                      {a.score}/{a.maxScore}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={onNavigateAssessments}
                      className="px-2.5 py-1 bg-sky-600 text-white text-[11px] font-semibold rounded-md hover:bg-sky-700 shrink-0"
                    >
                      Start
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Weak Topics, Revisions & Milestones */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">Focus & Milestones</h2>
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="font-bold text-amber-900">Topics to Practice ({activeMistakes.length})</div>
                <div className="text-amber-800 mt-1">
                  {activeMistakes.length > 0
                    ? activeMistakes
                        .slice(0, 2)
                        .map((m) => `${getSubjectLabel(m.subject)}: ${m.topicTitle}`)
                        .join(' · ')
                    : 'No unresolved mistakes right now.'}
                </div>
              </div>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <div className="font-bold text-sky-900">Revision Reminders ({dueRevisions.length})</div>
                <button
                  type="button"
                  onClick={onNavigateRetention}
                  className="text-sky-700 font-semibold hover:underline mt-1 inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Open Spaced Revision
                </button>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="font-bold text-emerald-900">Learning Milestone</div>
                <div className="text-emerald-800 mt-0.5 font-mono tabular-nums">
                  {completedLessons.length} visual lessons · {gradedTests.length} tests completed
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- TEACHER DASHBOARD ---------------- */
  if (viewMode === 'teacher') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 mb-1">
              <ShieldCheck className="w-4 h-4" />
              Teacher Special Account Verified ({TEACHER_EMAIL})
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Teacher Curriculum &amp; Review Console</h1>
            <p className="text-sm text-slate-600">
              Upload Grade 5 PDF textbooks (synced directly to your student&apos;s workspace), assign plans, and review handwritten work
            </p>
          </div>
          {onUpdateTeacherPin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pinDraft.trim().length < 4) return;
                onUpdateTeacherPin(pinDraft.trim());
                setPinSavedNotice('Teacher unlock PIN updated.');
                window.setTimeout(() => setPinSavedNotice(null), 3000);
              }}
              className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs"
            >
              <KeyRound className="w-4 h-4 text-sky-600 shrink-0" />
              <div>
                <div className="font-semibold text-slate-800">Student Mode Unlock PIN</div>
                <div className="text-[11px] text-slate-500">
                  {pinSavedNotice || 'Used to unlock Teacher Portal after Lock Student Mode'}
                </div>
              </div>
              <input
                type="password"
                minLength={4}
                maxLength={12}
                value={pinDraft}
                onChange={(e) => setPinDraft(e.target.value)}
                className="w-20 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
              />
              <button
                type="submit"
                disabled={pinDraft.trim().length < 4}
                className="px-3 py-1.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
              >
                Save PIN
              </button>
            </form>
          )}
        </div>

        {/* Textbook-Only Syllabus Readiness Checklist */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Classroom Textbook Syllabus Readiness (Strict Textbook-Only Mode)
            </h2>
            <span className="text-xs text-slate-500">
              Out-of-textbook syllabus is disabled until its PDF is uploaded below
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {SUBJECTS.map((subj) => {
              const count = textbooks.filter((b) => b.subject === subj).length;
              return (
                <div
                  key={subj}
                  className={`p-3 rounded-lg border text-xs ${
                    count > 0
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="font-bold">{getSubjectLabel(subj)}</div>
                  <div className="mt-1 text-[11px]">
                    {count > 0
                      ? `${count} PDF textbook${count === 1 ? '' : 's'} active`
                      : subj === 'Humanities'
                      ? 'Pending post-publish upload'
                      : 'Not uploaded yet'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
            {errorMsg}
          </div>
        )}
        {uploadStatus && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium">
            {uploadStatus}
          </div>
        )}

        {/* PDF Textbook Upload & RAG Indexing */}
        <form
          onSubmit={handlePdfUpload}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <FileUp className="w-5 h-5 text-sky-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Upload Textbook PDF (RAG Indexing)</h2>
              <p className="text-xs text-slate-500">
                Extracts text page-by-page, organizes chapters &amp; topics, and syncs the uploaded textbook to Student Workspace
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
              <select
                value={uploadSubject}
                onChange={(e) => setUploadSubject(e.target.value as Subject)}
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Grade Level</label>
              <select
                value={uploadGrade}
                onChange={(e) => setUploadGrade(e.target.value as GradeLevel)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              >
                {(['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] as GradeLevel[]).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Book Title (Optional)</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Grade 5 Textbook..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">PDF File</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 hover:file:bg-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={!pdfFile || uploading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-40"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {uploading ? 'Indexing...' : 'Extract & Index PDF'}
            </button>
          </div>
        </form>

        {/* Organized Textbooks & Chapters + Assign Learning Plan */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Indexed Textbooks &amp; Chapters ({textbooks.length})
            </h2>
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {textbooks.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No textbooks uploaded yet. Upload your Grade 5 English, Science, Mathematics, or Social &amp; Humanities PDFs above.
                </p>
              ) : (
                textbooks.map((tb) => {
                  const chs = chaptersByBook[tb.id] || [];
                  return (
                    <div key={tb.id} className="p-4 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-sky-700">
                            {getSubjectLabel(tb.subject)} · {tb.grade}
                          </div>
                          <div className="text-sm font-bold text-slate-900">{tb.title}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-xs font-mono tabular-nums text-slate-500">
                            {tb.pageCount}p · {tb.chunkCount} chunks
                          </div>
                          <button
                            type="button"
                            disabled={deletingBookId === tb.id}
                            onClick={() => handleDeleteTextbook(tb)}
                            title="Remove textbook"
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-40"
                          >
                            {deletingBookId === tb.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      {chs.map((ch) => (
                        <div key={ch.id} className="pl-3 border-l border-slate-200 text-xs space-y-1">
                          <div className="font-semibold text-slate-800">
                            Ch {ch.chapterNumber}: {ch.title} (pp. {ch.pageStart}–{ch.pageEnd})
                          </div>
                          <div className="text-slate-500">Topics: {ch.topics.join(' · ')}</div>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Assign Lesson or Test */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Assign Lesson or Assessment</h2>
            <form onSubmit={handleAssignPlan} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject</label>
                <select
                  value={assignSubject}
                  onChange={(e) => setAssignSubject(e.target.value as Subject)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {getSubjectLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Task Type</label>
                <select
                  value={assignType}
                  onChange={(e) =>
                    setAssignType(e.target.value as 'lesson' | 'assessment' | 'revision')
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                >
                  <option value="lesson">Visual Lesson</option>
                  <option value="assessment">Written Assessment</option>
                  <option value="revision">Memory Revision</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="e.g. Review Adding Fractions Visually"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Topic Name</label>
                <input
                  type="text"
                  value={assignTopic}
                  onChange={(e) => setAssignTopic(e.target.value)}
                  placeholder="e.g. Adding Fractions"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={assigning}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800"
              >
                <Plus className="w-4 h-4" /> Assign to Student Plan
              </button>
            </form>
          </div>
        </div>

        {/* Manual Teacher Review Queue for Handwritten Sheets */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Handwritten Answer Sheets Pending Review ({needsReviewTests.length})
          </h2>
          {needsReviewTests.length === 0 ? (
            <p className="text-xs text-slate-500">
              No handwritten sheets currently require manual review. When AI OCR confidence is uncertain, submissions appear here for teacher verification.
            </p>
          ) : (
            <div className="space-y-4">
              {needsReviewTests.map((a) => (
                <div key={a.id} className="p-4 border border-amber-200 bg-amber-50/40 rounded-xl space-y-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">
                      {a.title} ({getSubjectLabel(a.subject)})
                    </div>
                    <div className="text-xs font-mono text-amber-800">
                      AI Provisional Score: {a.score}/{a.maxScore}
                    </div>
                  </div>
                  {a.handwrittenPreview && (
                    <img
                      src={a.handwrittenPreview}
                      alt="Student handwritten answer sheet"
                      className="max-h-52 rounded-lg border border-slate-200"
                    />
                  )}
                  {a.evaluation?.transcribedWork && (
                    <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700">
                      {a.evaluation.transcribedWork}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Verified Score (/{a.maxScore})
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={a.maxScore}
                        value={reviewScores[a.id] ?? a.score}
                        onChange={(e) =>
                          setReviewScores((prev) => ({ ...prev, [a.id]: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Teacher Feedback</label>
                      <input
                        type="text"
                        value={reviewNotes[a.id] ?? ''}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                        placeholder="Great working steps on Step 1..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={savingReviewId === a.id}
                      onClick={() => handleSaveTeacherReview(a)}
                      className="py-2 px-4 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700"
                    >
                      Approve & Grade
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- PARENT DASHBOARD ---------------- */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Parent Progress & Consistency Report</h1>
        <p className="text-sm text-slate-600">
          Real-time overview of {workspace.studentName}&apos;s subject progress, written exam scores, and upcoming spaced revisions
        </p>
      </div>

      {/* Top KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Visual Lessons Completed</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {completedLessons.length} / {lessons.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Average Written Test Score</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-sky-700 mt-1">
            {avgTestPct !== null ? `${avgTestPct}%` : 'No tests graded'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Topics Needing Attention</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {activeMistakes.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Learning Consistency Streak</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {workspace.streakDays} day{workspace.streakDays === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Subject-wise Progress + Topics Requiring Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Subject-Wise Progress</h2>
          <div className="space-y-4">
            {SUBJECTS.map((subj) => {
              const sLessons = lessons.filter((l) => l.subject === subj);
              const sDone = sLessons.filter((l) => l.completed).length;
              const sTests = gradedTests.filter((a) => a.subject === subj);
              const sPct =
                sTests.length > 0
                  ? Math.round(
                      (sTests.reduce((sum, a) => sum + a.score / Math.max(1, a.maxScore), 0) /
                        sTests.length) *
                        100
                    )
                  : sLessons.length > 0
                  ? Math.round((sDone / sLessons.length) * 100)
                  : 0;

              return (
                <div key={subj} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{getSubjectLabel(subj)}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {sDone}/{sLessons.length} visual lessons · {sTests.length} graded tests ({sPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-600 rounded-full transition-all"
                      style={{ width: `${Math.max(4, sPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Topics Requiring Attention & Upcoming Revisions
          </h2>
          {activeMistakes.length === 0 && dueRevisions.length === 0 ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              All active topics and revision intervals are currently on track.
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              {activeMistakes.slice(0, 4).map((m) => (
                <div key={m.id} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {getSubjectLabel(m.subject)} · {m.topicTitle}
                  </div>
                  <div className="text-amber-800 mt-1">{m.misunderstanding}</div>
                </div>
              ))}
              {dueRevisions.slice(0, 3).map((r) => (
                <div key={r.id} className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sky-900">{r.topicTitle}</div>
                    <div className="text-sky-700">{getSubjectLabel(r.subject)} · Recall Due</div>
                  </div>
                  <Clock className="w-4 h-4 text-sky-600" />
                </div>
              ))}
            </div>
          )}

          {/* Recent Graded Tests */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-700">Recent Test Performance</div>
            {gradedTests.length === 0 ? (
              <p className="text-xs text-slate-500">No graded written tests yet.</p>
            ) : (
              gradedTests.slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs py-1">
                  <span className="text-slate-700 truncate pr-2">
                    <BookOpen className="w-3 h-3 inline mr-1.5 text-slate-400" />
                    {a.title}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                    {a.score}/{a.maxScore}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
