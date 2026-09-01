/**
 * Text extraction from uploaded resume files.
 *
 * Supported: PDF (text layer), PNG/JPG/WEBP/TIFF (OCR), DOCX, TXT.
 *
 * A scanned PDF has no text layer. Rather than returning a 500 — the failure
 * mode the briefing explicitly calls out — we detect the empty layer, mark the
 * file `needsOcr`, and let the caller decide: Gemini vision handles it when a
 * key is configured, otherwise the file surfaces in the UI as a warning card
 * with the reason stated.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Extraction } from '../../../shared/types.js';

const require = createRequire(import.meta.url);

// pdf-parse's index.js runs a self-test against a bundled sample when it thinks
// it is the entry module, which throws under ESM. Import the lib directly.
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  data: Buffer,
  opts?: Record<string, unknown>,
) => Promise<{ text: string; numpages: number }>;

const IMAGE_EXT = new Set<string>(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif', '.gif']);

/** Minimum characters before we consider a PDF to have a real text layer. */
const TEXT_LAYER_THRESHOLD = 120;

type TWorker = { recognize: (p: string) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> };

let tesseractWorker: TWorker | null = null;
let tesseractLoading: Promise<TWorker> | null = null;

async function getWorker(): Promise<TWorker> {
  if (tesseractWorker) return tesseractWorker;
  if (!tesseractLoading) {
    tesseractLoading = (async () => {
      const { createWorker } = await import('tesseract.js');
      tesseractWorker = (await createWorker('eng')) as unknown as TWorker;
      return tesseractWorker;
    })();
  }
  return tesseractLoading;
}

export async function shutdownOcr(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate().catch(() => {});
    tesseractWorker = null;
    tesseractLoading = null;
  }
}

/** Collapse the whitespace soup that PDF extraction usually produces. */
function normalise(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]{2,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}

async function extractPdf(filePath: string): Promise<Omit<Extraction, 'kind'> & { text: string }> {
  const buffer = await fs.readFile(filePath);
  try {
    const data = await pdfParse(buffer, { max: 0 });
    const text = normalise(data.text);
    return {
      text,
      pages: data.numpages ?? null,
      needsOcr: text.length < TEXT_LAYER_THRESHOLD,
      warning:
        text.length < TEXT_LAYER_THRESHOLD
          ? 'This PDF has no extractable text layer — it is most likely a scan or an image export.'
          : null,
    };
  } catch (err) {
    return {
      text: '',
      pages: null,
      needsOcr: true,
      warning: `PDF could not be parsed (${(err as Error).message}). It may be encrypted or corrupt.`,
    };
  }
}

async function extractImage(filePath: string): Promise<Omit<Extraction, 'kind'> & { text: string }> {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(filePath);
    const text = normalise(data.text);
    return {
      text,
      pages: 1,
      needsOcr: false,
      ocrConfidence: data.confidence != null ? Math.round(data.confidence) / 100 : null,
      warning:
        text.length < TEXT_LAYER_THRESHOLD
          ? 'OCR returned very little text. The image may be low-resolution or rotated.'
          : data.confidence != null && data.confidence < 70
            ? `OCR confidence is low (${Math.round(data.confidence)}%). Values may be misread.`
            : null,
    };
  } catch (err) {
    return { text: '', pages: null, needsOcr: true, warning: `OCR failed: ${(err as Error).message}` };
  }
}

async function extractDocx(filePath: string): Promise<Omit<Extraction, 'kind'> & { text: string }> {
  try {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ path: filePath });
    return { text: normalise(value), pages: null, needsOcr: false, warning: null };
  } catch (err) {
    return {
      text: '',
      pages: null,
      needsOcr: false,
      warning: `DOCX could not be read (${(err as Error).message}).`,
    };
  }
}

/**
 * Returns { text, pages, needsOcr, warning, ocrConfidence?, kind }.
 * Never throws for an unreadable file — the warning field carries the reason.
 */
export async function extractText(
  filePath: string,
  originalName = '',
): Promise<Extraction & { text: string }> {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (ext === '.pdf') return { ...(await extractPdf(filePath)), kind: 'pdf' };
  if (IMAGE_EXT.has(ext)) return { ...(await extractImage(filePath)), kind: 'image' };
  if (ext === '.docx') return { ...(await extractDocx(filePath)), kind: 'docx' };
  if (ext === '.txt' || ext === '.md') {
    const text = normalise(await fs.readFile(filePath, 'utf8'));
    return { text, pages: null, needsOcr: false, warning: null, kind: 'text' };
  }

  return {
    text: '',
    pages: null,
    needsOcr: false,
    kind: 'unknown',
    warning: `Unsupported file type "${ext || 'unknown'}". Upload a PDF, image, DOCX or TXT.`,
  };
}

export const SUPPORTED_EXTENSIONS: string[] = ['.pdf', '.docx', '.txt', '.md', ...IMAGE_EXT];
