import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { sanitizeAnimatedSvg } from './src/lib/svgSanitizer.ts';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '15mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message);
  } catch {
    // Check if raw contains an embedded JSON object
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart));
        if (parsed?.error?.message) return String(parsed.error.message);
      } catch {
        // ignore parse failure
      }
    }
  }
  return raw;
}

function isTransientGeminiError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status?: unknown }).status) : 0;
  return (
    status === 503 ||
    status === 429 ||
    status === 502 ||
    status === 504 ||
    raw.includes('503') ||
    raw.includes('unavailable') ||
    raw.includes('high demand') ||
    raw.includes('overloaded') ||
    raw.includes('429') ||
    raw.includes('resource_exhausted') ||
    raw.includes('econnreset') ||
    raw.includes('etimedout') ||
    raw.includes('fetch failed')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withGeminiRetry<T>(
  fn: (attempt: number, lastError: unknown) => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1200;
  const label = options.label ?? 'Gemini';
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(attempt, lastError);
    } catch (err) {
      lastError = err;
      const shouldRetry = isTransientGeminiError(err) && attempt < maxAttempts - 1;
      if (!shouldRetry) {
        throw err;
      }
      const delay = Math.round(baseDelayMs * Math.pow(1.8, attempt) + Math.random() * 350);
      console.log(`[${label}] Temporary busy response (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

type GenerateContentArgs = Parameters<GoogleGenAI['models']['generateContent']>[0];

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: GenerateContentArgs,
  label = 'generateContent'
) {
  return withGeminiRetry(
    async (attempt, lastError) => {
      const prevMsg = lastError ? (lastError instanceof Error ? lastError.message : String(lastError)).toLowerCase() : '';
      const shouldUseFallbackModel =
        prevMsg.includes('503') ||
        prevMsg.includes('unavailable') ||
        prevMsg.includes('high demand') ||
        prevMsg.includes('overloaded') ||
        prevMsg.includes('429') ||
        prevMsg.includes('resource_exhausted');

      if (attempt >= 1 && shouldUseFallbackModel && params.model === 'gemini-4-hydrogen') {
        console.log(`[${label}] Routing retry #${attempt} via gemini-3.1-flash-lite.`);
        const fallbackConfig = params.config ? { ...params.config } : undefined;
        if (fallbackConfig && 'thinkingConfig' in fallbackConfig) {
          delete fallbackConfig.thinkingConfig;
        }
        return ai.models.generateContent({
          ...params,
          model: 'gemini-3.1-flash-lite',
          config: fallbackConfig,
        });
      }
      return ai.models.generateContent(params);
    },
    { maxAttempts: 4, baseDelayMs: 1200, label }
  );
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const cleanMsg = extractErrorMessage(err);
  const lower = raw.toLowerCase();

  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: 'Gemini API authentication error. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return {
      status: 404,
      message: 'Requested AI model was not found or is currently unsupported.',
    };
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return {
      status: 503,
      message:
        'The AI model is temporarily experiencing high demand. We automatically retried several times—please wait a few seconds and try again.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and try again.',
    };
  }
  return { status: 500, message: cleanMsg || 'Upstream AI service error.' };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function embedTexts(ai: GoogleGenAI, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const results: number[][] = new Array(texts.length);
  const concurrency = 3;
  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      slice.map(async (text) =>
        withGeminiRetry(
          async () => {
            const res = await ai.models.embedContent({
              model: 'gemini-embedding-2',
              contents: text,
              config: { outputDimensionality: 256 },
            });
            return res.embeddings?.[0]?.values ?? [];
          },
          { maxAttempts: 4, baseDelayMs: 900, label: 'embedContent' }
        )
      )
    );
    batchResults.forEach((vec, idx) => {
      results[i + idx] = vec;
    });
    if (i + concurrency < texts.length) {
      await sleep(120);
    }
  }
  return results;
}

