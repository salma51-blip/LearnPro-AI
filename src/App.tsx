import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Loader2,
  LogOut,
  ArrowRight,
  GraduationCap,
  ShieldCheck,
  Lock,
  Unlock,
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardsView } from './components/DashboardsView';
import { VisualLearningView } from './components/VisualLearningView';
import { AdaptiveTutorView } from './components/AdaptiveTutorView';
import { AssessmentsView } from './components/AssessmentsView';
import { RetentionView } from './components/RetentionView';
import {
  Assessment,
  AssignedPlan,
  MistakeRecord,
  RevisionItem,
  SUBJECTS,
  SUBJECT_IMAGES,
  Subject,
  TEACHER_EMAIL,
  Textbook,
  TextbookChapter,
  TextbookChunk,
  UserWorkspace,
  ViewMode,
  VisualLesson,
} from './types/learnpro';

type NavTab = 'overview' | 'visual' | 'tutor' | 'assessments' | 'retention';
type LoginIntent = 'student' | 'teacher';

const STUDENT_LOCK_STORAGE_KEY = 'learnpro_student_locked';
const TEACHER_PIN_STORAGE_KEY = 'learnpro_teacher_pin';

function isStarterRecordId(id: string): boolean {
  return (
    id.startsWith('starter_') ||
    id.startsWith('vl_starter_') ||
    id.startsWith('assess_starter_') ||
    id.startsWith('rev_starter_') ||
    id.startsWith('plan_starter_')
  );
}

