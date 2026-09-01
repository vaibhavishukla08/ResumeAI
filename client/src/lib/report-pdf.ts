import type { jsPDF } from 'jspdf';
import type { Candidate, Role } from '@shared/types';

/**
 * Candidate report as a PDF.
 *
 * This replaced a plain-text dump. The reason matters: a screening report is
 * a document that gets attached to an email, filed against a requisition, and
 * occasionally shown to a candidate or a tribunal. It needs to be paginated,
 * branded, and readable by someone who was not in the room — none of which a
 * .txt file does.
 *
 * Drawn imperatively rather than rendered from HTML so the output does not
 * depend on the viewer's browser, print settings or page size.
 */

const PAGE = { width: 210, height: 297 };          // A4 in millimetres
const MARGIN = { left: 18, right: 18, top: 20, bottom: 20 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

/** A colour as jsPDF wants it. Named so defaults do not narrow to a literal. */
type Rgb = readonly [number, number, number];

/** Brand palette, matched to the app's light theme. */
const COLOR: Record<string, Rgb> = {
  ink: [15, 23, 42],
  body: [51, 65, 85],
  muted: [117, 130, 148],
  rule: [226, 232, 240],
  primary: [13, 116, 144],
  accent: [8, 145, 178],
  success: [5, 150, 105],
  warning: [217, 119, 6],
  error: [220, 38, 38],
};

function toneColor(score: number): Rgb {
  if (score >= 85) return COLOR.success;
  if (score >= 70) return COLOR.primary;
  if (score >= 50) return COLOR.warning;
  return COLOR.error;
}

function bandLabel(score: number): string {
  if (score >= 85) return 'Excellent match';
  if (score >= 70) return 'High match';
  if (score >= 50) return 'Medium match';
  return 'Low match';
}

/** Cursor that knows how to break a page, so no caller has to track Y. */
class Layout {
  y = MARGIN.top;
  page = 1;

  constructor(readonly doc: jsPDF, private readonly onNewPage: (doc: jsPDF, page: number) => void) {}

  /** Reserve vertical space, starting a new page if it will not fit. */
  need(mm: number): void {
    if (this.y + mm <= PAGE.height - MARGIN.bottom) return;
    this.doc.addPage();
    this.page += 1;
    this.y = MARGIN.top;
    this.onNewPage(this.doc, this.page);
  }

  gap(mm: number): void {
    this.y += mm;
  }
}

function setFont(doc: jsPDF, size: number, style: 'normal' | 'bold' = 'normal', color: Rgb = COLOR.body) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

function sectionHeading(L: Layout, title: string): void {
  L.need(14);
  setFont(L.doc, 11, 'bold', COLOR.ink);
  L.doc.text(title.toUpperCase(), MARGIN.left, L.y);
  L.gap(2);
  L.doc.setDrawColor(COLOR.rule[0], COLOR.rule[1], COLOR.rule[2]);
  L.doc.setLineWidth(0.3);
  L.doc.line(MARGIN.left, L.y, PAGE.width - MARGIN.right, L.y);
  L.gap(6);
}

/** Wrapped paragraph that paginates correctly on long text. */
function paragraph(L: Layout, text: string, size = 9.5, color: Rgb = COLOR.body): void {
  if (!text) return;
  setFont(L.doc, size, 'normal', color);
  for (const line of L.doc.splitTextToSize(text, CONTENT_WIDTH) as string[]) {
    L.need(5);
    L.doc.text(line, MARGIN.left, L.y);
    L.gap(4.6);
  }
}

function labelValue(L: Layout, label: string, value: string): void {
  L.need(6);
  setFont(L.doc, 9, 'normal', COLOR.muted);
  L.doc.text(label, MARGIN.left, L.y);
  setFont(L.doc, 9, 'bold', COLOR.ink);
  L.doc.text(value, MARGIN.left + 42, L.y);
  L.gap(5.4);
}

/** Horizontal meter used for the ATS breakdown. */
function meter(L: Layout, label: string, ratio: number, detail: string): void {
  L.need(11);
  const pct = Math.round(ratio * 100);
  const tone = toneColor(pct);

  setFont(L.doc, 9, 'normal', COLOR.ink);
  L.doc.text(label, MARGIN.left, L.y);
  setFont(L.doc, 9, 'bold', tone);
  L.doc.text(`${pct}%`, PAGE.width - MARGIN.right, L.y, { align: 'right' });
  L.gap(2.2);

  const barWidth = CONTENT_WIDTH;
  L.doc.setFillColor(COLOR.rule[0], COLOR.rule[1], COLOR.rule[2]);
  L.doc.roundedRect(MARGIN.left, L.y, barWidth, 1.8, 0.9, 0.9, 'F');
  if (pct > 0) {
    L.doc.setFillColor(tone[0], tone[1], tone[2]);
    L.doc.roundedRect(MARGIN.left, L.y, Math.max(1.8, barWidth * ratio), 1.8, 0.9, 0.9, 'F');
  }
  L.gap(4);

  setFont(L.doc, 7.5, 'normal', COLOR.muted);
  L.doc.text(detail, MARGIN.left, L.y);
  L.gap(5);
}

/** Skill chips, wrapped across lines with a leading tick or cross. */
function chips(L: Layout, items: string[], mark: 'yes' | 'no' | 'plain'): void {
  if (!items.length) {
    paragraph(L, '— none —', 9, COLOR.muted);
    return;
  }
  const color = mark === 'yes' ? COLOR.success : mark === 'no' ? COLOR.error : COLOR.muted;
  const prefix = mark === 'yes' ? '+ ' : mark === 'no' ? '- ' : '• ';

  setFont(L.doc, 9, 'normal', color);
  const line = items.map((i) => `${prefix}${i}`).join('    ');
  for (const wrapped of L.doc.splitTextToSize(line, CONTENT_WIDTH) as string[]) {
    L.need(5);
    L.doc.text(wrapped, MARGIN.left, L.y);
    L.gap(4.6);
  }
}

export async function buildCandidateReport(candidate: Candidate, role: Role | null): Promise<jsPDF> {
  // Dynamic import: jsPDF is ~350KB and most sessions never export a report,
  // so it is fetched on the click rather than shipped in the initial bundle.
  const { jsPDF: JsPdf } = await import('jspdf');
  const doc = new JsPdf({ unit: 'mm', format: 'a4' });
  const { analysis, parsed, recommendation } = candidate;
  const generated = new Date();

  const drawChrome = (d: jsPDF, page: number) => {
    // Header rule and footer on every page, so a detached sheet is still
    // identifiable — these reports get printed and passed around.
    d.setFillColor(COLOR.primary[0], COLOR.primary[1], COLOR.primary[2]);
    d.rect(0, 0, PAGE.width, 3, 'F');

    d.setFont('helvetica', 'normal');
    d.setFontSize(7.5);
    d.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
    d.text(
      `${parsed.name} · ${role?.title ?? 'Screening report'}`,
      MARGIN.left,
      PAGE.height - 10,
    );
    d.text(`Page ${page}`, PAGE.width - MARGIN.right, PAGE.height - 10, { align: 'right' });
  };

  drawChrome(doc, 1);
  const L = new Layout(doc, drawChrome);
  L.gap(4);

  /* ---------------------------------------------------------- title block */

  setFont(doc, 8, 'bold', COLOR.accent);
  doc.text('RESUMEAI · CANDIDATE SCREENING REPORT', MARGIN.left, L.y);
  L.gap(8);

  setFont(doc, 22, 'bold', COLOR.ink);
  doc.text(parsed.name, MARGIN.left, L.y);
  L.gap(7);

  setFont(doc, 10, 'normal', COLOR.muted);
  doc.text(
    [parsed.title || parsed.roles?.[0]?.title, parsed.location].filter(Boolean).join(' · ') ||
      'Role not stated',
    MARGIN.left,
    L.y,
  );
  L.gap(9);

  /* ------------------------------------------------------------ score card */

  const tone = toneColor(analysis.overall);
  L.need(30);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN.left, L.y, CONTENT_WIDTH, 26, 2, 2, 'F');

  const cardTop = L.y;
  setFont(doc, 30, 'bold', tone);
  doc.text(String(analysis.overall), MARGIN.left + 8, cardTop + 15);
  setFont(doc, 9, 'normal', COLOR.muted);
  doc.text('/100', MARGIN.left + 8 + doc.getTextWidth(String(analysis.overall)) + 2, cardTop + 15);
  setFont(doc, 9, 'bold', tone);
  doc.text(bandLabel(analysis.overall), MARGIN.left + 8, cardTop + 21);

  // The three scores side by side — the report's central claim is that these
  // measure different things and should not be collapsed.
  const cols = [
    { label: 'ATS score', value: `${analysis.atsScore}`, note: 'document hygiene' },
    { label: 'JD similarity', value: `${Math.round(analysis.similarity * 100)}%`, note: 'objective' },
    { label: 'Confidence', value: `${Math.round(analysis.confidence * 100)}%`, note: 'subjective' },
  ];
  cols.forEach((c, i) => {
    const x = MARGIN.left + 62 + i * 38;
    setFont(doc, 7.5, 'normal', COLOR.muted);
    doc.text(c.label.toUpperCase(), x, cardTop + 8);
    setFont(doc, 14, 'bold', COLOR.ink);
    doc.text(c.value, x, cardTop + 16);
    setFont(doc, 7, 'normal', COLOR.muted);
    doc.text(c.note, x, cardTop + 21);
  });
  L.gap(32);

  /* ------------------------------------------------------------- summary */

  sectionHeading(L, 'Summary');
  labelValue(L, 'Screened for', role?.title ?? candidate.roleId);
  labelValue(L, 'Experience', parsed.experienceYears != null ? `${parsed.experienceYears} years` : 'Not determined');
  labelValue(L, 'Seniority fit', analysis.experienceFit.note);
  labelValue(L, 'Education', parsed.education?.highestLevel ?? 'Not determined');
  labelValue(L, 'Skill coverage', `${analysis.skills.matchedCount} of ${analysis.skills.requiredCount} required (${Math.round(analysis.skills.coverage * 100)}%)`);
  labelValue(L, 'Email', parsed.contact?.email ?? '—');
  labelValue(L, 'Phone', parsed.contact?.phone ?? '—');
  labelValue(L, 'Analysis engine', candidate.engine === 'gemini' ? 'Gemini' : 'Local deterministic');
  labelValue(L, 'Generated', generated.toLocaleString());
  L.gap(3);

  if (candidate.extraction?.warning) {
    L.need(12);
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(MARGIN.left, L.y - 3.5, CONTENT_WIDTH, 10, 1.5, 1.5, 'F');
    setFont(doc, 8, 'bold', COLOR.warning);
    doc.text('Extraction warning', MARGIN.left + 3, L.y + 0.5);
    setFont(doc, 7.5, 'normal', COLOR.body);
    doc.text(
      (doc.splitTextToSize(candidate.extraction.warning, CONTENT_WIDTH - 6) as string[])[0],
      MARGIN.left + 3,
      L.y + 4.2,
    );
    L.gap(11);
  }

  /* -------------------------------------------------------------- skills */

  sectionHeading(L, 'Skill analysis');
  setFont(doc, 8.5, 'bold', COLOR.ink);
  L.need(5);
  doc.text('Matched', MARGIN.left, L.y);
  L.gap(4.5);
  chips(L, analysis.skills.matched.map((s) => `${s.label}${s.mentions > 1 ? ` (${s.mentions})` : ''}`), 'yes');
  L.gap(2);

  setFont(doc, 8.5, 'bold', COLOR.ink);
  L.need(5);
  doc.text('Missing', MARGIN.left, L.y);
  L.gap(4.5);
  chips(L, analysis.skills.missing.map((s) => `${s.label}${s.weight >= 3 ? ' [must-have]' : ''}`), 'no');
  L.gap(2);

  if (analysis.skills.additional.length) {
    setFont(doc, 8.5, 'bold', COLOR.ink);
    L.need(5);
    doc.text('Additional skills not required by the role', MARGIN.left, L.y);
    L.gap(4.5);
    chips(L, analysis.skills.additional.slice(0, 30).map((s) => s.label), 'plain');
  }
  L.gap(4);

  /* ------------------------------------------------------ ATS breakdown */

  sectionHeading(L, 'ATS breakdown');
  for (const b of analysis.breakdown) {
    meter(L, `${b.key}  (weight ${b.weight})`, b.score, b.detail);
  }
  L.gap(2);

  /* --------------------------------------------------- AI recommendation */

  if (recommendation) {
    sectionHeading(L, 'AI recommendation');
    setFont(doc, 9, 'bold', COLOR.primary);
    L.need(6);
    doc.text(
      `${recommendation.verdict.replace(/_/g, ' ')} · model confidence ${Math.round(recommendation.confidence * 100)}%`,
      MARGIN.left,
      L.y,
    );
    L.gap(6);
    paragraph(L, recommendation.summary);
    L.gap(3);

    if (recommendation.strengths.length) {
      setFont(doc, 8.5, 'bold', COLOR.ink);
      L.need(5);
      doc.text('Strengths', MARGIN.left, L.y);
      L.gap(4.5);
      for (const item of recommendation.strengths) paragraph(L, `+  ${item}`, 9, COLOR.body);
      L.gap(2);
    }
    if (recommendation.concerns.length) {
      setFont(doc, 8.5, 'bold', COLOR.ink);
      L.need(5);
      doc.text('Concerns', MARGIN.left, L.y);
      L.gap(4.5);
      for (const item of recommendation.concerns) paragraph(L, `-  ${item}`, 9, COLOR.body);
      L.gap(2);
    }
    if (recommendation.interviewQuestions?.length) {
      setFont(doc, 8.5, 'bold', COLOR.ink);
      L.need(5);
      doc.text('Suggested interview questions', MARGIN.left, L.y);
      L.gap(4.5);
      recommendation.interviewQuestions.forEach((q, i) => paragraph(L, `${i + 1}.  ${q}`, 9));
      L.gap(2);
    }
  }

  /* --------------------------------------------------------- insights */

  if (analysis.insights.length) {
    sectionHeading(L, 'Insights');
    for (const insight of analysis.insights) {
      const color =
        insight.type === 'strength' ? COLOR.success
        : insight.type === 'gap' ? COLOR.error
        : COLOR.warning;
      L.need(6);
      setFont(doc, 8.5, 'bold', color);
      doc.text(`[${insight.type}] ${insight.title}`, MARGIN.left, L.y);
      L.gap(4.5);
      paragraph(L, insight.body, 9);
      L.gap(2);
    }
  }

  /* ------------------------------------------------------ experience */

  if (parsed.roles?.length) {
    sectionHeading(L, 'Experience');
    for (const r of parsed.roles) {
      L.need(9);
      setFont(doc, 9, 'bold', COLOR.ink);
      doc.text(r.title, MARGIN.left, L.y);
      setFont(doc, 8.5, 'normal', COLOR.muted);
      doc.text(`${r.start ?? '?'} — ${r.end ?? '?'}`, PAGE.width - MARGIN.right, L.y, { align: 'right' });
      L.gap(4.2);
      if (r.company) {
        setFont(doc, 8.5, 'normal', COLOR.body);
        doc.text(r.company, MARGIN.left, L.y);
        L.gap(4.8);
      }
    }
    L.gap(2);
  }

  /* ---------------------------------------------------------- provenance */

  sectionHeading(L, 'How to read these scores');
  paragraph(
    L,
    'Similarity is objective: the distance between this resume and the job description, measured as language overlap. Confidence is subjective: how much to trust that match given how the evidence appeared — skills shown in context score higher than skills merely listed. ATS score is neither; it measures how well the document itself would survive a conventional keyword-and-format screen, independent of whether this person fits the role. High similarity with low confidence is the signature of a keyword-stuffed resume.',
    8.5,
    COLOR.muted,
  );

  return doc;
}

export async function downloadCandidateReport(candidate: Candidate, role: Role | null): Promise<string> {
  const doc = await buildCandidateReport(candidate, role);
  const safeName = candidate.parsed.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'candidate';
  const filename = `${safeName}-screening-report.pdf`;
  doc.save(filename);
  return filename;
}