async function structurePagesIntoTextbook(
  ai: GoogleGenAI,
  params: {
    title: string;
    subject: string;
    grade: string;
    pageCount: number;
    pages: { pageNumber: number; text: string }[];
  }
) {
  const { title, subject, grade, pageCount, pages } = params;
  const nonEmptyPages = pages.filter((p) => p.text && p.text.trim().length > 10);

  if (nonEmptyPages.length === 0) {
    throw new Error(
      'No readable text was found in this PDF. Please verify the file is not password-protected or blank.'
    );
  }

  const condensedPages = nonEmptyPages
    .slice(0, 35)
    .map((p) => `[Page ${p.pageNumber}]\n${p.text.slice(0, 1200)}`)
    .join('\n\n');

  const structureResp = await generateContentWithRetry(
    ai,
    {
      model: 'gemini-4-hydrogen',
      contents: `Analyze this ${grade} ${subject} textbook ("${title}") and organize it into clean chapters and topics with exact page ranges and meaningful learning chunks.\n\nTextbook content:\n${condensedPages}`,
      config: {
        systemInstruction:
          'You are an IGCSE Grade 5 curriculum organizer. Extract accurate chapter boundaries, clear topic names, concise summaries, and factual textbook chunks grounded strictly in the provided pages. Preserve exact page numbers.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  chapterNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  pageStart: { type: Type.INTEGER },
                  pageEnd: { type: Type.INTEGER },
                  topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['chapterNumber', 'title', 'summary', 'pageStart', 'pageEnd', 'topics'],
              },
            },
            chunks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  chapterTitle: { type: Type.STRING },
                  topicTitle: { type: Type.STRING },
                  pageNumber: { type: Type.INTEGER },
                  content: { type: Type.STRING },
                },
                required: ['chapterTitle', 'topicTitle', 'pageNumber', 'content'],
              },
            },
          },
          required: ['chapters', 'chunks'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
    'structurePagesIntoTextbook'
  );

  const structured = JSON.parse(structureResp.text || '{"chapters":[],"chunks":[]}');
  const chapters = (structured.chapters || []).slice(0, 20).map((c: Record<string, unknown>, idx: number) => ({
    chapterNumber: Number(c.chapterNumber) || idx + 1,
    title: String(c.title || `Chapter ${idx + 1}`).slice(0, 180),
    summary: String(c.summary || 'Key concepts from this chapter.').slice(0, 1200),
    pageStart: Math.max(1, Number(c.pageStart) || 1),
    pageEnd: Math.max(Math.max(1, Number(c.pageStart) || 1), Number(c.pageEnd) || 1),
    topics:
      Array.isArray(c.topics) && c.topics.length > 0
        ? c.topics.slice(0, 15).map((t) => String(t).slice(0, 120))
        : ['Core Concept'],
  }));

  const rawChunks = (structured.chunks || [])
    .slice(0, 50)
    .map((ch: Record<string, unknown>) => ({
      chapterTitle: String(ch.chapterTitle || chapters[0]?.title || 'Chapter 1').slice(0, 180),
      topicTitle: String(ch.topicTitle || chapters[0]?.topics?.[0] || 'Core Concept').slice(0, 180),
      pageNumber: Math.max(1, Number(ch.pageNumber) || 1),
      content: String(ch.content || '').slice(0, 3500),
    }))
    .filter((c: { content: string }) => c.content.length > 20);

  if (rawChunks.length < 3) {
    for (const p of nonEmptyPages.slice(0, 15)) {
      rawChunks.push({
        chapterTitle: chapters[0]?.title || 'Chapter 1',
        topicTitle: chapters[0]?.topics?.[0] || 'Core Concept',
        pageNumber: p.pageNumber,
        content: p.text.slice(0, 1800),
      });
    }
  }

  const embeddings = await embedTexts(
    ai,
    rawChunks.map(
      (c: { chapterTitle: string; topicTitle: string; content: string }) =>
        `${c.chapterTitle} - ${c.topicTitle}: ${c.content}`
    )
  );

  const chunks = rawChunks.map((c: Record<string, unknown>, idx: number) => ({
    ...c,
    embedding: embeddings[idx] && embeddings[idx].length > 0 ? embeddings[idx] : [0],
  }));

  return {
    title: title.slice(0, 180),
    subject,
    grade,
    pageCount: Math.max(1, pageCount),
    chapters,
    chunks,
  };
}

async function extractPdfPages(buffer: Buffer): Promise<{ pageNumber: number; text: string }[]> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdfDoc = await loadingTask.promise;
    const pages: { pageNumber: number; text: string }[] = [];
    const maxPages = Math.min(pdfDoc.numPages, 120);
    for (let p = 1; p <= maxPages; p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const strings = textContent.items
        .map((item: unknown) => {
          if (item && typeof item === 'object' && 'str' in item) {
            return String((item as { str: string }).str);
          }
          return '';
        })
        .filter(Boolean);
      pages.push({ pageNumber: p, text: strings.join(' ').replace(/\s+/g, ' ').trim() });
    }
    return pages;
  } catch {
    console.log('pdfjs-dist extraction fallback triggered.');
    return [];
  }
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'learnpro-ai-api' });
});