function mergeById<T extends { id: string }>(own: T[], shared: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of shared) {
    if (!isStarterRecordId(item.id)) map.set(item.id, item);
  }
  for (const item of own) {
    if (!isStarterRecordId(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingInRole, setSigningInRole] = useState<LoginIntent | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const pendingLoginIntentRef = useRef<LoginIntent | null>(null);

  // Same-device Student Lock PIN for Teacher account
  const [studentLocked, setStudentLocked] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STUDENT_LOCK_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [teacherPin, setTeacherPin] = useState<string>(() => {
    try {
      return window.localStorage.getItem(TEACHER_PIN_STORAGE_KEY) || '1234';
    } catch {
      return '1234';
    }
  });
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [unlockPinError, setUnlockPinError] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<UserWorkspace | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedSubject, setSelectedSubject] = useState<Subject>('Mathematics');
  const autoPickedSubjectRef = useRef(false);
  const [tutorTopic, setTutorTopic] = useState<string>('');
  const [tutorBookId, setTutorBookId] = useState<string>('');
  const [visualRequest, setVisualRequest] = useState<{ subject: Subject; query: string; requestId: number } | null>(null);

  const [ownBooks, setOwnBooks] = useState<Textbook[]>([]);
  const [sharedBooks, setSharedBooks] = useState<Textbook[]>([]);
  const [chaptersByBook, setChaptersByBook] = useState<Record<string, TextbookChapter[]>>({});
  const [chunksByBook, setChunksByBook] = useState<Record<string, TextbookChunk[]>>({});

  const [ownLessons, setOwnLessons] = useState<VisualLesson[]>([]);
  const [sharedLessons, setSharedLessons] = useState<VisualLesson[]>([]);

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [ownPlans, setOwnPlans] = useState<AssignedPlan[]>([]);
  const [sharedPlans, setSharedPlans] = useState<AssignedPlan[]>([]);

  const isTeacherAdmin = Boolean(
    user?.email && user.email.toLowerCase() === TEACHER_EMAIL.toLowerCase()
  );

  // Merged textbook-only lists (strictly excluding any legacy starter_* demo records)
  const textbooks = useMemo(() => {
    const merged = mergeById(ownBooks, sharedBooks);
    const toMs = (t: unknown): number => {
      if (t && typeof t === 'object' && 'toMillis' in t && typeof (t as { toMillis: () => number }).toMillis === 'function') {
        return (t as { toMillis: () => number }).toMillis();
      }
      return 0;
    };
    return merged.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  }, [ownBooks, sharedBooks]);

  const lessons = useMemo(() => {
    const merged = mergeById(ownLessons, sharedLessons);
    const validBookIds = new Set(textbooks.map((b) => b.id));
    return merged.filter((l) => validBookIds.has(l.textbookId));
  }, [ownLessons, sharedLessons, textbooks]);

  const plans = useMemo(() => mergeById(ownPlans, sharedPlans), [ownPlans, sharedPlans]);

  // Auto-select first uploaded textbook's subject if current default has no textbook yet
  useEffect(() => {
    if (autoPickedSubjectRef.current || textbooks.length === 0) return;
    const hasCurrent = textbooks.some((b) => b.subject === selectedSubject);
    if (!hasCurrent) {
      setSelectedSubject(textbooks[0].subject);
    }
    autoPickedSubjectRef.current = true;
  }, [textbooks, selectedSubject]);

  // Remove any legacy out-of-textbook starter_* documents cleanly when Teacher signs in
  async function cleanupLegacyStarterDocs(uid: string) {
    try {
      const starterBookIds = [
        'starter_mathematics_g5',
        'starter_science_g5',
        'starter_english_g5',
        'starter_humanities_g5',
        'starter_computing_g5',
      ];
      for (const bId of starterBookIds) {
        const bRef = doc(db, 'textbooks', bId);
        const snap = await getDoc(bRef);
        if (snap.exists() && snap.data().ownerId === uid) {
          const chSnap = await getDocs(collection(db, 'textbooks', bId, 'chapters'));
          for (const d of chSnap.docs) await deleteDoc(d.ref);
          const ckSnap = await getDocs(collection(db, 'textbooks', bId, 'chunks'));
          for (const d of ckSnap.docs) await deleteDoc(d.ref);
          await deleteDoc(bRef);
        }
      }
      const collectionsToClean = ['visualLessons', 'assessments', 'revisions', 'assignedPlans'] as const;
      for (const colName of collectionsToClean) {
        const snap = await getDocs(query(collection(db, colName), where('ownerId', '==', uid)));
        for (const d of snap.docs) {
          if (isStarterRecordId(d.id)) {
            await deleteDoc(d.ref);
          }
        }
      }
    } catch {
      // Non-fatal cleanup
    }
  }

  // Auth listener & workspace initialization
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);

      if (!u) {
        setWorkspace(null);
        setOwnBooks([]);
        setSharedBooks([]);
        setChaptersByBook({});
        setChunksByBook({});
        setOwnLessons([]);
        setSharedLessons([]);
        setAssessments([]);
        setMistakes([]);
        setRevisions([]);
        setOwnPlans([]);
        setSharedPlans([]);
        autoPickedSubjectRef.current = false;
        return;
      }

      const isAdminEmail =
        Boolean(u.email) && u.email!.toLowerCase() === TEACHER_EMAIL.toLowerCase();
      const loginIntent = pendingLoginIntentRef.current;
      pendingLoginIntentRef.current = null;

      if (loginIntent === 'teacher') {
        if (isAdminEmail) {
          setStudentLocked(false);
          try {
            window.localStorage.setItem(STUDENT_LOCK_STORAGE_KEY, 'false');
          } catch {
            // ignore
          }
          setAuthNotice(null);
        } else {
          setAuthNotice(
            `Signed in as ${u.email || 'Student'}. Special Teacher Portal requires the teacher account (${TEACHER_EMAIL}), so your workspace is set to Student View.`
          );
        }
      } else if (loginIntent === 'student') {
        if (isAdminEmail) {
          setStudentLocked(true);
          try {
            window.localStorage.setItem(STUDENT_LOCK_STORAGE_KEY, 'true');
          } catch {
            // ignore
          }
        }
        setAuthNotice(null);
      }

      try {
        const wsRef = doc(db, 'users', u.uid);
        const wsSnap = await getDoc(wsRef);
        const desiredInitialMode: ViewMode =
          loginIntent === 'teacher' && isAdminEmail ? 'teacher' : 'student';

        if (!wsSnap.exists()) {
          const defaultName = (u.displayName || (isAdminEmail ? 'Teacher' : 'Grade 5 Student'))
            .split(' ')[0]
            .slice(0, 80);
          await setDoc(wsRef, {
            uid: u.uid,
            studentName: defaultName,
            grade: 'Grade 5',
            curriculum: 'Uploaded School Textbook Syllabus',
            viewMode: desiredInitialMode,
            streakDays: 1,
            masteryPoints: 0,
            readingScore: 65,
            independentScore: 60,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(doc(db, 'users', u.uid, 'private', 'info'), {
            uid: u.uid,
            email: u.email || 'student@learnpro.local',
            displayName: (u.displayName || 'Student').slice(0, 120),
            createdAt: serverTimestamp(),
          });
        } else if (loginIntent === 'teacher' && isAdminEmail && wsSnap.data().viewMode !== 'teacher') {
          await updateDoc(wsRef, {
            viewMode: 'teacher',
            updatedAt: serverTimestamp(),
          });
        } else if (loginIntent === 'student' && wsSnap.data().viewMode !== 'student') {
          await updateDoc(wsRef, {
            viewMode: 'student',
            updatedAt: serverTimestamp(),
          });
        }

        if (isAdminEmail) {
          await cleanupLegacyStarterDocs(u.uid);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    });
    return () => unsub();
  }, []);

  // Firestore real-time listeners (only when authenticated)
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    const toMs = (t: unknown): number => {
      if (t && typeof t === 'object' && 'toMillis' in t && typeof (t as { toMillis: () => number }).toMillis === 'function') {
        return (t as { toMillis: () => number }).toMillis();
      }
      return 0;
    };

    const unsubWs = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setWorkspace(snap.data() as UserWorkspace);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubOwnBooks = onSnapshot(
      query(collection(db, 'textbooks'), where('ownerId', '==', uid)),
      (snap) => {
        setOwnBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Textbook)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'textbooks')
    );

    const unsubSharedBooks = onSnapshot(
      query(collection(db, 'textbooks'), where('sharedWithClassroom', '==', true)),
      (snap) => {
        setSharedBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Textbook)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'textbooks(shared)')
    );

    const unsubOwnLessons = onSnapshot(
      query(collection(db, 'visualLessons'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VisualLesson));
        list.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        setOwnLessons(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'visualLessons')
    );

    const unsubSharedLessons = onSnapshot(
      query(collection(db, 'visualLessons'), where('sharedWithClassroom', '==', true)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VisualLesson));
        list.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        setSharedLessons(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'visualLessons(shared)')
    );

    const unsubAssessments = onSnapshot(
      query(collection(db, 'assessments'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Assessment))
          .filter((a) => !isStarterRecordId(a.id));
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setAssessments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assessments')
    );

    const unsubMistakes = onSnapshot(
      query(collection(db, 'mistakes'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MistakeRecord));
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setMistakes(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'mistakes')
    );

    const unsubRevisions = onSnapshot(
      query(collection(db, 'revisions'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as RevisionItem))
          .filter((r) => !isStarterRecordId(r.id));
        list.sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt));
        setRevisions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'revisions')
    );

    const unsubOwnPlans = onSnapshot(
      query(collection(db, 'assignedPlans'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AssignedPlan));
        list.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        setOwnPlans(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assignedPlans')
    );

    const unsubSharedPlans = onSnapshot(
      query(collection(db, 'assignedPlans'), where('sharedWithClassroom', '==', true)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AssignedPlan));
        list.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        setSharedPlans(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assignedPlans(shared)')
    );

    return () => {
      unsubWs();
      unsubOwnBooks();
      unsubSharedBooks();
      unsubOwnLessons();
      unsubSharedLessons();
      unsubAssessments();
      unsubMistakes();
      unsubRevisions();
      unsubOwnPlans();
      unsubSharedPlans();
    };
  }, [user]);

  // Listen to chapters and chunks per uploaded textbook (supporting own + teacher-shared classroom books)
  useEffect(() => {
    if (!user || textbooks.length === 0) return;
    const uid = user.uid;
    const unsubs: (() => void)[] = [];

    textbooks.forEach((book) => {
      const filterField = book.ownerId === uid ? 'ownerId' : 'sharedWithClassroom';
      const filterVal = book.ownerId === uid ? uid : true;

      const u1 = onSnapshot(
        query(collection(db, 'textbooks', book.id, 'chapters'), where(filterField, '==', filterVal)),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TextbookChapter));
          list.sort((a, b) => a.chapterNumber - b.chapterNumber);
          setChaptersByBook((prev) => ({ ...prev, [book.id]: list }));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `textbooks/${book.id}/chapters`)
      );

      const u2 = onSnapshot(
        query(collection(db, 'textbooks', book.id, 'chunks'), where(filterField, '==', filterVal)),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TextbookChunk));
          setChunksByBook((prev) => ({ ...prev, [book.id]: list }));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `textbooks/${book.id}/chunks`)
      );

      unsubs.push(u1, u2);
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user, textbooks]);

  async function handleRoleSignIn(intent: LoginIntent) {
    setAuthError(null);
    setAuthNotice(null);
    setSigningInRole(intent);
    pendingLoginIntentRef.current = intent;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      pendingLoginIntentRef.current = null;
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSigningInRole(null);
    }
  }

  async function handleSwitchViewMode(mode: ViewMode) {
    if (!user) return;
    if (mode === 'teacher' && (!isTeacherAdmin || studentLocked)) {
      if (isTeacherAdmin && studentLocked) {
        setShowUnlockModal(true);
      }
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        viewMode: mode,
        updatedAt: serverTimestamp(),
      });
      setActiveTab('overview');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  async function handleLockStudentMode() {
    setStudentLocked(true);
    try {
      window.localStorage.setItem(STUDENT_LOCK_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    await handleSwitchViewMode('student');
  }

  async function handleUnlockTeacherSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (unlockPinInput.trim() !== teacherPin) {
      setUnlockPinError('Incorrect Teacher PIN. Check your PIN and try again.');
      return;
    }
    setUnlockPinError(null);
    setUnlockPinInput('');
    setShowUnlockModal(false);
    setStudentLocked(false);
    try {
      window.localStorage.setItem(STUDENT_LOCK_STORAGE_KEY, 'false');
    } catch {
      // ignore
    }
    if (user && isTeacherAdmin) {
      await updateDoc(doc(db, 'users', user.uid), {
        viewMode: 'teacher',
        updatedAt: serverTimestamp(),
      });
      setActiveTab('overview');
    }
  }

  function handleUpdateTeacherPin(newPin: string) {
    const cleaned = newPin.trim();
    if (cleaned.length < 4) return;
    setTeacherPin(cleaned);
    try {
      window.localStorage.setItem(TEACHER_PIN_STORAGE_KEY, cleaned);
    } catch {
      // ignore
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-sky-600" />
          Loading LearnPro AI...
        </div>
      </div>
    );
  }

  // Signed-Out Landing Screen with Distinct Student Login & Teacher Special Login
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
        <header className="max-w-6xl w-full mx-auto px-6 py-5 flex items-center justify-between gap-8 border-b border-slate-200">
          <span className="text-lg font-display font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            LearnPro AI
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#subjects" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Textbook Syllabus
            </a>
            <a href="#method" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Interactive Visuals
            </a>
            <a href="#assessments" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Assessments
            </a>
          </nav>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={signingInRole !== null}
              onClick={() => handleRoleSignIn('student')}
              className="px-4 py-2 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {signingInRole === 'student' ? 'Signing in...' : 'Student Login'}
            </button>
            <button
              type="button"
              disabled={signingInRole !== null}
              onClick={() => handleRoleSignIn('teacher')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              {signingInRole === 'teacher' ? 'Signing in...' : 'Teacher Special Login'}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 space-y-12">
          {authError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {authError}
            </div>
          )}

          {/* Hero Split */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="text-xs font-semibold text-sky-700">
                Grade 5 Textbook-Only Visual Learning &amp; Continuous Assessment
              </div>
              <h1 className="text-4xl sm:text-5xl font-display font-extrabold text-slate-900 leading-[1.1] text-balance">
                Understand your uploaded textbooks visually, remember longer, and solve independently.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                100% locked to your uploaded Grade 5 textbooks (English, Science, Mathematics, and Social &amp; Humanities when uploaded)—zero out-of-textbook syllabus.
              </p>

              {/* Separate Role Login Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                <div className="bg-white border border-sky-200 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
                    <GraduationCap className="w-4 h-4 text-sky-600" />
                    Student Workspace Login
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Access interactive animated visuals, textbook AI tutor, and tests assigned by your teacher.
                  </p>
                  <button
                    type="button"
                    disabled={signingInRole !== null}
                    onClick={() => handleRoleSignIn('student')}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50"
                  >
                    {signingInRole === 'student' ? 'Connecting...' : 'Sign in as Student'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Teacher Special Login
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Dedicated teacher console for uploading textbook PDFs, setting daily plans, and grading notebook work.
                  </p>
                  <button
                    type="button"
                    disabled={signingInRole !== null}
                    onClick={() => handleRoleSignIn('teacher')}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {signingInRole === 'teacher' ? 'Verifying Teacher...' : 'Teacher Portal Sign In'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3">
                <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={SUBJECT_IMAGES.Mathematics}
                    alt="Mathematics visual fractions and geometry"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={SUBJECT_IMAGES.Science}
                    alt="Science interactive circuits and plant vessels"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={SUBJECT_IMAGES.English}
                    alt="English comprehension and story visuals"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={SUBJECT_IMAGES.Humanities}
                    alt="Social and Humanities visual atlas"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 3-Column Feature Pillars */}
          <section id="method" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-200">
            <div id="subjects" className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <h2 className="text-base font-bold text-slate-900">1. Strict Textbook-Only Syllabus</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Every visual lesson, AI tutor reply, and written test comes strictly from your teacher&apos;s uploaded PDFs—no out-of-textbook topics.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <h2 className="text-base font-bold text-slate-900">2. Interactive CSS Visual Transitions</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Students trigger object movement and concept state changes step by step alongside animated SVG diagrams and everyday examples.
              </p>
            </div>
            <div id="assessments" className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
              <h2 className="text-base font-bold text-slate-900">3. Written &amp; Handwritten OCR Checks</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Answer digitally or upload photos of handwritten notebook working. AI analyzes every step and builds 1–15 day spaced revisions.
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Enforce Teacher View lock for non-teacher Google accounts OR when Teacher locked device into Student Mode
  const rawViewMode: ViewMode = workspace?.viewMode || 'student';
  const currentViewMode: ViewMode =
    rawViewMode === 'teacher' && (!isTeacherAdmin || studentLocked)
      ? 'student'
      : rawViewMode === 'parent' && studentLocked
      ? 'student'
      : rawViewMode;

  const availableModes: { id: ViewMode; label: string }[] =
    isTeacherAdmin && !studentLocked
      ? [
          { id: 'student', label: 'Student View' },
          { id: 'teacher', label: 'Teacher Portal' },
          { id: 'parent', label: 'Parent View' },
        ]
      : [
          { id: 'student', label: 'Student View' },
          ...(!studentLocked ? [{ id: 'parent' as ViewMode, label: 'Parent View' }] : []),
        ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="text-lg font-display font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            LearnPro AI
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="flex items-center gap-5 overflow-x-auto text-sm font-medium">
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'visual', label: 'Visual Studio' },
                { id: 'tutor', label: 'AI Tutor' },
                { id: 'assessments', label: 'Assessments' },
                { id: 'retention', label: 'Retention' },
              ] as { id: NavTab; label: string }[]
            ).map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-sky-600 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Toolbar (Role & Lock Controls) */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-900">
              {currentViewMode === 'teacher' ? 'Teacher Portal' : workspace?.studentName || 'Student'}
            </span>
            <span className="text-slate-300">·</span>
            <span>{workspace?.grade || 'Grade 5'}</span>
            <span className="text-slate-300">·</span>
            <span className="font-medium text-sky-700">
              {textbooks.length} uploaded textbook{textbooks.length === 1 ? '' : 's'} (Textbook-Only Syllabus)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {availableModes.length > 1 && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {availableModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSwitchViewMode(mode.id)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      currentViewMode === mode.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}

            {isTeacherAdmin && !studentLocked && (
              <button
                type="button"
                onClick={handleLockStudentMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
                title="Lock this browser in Student Mode before handing to your student"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock Student Mode
              </button>
            )}

            {isTeacherAdmin && studentLocked && (
              <button
                type="button"
                onClick={() => {
                  setUnlockPinError(null);
                  setUnlockPinInput('');
                  setShowUnlockModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Unlock className="w-3.5 h-3.5 text-sky-600" />
                Teacher Unlock
              </button>
            )}
          </div>
        </div>
      </div>

      {authNotice && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            {authNotice}
          </div>
        </div>
      )}

      {/* Teacher PIN Unlock Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlockTeacherSubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Teacher Portal Unlock
            </div>
            <p className="text-xs text-slate-600">
              Enter your Teacher PIN to switch back to Teacher Portal (default PIN: <span className="font-mono font-semibold">1234</span> unless customized in Teacher Portal).
            </p>
            {unlockPinError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {unlockPinError}
              </div>
            )}
            <input
              type="password"
              value={unlockPinInput}
              onChange={(e) => setUnlockPinInput(e.target.value)}
              placeholder="Enter Teacher PIN..."
              autoFocus
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnlockModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
              >
                Unlock Teacher Portal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'overview' && workspace && (
          <DashboardsView
            uid={user.uid}
            isTeacherAdmin={isTeacherAdmin}
            teacherPin={teacherPin}
            onUpdateTeacherPin={handleUpdateTeacherPin}
            workspace={workspace}
            viewMode={currentViewMode}
            textbooks={textbooks}
            chaptersByBook={chaptersByBook}
            lessons={lessons}
            assessments={assessments}
            mistakes={mistakes}
            revisions={revisions}
            plans={plans}
            onNavigateVisual={(subj) => {
              setSelectedSubject(subj);
              setActiveTab('visual');
            }}
            onNavigateAssessments={() => setActiveTab('assessments')}
            onNavigateRetention={() => setActiveTab('retention')}
          />
        )}

        {activeTab === 'visual' && (
          <VisualLearningView
            uid={user.uid}
            isTeacherAdmin={isTeacherAdmin && !studentLocked}
            selectedSubject={selectedSubject}
            onSelectSubject={setSelectedSubject}
            textbooks={textbooks}
            chaptersByBook={chaptersByBook}
            chunksByBook={chunksByBook}
            lessons={lessons}
            initialVisualRequest={visualRequest}
            onAskTutor={(subj, topic, bookId) => {
              setSelectedSubject(subj);
              setTutorTopic(topic);
              setTutorBookId(bookId);
              setActiveTab('tutor');
            }}
          />
        )}

        {activeTab === 'tutor' && (
          <AdaptiveTutorView
            uid={user.uid}
            studentName={workspace?.studentName || 'Student'}
            grade={workspace?.grade || 'Grade 5'}
            initialSubject={selectedSubject}
            initialTopic={tutorTopic}
            initialTextbookId={tutorBookId}
            textbooks={textbooks}
            chunksByBook={chunksByBook}
            mistakes={mistakes}
            onVisualizeTopic={(subj, queryText) => {
              setSelectedSubject(subj);
              setVisualRequest({ subject: subj, query: queryText, requestId: Date.now() });
              setActiveTab('visual');
            }}
          />
        )}

        {activeTab === 'assessments' && (
          <AssessmentsView
            uid={user.uid}
            assessments={assessments}
            mistakes={mistakes}
            textbooks={textbooks}
            chaptersByBook={chaptersByBook}
            chunksByBook={chunksByBook}
          />
        )}

        {activeTab === 'retention' && (
          <RetentionView
            uid={user.uid}
            revisions={revisions}
            lessons={lessons}
            assessments={assessments}
            mistakes={mistakes}
            onOpenLesson={(subj) => {
              setSelectedSubject(subj);
              setActiveTab('visual');
            }}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
