/**
 * Input validation.
 *
 * Every value that arrives from a client passes through here before it reaches
 * storage or the filesystem. The rules are deliberately narrow: each validator
 * states the exact shape it accepts and rejects everything else, rather than
 * trying to enumerate what is dangerous. A denylist is only ever as good as
 * the last attack somebody thought of.
 *
 * A note on the threat model, because it shapes what is and is not here:
 *
 *  - **SQL injection does not apply.** There is no SQL engine; the store is a
 *    JSON file queried with JavaScript array filters. Nothing is ever
 *    concatenated into a query language.
 *  - **Command injection does not apply.** The server never spawns a shell.
 *  - **Script injection** is contained by React, which escapes every
 *    interpolation, and the app uses no `dangerouslySetInnerHTML`.
 *
 * What *does* apply is the boring, real stuff: unbounded strings filling the
 * disk, values outside an enum corrupting the data model, numbers that are
 * NaN, arrays holding objects where strings were assumed, and files whose
 * extension lies about their contents. That is what this module addresses.
 */

export class ValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (field: string, message: string): never => {
  throw new ValidationError(field, message);
};

/* ------------------------------------------------------------- primitives */

export interface StringRule {
  min?: number;
  max: number;
  /** Allow an empty string to pass through as ''. */
  optional?: boolean;
  /** Reject anything not matching. */
  pattern?: RegExp;
  patternHint?: string;
}

/**
 * Trim, bound, and strip control characters.
 *
 * Control characters matter for a reason unrelated to injection: a newline in
 * a field that ends up in a log line lets an attacker forge additional log
 * entries. Stripping them at the boundary is cheaper than escaping at every
 * sink.
 */
export function str(value: unknown, field: string, rule: StringRule): string {
  if (value === undefined || value === null) {
    if (rule.optional) return '';
    return fail(field, `${field} is required.`);
  }
  if (typeof value !== 'string') {
    return fail(field, `${field} must be text.`);
  }

  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();

  if (!cleaned && rule.optional) return '';
  if (!cleaned) return fail(field, `${field} is required.`);

  if (rule.min !== undefined && cleaned.length < rule.min) {
    return fail(field, `${field} must be at least ${rule.min} characters.`);
  }
  if (cleaned.length > rule.max) {
    return fail(field, `${field} must be ${rule.max} characters or fewer.`);
  }
  if (rule.pattern && !rule.pattern.test(cleaned)) {
    return fail(field, rule.patternHint ?? `${field} contains characters that are not allowed.`);
  }
  return cleaned;
}

/**
 * Multi-line free text: newlines and tabs survive, other control characters do
 * not. Used for job descriptions and notes.
 */
export function text(value: unknown, field: string, max: number, optional = true): string {
  if (value === undefined || value === null) {
    if (optional) return '';
    return fail(field, `${field} is required.`);
  }
  if (typeof value !== 'string') return fail(field, `${field} must be text.`);

  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (cleaned.length > max) {
    return fail(field, `${field} must be ${max} characters or fewer (received ${cleaned.length}).`);
  }
  return cleaned;
}

