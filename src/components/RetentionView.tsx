import React, { useState } from 'react';
import { CheckCircle2, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Assessment,
  MistakeRecord,
  RevisionItem,
  SUBJECTS,
  Subject,
  VisualLesson,
  getSubjectLabel,
} from '../types/learnpro';

interface Props {
  uid: string;
  revisions: RevisionItem[];
  lessons: VisualLesson[];
  assessments: Assessment[];
  mistakes: MistakeRecord[];
  onOpenLesson: (subject: Subject) => void;
}

const STAGE_LABELS = ['Immediate', '1 Day', '3 Days', '7 Days', '15 Days'];
const STAGE_INTERVALS = [0, 1, 3, 7, 15];

export const RetentionView: React.FC<Props> = ({
  uid,
  revisions,
  lessons,
  assessments,
  mistakes,
  onOpenLesson,
}) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function handleRecallOutcome(item: RevisionItem, remembered: boolean) {
    setUpdatingId(item.id);
    try {
      const nextStage = remembered
        ? Math.min(4, item.stageIndex + 1)
        : Math.max(0, item.stageIndex - 1);
      const nextInterval = STAGE_INTERVALS[nextStage];
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + nextInterval);

      const newRemembered = item.rememberedCount + (remembered ? 1 : 0);
      const newForgotten = item.forgottenCount + (remembered ? 0 : 1);
      const total = Math.max(1, newRemembered + newForgotten);
      const retentionScore = Math.round((newRemembered / total) * 100);
      const nextStatus =
        remembered && nextStage >= 4 ? 'mastered' : remembered ? 'scheduled' : 'due';

      await updateDoc(doc(db, 'revisions', item.id), {
        stageIndex: nextStage,
        intervalDays: nextInterval,
        retentionScore,
        rememberedCount: newRemembered,
        forgottenCount: newForgotten,
        status: nextStatus,
        nextReviewAt: Timestamp.fromDate(nextDate),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `revisions/${item.id}`);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAddLessonToSchedule(lesson: VisualLesson) {
    const revId = `rev_${lesson.subject.toLowerCase()}_${lesson.topicTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40)}_${uid.slice(0, 8)}`;
    try {
      await setDoc(doc(db, 'revisions', revId), {
        ownerId: uid,
        subject: lesson.subject,
        topicTitle: lesson.topicTitle.slice(0, 180),
        stageIndex: 0,
        intervalDays: 0,
        retentionScore: lesson.comprehensionScore || 60,
        rememberedCount: lesson.completed ? 1 : 0,
        forgottenCount: 0,
        status: 'due',
        nextReviewAt: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `revisions/${revId}`);
    }
  }

  // Compute subject-wise analytics from real Firestore records
  const subjectStats = SUBJECTS.map((subj) => {
    const subjLessons = lessons.filter((l) => l.subject === subj);
    const subjAssessments = assessments.filter((a) => a.subject === subj && a.status !== 'pending');
    const subjMistakes = mistakes.filter((m) => m.subject === subj && !m.resolved);
    const subjRevs = revisions.filter((r) => r.subject === subj);

    const avgAssessmentPct =
      subjAssessments.length > 0
        ? Math.round(
            (subjAssessments.reduce((sum, a) => sum + a.score / Math.max(1, a.maxScore), 0) /
              subjAssessments.length) *
              100
          )
        : null;

    const avgRetention =
      subjRevs.length > 0
        ? Math.round(subjRevs.reduce((s, r) => s + r.retentionScore, 0) / subjRevs.length)
        : null;

    return {
      subject: subj,
      lessonsCompleted: subjLessons.filter((l) => l.completed).length,
      totalLessons: subjLessons.length,
      avgAssessmentPct,
      activeMistakes: subjMistakes.length,
      avgRetention,
    };
  });

  const unscheduledLessons = lessons.filter(
    (l) => !revisions.some((r) => r.topicTitle.toLowerCase() === l.topicTitle.toLowerCase() && r.subject === l.subject)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Memory Retention & Spaced Revision</h1>
        <p className="text-sm text-slate-600">
          Spaced-repetition tracking across Immediate, 1-Day, 3-Day, 7-Day, and 15-Day memory intervals
        </p>
      </div>

      {/* 5-Stage Interval Legend */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="text-xs font-bold text-slate-700 mb-3">Spaced-Repetition Intervals</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STAGE_LABELS.map((label, idx) => {
            const count = revisions.filter((r) => r.stageIndex === idx).length;
            return (
              <div key={label} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs font-semibold text-slate-500">Stage {idx + 1}</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{label}</div>
                <div className="text-xs font-mono tabular-nums text-sky-700 mt-1">
                  {count} topic{count === 1 ? '' : 's'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Revision Queue */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Revision Queue & Recall Checks</h2>
            <p className="text-xs text-slate-500">
              Remembering clearly advances the interval; forgetting resets the concept for earlier visual review
            </p>
          </div>
        </div>

        {revisions.length === 0 ? (
          <div className="py-4 space-y-3">
            <p className="text-sm text-slate-600">
              No topics are in your spaced-revision tracker yet. Complete a Visual Lesson Quick Check or add a topic below to begin memory tracking.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {revisions.map((item) => (
              <div key={item.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/60 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-sky-700">{getSubjectLabel(item.subject)}</div>
                    <div className="text-base font-bold text-slate-900">{item.topicTitle}</div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      item.status === 'mastered'
                        ? 'text-emerald-700'
                        : item.status === 'due'
                        ? 'text-amber-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {item.status === 'mastered' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                    {item.status === 'mastered'
                      ? 'Long-Term Mastered'
                      : item.status === 'due'
                      ? 'Due for Recall'
                      : `Next: ${STAGE_LABELS[item.stageIndex]}`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs bg-white border border-slate-200 rounded-lg p-2.5">
                  <div>
                    <div className="text-slate-500">Retention</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900">
                      {item.retentionScore}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Remembered</div>
                    <div className="font-mono tabular-nums font-bold text-emerald-700">
                      {item.rememberedCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Forgotten</div>
                    <div className="font-mono tabular-nums font-bold text-rose-700">
                      {item.forgottenCount}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updatingId === item.id}
                    onClick={() => handleRecallOutcome(item, true)}
                    className="flex-1 py-2 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Remembered Clearly
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === item.id}
                    onClick={() => handleRecallOutcome(item, false)}
                    className="flex-1 py-2 px-3 bg-white border border-amber-300 text-amber-900 text-xs font-semibold rounded-lg hover:bg-amber-50 disabled:opacity-50"
                  >
                    Forgot — Review Visual
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {unscheduledLessons.length > 0 && (
          <div className="pt-4 border-t border-slate-200 space-y-2">
            <div className="text-xs font-semibold text-slate-600">
              Add Completed or Upcoming Topics to Spaced Revision
            </div>
            <div className="flex flex-wrap gap-2">
              {unscheduledLessons.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => handleAddLessonToSchedule(l)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-sky-50 hover:border-sky-300"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                  Track: {getSubjectLabel(l.subject)} — {l.topicTitle}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Personalized Learning Path Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Personalized Subject Mastery Profile</h2>
          <p className="text-xs text-slate-500">
            Real performance summary across visual lessons, written tests, and unresolved mistakes
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-4 font-semibold">Subject</th>
                <th className="py-2.5 px-4 font-semibold text-right">Visual Lessons</th>
                <th className="py-2.5 px-4 font-semibold text-right">Written Avg</th>
                <th className="py-2.5 px-4 font-semibold text-right">Memory Retention</th>
                <th className="py-2.5 px-4 font-semibold text-right">Active Mistakes</th>
                <th className="py-2.5 pl-4 font-semibold text-right">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjectStats.map((row) => (
                <tr key={row.subject} className="hover:bg-slate-50/80">
                  <td className="py-3 pr-4 font-bold text-slate-900">{getSubjectLabel(row.subject)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {row.lessonsCompleted}/{row.totalLessons}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {row.avgAssessmentPct !== null ? `${row.avgAssessmentPct}%` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {row.avgRetention !== null ? `${row.avgRetention}%` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {row.activeMistakes > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {row.activeMistakes}
                      </span>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>
                  <td className="py-3 pl-4 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenLesson(row.subject)}
                      className="text-sky-700 font-semibold hover:underline"
                    >
                      Open Visual Studio
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
