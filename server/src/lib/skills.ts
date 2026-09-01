/**
 * Skill taxonomy + normalisation.
 *
 * Every canonical skill carries a set of aliases so that "JS", "Javascript" and
 * "ECMAScript" all collapse onto the same node. Categories drive the grouped
 * views in the comparison matrix.
 */

import type { DetectedSkill, RequiredSkill, Skill } from '../../../shared/types.js';

interface TaxonomyEntry {
  id: string;
  label: string;
  category: string;
  aliases: string[];
}

const TAXONOMY: TaxonomyEntry[] = [
  // ---- Languages -------------------------------------------------------
  { id: 'javascript', label: 'JavaScript', category: 'Languages', aliases: ['js', 'ecmascript', 'es6', 'es2015', 'vanilla js'] },
  { id: 'typescript', label: 'TypeScript', category: 'Languages', aliases: ['ts'] },
  { id: 'python', label: 'Python', category: 'Languages', aliases: ['py', 'python3'] },
  { id: 'java', label: 'Java', category: 'Languages', aliases: ['java8', 'java 11', 'java 17'] },
  { id: 'csharp', label: 'C#', category: 'Languages', aliases: ['c sharp', 'dotnet', '.net', 'asp.net'] },
  { id: 'cpp', label: 'C++', category: 'Languages', aliases: ['cplusplus', 'c plus plus'] },
  { id: 'go', label: 'Go', category: 'Languages', aliases: ['golang'] },
  { id: 'rust', label: 'Rust', category: 'Languages', aliases: [] },
  { id: 'ruby', label: 'Ruby', category: 'Languages', aliases: ['ruby on rails', 'rails'] },
  { id: 'php', label: 'PHP', category: 'Languages', aliases: ['laravel'] },
  { id: 'swift', label: 'Swift', category: 'Languages', aliases: ['swiftui'] },
  { id: 'kotlin', label: 'Kotlin', category: 'Languages', aliases: ['jetpack compose'] },
  { id: 'scala', label: 'Scala', category: 'Languages', aliases: [] },
  { id: 'r', label: 'R', category: 'Languages', aliases: ['rlang'] },
  { id: 'sql', label: 'SQL', category: 'Languages', aliases: ['ansi sql', 't-sql', 'plsql', 'pl/sql'] },

  // ---- Frontend --------------------------------------------------------
  { id: 'react', label: 'React', category: 'Frontend', aliases: ['reactjs', 'react.js', 'react 18'] },
  { id: 'nextjs', label: 'Next.js', category: 'Frontend', aliases: ['next', 'nextjs', 'next js'] },
  { id: 'vue', label: 'Vue', category: 'Frontend', aliases: ['vuejs', 'vue.js', 'vue 3', 'nuxt', 'nuxtjs'] },
  { id: 'angular', label: 'Angular', category: 'Frontend', aliases: ['angularjs', 'angular 2'] },
  { id: 'svelte', label: 'Svelte', category: 'Frontend', aliases: ['sveltekit'] },
  { id: 'tailwind', label: 'Tailwind CSS', category: 'Frontend', aliases: ['tailwindcss', 'tailwind'] },
  { id: 'html', label: 'HTML', category: 'Frontend', aliases: ['html5'] },
  { id: 'css', label: 'CSS', category: 'Frontend', aliases: ['css3', 'sass', 'scss', 'less'] },
  { id: 'redux', label: 'Redux', category: 'Frontend', aliases: ['redux toolkit', 'rtk'] },
  { id: 'webpack', label: 'Webpack', category: 'Frontend', aliases: ['vite', 'rollup', 'esbuild', 'parcel'] },

  // ---- Backend ---------------------------------------------------------
  { id: 'nodejs', label: 'Node.js', category: 'Backend', aliases: ['node', 'nodejs', 'node js'] },
  { id: 'express', label: 'Express', category: 'Backend', aliases: ['expressjs', 'express.js'] },
  { id: 'django', label: 'Django', category: 'Backend', aliases: ['drf', 'django rest framework'] },
  { id: 'flask', label: 'Flask', category: 'Backend', aliases: [] },
  { id: 'fastapi', label: 'FastAPI', category: 'Backend', aliases: ['fast api'] },
  { id: 'spring', label: 'Spring Boot', category: 'Backend', aliases: ['spring', 'springboot'] },
  { id: 'graphql', label: 'GraphQL', category: 'Backend', aliases: ['apollo', 'apollo server'] },
  { id: 'rest', label: 'REST APIs', category: 'Backend', aliases: ['rest', 'restful', 'rest api', 'restful api'] },
  { id: 'grpc', label: 'gRPC', category: 'Backend', aliases: ['protobuf', 'protocol buffers'] },
  { id: 'microservices', label: 'Microservices', category: 'Backend', aliases: ['micro services', 'service oriented'] },

  // ---- Data ------------------------------------------------------------
  { id: 'postgres', label: 'PostgreSQL', category: 'Data', aliases: ['postgresql', 'postgre', 'psql', 'pgvector'] },
  { id: 'mysql', label: 'MySQL', category: 'Data', aliases: ['mariadb'] },
  { id: 'mongodb', label: 'MongoDB', category: 'Data', aliases: ['mongo', 'mongoose'] },
  { id: 'redis', label: 'Redis', category: 'Data', aliases: ['redis cache'] },
  { id: 'elasticsearch', label: 'Elasticsearch', category: 'Data', aliases: ['elastic', 'opensearch', 'elk'] },
  { id: 'kafka', label: 'Kafka', category: 'Data', aliases: ['apache kafka'] },
  { id: 'spark', label: 'Spark', category: 'Data', aliases: ['apache spark', 'pyspark'] },
  { id: 'airflow', label: 'Airflow', category: 'Data', aliases: ['apache airflow', 'dags'] },
  { id: 'snowflake', label: 'Snowflake', category: 'Data', aliases: ['bigquery', 'redshift', 'data warehouse'] },
  { id: 'etl', label: 'ETL', category: 'Data', aliases: ['elt', 'data pipeline', 'data pipelines'] },

  // ---- Cloud / DevOps --------------------------------------------------
  { id: 'aws', label: 'AWS', category: 'Cloud & DevOps', aliases: ['amazon web services', 'ec2', 's3', 'lambda'] },
  { id: 'gcp', label: 'GCP', category: 'Cloud & DevOps', aliases: ['google cloud', 'google cloud platform', 'cloud run'] },
  { id: 'azure', label: 'Azure', category: 'Cloud & DevOps', aliases: ['microsoft azure'] },
  { id: 'docker', label: 'Docker', category: 'Cloud & DevOps', aliases: ['containers', 'containerisation', 'containerization'] },
  { id: 'kubernetes', label: 'Kubernetes', category: 'Cloud & DevOps', aliases: ['k8s', 'eks', 'gke', 'helm'] },
  { id: 'terraform', label: 'Terraform', category: 'Cloud & DevOps', aliases: ['iac', 'infrastructure as code', 'pulumi'] },
  { id: 'cicd', label: 'CI/CD', category: 'Cloud & DevOps', aliases: ['ci cd', 'continuous integration', 'github actions', 'jenkins', 'gitlab ci', 'circleci'] },
  { id: 'linux', label: 'Linux', category: 'Cloud & DevOps', aliases: ['unix', 'bash', 'shell scripting'] },
  { id: 'monitoring', label: 'Observability', category: 'Cloud & DevOps', aliases: ['prometheus', 'grafana', 'datadog', 'monitoring', 'opentelemetry'] },

  // ---- AI / ML ---------------------------------------------------------
  { id: 'ml', label: 'Machine Learning', category: 'AI & ML', aliases: ['machine learning', 'ml', 'supervised learning'] },
  { id: 'deeplearning', label: 'Deep Learning', category: 'AI & ML', aliases: ['deep learning', 'neural networks', 'cnn', 'rnn'] },
  { id: 'pytorch', label: 'PyTorch', category: 'AI & ML', aliases: ['torch'] },
  { id: 'tensorflow', label: 'TensorFlow', category: 'AI & ML', aliases: ['tf', 'keras'] },
  { id: 'nlp', label: 'NLP', category: 'AI & ML', aliases: ['natural language processing', 'text mining'] },
  { id: 'llm', label: 'LLMs', category: 'AI & ML', aliases: ['large language model', 'large language models', 'gpt', 'gemini', 'transformer', 'transformers', 'prompt engineering'] },
  { id: 'rag', label: 'RAG', category: 'AI & ML', aliases: ['retrieval augmented generation', 'vector search', 'vector database', 'embeddings'] },
  { id: 'pandas', label: 'Pandas', category: 'AI & ML', aliases: ['numpy', 'scipy'] },
  { id: 'sklearn', label: 'scikit-learn', category: 'AI & ML', aliases: ['sklearn', 'scikit learn'] },
  { id: 'cv', label: 'Computer Vision', category: 'AI & ML', aliases: ['computer vision', 'opencv', 'image recognition'] },

  // ---- Mobile ----------------------------------------------------------
  { id: 'reactnative', label: 'React Native', category: 'Mobile', aliases: ['react-native'] },
  { id: 'flutter', label: 'Flutter', category: 'Mobile', aliases: ['dart'] },
  { id: 'ios', label: 'iOS', category: 'Mobile', aliases: ['xcode', 'uikit'] },
  { id: 'android', label: 'Android', category: 'Mobile', aliases: ['android studio'] },

  // ---- Practices -------------------------------------------------------
  { id: 'git', label: 'Git', category: 'Practices', aliases: ['github', 'gitlab', 'bitbucket', 'version control'] },
  { id: 'agile', label: 'Agile', category: 'Practices', aliases: ['scrum', 'kanban', 'sprint planning'] },
  { id: 'testing', label: 'Testing', category: 'Practices', aliases: ['unit testing', 'jest', 'pytest', 'cypress', 'playwright', 'tdd', 'integration testing'] },
  { id: 'systemdesign', label: 'System Design', category: 'Practices', aliases: ['system design', 'distributed systems', 'architecture', 'scalability'] },
  { id: 'security', label: 'Security', category: 'Practices', aliases: ['oauth', 'jwt', 'authentication', 'authorization', 'appsec'] },
  { id: 'accessibility', label: 'Accessibility', category: 'Practices', aliases: ['a11y', 'wcag', 'aria'] },

  // ---- Soft skills -----------------------------------------------------
  { id: 'leadership', label: 'Leadership', category: 'Soft Skills', aliases: ['team lead', 'tech lead', 'mentoring', 'mentorship', 'managed a team'] },
  { id: 'communication', label: 'Communication', category: 'Soft Skills', aliases: ['stakeholder management', 'presentation', 'written communication'] },
  { id: 'collaboration', label: 'Collaboration', category: 'Soft Skills', aliases: ['cross-functional', 'cross functional', 'teamwork'] },
  { id: 'problemsolving', label: 'Problem Solving', category: 'Soft Skills', aliases: ['analytical', 'critical thinking', 'troubleshooting'] },
];

