import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ClientPdfResult {
  pageCount: number;
  pages: ExtractedPdfPage[];
}

async function renderPageToJpegBase64(pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await pdfDoc.getPage(pageNum);
  const baseVp = page.getViewport({ scale: 1 });
  const targetWidth = 1150;
  const scale = Math.min(2.0, Math.max(1.0, targetWidth / Math.max(1, baseVp.width)));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Fill solid white background before rendering so transparent PDF pages don't turn black in JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
    background: '#ffffff',
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
  return dataUrl.split(',')[1] || '';
}

async function runOcrBatch(batch: { pageNumber: number; imageBase64: string }[]): Promise<ExtractedPdfPage[]> {
  if (batch.length === 0) return [];
  const resp = await fetch('/api/textbooks/ocr-pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pages: batch }),
  });
  const rawText = await resp.text();
  let data: { error?: string; pages?: ExtractedPdfPage[] } = {};
  try {
    data = JSON.parse(rawText);
  } catch {
    data = {};
  }
  if (!resp.ok) {
    throw new Error(
      data.error ||
        (resp.status === 503
          ? 'The AI OCR service is temporarily busy. Please wait a few seconds and try again.'
          : 'Failed to OCR scanned PDF pages.')
    );
  }
  return Array.isArray(data.pages) ? data.pages : [];
}

export async function extractPdfInBrowser(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ClientPdfResult> {
  onProgress?.('Opening PDF in browser...');
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const maxTextPages = Math.min(totalPages, 120);
  const textPages: ExtractedPdfPage[] = [];

  for (let p = 1; p <= maxTextPages; p++) {
    if (p === 1 || p % 5 === 0 || p === maxTextPages) {
      onProgress?.(`Reading page ${p} of ${maxTextPages}...`);
    }
    const page = await pdfDoc.getPage(p);
    const textContent = await page.getTextContent();
    const strings = textContent.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .filter(Boolean);
    const text = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      textPages.push({ pageNumber: p, text });
    }
  }

  const totalChars = textPages.reduce((acc, p) => acc + p.text.length, 0);

  // If scanned image-only PDF with little/no embedded text, render pages onto white canvases for AI OCR
  if (totalChars < 150) {
    const pageNumbersToScan: number[] = [];
    const firstLimit = Math.min(totalPages, 12);
    for (let p = 1; p <= firstLimit; p++) {
      pageNumbersToScan.push(p);
    }

    const ocrMap = new Map<number, ExtractedPdfPage>();
    for (const tp of textPages) {
      if (tp.text.trim().length > 5) {
        ocrMap.set(tp.pageNumber, tp);
      }
    }

    const scanPageList = async (pageList: number[]) => {
      const batchImages: { pageNumber: number; imageBase64: string }[] = [];
      for (let i = 0; i < pageList.length; i++) {
        const p = pageList[i];
        onProgress?.(`Preparing scanned page ${p} of ${totalPages} for OCR...`);
        const base64 = await renderPageToJpegBase64(pdfDoc, p);
        if (base64) {
          batchImages.push({ pageNumber: p, imageBase64: base64 });
        }
        if (batchImages.length === 3 || i === pageList.length - 1) {
          if (batchImages.length > 0) {
            onProgress?.(`Reading scanned text with AI OCR (page ${p})...`);
            const batch = batchImages.splice(0, batchImages.length);
            const extracted = await runOcrBatch(batch);
            for (const item of extracted) {
              const cleanText = String(item.text || '').trim();
              if (cleanText.length > 5) {
                ocrMap.set(Number(item.pageNumber), {
                  pageNumber: Number(item.pageNumber),
                  text: cleanText,
                });
              }
            }
            if (i < pageList.length - 1) {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
      }
    };

    await scanPageList(pageNumbersToScan);

    // If early pages were blank/cover/images and totalPages > 12, also sample middle textbook pages
    const ocrCharsSoFar = Array.from(ocrMap.values()).reduce((acc, p) => acc + p.text.length, 0);
    if (ocrCharsSoFar < 120 && totalPages > 12) {
      const midStart = Math.min(totalPages, Math.max(13, Math.floor(totalPages * 0.2)));
      const midPages: number[] = [];
      for (let p = midStart; p <= Math.min(totalPages, midStart + 5); p++) {
        midPages.push(p);
      }
      await scanPageList(midPages);
    }

    const combined = Array.from(ocrMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);
    return {
      pageCount: totalPages,
      pages: combined,
    };
  }

  return {
    pageCount: totalPages,
    pages: textPages,
  };
}
