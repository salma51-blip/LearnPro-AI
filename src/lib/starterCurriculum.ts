import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Subject, VisualType } from '../types/learnpro';

interface StarterBookSeed {
  key: string;
  subject: Subject;
  title: string;
  pageCount: number;
  visualType: VisualType;
  chapter: {
    chapterNumber: number;
    title: string;
    summary: string;
    pageStart: number;
    pageEnd: number;
    topics: string[];
  };
  chunks: {
    topicTitle: string;
    pageNumber: number;
    content: string;
  }[];
  visualLesson: {
    topicTitle: string;
    title: string;
    storyIntro: string;
    steps: {
      stageTitle: string;
      explanation: string;
      realLifeExample: string;
      visualCue: string;
    }[];
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
  };
}

const STARTER_BOOKS: StarterBookSeed[] = [
  {
    key: 'math',
    subject: 'Mathematics',
    title: 'Cambridge Primary IGCSE Mathematics — Grade 5',
    pageCount: 148,
    visualType: 'fractions_geometry',
    chapter: {
      chapterNumber: 1,
      title: 'Fractions, Equivalence & Polygons',
      summary:
        'Understand how parts make a whole using fraction bars, compare unlike denominators by finding equivalent slices, and classify 2D polygons by sides and angles.',
      pageStart: 12,
      pageEnd: 34,
      topics: ['Equivalent Fractions', 'Adding Fractions', 'Regular Polygons'],
    },
    chunks: [
      {
        topicTitle: 'Equivalent Fractions',
        pageNumber: 14,
        content:
          'Equivalent fractions represent the exact same amount of a whole even when the numerator and denominator look different. If you cut a chocolate bar into 2 equal pieces and eat 1 (1/2), you eat the exact same amount as cutting it into 4 equal pieces and eating 2 (2/4). Multiplying both top and bottom by the same number keeps the value equal.',
      },
      {
        topicTitle: 'Adding Fractions',
        pageNumber: 19,
        content:
          'To add fractions with different denominators, first make the pieces the same size (find a common denominator). For example, to add 1/2 + 1/4, turn 1/2 into 2/4 so all slices are quarters. Then add only the numerators: 2/4 + 1/4 = 3/4. Never add denominators together because the size of each whole slice stays quarters.',
      },
      {
        topicTitle: 'Regular Polygons',
        pageNumber: 28,
        content:
          'A polygon is a closed flat shape made of straight line segments. In a regular polygon, every side has the same length and every interior angle is equal. A triangle has 3 sides (180 degrees total), a quadrilateral has 4 sides, a pentagon has 5 sides, and a hexagon has 6 sides.',
      },
    ],
    visualLesson: {
      topicTitle: 'Equivalent Fractions',
      title: 'Seeing Why 1/2 Equals 2/4 and How Slices Combine',
      storyIntro:
        'Imagine sharing two identical rectangular pizzas at lunch. Maya cuts hers into 2 big halves and eats 1 slice. Leo cuts his into 4 quarters and eats 2 slices. Who ate more?',
      steps: [
        {
          stageTitle: '1. Whole & Equal Parts',
          explanation:
            'The bottom number (denominator) tells us how many equal pieces the whole pizza is cut into. The top number (numerator) counts how many pieces we take.',
          realLifeExample: 'Cutting a 1-meter ribbon into 4 equal pieces makes each piece 1/4 meter.',
          visualCue: 'Look at the top fraction bar split into equal shaded blocks.',
        },
        {
          stageTitle: '2. Splitting Without Changing Size',
          explanation:
            'If you slice each half right down the middle, 1 big half turns into 2 smaller quarters. The total shaded pizza stays the exact same width.',
          realLifeExample: 'Trading one 50-cent coin for two 25-cent coins gives the same total money.',
          visualCue: 'Compare Bar A (1/2) directly above Bar B (2/4) — their shaded edges align.',
        },
        {
          stageTitle: '3. Matching Piece Sizes Before Adding',
          explanation:
            'You can only add pieces when they have the same size denominator. Convert 1/2 into 2/4 first, then count the total quarter pieces.',
          realLifeExample: 'You cannot add 1 apple + 2 bananas into "3 apples", you count them as 3 fruits first.',
          visualCue: 'Toggle the Addition Merge view in the Math Sandbox to watch 2/4 + 1/4 snap together.',
        },
      ],
      conceptMap: {
        center: 'Fractions & Equality',
        branches: [
          { label: 'Numerator (Top)', detail: 'Counts how many shaded parts you have.' },
          { label: 'Denominator (Bottom)', detail: 'Shows total equal parts in 1 whole.' },
          { label: 'Equivalent Rule', detail: 'Multiply top and bottom by the same number.' },
          { label: 'Adding Rule', detail: 'Match denominators first, then add numerators only.' },
        ],
      },
      comparison: {
        leftTitle: 'Common Mistake',
        leftPoints: ['Adding tops AND bottoms: 1/2 + 1/4 = 2/6 (Wrong)', 'Thinking 1/4 is bigger than 1/2 because 4 > 2'],
        rightTitle: 'Visual Truth',
        rightPoints: ['Match slice sizes first: 2/4 + 1/4 = 3/4', 'More slices means each individual slice is smaller'],
      },
      comprehensionCheck: {
        question: 'Why does 1/2 + 1/4 equal 3/4 instead of 2/6?',
        options: [
          'Because 1/2 must be rewritten as 2/4 so all pieces are the same quarter size before adding tops',
          'Because you always multiply the denominators together and subtract 1',
          'Because 1/4 is larger than 1/2 on a number line',
        ],
        correctIndex: 0,
        explanation:
          'When we split 1/2 into 2/4, both fractions are measured in quarters. Adding 2 quarters + 1 quarter gives 3 quarters (3/4).',
      },
    },
  },
  {
    key: 'science',
    subject: 'Science',
    title: 'Cambridge Primary IGCSE Science — Grade 5',
    pageCount: 162,
    visualType: 'science_lab',
    chapter: {
      chapterNumber: 3,
      title: 'Electricity, Circuits & Plant Transport',
      summary:
        'Explore how closed electric circuits push energy from a battery to light a bulb, and how plant xylem and phloem vessels transport water and food.',
      pageStart: 42,
      pageEnd: 68,
      topics: ['Simple Electric Circuits', 'Conductors & Insulators', 'Xylem & Phloem Transport'],
    },
    chunks: [
      {
        topicTitle: 'Simple Electric Circuits',
        pageNumber: 45,
        content:
          'An electric circuit is a complete unbroken loop that lets electric current flow from the battery (cell), through metal wires, into a bulb or buzzer, and back to the battery. If a switch is open, there is a gap in the loop and current stops immediately. Increasing battery voltage pushes more current, making the bulb glow brighter.',
      },
      {
        topicTitle: 'Xylem & Phloem Transport',
        pageNumber: 58,
        content:
          'Plants have two sets of tiny transport tubes inside their stems and leaves. Xylem tubes carry water and dissolved minerals upward from the roots to the leaves. Phloem tubes carry sugary food made during photosynthesis in the leaves to every growing part of the plant.',
      },
    ],
    visualLesson: {
      topicTitle: 'Simple Electric Circuits',
      title: 'How Electrons Loop Through a Circuit & Power a Bulb',
      storyIntro:
        'When you flick a bedroom light switch, why does the ceiling bulb glow in an instant—and go completely dark the moment a single wire comes loose?',
      steps: [
        {
          stageTitle: '1. The Energy Pump (Battery)',
          explanation:
            'A battery acts like a water pump. Its voltage pushes tiny electric charges through copper wires around the circuit.',
          realLifeExample: 'Higher voltage (like 6V vs 1.5V) is like pedaling a bicycle harder—charges move faster.',
          visualCue: 'Increase the Voltage slider in the Science Lab to speed up flowing electrons.',
        },
        {
          stageTitle: '2. Closed Loop vs Open Gap',
          explanation:
            'Charges can only travel around a complete unbroken circle. Opening a switch creates an air gap that blocks the loop.',
          realLifeExample: 'A drawbridge lifted up stops every car on the road, even if the engine is running.',
          visualCue: 'Click the Circuit Switch toggle to break and reconnect the loop.',
        },
        {
          stageTitle: '3. Resistance & Bulb Brightness',
          explanation:
            'The thin filament inside a bulb resists the flow, getting warm and glowing brightly. More resistance slows the current down.',
          realLifeExample: 'Squeezing a garden hose makes it harder for water to rush through.',
          visualCue: 'Adjust the Resistance slider and watch the bulb glow dim or brighten.',
        },
      ],
      conceptMap: {
        center: 'Electric Circuit',
        branches: [
          { label: 'Battery (Cell)', detail: 'Provides voltage push for current.' },
          { label: 'Closed Switch', detail: 'Completes the metal path so charges flow.' },
          { label: 'Conductor Wire', detail: 'Copper lets electric current pass easily.' },
          { label: 'Load (Bulb)', detail: 'Converts electrical energy into light and heat.' },
        ],
      },
      comparison: {
        leftTitle: 'Open Circuit',
        leftPoints: ['Switch is open (air gap)', 'Current = 0 A', 'Bulb stays completely off'],
        rightTitle: 'Closed Circuit',
        rightPoints: ['Complete unbroken metal loop', 'Current flows from battery through bulb', 'Higher voltage = brighter glow'],
      },
      comprehensionCheck: {
        question: 'What happens if you close the switch AND increase the battery voltage from 1.5V to 6V?',
        options: [
          'Current flows faster through the closed loop and the bulb shines much brighter',
          'The circuit breaks because 6V stops current from moving',
          'Only half the wire gets electricity',
        ],
        correctIndex: 0,
        explanation:
          'Closing the switch completes the loop, and increasing voltage pushes more electrical current per second, making the bulb glow brighter.',
      },
    },
  },
  {
    key: 'english',
    subject: 'English',
    title: 'Cambridge Primary IGCSE English — Grade 5',
    pageCount: 136,
    visualType: 'english_story',
    chapter: {
      chapterNumber: 2,
      title: 'Building Vivid Sentences & Reading Comprehension',
      summary:
        'Learn how subjects, verbs, adjectives, and prepositional phrases snap together like building blocks, and find main ideas inside story paragraphs.',
      pageStart: 22,
      pageEnd: 46,
      topics: ['Sentence Building Blocks', 'Descriptive Adjectives', 'Inference in Stories'],
    },
    chunks: [
      {
        topicTitle: 'Sentence Building Blocks',
        pageNumber: 24,
        content:
          'Every complete sentence needs two core parts: a Subject (who or what the sentence is about) and a Predicate containing an action or linking Verb (what the subject does). Adding descriptive Adjectives before nouns and Prepositional Phrases (showing where or when) turns a plain sentence into a clear picture for the reader.',
      },
      {
        topicTitle: 'Inference in Stories',
        pageNumber: 35,
        content:
          'Authors do not always tell us feelings directly. Instead, they show clues. If a character pulls her coat tight, shivers, and watches frost form on the window, we can infer it is freezing cold outside even if the word "cold" is never written.',
      },
    ],
    visualLesson: {
      topicTitle: 'Sentence Building Blocks',
      title: 'Snapping Words Together to Paint Clear Story Pictures',
      storyIntro:
        'Reading a long paragraph feels confusing when words blur together. When you see each sentence as colorful building blocks—Who + Action + Where—reading becomes easy to picture.',
      steps: [
        {
          stageTitle: '1. Find the Subject (Who?)',
          explanation:
            'Always spot who or what is doing the action first. Ask yourself: "Who is in this picture?"',
          realLifeExample: 'In "The curious fox leaped", the Subject is "The curious fox".',
          visualCue: 'Click a Subject tile in the Sentence Builder to start your picture.',
        },
        {
          stageTitle: '2. Spot the Action Verb (Did What?)',
          explanation:
            'The verb brings the picture to life by showing movement or state.',
          realLifeExample: 'Choosing "dashed" instead of "went" helps your brain see speed.',
          visualCue: 'Select an Action Verb tile and watch the sentence meaning update.',
        },
        {
          stageTitle: '3. Add Detail & Location (Where / How?)',
          explanation:
            'Adjectives add color or feeling, and prepositional phrases place the action in a clear setting.',
          realLifeExample: '"across the misty bridge" tells your brain the exact scene.',
          visualCue: 'Add an Adjective and Location phrase to complete your vivid sentence.',
        },
      ],
      conceptMap: {
        center: 'Clear Sentence',
        branches: [
          { label: 'Subject (Blue)', detail: 'Who or what the sentence is about.' },
          { label: 'Adjective (Amber)', detail: 'Describes size, color, or feeling.' },
          { label: 'Verb (Emerald)', detail: 'The action happening in the scene.' },
          { label: 'Location Phrase', detail: 'Tells where or when it happens.' },
        ],
      },
      comparison: {
        leftTitle: 'Plain Sentence',
        leftPoints: ['The boy walked.', 'Hard to picture the setting or mood'],
        rightTitle: 'Visual Sentence',
        rightPoints: ['The nervous explorer tiptoed across the creaking wooden bridge.', 'Clear character, action, and setting'],
      },
      comprehensionCheck: {
        question: 'In "The brave astronaut floated inside the quiet capsule", which part tells WHERE the action happens?',
        options: ['inside the quiet capsule', 'The brave astronaut', 'floated'],
        correctIndex: 0,
        explanation:
          '"inside the quiet capsule" is the prepositional location phrase showing where the astronaut floated.',
      },
    },
  },
  {
    key: 'humanities',
    subject: 'Humanities',
    title: 'IGCSE Primary Humanities: Ancient Worlds & Maps — Grade 5',
    pageCount: 124,
    visualType: 'humanities_atlas',
    chapter: {
      chapterNumber: 1,
      title: 'Why Early Civilizations Built Along Great Rivers',
      summary:
        'Trace how annual river floods created fertile soil, farming surpluses, and permanent cities in Mesopotamia, Ancient Egypt, and the Indus Valley.',
      pageStart: 8,
      pageEnd: 29,
      topics: ['River Valley Civilizations', 'Cause and Effect in History', 'Reading Atlas Maps'],
    },
    chunks: [
      {
        topicTitle: 'River Valley Civilizations',
        pageNumber: 11,
        content:
          'Nearly 5,000 years ago, the earliest cities grew along major rivers: the Nile in Egypt, the Tigris and Euphrates in Mesopotamia, and the Indus River in South Asia. Every year, seasonal rains caused these rivers to overflow and leave behind rich dark silt. Farmers used irrigation canals to water crops, creating extra food that allowed builders, potters, and scribes to live together in cities.',
      },
      {
        topicTitle: 'Cause and Effect in History',
        pageNumber: 20,
        content:
          'History works like a chain of causes and effects. Cause: Rivers flooded and left fertile silt. Effect 1: Farmers grew surplus grain. Effect 2: Not everyone needed to farm, so people specialized in trade, metalworking, and writing.',
      },
    ],
    visualLesson: {
      topicTitle: 'River Valley Civilizations',
      title: 'Why Ancient Cities Always Grew Beside Winding Rivers',
      storyIntro:
        'If you had to start a brand-new town 5,000 years ago with no grocery stores or trucks, where would you build it? Let us trace the clues on the ancient atlas.',
      steps: [
        {
          stageTitle: '1. Fresh Water & Fertile Silt',
          explanation:
            'Deserts and dry plains could not grow enough wheat or barley. Seasonal river floods dropped nutrient-rich mud (silt) along riverbanks.',
          realLifeExample: 'Think of fertile silt like natural plant fertilizer spread evenly by the river.',
          visualCue: 'Enable the Rivers layer in the Humanities Atlas to see settlement clusters.',
        },
        {
          stageTitle: '2. Irrigation Canals -> Food Surplus',
          explanation:
            'People dug small ditches (irrigation canals) to guide river water to dry fields, producing more food than one family needed.',
          realLifeExample: 'Extra stored grain meant families survived dry months safely.',
          visualCue: 'Select Ancient Egypt or Indus Valley on the timeline to compare innovations.',
        },
        {
          stageTitle: '3. Boats Turn Rivers Into Highways',
          explanation:
            'Carrying heavy stone or grain on foot was exhausting. Wooden boats floated goods smoothly between towns, creating trade networks.',
          realLifeExample: 'Rivers acted as the first highways before paved roads existed.',
          visualCue: 'Toggle Trade Routes on the map to trace how goods moved between cities.',
        },
      ],
      conceptMap: {
        center: 'River Civilizations',
        branches: [
          { label: 'Annual Floods', detail: 'Deposited dark fertile silt for farming.' },
          { label: 'Irrigation Canals', detail: 'Carried water safely to crop fields.' },
          { label: 'Job Specialization', detail: 'Food surplus freed people to be builders & scribes.' },
          { label: 'River Trade', detail: 'Boats connected distant cities for exchange.' },
        ],
      },
      comparison: {
        leftTitle: 'Nomadic Hunting Groups',
        leftPoints: ['Moved constantly following herds', 'Small temporary camps', 'Everyone spent all day finding food'],
        rightTitle: 'River Valley Cities',
        rightPoints: ['Permanent brick & stone homes', 'Stored grain surpluses', 'Artisans, traders, builders, and early writing'],
      },
      comprehensionCheck: {
        question: 'How did food surpluses from river farming help create builders, potters, and scribes?',
        options: [
          'Because extra food meant not every person had to spend all day farming',
          'Because rivers washed away all houses every month',
          'Because ancient people did not drink water',
        ],
        correctIndex: 0,
        explanation:
          'When fewer farmers could grow enough food for everyone, other community members had time to learn crafts, architecture, and writing.',
      },
    },
  },
  {
    key: 'computing',
    subject: 'Computing',
    title: 'Cambridge Primary IGCSE Computing — Grade 5',
    pageCount: 118,
    visualType: 'computing_logic',
    chapter: {
      chapterNumber: 1,
      title: 'Inside the Computer: CPU, Memory & Logic Flowcharts',
      summary:
        'Discover how the CPU fetches instructions from RAM, executes calculations, and uses IF/ELSE flowchart branches to make smart decisions.',
      pageStart: 6,
      pageEnd: 26,
      topics: ['CPU & RAM Cycle', 'Flowchart Decisions', 'Input-Process-Output'],
    },
    chunks: [
      {
        topicTitle: 'CPU & RAM Cycle',
        pageNumber: 9,
        content:
          'The Central Processing Unit (CPU) is the brain of a computer that follows instructions one step at a time: Fetch from RAM, Decode what the instruction means, and Execute the calculation. RAM (Random Access Memory) is fast temporary workspace memory that clears when power turns off, while Storage (SSD/Hard Drive) keeps files permanently.',
      },
      {
        topicTitle: 'Flowchart Decisions',
        pageNumber: 18,
        content:
          'A flowchart maps out an algorithm visually. Rectangles show action steps, while diamond shapes represent a YES/NO decision (an IF/ELSE condition). Depending on whether a condition is TRUE or FALSE, the computer follows a different arrow path.',
      },
    ],
    visualLesson: {
      topicTitle: 'CPU & RAM Cycle',
      title: 'How the CPU, RAM & Flowcharts Think Step by Step',
      storyIntro:
        'When you click a button in a game, how does a flat silicon chip know whether to jump, play a sound, or add a point? Let us watch data race across the motherboard.',
      steps: [
        {
          stageTitle: '1. Storage vs Fast RAM Desk',
          explanation:
            'Your SSD Storage is like a bookshelf holding all apps safely. When you open an app, it loads onto RAM—the computer’s fast workbench.',
          realLifeExample: 'Keeping your math notebook open on your desk (RAM) is much faster than walking to a locker (Storage) for every problem.',
          visualCue: 'Step through the CPU Cycle Simulator to watch data move from Storage to RAM.',
        },
        {
          stageTitle: '2. Fetch, Decode, Execute',
          explanation:
            'The CPU fetches one instruction from RAM, decodes what command it means, and executes it inside its arithmetic unit.',
          realLifeExample: 'Like a chef reading 1 recipe line (Fetch), understanding "chop 2 carrots" (Decode), and chopping them (Execute).',
          visualCue: 'Press Step Forward in the Computing Lab to highlight each active bus pathway.',
        },
        {
          stageTitle: '3. Diamond Decisions (IF / ELSE)',
          explanation:
            'Computers make choices using TRUE / FALSE logic switches inside flowchart diamonds.',
          realLifeExample: 'IF temperature > 30°C THEN turn fan ON ELSE keep fan OFF.',
          visualCue: 'Toggle Input A and Input B switches to test how the Logic Gate responds.',
        },
      ],
      conceptMap: {
        center: 'Computer Processing',
        branches: [
          { label: 'CPU (Processor)', detail: 'Fetches, decodes, and executes instructions.' },
          { label: 'RAM (Working Memory)', detail: 'Fast temporary desk for active programs.' },
          { label: 'SSD Storage', detail: 'Long-term memory kept even when powered off.' },
          { label: 'IF/ELSE Diamond', detail: 'Routes program flow based on TRUE/FALSE checks.' },
        ],
      },
      comparison: {
        leftTitle: 'RAM (Short-Term)',
        leftPoints: ['Super fast access by CPU', 'Holds currently open apps', 'Clears when computer shuts down'],
        rightTitle: 'Storage / SSD (Long-Term)',
        rightPoints: ['Holds saved files, photos, textbooks', 'Remembers data without electricity', 'Loads data into RAM when needed'],
      },
      comprehensionCheck: {
        question: 'Why does a computer load an app from SSD Storage into RAM before running it?',
        options: [
          'Because RAM is a fast working desk that the CPU can read from rapidly',
          'Because SSD Storage deletes files after 5 seconds',
          'Because RAM is only used to cool down the monitor',
        ],
        correctIndex: 0,
        explanation:
          'RAM gives the CPU ultra-fast access to active instructions while you use the program, whereas SSD Storage keeps files safely long-term.',
      },
    },
  },
];