/** Lookup table: every alias + canonical label -> taxonomy entry. */
const LOOKUP = new Map<string, TaxonomyEntry>();
for (const skill of TAXONOMY) {
  LOOKUP.set(skill.label.toLowerCase(), skill);
  LOOKUP.set(skill.id, skill);
  for (const alias of skill.aliases) LOOKUP.set(alias.toLowerCase(), skill);
}

/** Longest-first list of searchable phrases, so "react native" wins over "react". */
const PHRASES = [...LOOKUP.keys()].sort((a, b) => b.length - a.length);

export const CATEGORIES: string[] = [...new Set(TAXONOMY.map((s) => s.category))];
export const ALL_SKILLS: Skill[] = TAXONOMY.map(({ id, label, category }) => ({ id, label, category }));

/** Resolve any free-text token to a canonical skill, or null. */
export function canonical(term: string | null | undefined): TaxonomyEntry | null {
  if (!term) return null;
  const key = String(term).toLowerCase().trim().replace(/[.,;:]+$/, '');
  return LOOKUP.get(key) || null;
}

/** Escape a phrase for safe use inside a RegExp. */
function escapeRe(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan raw text and return the canonical skills found, each with the number of
 * mentions and the surrounding snippet of the first hit (used for evidence).
 */
export function extractSkills(text: string): DetectedSkill[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const found = new Map<string, DetectedSkill & { index: number }>();

  for (const phrase of PHRASES) {
    // Word-boundary match that tolerates the punctuation common in skill lists.
    const re = new RegExp(`(^|[^a-z0-9+#.])${escapeRe(phrase)}([^a-z0-9+#]|$)`, 'g');
    let match: RegExpExecArray | null;
    let count = 0;
    let firstIndex = -1;
    while ((match = re.exec(haystack)) !== null) {
      count += 1;
      if (firstIndex === -1) firstIndex = match.index;
      if (count > 50) break;
    }
    if (!count) continue;

    const skill = LOOKUP.get(phrase)!;
    const existing = found.get(skill.id);
    if (existing) {
      existing.mentions += count;
      if (firstIndex !== -1 && firstIndex < existing.index) existing.index = firstIndex;
    } else {
      found.set(skill.id, {
        id: skill.id,
        label: skill.label,
        category: skill.category,
        mentions: count,
        index: firstIndex,
        evidence: '',
      });
    }
  }

  return [...found.values()]
    .map((s) => ({
      ...s,
      evidence: snippetAt(text, s.index),
    }))
    .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label));
}

function snippetAt(text: string, index: number): string {
  if (index == null || index < 0) return '';
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + 90);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

/**
 * Parse a comma / newline separated requirement list into canonical skills.
 * Unknown terms are preserved as free-text requirements so a recruiter can
 * still require something the taxonomy has never seen.
 */
export function parseRequiredSkills(input: string | string[] | null | undefined): RequiredSkill[] {
  if (!input) return [];
  const parts = Array.isArray(input) ? input : String(input).split(/[,\n;|]+/);
  const out: RequiredSkill[] = [];
  const seen = new Set<string>();

  for (const raw of parts) {
    const term = String(raw).trim();
    if (!term) continue;
    const hit = canonical(term);
    const id = hit ? hit.id : `custom:${term.toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(
      hit
        ? { id: hit.id, label: hit.label, category: hit.category, custom: false }
        : { id, label: term, category: 'Other', custom: true },
    );
  }
  return out;
}