// 1a. OCR scanned PDF page images sent in small batches from client
app.post('/api/textbooks/ocr-pages', async (req, res) => {
  try {
    const pages = Array.isArray(req.body.pages) ? req.body.pages : [];
    if (pages.length === 0) {
      res.status(400).json({ error: 'No page images provided for OCR.' });
      return;
    }
    const ai = getAiClient();
    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    for (const p of pages.slice(0, 4)) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: String(p.imageBase64 || '') } });
      parts.push({ text: `Above is textbook page ${Number(p.pageNumber)}.` });
    }
    parts.push({
      text: 'You are a precise textbook OCR transcriber. Read and transcribe EVERY visible word, heading, subheading, diagram label, caption, number, table entry, and paragraph from each page image above. Return one entry per page with its exact pageNumber and all readable text.',
    });

    const ocrResp = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pages: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pageNumber: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                  },
                  required: ['pageNumber', 'text'],
                },
              },
            },
            required: ['pages'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'ocrPages'
    );
    const parsed = JSON.parse(ocrResp.text || '{"pages":[]}');
    res.json({ pages: Array.isArray(parsed.pages) ? parsed.pages : [] });
  } catch (err) {
    console.error('OCR pages error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 1b. Structure client-extracted textbook pages into chapters & RAG chunks
app.post('/api/textbooks/structure', async (req, res) => {
  try {
    const { title, subject, grade, pageCount, pages } = req.body;
    if (!Array.isArray(pages) || pages.length === 0) {
      res.status(422).json({
        error: 'Could not extract readable text from this PDF. Please verify the file is not password-protected or empty.',
      });
      return;
    }
    const ai = getAiClient();
    const result = await structurePagesIntoTextbook(ai, {
      title: String(title || `${subject || 'Mathematics'} Textbook`),
      subject: String(subject || 'Mathematics'),
      grade: String(grade || 'Grade 5'),
      pageCount: Number(pageCount) || pages.length,
      pages,
    });
    res.json(result);
  } catch (err) {
    console.error('Structure textbook error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 1c. Legacy direct multipart PDF upload endpoint (kept for smaller direct PDF uploads)
app.post('/api/textbooks/extract', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const subject = String(req.body.subject || 'Mathematics');
    const grade = String(req.body.grade || 'Grade 5');
    const customTitle = String(req.body.title || '').trim();

    if (!file) {
      res.status(400).json({ error: 'Please select a PDF textbook file to upload.' });
      return;
    }

    const ai = getAiClient();
    const title = customTitle || file.originalname.replace(/\.pdf$/i, '') || `${subject} Textbook`;

    let pages = await extractPdfPages(file.buffer);
    const totalExtractedChars = pages.reduce((acc, p) => acc + p.text.length, 0);

    if (totalExtractedChars < 150) {
      const pdfBase64 = file.buffer.toString('base64');
      const ocrResp = await generateContentWithRetry(
        ai,
        {
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
              {
                text: `Extract the readable educational text from this ${grade} ${subject} textbook PDF page by page. Return JSON with pages array containing pageNumber (integer) and text (string).`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                pages: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      pageNumber: { type: Type.INTEGER },
                      text: { type: Type.STRING },
                    },
                    required: ['pageNumber', 'text'],
                  },
                },
              },
              required: ['pages'],
            },
          },
        },
        'extractPdfOcr'
      );
      const parsedOcr = JSON.parse(ocrResp.text || '{"pages":[]}');
      if (Array.isArray(parsedOcr.pages) && parsedOcr.pages.length > 0) {
        pages = parsedOcr.pages;
      }
    }

    const result = await structurePagesIntoTextbook(ai, {
      title,
      subject,
      grade,
      pageCount: Math.max(1, pages.length),
      pages,
    });
    res.json(result);
  } catch (err) {
    console.error('PDF extract error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 2. Embed text chunks for starter textbooks or teacher notes
app.post('/api/rag/embed-chunks', async (req, res) => {
  try {
    const chunks = Array.isArray(req.body.chunks) ? req.body.chunks : [];
    const ai = getAiClient();
    const embeddings = await embedTexts(
      ai,
      chunks.map((c: { content: string }) => String(c.content || '').slice(0, 3000))
    );
    res.json({ embeddings });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 3. RAG-Powered Adaptive AI Tutor Chat
app.post('/api/tutor/chat', async (req, res) => {
  try {
    const { question, subject, topicTitle, studentName, grade, history, chunks, recentMistakes } = req.body;
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Question is required.' });
      return;
    }

    const candidateChunks = Array.isArray(chunks)
      ? chunks.filter((c: { subject?: string; content?: string }) => (!c.subject || c.subject === subject) && Boolean(c.content))
      : [];
    if (candidateChunks.length === 0) {
      res.status(422).json({
        error: `No uploaded textbook content found for ${subject}. Please ask your teacher to upload the ${subject} textbook PDF first — only uploaded textbook syllabus is allowed.`,
      });
      return;
    }

    const ai = getAiClient();
    const [qEmbedding] = await embedTexts(ai, [`${subject} ${topicTitle}: ${question}`]);

    const scored = candidateChunks
      .map((chunk: { id?: string; subject?: string; chapterTitle: string; topicTitle: string; pageNumber: number; content: string; embedding?: number[] }) => {
        let sim = chunk.embedding && qEmbedding ? cosineSimilarity(qEmbedding, chunk.embedding) : 0;
        if (chunk.subject === subject) sim += 0.08;
        if (topicTitle && chunk.topicTitle?.toLowerCase().includes(String(topicTitle).toLowerCase())) sim += 0.1;
        return { ...chunk, score: sim };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const contextBlock = scored
      .map(
        (c, i) =>
          `[Source ${i + 1} | Chapter: ${c.chapterTitle} | Topic: ${c.topicTitle} | Page ${c.pageNumber}]\n${c.content}`
      )
      .join('\n\n');

    const mistakeContext = Array.isArray(recentMistakes) && recentMistakes.length > 0
      ? `Known recent struggles for ${studentName || 'the student'}: ${recentMistakes.slice(0, 4).join('; ')}`
      : '';

    const historyText = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m: { role: string; content: string }) => `${m.role === 'student' ? 'Student' : 'Tutor'}: ${m.content}`)
          .join('\n')
      : '';

    const prompt = `Student (${studentName || 'Learner'}, ${grade || 'Grade 5'} IGCSE) asks about ${subject} — "${topicTitle}":
"${question}"

Recent Conversation:
${historyText || '(New conversation)'}

${mistakeContext}

Retrieved Textbook Context (ONLY ALLOWED SYLLABUS — DO NOT USE EXTERNAL SYLLABUS):
${contextBlock}`;

    const response = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: `You are LearnPro Tutor, a patient, encouraging Grade 5 schoolteacher helping a child understand ONLY their uploaded textbook syllabus.
STRICT TEXTBOOK-ONLY SYLLABUS RULES:
1. Ground your explanation 100% strictly in the Retrieved Textbook Context. Completely EXCLUDE all out-of-textbook syllabus, external chapters, or outside topics.
2. If the student asks about a concept NOT covered in the Retrieved Textbook Context, set groundedInTextbook to false and politely say: "This topic is outside your uploaded ${subject} textbook syllabus. Let's focus on the topics inside your textbook!" and suggest one topic from the Retrieved Textbook Context.
3. Use simple Grade 5 language. Start with a relatable everyday example BEFORE introducing technical terms from the textbook.
4. Break explanations into short, clear steps (never a long wall of text).
5. If the student asks for the answer to a practice problem, NEVER give the final answer directly—give a helpful visual hint and guide them to try the next step.
6. Always ask one short check-for-understanding question at the end.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING, description: 'Patient, clear Grade 5 visual explanation in short paragraphs or numbered steps.' },
              hint: { type: Type.STRING, description: 'A gentle clue or visual mental picture to help the child solve independently.' },
              checkQuestion: { type: Type.STRING, description: 'One short question to verify the child understood the idea.' },
              groundedInTextbook: { type: Type.BOOLEAN },
              usedSourceIndices: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: '1-based indices of the Retrieved Textbook Context sources used.',
              },
            },
            required: ['reply', 'hint', 'checkQuestion', 'groundedInTextbook', 'usedSourceIndices'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'tutorChat'
    );

    const parsed = JSON.parse(response.text || '{}');
    const usedIndices: number[] = Array.isArray(parsed.usedSourceIndices) ? parsed.usedSourceIndices : [1];
    const citations = scored
      .filter((_c, idx) => usedIndices.includes(idx + 1) || idx === 0)
      .slice(0, 3)
      .map((c) => ({
        chapterTitle: c.chapterTitle,
        topicTitle: c.topicTitle,
        pageNumber: c.pageNumber,
        excerpt: c.content.slice(0, 180) + (c.content.length > 180 ? '...' : ''),
      }));

    res.json({
      reply: parsed.reply || 'Let us look at this step by step together.',
      hint: parsed.hint || 'Try picturing this with an everyday object you know.',
      checkQuestion: parsed.checkQuestion || 'Can you explain the first step in your own words?',
      groundedInTextbook: Boolean(parsed.groundedInTextbook && scored.length > 0),
      citations,
    });
  } catch (err) {
    console.error('Tutor chat error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 4. Visual Lesson + Dynamic Animated Diagram Generator grounded in textbook chunks
app.post('/api/lessons/generate', async (req, res) => {
  try {
    const { subject, chapterTitle, topicTitle, textbookTitle, chunks, customQuestion } = req.body;
    const ai = getAiClient();

    const visualTypeMap: Record<string, string> = {
      Mathematics: 'fractions_geometry',
      Science: 'science_lab',
      English: 'english_story',
      Humanities: 'humanities_atlas',
      Computing: 'computing_logic',
    };
    const visualType = visualTypeMap[subject] || 'fractions_geometry';

    const candidateChunks = Array.isArray(chunks)
      ? chunks.filter((c: { content?: string }) => Boolean(c?.content))
      : [];
    if (candidateChunks.length === 0) {
      res.status(422).json({
        error: `No uploaded textbook content found for ${subject || 'this subject'}. Only uploaded textbook syllabus is permitted — please upload the PDF textbook in Teacher Portal first.`,
      });
      return;
    }

    let relevantChunks = candidateChunks.slice(0, 5);

    if (customQuestion && typeof customQuestion === 'string' && candidateChunks.length > 5) {
      try {
        const [qEmbedding] = await embedTexts(ai, [`${subject} ${topicTitle || ''}: ${customQuestion}`]);
        relevantChunks = candidateChunks
          .map((chunk: { subject?: string; chapterTitle: string; topicTitle: string; pageNumber: number; content: string; embedding?: number[] }) => {
            let sim = chunk.embedding && qEmbedding ? cosineSimilarity(qEmbedding, chunk.embedding) : 0;
            if (chunk.subject === subject) sim += 0.08;
            return { ...chunk, score: sim };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      } catch {
        relevantChunks = candidateChunks.slice(0, 5);
      }
    }

    const contextText = relevantChunks
      .map((c: { pageNumber: number; chapterTitle?: string; content: string }) => `[${c.chapterTitle || chapterTitle || 'Chapter'} · Page ${c.pageNumber}] ${c.content}`)
      .join('\n\n');

    const focusLine = customQuestion
      ? `Student Visual Request / Question: "${customQuestion}"\nTopic Focus: ${topicTitle || customQuestion}`
      : `Topic: ${topicTitle}`;

    const response = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: `Create a Grade 5 Visual Learning Lesson + Interactive Diagram for ${subject} grounded STRICTLY in the uploaded textbook:
Textbook: ${textbookTitle || `${subject} Textbook`}
Chapter: ${chapterTitle || 'Textbook Concepts'}
${focusLine}

Source Textbook Passages (ONLY ALLOWED SYLLABUS):
${contextText}`,
        config: {
          systemInstruction: `You are an expert Grade 5 visual educator designing interactive, story-driven visual lessons and real animated SVG diagrams for a 10-year-old student.
STRICT TEXTBOOK-ONLY SYLLABUS LOCK:
- Every explanation, visual diagram label, step, concept map branch, comparison, and comprehension check MUST be grounded strictly in the Source Textbook Passages provided. EXCLUDE all out-of-textbook syllabus or outside topics.
Convert the textbook passages into:
1) animatedSvg: A rich, colorful, self-contained SVG illustration (viewBox="0 0 680 380") depicting THIS SPECIFIC TEXTBOOK TOPIC visually—NOT generic empty boxes!
   - Draw actual recognizable Grade 5 educational illustrations using SVG shapes (<rect>, <circle>, <ellipse>, <path>, <polygon>, <line>, <text>): e.g., sun, clouds, rain, river, leaves/roots, digestive organs, heart/blood vessels, fraction bars/pies, polygons/angles, atoms/particles, gears, circuits, planets, timelines, or flowcharts depending on the topic.
   - Include a crisp title at y="32", clean non-overlapping text labels on solid/tinted badge boxes, and at least 3 smooth SVG animations (<animateMotion>, <animateTransform>, or <animate> with repeatCount="indefinite") showing movement, flow, growth, or change!
   - Use a clean light background <rect width="680" height="380" rx="16" fill="#F8FAFC"/> (or #0F172A for space/electricity/computing) with high-contrast legible text. Do NOT use <script>, <foreignObject>, or event handlers.
2) visualDiagram: Structured interactive breakdown (4 to 5 clickable nodes + connections).
3) Short visual steps, concept map, comparison, and comprehension check.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              storyIntro: { type: Type.STRING, description: '2-3 sentence relatable story introducing the concept.' },
              animatedSvg: {
                type: Type.STRING,
                description: 'Complete valid <svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg">...</svg> diagram illustrating this exact topic with animations and clear labels.',
              },
              visualDiagram: {
                type: Type.OBJECT,
                properties: {
                  diagramTitle: { type: Type.STRING },
                  diagramStyle: {
                    type: Type.STRING,
                    description: "One of: 'cycle', 'process_flow', 'labeled_parts', 'comparison_bars', 'timeline'",
                  },
                  caption: { type: Type.STRING },
                  flowLabel: { type: Type.STRING },
                  nodes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        label: { type: Type.STRING },
                        roleOrValue: { type: Type.STRING },
                        description: { type: Type.STRING },
                        icon: {
                          type: Type.STRING,
                          description: "One of: 'sun', 'water', 'leaf', 'bolt', 'atom', 'heart', 'gear', 'book', 'globe', 'star', 'flask', 'brain'",
                        },
                        color: {
                          type: Type.STRING,
                          description: "One of: 'sky', 'emerald', 'amber', 'indigo', 'rose'",
                        },
                        percentValue: { type: Type.INTEGER },
                      },
                      required: ['id', 'label', 'roleOrValue', 'description', 'icon', 'color'],
                    },
                  },
                  connections: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        fromIndex: { type: Type.INTEGER },
                        toIndex: { type: Type.INTEGER },
                        label: { type: Type.STRING },
                      },
                      required: ['fromIndex', 'toIndex', 'label'],
                    },
                  },
                },
                required: ['diagramTitle', 'diagramStyle', 'caption', 'flowLabel', 'nodes', 'connections'],
              },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stageTitle: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    realLifeExample: { type: Type.STRING },
                    visualCue: { type: Type.STRING },
                  },
                  required: ['stageTitle', 'explanation', 'realLifeExample', 'visualCue'],
                },
              },
              conceptMap: {
                type: Type.OBJECT,
                properties: {
                  center: { type: Type.STRING },
                  branches: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        detail: { type: Type.STRING },
                      },
                      required: ['label', 'detail'],
                    },
                  },
                },
                required: ['center', 'branches'],
              },
              comparison: {
                type: Type.OBJECT,
                properties: {
                  leftTitle: { type: Type.STRING },
                  leftPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                  rightTitle: { type: Type.STRING },
                  rightPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['leftTitle', 'leftPoints', 'rightTitle', 'rightPoints'],
              },
              comprehensionCheck: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
            required: ['title', 'storyIntro', 'animatedSvg', 'visualDiagram', 'steps', 'conceptMap', 'comparison', 'comprehensionCheck'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'lessonsGenerate'
    );

    const parsed = JSON.parse(response.text || '{}');
    const citations = relevantChunks.slice(0, 3).map((c: { pageNumber: number; chapterTitle?: string }) => ({
      chapterTitle: c.chapterTitle || chapterTitle || 'Textbook',
      pageNumber: Number(c.pageNumber) || 1,
    }));

    const validStyles = ['cycle', 'process_flow', 'labeled_parts', 'comparison_bars', 'timeline'];
    const validIcons = ['sun', 'water', 'leaf', 'bolt', 'atom', 'heart', 'gear', 'book', 'globe', 'star', 'flask', 'brain'];
    const validColors = ['sky', 'emerald', 'amber', 'indigo', 'rose'];

    const rawDiag = parsed.visualDiagram || {};
    const visualDiagram = {
      diagramTitle: String(rawDiag.diagramTitle || parsed.title || topicTitle || 'Visual Concept Diagram').slice(0, 140),
      diagramStyle: validStyles.includes(rawDiag.diagramStyle) ? rawDiag.diagramStyle : 'process_flow',
      caption: String(rawDiag.caption || 'Click any part of the visual diagram to explore step by step.').slice(0, 300),
      flowLabel: String(rawDiag.flowLabel || 'Step-by-Step Visual Flow').slice(0, 80),
      nodes: Array.isArray(rawDiag.nodes)
        ? rawDiag.nodes.slice(0, 6).map((n: Record<string, unknown>, idx: number) => ({
            id: String(n.id || `n${idx + 1}`),
            label: String(n.label || `Part ${idx + 1}`).slice(0, 60),
            roleOrValue: String(n.roleOrValue || `Step ${idx + 1}`).slice(0, 60),
            description: String(n.description || '').slice(0, 400),
            icon: validIcons.includes(String(n.icon)) ? String(n.icon) : 'star',
            color: validColors.includes(String(n.color)) ? String(n.color) : validColors[idx % validColors.length],
            percentValue: typeof n.percentValue === 'number' ? Math.max(5, Math.min(100, n.percentValue)) : undefined,
          }))
        : [],
      connections: Array.isArray(rawDiag.connections) ? rawDiag.connections.slice(0, 8) : [],
    };

    const animatedSvg = sanitizeAnimatedSvg(parsed.animatedSvg) || undefined;

    res.json({
      title: String(parsed.title || topicTitle || customQuestion || 'Visual Lesson').slice(0, 200),
      visualType,
      storyIntro: String(parsed.storyIntro || '').slice(0, 1500),
      lessonPayload: {
        steps: (parsed.steps || []).slice(0, 5),
        conceptMap: parsed.conceptMap || { center: topicTitle || 'Concept', branches: [] },
        comparison: parsed.comparison || { leftTitle: 'Idea A', leftPoints: [], rightTitle: 'Idea B', rightPoints: [] },
        comprehensionCheck: parsed.comprehensionCheck,
        citations,
        visualDiagram,
        ...(animatedSvg ? { animatedSvg } : {}),
      },
    });
  } catch (err) {
    console.error('Lesson generation error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 4b. Generate custom animated SVG diagram on demand for any existing topic
app.post('/api/lessons/diagram', async (req, res) => {
  try {
    const { subject, topicTitle, storyIntro, steps } = req.body;
    if (!topicTitle || typeof topicTitle !== 'string') {
      res.status(400).json({ error: 'Topic title is required to draw a textbook diagram.' });
      return;
    }
    const ai = getAiClient();
    const stepSummary = Array.isArray(steps)
      ? steps.map((s: { stageTitle?: string; explanation?: string }) => `- ${s.stageTitle}: ${s.explanation}`).join('\n')
      : '';

    const response = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: `Draw a clear, labeled, animated Grade 5 educational SVG diagram (viewBox="0 0 680 380") grounded strictly in these textbook lesson notes:
Subject: ${subject || 'Science'}
Topic: ${topicTitle}
Context: ${storyIntro || ''}
Textbook Key Concepts:
${stepSummary || topicTitle}`,
        config: {
          systemInstruction: `Create a rich, understandable Grade 5 textbook illustration as a standalone SVG (viewBox="0 0 680 380").
Strictly depict ONLY the textbook concepts provided — do NOT add out-of-textbook syllabus.
Include:
- Clean background <rect width="680" height="380" rx="16" fill="#F8FAFC"/> (or #0F172A for space/circuits/computing)
- Crisp title at y="32"
- Real recognizable vector artwork illustrating THIS exact concept (shapes, arrows, pipes, organs, plants, particles, fraction bars, shapes, gears, landscapes)
- Clear non-overlapping labels inside rounded boxes
- At least 3 smooth SVG animations (<animateMotion>, <animateTransform>, <animate> with repeatCount="indefinite")
Do NOT include <script>, <foreignObject>, or event handlers.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              animatedSvg: { type: Type.STRING },
            },
            required: ['animatedSvg'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'lessonDiagram'
    );

    const parsed = JSON.parse(response.text || '{}');
    const animatedSvg = sanitizeAnimatedSvg(parsed.animatedSvg);
    if (!animatedSvg) {
      res.status(422).json({ error: 'Could not construct diagram SVG.' });
      return;
    }
    res.json({ animatedSvg });
  } catch (err) {
    console.error('Diagram generation error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 5. Continuous Assessment Generator
app.post('/api/assessments/generate', async (req, res) => {
  try {
    const { subject, assessmentType, chapterTitle, topicTitle, chunks, weakTopics } = req.body;
    const validChunks = Array.isArray(chunks)
      ? chunks.filter((c: { content?: string }) => Boolean(c?.content))
      : [];
    if (validChunks.length === 0) {
      res.status(422).json({
        error: `No uploaded textbook content found for ${subject || 'this subject'}. Only uploaded textbook syllabus can be tested — please upload the PDF textbook first.`,
      });
      return;
    }

    const ai = getAiClient();

    const contextText = validChunks
      .slice(0, 6)
      .map((c: { pageNumber: number; content: string }) => `[Page ${c.pageNumber}] ${c.content}`)
      .join('\n');

    const response = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: `Generate a ${assessmentType} written assessment for Grade 5 ${subject}.
Chapter: ${chapterTitle}
Topic: ${topicTitle}
Focus extra practice on weak areas if relevant: ${(weakTopics || []).join(', ') || 'None'}

Textbook Evidence (ONLY ALLOWED SYLLABUS):
${contextText}`,
        config: {
          systemInstruction: `STRICT TEXTBOOK-ONLY SYLLABUS LOCK:
Create 5 Grade 5 questions strictly from the provided Textbook Evidence passages ONLY. Exclude ALL out-of-textbook syllabus or external topics.
Mix types: 'mcq', 'fill_blank', 'true_false', 'short_answer', and 'math_working' (or 'application').
Ensure clear wording for a 10-11 year old student, exact grading rubric, expected working steps, and textbook page references from the provided passages.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING },
                    prompt: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswer: { type: Type.STRING },
                    workingSteps: { type: Type.STRING },
                    points: { type: Type.INTEGER },
                    pageRef: { type: Type.INTEGER },
                  },
                  required: ['id', 'type', 'prompt', 'correctAnswer', 'workingSteps', 'points'],
                },
              },
            },
            required: ['title', 'questions'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'assessmentsGenerate'
    );

    const parsed = JSON.parse(response.text || '{"title":"Practice Assessment","questions":[]}');
    const questions = (parsed.questions || []).slice(0, 10).map((q: Record<string, unknown>, i: number) => ({
      id: String(q.id || `q${i + 1}`),
      type: String(q.type || 'short_answer'),
      prompt: String(q.prompt || ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctAnswer: String(q.correctAnswer || ''),
      workingSteps: String(q.workingSteps || ''),
      points: Number(q.points) || 2,
      pageRef: Number(q.pageRef) || 1,
    }));

    res.json({
      title: String(parsed.title || `${topicTitle} Check`).slice(0, 180),
      questions,
    });
  } catch (err) {
    console.error('Assessment generate error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 6. Digital Written Assessment Evaluation + Mistake Analysis
app.post('/api/assessments/evaluate', async (req, res) => {
  try {
    const { subject, topicTitle, questions, studentAnswers } = req.body;
    const ai = getAiClient();

    const qaPairs = (questions || []).map((q: Record<string, unknown>, idx: number) => ({
      index: idx + 1,
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      expectedAnswer: q.correctAnswer,
      expectedSteps: q.workingSteps,
      points: Number(q.points) || 2,
      studentResponse: studentAnswers?.[String(q.id)] || '(No answer provided)',
    }));

    const response = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: `Evaluate a Grade 5 student's written assessment for ${subject} (${topicTitle}).
Questions and Student Answers:
${JSON.stringify(qaPairs, null, 2)}`,
        config: {
          systemInstruction: `You are a supportive Grade 5 IGCSE examiner.
Grade both the working process AND the final answer (partial credit is encouraged when steps are mostly right).
For EVERY question that is not fully correct, produce a Mistake Analysis entry identifying the likely conceptual misunderstanding, a simple Grade 5 explanation, a visual mental picture hint, and a similar practice question with its answer.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questionResults: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    earnedPoints: { type: Type.INTEGER },
                    maxPoints: { type: Type.INTEGER },
                    isCorrect: { type: Type.BOOLEAN },
                    feedback: { type: Type.STRING },
                    workingAnalysis: { type: Type.STRING },
                  },
                  required: ['id', 'earnedPoints', 'maxPoints', 'isCorrect', 'feedback', 'workingAnalysis'],
                },
              },
              overallSummary: { type: Type.STRING },
              strengths: { type: Type.STRING },
              mistakes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionPrompt: { type: Type.STRING },
                    studentAnswer: { type: Type.STRING },
                    correctAnswer: { type: Type.STRING },
                    misunderstanding: { type: Type.STRING },
                    simpleExplanation: { type: Type.STRING },
                    visualHint: { type: Type.STRING },
                    practiceQuestion: { type: Type.STRING },
                    practiceAnswer: { type: Type.STRING },
                  },
                  required: [
                    'questionPrompt',
                    'studentAnswer',
                    'correctAnswer',
                    'misunderstanding',
                    'simpleExplanation',
                    'visualHint',
                    'practiceQuestion',
                    'practiceAnswer',
                  ],
                },
              },
            },
            required: ['questionResults', 'overallSummary', 'strengths', 'mistakes'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'assessmentsEvaluate'
    );

    const parsed = JSON.parse(response.text || '{}');
    const results = Array.isArray(parsed.questionResults) ? parsed.questionResults : [];
    const totalScore = results.reduce((sum: number, r: { earnedPoints?: number }) => sum + (Number(r.earnedPoints) || 0), 0);
    const maxScore = Math.max(1, results.reduce((sum: number, r: { maxPoints?: number }) => sum + (Number(r.maxPoints) || 2), 0));

    res.json({
      score: Math.min(totalScore, maxScore),
      maxScore,
      overallSummary: parsed.overallSummary || 'Good effort on your written work.',
      strengths: parsed.strengths || 'You attempted the questions.',
      questionResults: results,
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
    });
  } catch (err) {
    console.error('Assessment evaluate error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 7. Handwritten Notebook Photo OCR & Step-by-Step Evaluation
app.post('/api/assessments/evaluate-handwritten', upload.single('photo'), async (req, res) => {
  try {
    const file = req.file;
    const subject = String(req.body.subject || 'Mathematics');
    const topicTitle = String(req.body.topicTitle || 'Written Practice');
    let questions: unknown[] = [];
    try {
      questions = JSON.parse(String(req.body.questions || '[]'));
    } catch {
      questions = [];
    }

    if (!file) {
      res.status(400).json({ error: 'Please upload a photo of the handwritten notebook work.' });
      return;
    }

    const ai = getAiClient();
    const imageBase64 = file.buffer.toString('base64');
    const mimeType = file.mimetype || 'image/jpeg';

    const response = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            {
              text: `Carefully read (OCR) the Grade 5 student's handwritten notebook work for ${subject} (${topicTitle}).
Questions being answered:
${JSON.stringify(questions, null, 2)}

Inspect every written line, working step, calculation, diagram label, and final answer. Identify exactly which step was done well and which step had an error. If the handwriting is blurry, cut off, or hard to read confidently, set needsTeacherReview to true and explain why.`,
            },
          ],
        },
        config: {
          systemInstruction:
            'You are an expert Grade 5 teacher evaluating handwritten student notebook photos. Perform accurate OCR, trace math/written working step by step, never evaluate only the final answer, and flag needsTeacherReview when confidence < 0.75.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcribedWork: { type: Type.STRING },
              stepByStepAnalysis: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepLabel: { type: Type.STRING },
                    studentWrote: { type: Type.STRING },
                    isCorrect: { type: Type.BOOLEAN },
                    note: { type: Type.STRING },
                  },
                  required: ['stepLabel', 'studentWrote', 'isCorrect', 'note'],
                },
              },
              confidence: { type: Type.NUMBER },
              needsTeacherReview: { type: Type.BOOLEAN },
              score: { type: Type.INTEGER },
              maxScore: { type: Type.INTEGER },
              overallSummary: { type: Type.STRING },
              mistakes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionPrompt: { type: Type.STRING },
                    studentAnswer: { type: Type.STRING },
                    correctAnswer: { type: Type.STRING },
                    misunderstanding: { type: Type.STRING },
                    simpleExplanation: { type: Type.STRING },
                    visualHint: { type: Type.STRING },
                    practiceQuestion: { type: Type.STRING },
                    practiceAnswer: { type: Type.STRING },
                  },
                  required: [
                    'questionPrompt',
                    'studentAnswer',
                    'correctAnswer',
                    'misunderstanding',
                    'simpleExplanation',
                    'visualHint',
                    'practiceQuestion',
                    'practiceAnswer',
                  ],
                },
              },
            },
            required: [
              'transcribedWork',
              'stepByStepAnalysis',
              'confidence',
              'needsTeacherReview',
              'score',
              'maxScore',
              'overallSummary',
              'mistakes',
            ],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'evaluateHandwritten'
    );

    const parsed = JSON.parse(response.text || '{}');
    const maxScore = Math.max(1, Number(parsed.maxScore) || 10);
    const score = Math.min(maxScore, Math.max(0, Number(parsed.score) || 0));

    res.json({
      transcribedWork: parsed.transcribedWork || 'Handwritten work inspected.',
      stepByStepAnalysis: Array.isArray(parsed.stepByStepAnalysis) ? parsed.stepByStepAnalysis : [],
      confidence: Number(parsed.confidence) || 0.85,
      needsTeacherReview: Boolean(parsed.needsTeacherReview || (Number(parsed.confidence) || 1) < 0.75),
      score,
      maxScore,
      overallSummary: parsed.overallSummary || 'Handwritten steps evaluated.',
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
    });
  } catch (err) {
    console.error('Handwritten evaluation error:', err);
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

// 8. Verify Mistake Remediation Practice Attempt
app.post('/api/mistakes/verify-practice', async (req, res) => {
  try {
    const { subject, topicTitle, practiceQuestion, practiceAnswer, studentAttempt } = req.body;
    const ai = getAiClient();

    const response = await generateContentWithRetry(
      ai,
      {
        model: 'gemini-4-hydrogen',
        contents: `Subject: ${subject} (${topicTitle})
Practice Question: ${practiceQuestion}
Expected Answer: ${practiceAnswer}
Student Attempt: ${studentAttempt}`,
        config: {
          systemInstruction:
            'Check if the Grade 5 student solved the practice question correctly or showed understanding of the key concept. Give warm, specific encouraging feedback.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isCorrect: { type: Type.BOOLEAN },
              feedback: { type: Type.STRING },
              nextTip: { type: Type.STRING },
            },
            required: ['isCorrect', 'feedback', 'nextTip'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      'verifyPractice'
    );

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      isCorrect: Boolean(parsed.isCorrect),
      feedback: parsed.feedback || 'Nice try!',
      nextTip: parsed.nextTip || 'Review the visual hint and try once more.',
    });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist/index.html'));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LearnPro AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