/** One of a fixed set. The cast that this replaces was the actual bug. */
export function oneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(field, `${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

export interface IntRule {
  min: number;
  max: number;
  optional?: boolean;
}

/**
 * Strict integer. `Number('')` is 0 and `Number('abc')` is NaN — both would
 * sail through a bare `Number()` call and land in storage.
 */
export function int(value: unknown, field: string, rule: IntRule): number | null {
  if (value === undefined || value === null || value === '') {
    if (rule.optional) return null;
    return fail(field, `${field} is required.`);
  }

  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return fail(field, `${field} must be a number.`);
  if (!Number.isInteger(n)) return fail(field, `${field} must be a whole number.`);
  if (n < rule.min || n > rule.max) {
    return fail(field, `${field} must be between ${rule.min} and ${rule.max}.`);
  }
  return n;
}

/**
 * Identifier: UUIDs and the slug form used for role ids.
 *
 * Deliberately strict. Ids reach `path.join` and act as map keys, so anything
 * containing a separator, a dot segment, or a null byte is refused here rather
 * than being sanitised further down where the context is easy to get wrong.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function id(value: unknown, field: string): string {
  const raw = str(value, field, { max: 64 });
  if (!ID_PATTERN.test(raw)) {
    return fail(field, `${field} is not a valid identifier.`);
  }
  return raw;
}

export function optionalId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return id(value, field);
}

/** Array of identifiers, bounded so one request cannot ask for everything. */
export function idArray(value: unknown, field: string, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return fail(field, `${field} must be a list.`);
  if (value.length > maxItems) {
    return fail(field, `${field} may contain at most ${maxItems} entries.`);
  }
  // Validate every element: an array of objects where strings were assumed is
  // how a downstream `.includes()` silently stops matching.
  return value.map((v, i) => id(v, `${field}[${i}]`));
}

/** Bounded list of free-text tags, e.g. must-have skill names. */
export function stringArray(value: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return fail(field, `${field} must be a list.`);
  if (value.length > maxItems) {
    return fail(field, `${field} may contain at most ${maxItems} entries.`);
  }
  return value.map((v, i) => str(v, `${field}[${i}]`, { max: maxLen }));
}

export function bool(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fail(field, `${field} must be true or false.`);
}

/* ------------------------------------------------------- file signatures */

/**
 * Magic-byte checks.
 *
 * The upload filter tests the extension, which is a claim by the uploader, not
 * a fact about the file. Verifying the leading bytes is what makes the two
 * agree — a shell script named `.pdf` never reaches the PDF parser, and an
 * HTML document named `.png` never reaches OCR.
 */
type Signature = { magic: number[]; offset?: number; mask?: number[] };

const SIGNATURES: Record<string, Signature[]> = {
  '.pdf': [{ magic: [0x25, 0x50, 0x44, 0x46] }],                       // %PDF
  '.png': [{ magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  '.jpg': [{ magic: [0xff, 0xd8, 0xff] }],
  '.jpeg': [{ magic: [0xff, 0xd8, 0xff] }],
  '.gif': [{ magic: [0x47, 0x49, 0x46, 0x38] }],                       // GIF8
  '.bmp': [{ magic: [0x42, 0x4d] }],                                   // BM
  '.webp': [{ magic: [0x52, 0x49, 0x46, 0x46] }],                      // RIFF….WEBP
  '.tif': [{ magic: [0x49, 0x49, 0x2a, 0x00] }, { magic: [0x4d, 0x4d, 0x00, 0x2a] }],
  '.tiff': [{ magic: [0x49, 0x49, 0x2a, 0x00] }, { magic: [0x4d, 0x4d, 0x00, 0x2a] }],
  // DOCX is a zip container.
  '.docx': [{ magic: [0x50, 0x4b, 0x03, 0x04] }, { magic: [0x50, 0x4b, 0x05, 0x06] }],
};

/** Extensions with no fixed signature — plain text is any bytes. */
const UNSIGNED = new Set(['.txt', '.md']);

export interface FileCheck {
  ok: boolean;
  reason?: string;
}

export function checkFileSignature(ext: string, head: Buffer): FileCheck {
  if (UNSIGNED.has(ext)) {
    // Text files have no magic number, but they must not be executables or
    // markup wearing a .txt extension.
    if (head.length >= 2 && head[0] === 0x23 && head[1] === 0x21) {
      return { ok: false, reason: 'This file is a script, not a document.' };
    }
    if (head.length >= 4 && head.subarray(0, 4).toString('ascii').toUpperCase() === '<!DO') {
      return { ok: false, reason: 'This file is HTML, not plain text.' };
    }
    if (head.includes(0x00)) {
      return { ok: false, reason: 'This file is binary, not text.' };
    }
    return { ok: true };
  }

  const expected = SIGNATURES[ext];
  if (!expected) return { ok: false, reason: `Unsupported file type "${ext}".` };

  const matched = expected.some((sig) => {
    const offset = sig.offset ?? 0;
    if (head.length < offset + sig.magic.length) return false;
    return sig.magic.every((byte, i) => head[offset + i] === byte);
  });

  if (!matched) {
    return {
      ok: false,
      reason: `File contents do not match its "${ext}" extension. It may be renamed or corrupt.`,
    };
  }

  // WEBP needs a second check: RIFF is also AVI and WAV.
  if ((ext === '.webp') && head.subarray(8, 12).toString('ascii') !== 'WEBP') {
    return { ok: false, reason: 'File claims to be WEBP but is a different RIFF container.' };
  }

  return { ok: true };
}

/**
 * Filenames are attacker-controlled and end up in logs, error messages and a
 * Content-Disposition header. Strip anything that could traverse a path or
 * break out of the header.
 */
export function safeFilename(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) return 'unnamed';
  return (
    name
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Take the basename: "../../etc/passwd" becomes "passwd".
      .replace(/^.*[\\/]/, '')
      .replace(/[<>:"|?*]/g, '_')
      .trim()
      .slice(0, 200) || 'unnamed'
  );
}

/* -------------------------------------------------------------- helpers */

/** Wrap a handler so a ValidationError becomes a 400 instead of a 500. */
export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}
