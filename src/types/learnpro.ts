export type Subject = 'Mathematics' | 'Science' | 'English' | 'Humanities' | 'Computing';
export type GradeLevel = 'Grade 1' | 'Grade 2' | 'Grade 3' | 'Grade 4' | 'Grade 5';
export type ViewMode = 'student' | 'teacher' | 'parent';
export type VisualType =
  | 'fractions_geometry'
  | 'science_lab'
  | 'english_story'
  | 'humanities_atlas'
  | 'computing_logic';

export type AssessmentType = 'topic' | 'daily' | 'weekly' | 'chapter' | 'revision' | 'cumulative';

export interface UserWorkspace {
  uid: string;
  studentName: string;
  grade: GradeLevel;
  curriculum: string;
  viewMode: ViewMode;
  streakDays: number;
  masteryPoints: number;
  readingScore?: number;
  independentScore?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Textbook {
  id: string;
  ownerId: string;
  subject: Subject;
  title: string;
  grade: GradeLevel;
  pageCount: number;
  chunkCount: number;
  status: 'ready' | 'processing' | 'error';
  sharedWithClassroom?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TextbookChapter {
  id: string;
  ownerId: string;
  textbookId: string;
  chapterNumber: number;
  title: string;
  summary: string;
  pageStart: number;
  pageEnd: number;
  topics: string[];
  sharedWithClassroom?: boolean;
  createdAt?: unknown;
}

export interface TextbookChunk {
  id: string;
  ownerId: string;
  textbookId: string;
  subject: Subject;
  chapterTitle: string;
  topicTitle: string;
  pageNumber: number;
  content: string;
  embedding: number[];
  sharedWithClassroom?: boolean;
  createdAt?: unknown;
}

export interface VisualStep {
  stageTitle: string;
  explanation: string;
  realLifeExample: string;
  visualCue: string;
}

export type VisualDiagramStyle = 'cycle' | 'process_flow' | 'labeled_parts' | 'comparison_bars' | 'timeline';
export type VisualNodeIcon =
  | 'sun'
  | 'water'
  | 'leaf'
  | 'bolt'
  | 'atom'
  | 'heart'
  | 'gear'
  | 'book'
  | 'globe'
  | 'star'
  | 'flask'
  | 'brain';
export type VisualNodeColor = 'sky' | 'emerald' | 'amber' | 'indigo' | 'rose';

export interface VisualDiagramNode {
  id: string;
  label: string;
  roleOrValue: string;
  description: string;
  icon: VisualNodeIcon;
  color: VisualNodeColor;
  percentValue?: number;
}

export interface VisualDiagram {
  diagramTitle: string;
  diagramStyle: VisualDiagramStyle;
  caption: string;
  flowLabel: string;
  nodes: VisualDiagramNode[];
  connections: { fromIndex: number; toIndex: number; label: string }[];
}

export interface VisualLesson {
  id: string;
  ownerId: string;
  subject: Subject;
  textbookId: string;
  chapterTitle: string;
  topicTitle: string;
  title: string;
  visualType: VisualType;
  storyIntro: string;
  lessonPayload: {
    steps: VisualStep[];
    conceptMap: {
      center: string;
      branches: { label: string; detail: string }[];
    };
    comparison: {
      leftTitle: string;
      leftPoints: string[];
      rightTitle: string;
      rightPoints: string[];
    };
    comprehensionCheck: {
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    };
    citations: { chapterTitle: string; pageNumber: number }[];
    visualDiagram?: VisualDiagram;
    animatedSvg?: string;
  };
  completed: boolean;
  comprehensionScore: number;
  sharedWithClassroom?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TutorSession {
  id: string;
  ownerId: string;
  subject: Subject;
  topicTitle: string;
  textbookId: string;
  messageCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TutorCitation {
  chapterTitle: string;
  topicTitle: string;
  pageNumber: number;
  excerpt: string;
}

export interface TutorMessage {
  id: string;
  ownerId: string;
  sessionId: string;
  role: 'student' | 'tutor';
  content: string;
  citations?: TutorCitation[];
  checkQuestion?: string;
  createdAt?: unknown;
}

export interface AssessmentQuestion {
  id: string;
  type: string;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  workingSteps: string;
  points: number;
  pageRef?: number;
}

export interface Assessment {
  id: string;
  ownerId: string;
  subject: Subject;
  title: string;
  assessmentType: AssessmentType;
  chapterTitle: string;
  topicTitle: string;
  mode: 'digital' | 'handwritten';
  status: 'pending' | 'needs_review' | 'graded';
  questions: AssessmentQuestion[];
  evaluation?: {
    overallSummary?: string;
    strengths?: string;
    transcribedWork?: string;
    confidence?: number;
    questionResults?: {
      id: string;
      earnedPoints: number;
      maxPoints: number;
      isCorrect: boolean;
      feedback: string;
      workingAnalysis: string;
    }[];
    stepByStepAnalysis?: {
      stepLabel: string;
      studentWrote: string;
      isCorrect: boolean;
      note: string;
    }[];
  };
  score: number;
  maxScore: number;
  teacherNotes?: string;
  handwrittenPreview?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MistakeRecord {
  id: string;
  ownerId: string;
  subject: Subject;
  topicTitle: string;
  questionPrompt: string;
  studentAnswer: string;
  correctAnswer: string;
  misunderstanding: string;
  simpleExplanation: string;
  visualHint: string;
  practiceQuestion: string;
  practiceAnswer: string;
  resolved: boolean;
  occurrenceCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RevisionItem {
  id: string;
  ownerId: string;
  subject: Subject;
  topicTitle: string;
  stageIndex: number;
  intervalDays: number;
  retentionScore: number;
  rememberedCount: number;
  forgottenCount: number;
  status: 'due' | 'scheduled' | 'mastered';
  nextReviewAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AssignedPlan {
  id: string;
  ownerId: string;
  subject: Subject;
  title: string;
  topicTitle: string;
  itemType: 'lesson' | 'assessment' | 'revision';
  status: 'pending' | 'completed';
  dueDate: string;
  sharedWithClassroom?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const TEACHER_EMAIL = 'salmanazeer51@gmail.com';

export const SUBJECTS: Subject[] = ['Mathematics', 'Science', 'English', 'Humanities', 'Computing'];

export const SUBJECT_LABELS: Record<Subject, string> = {
  Mathematics: 'Mathematics',
  Science: 'Science',
  English: 'English',
  Humanities: 'Social & Humanities',
  Computing: 'Computing',
};

export function getSubjectLabel(subject: Subject): string {
  return SUBJECT_LABELS[subject] || subject;
}

export const SUBJECT_IMAGES: Record<Subject, string> = {
  Mathematics: '/src/assets/images/subject_math_visual_1795067462761.jpg',
  Science: '/src/assets/images/subject_science_visual_1795067462670.jpg',
  English: '/src/assets/images/subject_english_visual_1795067462664.jpg',
  Humanities: '/src/assets/images/subject_humanities_visual_1795067462277.jpg',
  Computing: '/src/assets/images/subject_computing_visual_1795067462804.jpg',
};

export const SUBJECT_ACCENTS: Record<
  Subject,
  { badge: string; softBg: string; text: string; border: string; hex: string }
> = {
  Mathematics: {
    badge: 'bg-sky-600 text-white',
    softBg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    hex: '#0284C7',
  },
  Science: {
    badge: 'bg-emerald-600 text-white',
    softBg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    hex: '#059669',
  },
  English: {
    badge: 'bg-amber-600 text-white',
    softBg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    hex: '#D97706',
  },
  Humanities: {
    badge: 'bg-indigo-600 text-white',
    softBg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    hex: '#4F46E5',
  },
  Computing: {
    badge: 'bg-teal-600 text-white',
    softBg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    hex: '#0D9488',
  },
};
