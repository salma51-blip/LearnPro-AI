import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Loader2,
  MessageSquare,
  MoveRight,
  Zap,
  Layers,
  Upload,
} from 'lucide-react';
import {
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  SUBJECTS,
  SUBJECT_ACCENTS,
  SUBJECT_IMAGES,
  Subject,
  Textbook,
  TextbookChapter,
  TextbookChunk,
  VisualLesson,
  getSubjectLabel,
} from '../types/learnpro';
import { InteractiveVisualStage } from './InteractiveVisualStage';

interface Props {
  uid: string;
  isTeacherAdmin?: boolean;
  selectedSubject: Subject;
  onSelectSubject: (s: Subject) => void;
  textbooks: Textbook[];
  chaptersByBook: Record<string, TextbookChapter[]>;
  chunksByBook: Record<string, TextbookChunk[]>;
  lessons: VisualLesson[];
  initialVisualRequest?: { subject: Subject; query: string; requestId: number } | null;
  onAskTutor: (subject: Subject, topicTitle: string, textbookId: string) => void;
}

export const VisualLearningView: React.FC<Props> = ({
  uid,
  isTeacherAdmin = false,
  selectedSubject,
  onSelectSubject,
  textbooks,
  chaptersByBook,
  chunksByBook,
  lessons,
  initialVisualRequest,
  onAskTutor,
}) => {
  const subjectBooks = textbooks.filter((t) => t.subject === selectedSubject);
  const subjectBookIds = new Set(subjectBooks.map((b) => b.id));
  const subjectLessons = lessons.filter(
    (l) => l.subject === selectedSubject && subjectBookIds.has(l.textbookId)
  );
  const subjectChunks = subjectBooks.flatMap((b) => chunksByBook[b.id] || []);
  const hasUploadedTextbook = subjectBooks.length > 0 && subjectChunks.length > 0;

  const [activeLessonId, setActiveLessonId] = useState<string>('');
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [checkSubmitted, setCheckSubmitted] = useState(false);
  const [generatingTopic, setGeneratingTopic] = useState<string | null>(null);
  const [customVisualQuery, setCustomVisualQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Interactive CSS Concept Animation Triggers
  const [motionRunKey, setMotionRunKey] = useState(0);
  const [motionActive, setMotionActive] = useState(false);
  const [stateChanged, setStateChanged] = useState(false);
  const [stateMorphKey, setStateMorphKey] = useState(0);
  const [activeConceptIdx, setActiveConceptIdx] = useState(0);

  const activeLesson =
    subjectLessons.find((l) => l.id === activeLessonId) || subjectLessons[0] || null;

  useEffect(() => {
    if (subjectLessons.length > 0 && !subjectLessons.some((l) => l.id === activeLessonId)) {
      setActiveLessonId(subjectLessons[0].id);
      setActiveStepIdx(0);
      setIsPlaying(false);
      setSelectedOption(null);
      setCheckSubmitted(false);
      setMotionActive(false);
      setStateChanged(false);
      setActiveConceptIdx(0);
    } else if (subjectLessons.length === 0) {
      setActiveLessonId('');
    }
  }, [selectedSubject, subjectLessons, activeLessonId]);

  const steps = activeLesson?.lessonPayload?.steps || [];
  const conceptBranches = activeLesson?.lessonPayload?.conceptMap?.branches || [];

  useEffect(() => {
    if (!isPlaying || steps.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveStepIdx((prev) => {
        if (prev + 1 >= steps.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [isPlaying, steps.length]);

  const subjectChapters = subjectBooks.flatMap((b) =>
    (chaptersByBook[b.id] || []).map((ch) => ({ book: b, chapter: ch }))
  );

  // Trigger visualization automatically if routed from Adaptive AI Tutor
  useEffect(() => {
    if (!initialVisualRequest) return;
    const reqBooks = textbooks.filter((t) => t.subject === initialVisualRequest.subject);
    const targetBook = reqBooks[0];
    if (!targetBook) {
      setErrorMsg(
        `No uploaded textbook found for ${getSubjectLabel(initialVisualRequest.subject)} yet. Only uploaded textbook syllabus can be visualized.`
      );
      return;
    }
    const label =
      initialVisualRequest.query.length > 60
        ? `${initialVisualRequest.query.slice(0, 57)}...`
        : initialVisualRequest.query;
    handleGenerateLesson(targetBook, null, label, initialVisualRequest.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVisualRequest?.requestId]);

  function triggerObjectMotion() {
    setMotionActive(true);
    setMotionRunKey((k) => k + 1);
  }

  function triggerStateTransition() {
    setStateChanged((prev) => !prev);
    setStateMorphKey((k) => k + 1);
  }

  function triggerConceptCycle() {
    const total = Math.max(1, conceptBranches.length);
    setActiveConceptIdx((prev) => (prev + 1) % total);
    setStateMorphKey((k) => k + 1);
  }

  function resetCssAnimations() {
    setMotionActive(false);
    setStateChanged(false);
    setActiveConceptIdx(0);
    setMotionRunKey(0);
    setStateMorphKey(0);
  }

  async function handleGenerateLesson(
    book: Textbook,
    chapter: TextbookChapter | null,
    topicTitle: string,
    customQuestion?: string
  ) {
    setErrorMsg(null);
    const allBookChunks = chunksByBook[book.id] || [];
    if (allBookChunks.length === 0) {
      setErrorMsg(
        `No indexed textbook passages found in "${book.title}". Please wait for textbook indexing or re-upload in Teacher Portal.`
      );
      return;
    }

    setGeneratingTopic(topicTitle);
    try {
      const bookChunks = allBookChunks.filter(
        (c) =>
          c.topicTitle.toLowerCase().includes(topicTitle.toLowerCase()) ||
          (chapter && c.chapterTitle.toLowerCase().includes(chapter.title.toLowerCase()))
      );
      const chunksToSend = customQuestion
        ? allBookChunks.slice(0, 40)
        : bookChunks.length > 0
        ? bookChunks
        : allBookChunks.slice(0, 8);

      const resp = await fetch('/api/lessons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: book.subject,
          chapterTitle: chapter?.title || `${book.title}`,
          topicTitle,
          textbookTitle: book.title,
          customQuestion,
          chunks: chunksToSend,
        }),
      });
      const rawText = await resp.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
      if (!resp.ok) {
        throw new Error(
          data.error ||
            (resp.status === 503
              ? 'The AI visual generator is temporarily busy. Please try again in a few seconds.'
              : 'Failed to generate visual lesson.')
        );
      }

      const lessonId = `vl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        await setDoc(doc(db, 'visualLessons', lessonId), {
          ownerId: uid,
          subject: book.subject,
          textbookId: book.id,
          chapterTitle: (chapter?.title || `${book.title} Syllabus`).slice(0, 180),
          topicTitle: topicTitle.slice(0, 180),
          title: String(data.title || topicTitle).slice(0, 200),
          visualType: data.visualType,
          storyIntro: String(data.storyIntro || '').slice(0, 1500),
          lessonPayload: data.lessonPayload,
          completed: false,
          comprehensionScore: 0,
          ...(isTeacherAdmin ? { sharedWithClassroom: true } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `visualLessons/${lessonId}`);
      }
      setActiveLessonId(lessonId);
      setActiveStepIdx(0);
      setSelectedOption(null);
      setCheckSubmitted(false);
      resetCssAnimations();
      if (customQuestion) setCustomVisualQuery('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate visual lesson.');
    } finally {
      setGeneratingTopic(null);
    }
  }

  async function handleAskForVisual(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = customVisualQuery.trim();
    if (!trimmed) return;
    const targetBook = subjectBooks[0];
    if (!targetBook || subjectChunks.length === 0) {
      setErrorMsg(
        `No uploaded textbook found for ${getSubjectLabel(selectedSubject)}. Only topics from uploaded textbooks can be visualized.`
      );
      return;
    }
    const topicLabel = trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
    await handleGenerateLesson(targetBook, null, topicLabel, trimmed);
  }

  async function handleCompleteCheck() {
    if (!activeLesson || selectedOption === null) return;
    setCheckSubmitted(true);
    const isCorrect = selectedOption === activeLesson.lessonPayload.comprehensionCheck.correctIndex;
    const score = isCorrect ? 100 : 50;

    if (activeLesson.ownerId === uid || isTeacherAdmin) {
      try {
        await updateDoc(doc(db, 'visualLessons', activeLesson.id), {
          completed: true,
          comprehensionScore: score,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `visualLessons/${activeLesson.id}`);
      }
    }

    const revId = `rev_${activeLesson.subject.toLowerCase()}_${activeLesson.topicTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40)}_${uid.slice(0, 8)}`;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (isCorrect ? 1 : 0));

    try {
      await setDoc(doc(db, 'revisions', revId), {
        ownerId: uid,
        subject: activeLesson.subject,
        topicTitle: activeLesson.topicTitle.slice(0, 180),
        stageIndex: isCorrect ? 1 : 0,
        intervalDays: isCorrect ? 1 : 0,
        retentionScore: score,
        rememberedCount: isCorrect ? 1 : 0,
        forgottenCount: isCorrect ? 0 : 1,
        status: isCorrect ? 'scheduled' : 'due',
        nextReviewAt: Timestamp.fromDate(nextDate),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `revisions/${revId}`);
    }
  }

  const subjectLabel = getSubjectLabel(selectedSubject);
  const currentStep = steps[activeStepIdx];

  return (
    <div className="space-y-6">
      {/* Subject Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visual Learning Studio</h1>
          <p className="text-sm text-slate-600">
            Interactive diagrams, CSS motion transitions, and textbook-only lessons grounded strictly in your uploaded Grade 5 PDFs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          {SUBJECTS.map((subj) => {
            const active = subj === selectedSubject;
            const uploadedCount = textbooks.filter((b) => b.subject === subj).length;
            return (
              <button
                key={subj}
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  onSelectSubject(subj);
                }}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                  active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{getSubjectLabel(subj)}</span>
                {uploadedCount > 0 ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Textbook uploaded" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-300" title="Pending textbook upload" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Pending Textbook Gate for Subjects Without Uploaded PDFs (e.g., Social & Humanities before publish) */}
      {!hasUploadedTextbook ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Upload className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {subjectLabel} Textbook Pending Upload
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            Strict Textbook-Only Syllabus is active: out-of-textbook syllabus is excluded. Once the Teacher uploads the Grade 5 <strong>{subjectLabel}</strong> textbook PDF in Teacher Portal, all chapters, animated visuals, and tests will unlock here automatically.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-2 text-xs">
            {SUBJECTS.filter((s) => textbooks.some((b) => b.subject === s)).map((readySubj) => (
              <button
                key={readySubj}
                type="button"
                onClick={() => onSelectSubject(readySubj)}
                className="px-3.5 py-2 bg-sky-50 border border-sky-200 text-sky-800 font-semibold rounded-lg hover:bg-sky-100"
              >
                Open Uploaded {getSubjectLabel(readySubj)} Textbook
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Compact Control Header: Ask Visual Studio + Uploaded Textbook Topics */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={SUBJECT_IMAGES[selectedSubject]}
                  alt={`${subjectLabel} visual learning`}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                />
                <div>
                  <div className={`text-xs font-semibold ${SUBJECT_ACCENTS[selectedSubject].text}`}>
                    {subjectLabel} · Uploaded Textbook Only ({subjectBooks[0]?.title})
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeLesson ? activeLesson.title : `Select Any Uploaded ${subjectLabel} Topic`}
                  </h2>
                </div>
              </div>
              {activeLesson && (
                <button
                  type="button"
                  onClick={() =>
                    onAskTutor(activeLesson.subject, activeLesson.topicTitle, activeLesson.textbookId)
                  }
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ask AI Tutor About This
                </button>
              )}
            </div>

            {/* Ask Visual Studio Anything (Strictly Grounded in Uploaded Textbook) */}
            <form onSubmit={handleAskForVisual} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customVisualQuery}
                onChange={(e) => setCustomVisualQuery(e.target.value)}
                placeholder={`Ask Visual Studio to animate any topic from your uploaded ${subjectLabel} textbook...`}
                className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
              />
              <button
                type="submit"
                disabled={!customVisualQuery.trim() || Boolean(generatingTopic)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                {generatingTopic ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                )}
                Visualize from Textbook
              </button>
            </form>

            {generatingTopic && (
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-900 flex items-center gap-2 font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
                Building animated diagram, interactive CSS transitions &amp; steps from your textbook for “{generatingTopic}”...
              </div>
            )}

            {/* Uploaded Textbook Chapters & Visual Lessons */}
            <div className="space-y-2.5 pt-1">
              <div className="text-xs font-semibold text-slate-500">
                Uploaded Textbook Syllabus Topics ({subjectLessons.length} visual modules built)
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {subjectLessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => {
                      setActiveLessonId(lesson.id);
                      setActiveStepIdx(0);
                      setIsPlaying(false);
                      setSelectedOption(null);
                      setCheckSubmitted(false);
                      resetCssAnimations();
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      activeLesson?.id === lesson.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {lesson.completed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {lesson.topicTitle}
                  </button>
                ))}

                {subjectChapters.flatMap(({ book, chapter }) =>
                  chapter.topics
                    .filter(
                      (topic) =>
                        !subjectLessons.some(
                          (l) => l.topicTitle.toLowerCase() === topic.toLowerCase()
                        )
                    )
                    .map((topic) => (
                      <button
                        key={`${book.id}_${chapter.id}_${topic}`}
                        type="button"
                        disabled={Boolean(generatingTopic)}
                        onClick={() => handleGenerateLesson(book, chapter, topic)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-dashed border-sky-300 bg-sky-50/60 text-sky-800 hover:bg-sky-100 transition-colors disabled:opacity-60"
                        title={`${book.title} · Ch ${chapter.chapterNumber}: ${chapter.title}`}
                      >
                        {generatingTopic === topic ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Visualize: {topic}
                      </button>
                    ))
                )}
              </div>
            </div>

            {activeLesson && (
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                {activeLesson.storyIntro}
              </p>
            )}
          </div>

          {/* Interactive CSS Concept Motion & State Transition Lab */}
          {activeLesson && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
                    Interactive CSS Concept Animations
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    Trigger Object Movement &amp; State Transitions for “{activeLesson.topicTitle}”
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerObjectMotion}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 transition-transform active:scale-95"
                  >
                    <MoveRight className="w-3.5 h-3.5" />
                    Animate Object Movement
                  </button>
                  <button
                    type="button"
                    onClick={triggerStateTransition}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-transform active:scale-95"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {stateChanged ? 'Revert State Change' : 'Trigger State Change'}
                  </button>
                  <button
                    type="button"
                    onClick={triggerConceptCycle}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-transform active:scale-95"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Next Concept Focus
                  </button>
                  <button
                    type="button"
                    onClick={resetCssAnimations}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                {/* 1. CSS Object Movement Stage */}
                <div className="lg:col-span-6 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      1. Object Movement Track (Step {activeStepIdx + 1})
                    </span>
                    <span className="text-[11px] font-mono text-sky-700">
                      {motionActive ? 'Moving across stages...' : 'Ready to animate'}
                    </span>
                  </div>

                  {/* CSS Animated Track */}
                  <div className="relative h-28 bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-between overflow-hidden">
                    <div
                      className={`absolute left-8 right-8 top-1/2 -translate-y-1/2 h-2 rounded-full ${
                        motionActive ? 'lp-flow-beam' : 'bg-slate-200'
                      }`}
                    />
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-9 h-9 rounded-full bg-sky-100 border-2 border-sky-500 flex items-center justify-center text-xs font-bold text-sky-900">
                        1
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 mt-1 max-w-[85px] truncate">
                        {steps[0]?.stageTitle || 'Start'}
                      </span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-9 h-9 rounded-full bg-amber-100 border-2 border-amber-500 flex items-center justify-center text-xs font-bold text-amber-900">
                        2
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 mt-1 max-w-[85px] truncate">
                        {currentStep?.stageTitle || 'Action'}
                      </span>
                    </div>
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center text-xs font-bold text-emerald-900">
                        3
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 mt-1 max-w-[85px] truncate">
                        {steps[steps.length - 1]?.stageTitle || 'Outcome'}
                      </span>
                    </div>

                    {/* Moving Concept Object */}
                    <div
                      key={motionRunKey}
                      className={`absolute top-1/2 z-20 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold shadow-md flex items-center gap-1 whitespace-nowrap ${
                        motionActive
                          ? 'lp-motion-travel'
                          : 'left-[8%] -translate-x-1/2 -translate-y-1/2 lp-motion-float'
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      {activeLesson.topicTitle.slice(0, 14)}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600">
                    <strong>Visual Cue:</strong> {currentStep?.visualCue || 'Click "Animate Object Movement" to watch the concept travel through each stage.'}
                  </p>
                </div>

                {/* 2. CSS State Change Transition Card */}
                <div className="lg:col-span-6 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      2. Concept State Transition (Before → After)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors duration-500 ${
                        stateChanged
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {stateChanged ? 'Transformed State' : 'Initial State'}
                    </span>
                  </div>

                  <div
                    key={stateMorphKey}
                    onClick={triggerStateTransition}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') triggerStateTransition();
                    }}
                    className={`cursor-pointer rounded-xl p-4 border-2 transition-all duration-500 lp-state-morph ${
                      stateChanged
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 translate-x-1'
                        : 'bg-amber-50 border-amber-300 text-amber-950'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-bold">
                        {stateChanged
                          ? activeLesson.lessonPayload.comparison.rightTitle
                          : activeLesson.lessonPayload.comparison.leftTitle}
                      </span>
                      <span className="text-[11px] font-mono underline">Click card to toggle</span>
                    </div>
                    <ul className="space-y-1 text-xs list-disc pl-4">
                      {(stateChanged
                        ? activeLesson.lessonPayload.comparison.rightPoints
                        : activeLesson.lessonPayload.comparison.leftPoints
                      ).map((pt, idx) => (
                        <li key={idx} className="lp-concept-enter">
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {conceptBranches.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {conceptBranches.map((b, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setActiveConceptIdx(idx);
                            setStateMorphKey((k) => k + 1);
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-300 ${
                            activeConceptIdx === idx
                              ? 'bg-indigo-600 text-white scale-105 shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Two-Zone Sandbox Layout: Animated Diagram + Guided Step Deck */}
          {activeLesson ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Zone: Interactive Visual Stage */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
                <InteractiveVisualStage
                  lessonId={activeLesson.id}
                  subject={activeLesson.subject}
                  storyIntro={activeLesson.storyIntro}
                  visualType={activeLesson.visualType}
                  topicTitle={activeLesson.topicTitle}
                  animatedSvg={activeLesson.lessonPayload.animatedSvg}
                  visualDiagram={activeLesson.lessonPayload.visualDiagram}
                  steps={activeLesson.lessonPayload.steps}
                  activeStepIdx={activeStepIdx}
                  onSelectStep={(idx) => {
                    setIsPlaying(false);
                    setActiveStepIdx(idx);
                    setMotionActive(true);
                    setMotionRunKey((k) => k + 1);
                  }}
                />
              </div>

              {/* Right Zone: Step-by-Step Animated Walkthrough */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Guided Visual Steps</h3>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      Step {activeStepIdx + 1} of {Math.max(1, steps.length)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700"
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveStepIdx((prev) => (prev + 1) % Math.max(1, steps.length));
                        triggerObjectMotion();
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      title="Step Forward"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveStepIdx(0);
                        resetCssAnimations();
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      title="Reset Steps"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {steps.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex gap-1.5">
                      {steps.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setActiveStepIdx(idx);
                            triggerObjectMotion();
                          }}
                          className={`flex-1 h-2 rounded-full transition-all duration-300 ${
                            idx === activeStepIdx
                              ? 'bg-sky-600 scale-y-125'
                              : idx < activeStepIdx
                              ? 'bg-sky-200'
                              : 'bg-slate-200'
                          }`}
                          aria-label={s.stageTitle}
                        />
                      ))}
                    </div>

                    <div
                      key={activeStepIdx}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 lp-concept-enter"
                    >
                      <div className="text-sm font-bold text-slate-900">
                        {steps[activeStepIdx]?.stageTitle}
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {steps[activeStepIdx]?.explanation}
                      </p>
                      <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
                        <div>
                          <span className="font-bold text-emerald-700">Real-Life Example: </span>
                          <span className="text-slate-700">{steps[activeStepIdx]?.realLifeExample}</span>
                        </div>
                        <div>
                          <span className="font-bold text-sky-700">Try on Canvas: </span>
                          <span className="text-slate-700">{steps[activeStepIdx]?.visualCue}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeLesson.lessonPayload.citations?.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    <span>Textbook Reference:</span>
                    {activeLesson.lessonPayload.citations.map((c, i) => (
                      <span key={i} className="font-mono text-slate-700">
                        {c.chapterTitle} (p. {c.pageNumber})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-600">
              Select any topic pill above (e.g. <strong>Visualize: ...</strong>) or ask Visual Studio a question from your uploaded <strong>{subjectLabel}</strong> textbook to launch its interactive animated diagram!
            </div>
          )}

          {/* Concept Map + Visual Comparison + Comprehension Check */}
          {activeLesson && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Concept Map */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  Concept Map: {activeLesson.lessonPayload.conceptMap.center}
                </h3>
                <div className="space-y-2.5">
                  {activeLesson.lessonPayload.conceptMap.branches.map((b, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setActiveConceptIdx(i);
                        setStateMorphKey((k) => k + 1);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-all duration-300 ${
                        activeConceptIdx === i
                          ? 'bg-sky-50 border-sky-400 shadow-xs scale-[1.02]'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold text-sky-700">{b.label}</div>
                      <div className="text-xs text-slate-700 mt-0.5">{b.detail}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Visual Comparison */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h3 className="text-base font-bold text-slate-900">Visual Comparison</h3>
                <div className="space-y-3">
                  <div
                    className={`p-3.5 bg-amber-50/70 border rounded-lg transition-all duration-500 ${
                      !stateChanged ? 'border-amber-400 ring-1 ring-amber-300' : 'border-amber-200 opacity-75'
                    }`}
                  >
                    <div className="text-xs font-bold text-amber-900 mb-1.5">
                      {activeLesson.lessonPayload.comparison.leftTitle}
                    </div>
                    <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                      {activeLesson.lessonPayload.comparison.leftPoints.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div
                    className={`p-3.5 bg-emerald-50/70 border rounded-lg transition-all duration-500 ${
                      stateChanged ? 'border-emerald-400 ring-1 ring-emerald-300' : 'border-emerald-200 opacity-75'
                    }`}
                  >
                    <div className="text-xs font-bold text-emerald-900 mb-1.5">
                      {activeLesson.lessonPayload.comparison.rightTitle}
                    </div>
                    <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                      {activeLesson.lessonPayload.comparison.rightPoints.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Quick Check for Understanding */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Quick Check</h3>
                  {activeLesson.completed && (
                    <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-800">
                  {activeLesson.lessonPayload.comprehensionCheck.question}
                </p>
                <div className="space-y-2">
                  {activeLesson.lessonPayload.comprehensionCheck.options.map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = idx === activeLesson.lessonPayload.comprehensionCheck.correctIndex;
                    let style = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50';
                    if (checkSubmitted) {
                      if (isCorrect) style = 'bg-emerald-50 border-emerald-400 text-emerald-900';
                      else if (isSelected) style = 'bg-rose-50 border-rose-300 text-rose-900';
                    } else if (isSelected) {
                      style = 'bg-sky-50 border-sky-400 text-sky-900';
                    }
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (!checkSubmitted) setSelectedOption(idx);
                        }}
                        className={`w-full text-left p-3 text-xs font-medium rounded-lg border transition-colors ${style}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {!checkSubmitted ? (
                  <button
                    type="button"
                    disabled={selectedOption === null}
                    onClick={handleCompleteCheck}
                    className="w-full py-2 px-4 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-40 transition-colors"
                  >
                    Check Answer &amp; Save to Memory Plan
                  </button>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                    <strong className="text-slate-900">Why: </strong>
                    {activeLesson.lessonPayload.comprehensionCheck.explanation}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