export async function ensureStarterCurriculum(uid: string): Promise<void> {
  try {
    const existingBooks = await getDocs(
      query(collection(db, 'textbooks'), where('ownerId', '==', uid))
    );
    if (!existingBooks.empty) {
      return;
    }

    // Request real embeddings for all starter chunks from server
    const allChunkTexts = STARTER_BOOKS.flatMap((b) =>
      b.chunks.map((c) => ({ content: `${b.chapter.title} - ${c.topicTitle}: ${c.content}` }))
    );

    let embeddings: number[][] = [];
    try {
      const resp = await fetch('/api/rag/embed-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunks: allChunkTexts }),
      });
      if (resp.ok) {
        const data = await resp.json();
        embeddings = Array.isArray(data.embeddings) ? data.embeddings : [];
      }
    } catch {
      // Fallback unit vectors if offline during seed; real upload always embeds server-side
    }

    let embCursor = 0;
    const uidPrefix = uid.slice(0, 12).replace(/[^a-zA-Z0-9_-]/g, 'u');

    for (const book of STARTER_BOOKS) {
      const textbookId = `tb_${book.key}_${uidPrefix}`;
      const tbRef = doc(db, 'textbooks', textbookId);
      await setDoc(tbRef, {
        ownerId: uid,
        subject: book.subject,
        title: book.title,
        grade: 'Grade 5',
        pageCount: book.pageCount,
        chunkCount: book.chunks.length,
        status: 'ready',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const batch = writeBatch(db);

      const chRef = doc(db, 'textbooks', textbookId, 'chapters', `ch1_${book.key}`);
      batch.set(chRef, {
        ownerId: uid,
        textbookId,
        chapterNumber: book.chapter.chapterNumber,
        title: book.chapter.title,
        summary: book.chapter.summary,
        pageStart: book.chapter.pageStart,
        pageEnd: book.chapter.pageEnd,
        topics: book.chapter.topics,
        createdAt: serverTimestamp(),
      });

      book.chunks.forEach((chunk, idx) => {
        const vec = embeddings[embCursor] && embeddings[embCursor].length > 0 ? embeddings[embCursor] : [0.1, 0.2, 0.3, 0.4];
        embCursor++;
        const chunkRef = doc(db, 'textbooks', textbookId, 'chunks', `chk_${book.key}_${idx + 1}`);
        batch.set(chunkRef, {
          ownerId: uid,
          textbookId,
          subject: book.subject,
          chapterTitle: book.chapter.title,
          topicTitle: chunk.topicTitle,
          pageNumber: chunk.pageNumber,
          content: chunk.content,
          embedding: vec,
          createdAt: serverTimestamp(),
        });
      });

      const lessonRef = doc(db, 'visualLessons', `lesson_${book.key}_${uidPrefix}`);
      batch.set(lessonRef, {
        ownerId: uid,
        subject: book.subject,
        textbookId,
        chapterTitle: book.chapter.title,
        topicTitle: book.visualLesson.topicTitle,
        title: book.visualLesson.title,
        visualType: book.visualType,
        storyIntro: book.visualLesson.storyIntro,
        lessonPayload: {
          steps: book.visualLesson.steps,
          conceptMap: book.visualLesson.conceptMap,
          comparison: book.visualLesson.comparison,
          comprehensionCheck: book.visualLesson.comprehensionCheck,
          citations: [{ chapterTitle: book.chapter.title, pageNumber: book.chunks[0].pageNumber }],
        },
        completed: false,
        comprehensionScore: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
    }

    // Seed 2 starter assessments (1 Math topic check, 1 Science daily check) + 3 daily plan items
    const seedBatch = writeBatch(db);

    seedBatch.set(doc(db, 'assessments', `assess_math_${uidPrefix}`), {
      ownerId: uid,
      subject: 'Mathematics',
      title: 'Fractions & Equivalence Check',
      assessmentType: 'topic',
      chapterTitle: 'Fractions, Equivalence & Polygons',
      topicTitle: 'Equivalent Fractions',
      mode: 'digital',
      status: 'pending',
      score: 0,
      maxScore: 6,
      questions: [
        {
          id: 'q1',
          type: 'mcq',
          prompt: 'Which fraction is equal to 1/2?',
          options: ['1/4', '2/4', '2/3', '3/8'],
          correctAnswer: '2/4',
          workingSteps: 'Multiply numerator and denominator of 1/2 by 2 to get 2/4.',
          points: 2,
          pageRef: 14,
        },
        {
          id: 'q2',
          type: 'math_working',
          prompt: 'Show your steps to add: 1/2 + 1/4 = ?',
          options: [],
          correctAnswer: '3/4',
          workingSteps: 'Step 1: Convert 1/2 to 2/4. Step 2: Add numerators: 2/4 + 1/4 = 3/4.',
          points: 2,
          pageRef: 19,
        },
        {
          id: 'q3',
          type: 'short_answer',
          prompt: 'In your own words, why do we NOT add the denominators when adding 2/4 + 1/4?',
          options: [],
          correctAnswer: 'Because the denominator shows the size of each piece (quarters), which stays the same.',
          workingSteps: 'Explain that only the count of equal pieces (numerator) increases.',
          points: 2,
          pageRef: 19,
        },
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    seedBatch.set(doc(db, 'assessments', `assess_science_${uidPrefix}`), {
      ownerId: uid,
      subject: 'Science',
      title: 'Daily Check: Electric Circuits',
      assessmentType: 'daily',
      chapterTitle: 'Electricity, Circuits & Plant Transport',
      topicTitle: 'Simple Electric Circuits',
      mode: 'digital',
      status: 'pending',
      score: 0,
      maxScore: 4,
      questions: [
        {
          id: 'q1',
          type: 'true_false',
          prompt: 'True or False: A bulb will light up when the circuit switch is open.',
          options: ['True', 'False'],
          correctAnswer: 'False',
          workingSteps: 'An open switch breaks the loop so current cannot flow.',
          points: 2,
          pageRef: 45,
        },
        {
          id: 'q2',
          type: 'short_answer',
          prompt: 'What happens to bulb brightness if you add a second battery to increase voltage in a closed circuit?',
          options: [],
          correctAnswer: 'The bulb glows brighter because more electric current flows.',
          workingSteps: 'More voltage pushes more current around the loop.',
          points: 2,
          pageRef: 45,
        },
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    seedBatch.set(doc(db, 'assignedPlans', `plan_1_${uidPrefix}`), {
      ownerId: uid,
      subject: 'Mathematics',
      title: 'Explore Visual Fractions Sandbox',
      topicTitle: 'Equivalent Fractions',
      itemType: 'lesson',
      status: 'pending',
      dueDate: todayStr,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    seedBatch.set(doc(db, 'assignedPlans', `plan_2_${uidPrefix}`), {
      ownerId: uid,
      subject: 'Science',
      title: 'Complete Electric Circuits Check',
      topicTitle: 'Simple Electric Circuits',
      itemType: 'assessment',
      status: 'pending',
      dueDate: todayStr,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    seedBatch.set(doc(db, 'assignedPlans', `plan_3_${uidPrefix}`), {
      ownerId: uid,
      subject: 'English',
      title: 'Build 3 Vivid Sentences in Story Studio',
      topicTitle: 'Sentence Building Blocks',
      itemType: 'lesson',
      status: 'pending',
      dueDate: todayStr,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await seedBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'textbooks');
  }
}
