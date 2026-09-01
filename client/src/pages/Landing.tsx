import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Public marketing page.
 *
 * Structure follows the supplied reference: a photographic hero with a
 * two-tone headline, a stat band that overlaps the hero's lower edge, a
 * four-up capability grid with pastel icon tiles, and a split proof section
 * with a floating credential card. Content is this product's own.
 */

const STATS = [
  { icon: 'group', value: '60', suffix: '', label: 'Resumes per batch' },
  { icon: 'bolt', value: '3', suffix: 's', label: 'Typical batch scan' },
  { icon: 'checklist', value: '200', suffix: '+', label: 'Skills recognised' },
  { icon: 'workspace_premium', value: '20', suffix: '+', label: 'Professions covered' },
];

const CAPABILITIES = [
  {
    icon: 'document_scanner',
    tint: 'bg-primary/12 text-primary',
    title: 'Any Resume, Any Field',
    body: 'PDFs, DOCX, phone photos and scans — screened against healthcare, finance, legal, trades and tech alike.',
  },
  {
    icon: 'balance',
    tint: 'bg-secondary/12 text-secondary',
    title: 'Two Distinct Scores',
    body: 'Objective similarity beside subjective confidence, so a keyword-stuffed resume cannot hide.',
  },
  {
    icon: 'grid_view',
    tint: 'bg-tertiary/12 text-tertiary',
    title: 'Pool Comparison',
    body: 'A skill matrix across every candidate at once, plus the gaps your whole shortlist shares.',
  },
  {
    icon: 'tune',
    tint: 'bg-accent/12 text-accent',
    title: 'Deep Filtering',
    body: 'Filter on score thresholds, must-have skills, seniority band, education and extraction health.',
  },
];

const PROOF = [
  'Every score is explainable, never a black box',
  'Skill matches carry the sentence they came from',
  'Runs fully offline — AI layer is optional',
];

/** Reveals children once they scroll into view. */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-smooth ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      {children}
    </div>
  );
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 900);
        // Ease-out so the number settles rather than stopping dead.
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return <span ref={ref} className="tabular-nums">{n}{suffix}</span>;
}

function TopNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ease-smooth ${
        scrolled
          ? 'bg-surface/90 backdrop-blur-xl border-b border-outline-variant py-sm shadow-soft'
          : 'bg-transparent py-md'
      }`}
    >
      <nav className="max-w-container-max mx-auto px-lg flex items-center justify-between gap-md">
        <Link to="/" className="flex items-center gap-sm">
          <div className="w-9 h-9 rounded-xl gradient-surface grid place-items-center shadow-soft">
            <span className="material-symbols-outlined filled text-white" style={{ fontSize: 20 }}>
              readiness_score
            </span>
          </div>
          <span className="font-heading text-headline-md tracking-tight text-on-surface">ResumeAI</span>
        </Link>

        <ul className="hidden lg:flex items-center gap-xl">
          {['Capabilities', 'How it works', 'Scoring'].map((item) => (
            <li key={item}>
              <a
                href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                className="font-body text-body-md font-medium text-on-surface-variant hover:text-primary transition-colors"
              >
                {item}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-sm">
          <Link to="/signin" className="btn-quiet hidden sm:inline-flex text-body-md">Sign in</Link>
          <Link to="/signin?mode=register" className="btn-primary text-body-md px-md py-sm">
            Get Started
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}

export default function Landing() {
  return (
    <div className="bg-background min-h-screen">
      <TopNav />

      {/* ------------------------------------------------------------ hero */}
      <section className="relative min-h-[92vh] flex items-center pt-2xl overflow-hidden">
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          {/*
            The source is 1000x1499 — portrait 2:3 — against a landscape hero.
            Rather than stretch it full-bleed (a ~1.4x upscale at desktop, which
            is what softens an image), it is anchored right at full hero height
            and capped at its native 1000px width. Cover scale therefore tops
            out at exactly 1.00x: the browser only ever shrinks the frame.

            object-position sits slightly left of centre so the crop keeps the
            laptops and hands — the subject — rather than the empty table edge.
          */}
          <div className="absolute inset-y-0 right-0 w-full sm:w-[70%] lg:w-[62%] xl:w-[58%] max-w-[1000px]">
            <img
              src="/img/hero-team.jpg"
              alt=""
              className="w-full h-full object-cover object-[42%_center] select-none"
              // Slight lift so the warm wood keeps its depth against the
              // near-white page rather than flattening into it.
              style={{ filter: 'contrast(1.06) saturate(1.08) brightness(1.02)' }}
              draggable={false}
              fetchPriority="high"
              decoding="async"
            />
          </div>

          {/*
            Horizontal dissolve. Opaque under the copy, then falling away so the
            photograph emerges rather than beginning at a hard vertical seam.
            Stops are tuned to the panel: effectively clear by ~62%.
          */}
          <div
            className="absolute inset-0"
            style={{
              background:
                // Fully opaque past the panel's left edge (42%), so the seam
                // itself is covered, then dissolving across the photograph
                // rather than at the boundary where the step would be visible.
                'linear-gradient(94deg, rgb(var(--background)) 0%, rgb(var(--background)) 44%, rgb(var(--background) / 0.88) 52%, rgb(var(--background) / 0.52) 58%, rgb(var(--background) / 0.22) 64%, rgb(var(--background) / 0.06) 70%, transparent 78%)',
            }}
          />

          {/* Narrow top fade so the transparent nav stays legible over the photo. */}
          <div
            className="absolute inset-x-0 top-0 h-36"
            style={{
              // Deeper and taller than it looks like it needs to be: the nav
              // sits directly on the photograph at scroll-top, and "Sign in" is
              // a quiet link with no background of its own to fall back on.
              background:
                'linear-gradient(to bottom, rgb(var(--background) / 0.94) 0%, rgb(var(--background) / 0.78) 35%, rgb(var(--background) / 0.34) 70%, transparent 100%)',
            }}
          />

          {/* Bottom fade so the stat band lands on calm ground. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgb(var(--background)) 0%, rgb(var(--background) / 0.48) 12%, rgb(var(--background) / 0.08) 28%, transparent 44%)',
            }}
          />

          {/* Faint brand tint so the photograph belongs to the palette. */}
          <div
            className="absolute inset-y-0 right-0 w-[58%] mix-blend-soft-light"
            style={{
              background:
                'linear-gradient(115deg, transparent 0%, rgb(var(--grad-a) / 0.32) 55%, rgb(var(--grad-c) / 0.30) 100%)',
            }}
          />
        </div>

        <div className="relative max-w-container-max mx-auto px-lg w-full">
          <div className="max-w-2xl animate-slide-up">
            <span className="chip bg-primary/12 border-primary/30 text-primary font-semibold">
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>auto_awesome</span>
              Resume intelligence for hiring teams
            </span>

            <h1 className="font-display text-display-xl lg:text-display-2xl mt-md text-on-surface">
              Screening That Explains
              <br />
              <span className="gradient-text">Every Single Score</span>
            </h1>

            <p className="font-body text-body-lg lg:text-[20px] lg:leading-[32px] text-on-surface-variant mt-md max-w-xl">
              Upload a batch of resumes for any role — nurse, analyst, electrician, engineer —
              and see exactly which skills matched, which are missing, and how much to
              trust each result.
            </p>

            <div className="flex flex-wrap items-center gap-sm mt-lg">
              <Link to="/signin?mode=register" className="btn-primary px-lg py-md text-body-md">
                Start Screening
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              </Link>
              <a href="#capabilities" className="btn-ghost px-lg py-md text-body-md">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_circle</span>
                See what it does
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- stat band */}
      <div className="relative z-10 max-w-container-max mx-auto px-lg -mt-2xl">
        <Reveal>
          <div className="panel shadow-lift grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-outline-variant overflow-hidden">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-center gap-md p-lg">
                <div className="w-11 h-11 rounded-xl bg-primary/10 grid place-items-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 21 }}>
                    {s.icon}
                  </span>
                </div>
                <div>
                  <p className="font-heading text-headline-md text-on-surface leading-none">
                    <CountUp to={Number(s.value)} suffix={s.suffix} />
                  </p>
                  <p className="font-body text-body-sm text-on-surface-variant mt-xs">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ----------------------------------------------------- capabilities */}
      <section id="capabilities" className="max-w-container-max mx-auto px-lg py-3xl">
        <Reveal>
          <div className="grid lg:grid-cols-2 gap-lg items-end mb-xl">
            <div>
              <p className="label-eyebrow text-primary mb-sm">What it does</p>
              <h2 className="font-heading text-headline-lg lg:text-display-lg text-on-surface">
                Screening that survives
                <br />
                <span className="gradient-text">a second look</span>
              </h2>
            </div>
            <div>
              <p className="font-body text-body-md text-on-surface-variant">
                Every number on the dashboard can be traced back to a line in the resume.
                No opaque ranking, no scores you cannot defend in a hiring review.
              </p>
              <Link
                to="/signin?mode=register"
                className="inline-flex items-center gap-xs mt-md font-body text-body-sm font-semibold
                           text-primary hover:gap-sm transition-all duration-200"
              >
                Explore the workspace
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_forward</span>
              </Link>
            </div>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-md">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delay={i * 90}>
              <article className="panel p-lg h-full hover-lift group">
                <div
                  className={`w-12 h-12 rounded-xl grid place-items-center ${c.tint}
                              transition-transform duration-300 group-hover:scale-110`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 23 }}>{c.icon}</span>
                </div>
                <h3 className="font-heading text-title mt-md text-on-surface">{c.title}</h3>
                <p className="font-body text-body-sm text-on-surface-variant mt-xs leading-relaxed">
                  {c.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- proof */}
      <section id="how-it-works" className="bg-surface-container-low border-y border-outline-variant">
        <div className="max-w-container-max mx-auto px-lg py-3xl grid lg:grid-cols-2 gap-2xl items-center">
          <Reveal>
            <p className="label-eyebrow text-primary mb-sm">Why it holds up</p>
            <h2 className="font-heading text-headline-lg lg:text-display-lg text-on-surface">
              Built for the
              <br />
              <span className="gradient-text">hiring review</span>
            </h2>
            <p className="font-body text-body-md text-on-surface-variant mt-md">
              A recruiter should never have to say &ldquo;the system ranked them
              lower&rdquo; without being able to say why. Every score here decomposes into
              parts you can read.
            </p>

            <ul className="mt-lg space-y-sm">
              {PROOF.map((p) => (
                <li key={p} className="flex items-start gap-sm">
                  <span className="material-symbols-outlined text-primary flex-shrink-0 mt-px" style={{ fontSize: 19 }}>
                    check_circle
                  </span>
                  <span className="font-body text-body-md text-on-surface">{p}</span>
                </li>
              ))}
            </ul>

            <Link to="/signin?mode=register" className="btn-primary mt-lg px-lg py-md">
              Create your workspace
            </Link>
          </Reveal>

          <Reveal delay={140}>
            <div className="relative">
              <img
                src="/img/resume-desk.jpg"
                alt="A printed resume laid out on a desk in morning light"
                className="w-full h-[460px] object-cover object-[center_38%] rounded-3xl shadow-lift"
              />
              {/* Floating credential card, as in the reference layout. */}
              <div className="absolute -bottom-8 -left-4 sm:left-lg panel shadow-lift p-md max-w-[230px] animate-float">
                <p className="font-heading text-headline-md gradient-text">3 scores</p>
                <p className="font-body text-body-sm font-semibold text-on-surface mt-xs">
                  Never collapsed into one
                </p>
                <p className="font-body text-body-sm text-on-surface-variant mt-xs">
                  Similarity, confidence and ATS hygiene stay separate — the disagreement is the signal.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------- scoring */}
      <section id="scoring" className="max-w-container-max mx-auto px-lg py-3xl">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto mb-xl">
            <p className="label-eyebrow text-primary mb-sm">The three scores</p>
            <h2 className="font-heading text-headline-lg lg:text-display-lg text-on-surface">
              Three numbers,
              <span className="gradient-text"> three meanings</span>
            </h2>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-md">
          {[
            { t: 'Similarity', k: 'Objective', d: 'Cosine distance between the resume and the job description. Pure geometry — language overlap and nothing else.', c: 'text-primary' },
            { t: 'Confidence', k: 'Subjective', d: 'How much to trust the match: were skills shown in context or only listed, does seniority fit, did the file parse cleanly.', c: 'text-tertiary' },
            { t: 'ATS score', k: 'Hygiene', d: 'How well the document survives a conventional keyword-and-format pass. Independent of whether the candidate fits.', c: 'text-secondary' },
          ].map((s, i) => (
            <Reveal key={s.t} delay={i * 90}>
              <article className="panel p-lg h-full hover-lift">
                <span className="label-eyebrow">{s.k}</span>
                <h3 className={`font-heading text-headline-md mt-xs ${s.c}`}>{s.t}</h3>
                <p className="font-body text-body-sm text-on-surface-variant mt-sm leading-relaxed">
                  {s.d}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <div className="panel gradient-border mt-xl p-xl text-center">
            <h3 className="font-heading text-headline-md text-on-surface">
              Ready to screen your first batch?
            </h3>
            <p className="font-body text-body-md text-on-surface-variant mt-xs max-w-xl mx-auto">
              Create an account and upload a folder of resumes. No API key required —
              the analysis engine runs locally out of the box.
            </p>
            <Link to="/signin?mode=register" className="btn-primary mt-lg px-lg py-md text-body-md">
              Get Started
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-outline-variant">
        <div className="max-w-container-max mx-auto px-lg py-lg flex items-center justify-between gap-md flex-wrap">
          <div className="flex items-center gap-sm">
            <div className="w-8 h-8 rounded-lg gradient-surface grid place-items-center">
              <span className="material-symbols-outlined filled text-white" style={{ fontSize: 18 }}>
                readiness_score
              </span>
            </div>
            <span className="font-heading text-title text-on-surface">ResumeAI</span>
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            Resumes stay on your machine unless you enable the Gemini engine.
          </p>
        </div>
      </footer>
    </div>
  );
}
