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
  { id: 'microservices', label: 'Microservices', category: 'Backend', aliases: ['micro services', 'service oriented architecture', 'soa'] },

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


  /* ==================================================================
   * Beyond software. The engine is domain-agnostic — it matches
   * required skills against detected ones — so the taxonomy is the only
   * thing that made it a developer-only tool. These sections let a
   * clinic, a law firm or a hotel screen with the same machinery.
   * ================================================================== */

  // ---- Healthcare & Medical -------------------------------------------
  { id: 'patient-care', label: 'Patient Care', category: 'Healthcare', aliases: ['patient management', 'direct patient care', 'bedside care'] },
  { id: 'clinical-assessment', label: 'Clinical Assessment', category: 'Healthcare', aliases: ['patient assessment', 'clinical evaluation', 'triage'] },
  { id: 'ehr', label: 'EHR / EMR', category: 'Healthcare', aliases: ['epic', 'epic ehr', 'epic emr', 'cerner', 'cerner ehr', 'meditech', 'allscripts', 'electronic health record', 'electronic medical record', 'ehr', 'emr'] },
  { id: 'medication-admin', label: 'Medication Administration', category: 'Healthcare', aliases: ['med administration', 'drug administration', 'iv therapy'] },
  { id: 'phlebotomy', label: 'Phlebotomy', category: 'Healthcare', aliases: ['venipuncture', 'blood draw'] },
  { id: 'acls', label: 'ACLS', category: 'Healthcare', aliases: ['advanced cardiac life support'] },
  { id: 'bls-cpr', label: 'BLS / CPR', category: 'Healthcare', aliases: ['bls', 'basic life support', 'cpr certified', 'cpr'] },
  { id: 'hipaa', label: 'HIPAA Compliance', category: 'Healthcare', aliases: ['hipaa', 'patient privacy', 'phi'] },
  { id: 'medical-coding', label: 'Medical Coding', category: 'Healthcare', aliases: ['icd-10', 'icd10', 'cpt coding', 'medical billing'] },
  { id: 'infection-control', label: 'Infection Control', category: 'Healthcare', aliases: ['sterilisation', 'sterilization', 'aseptic technique'] },
  { id: 'pharmacology', label: 'Pharmacology', category: 'Healthcare', aliases: ['drug interactions', 'dosage calculation'] },
  { id: 'radiology', label: 'Radiology', category: 'Healthcare', aliases: ['x-ray', 'imaging', 'ct scan', 'mri', 'ultrasound', 'sonography'] },
  { id: 'surgical-assist', label: 'Surgical Assistance', category: 'Healthcare', aliases: ['scrub nurse', 'operating room', 'perioperative'] },
  { id: 'care-planning', label: 'Care Planning', category: 'Healthcare', aliases: ['treatment planning', 'discharge planning', 'case management'] },
  { id: 'telehealth', label: 'Telehealth', category: 'Healthcare', aliases: ['telemedicine', 'remote consultation'] },
  { id: 'mental-health', label: 'Mental Health', category: 'Healthcare', aliases: ['behavioral health', 'behavioural health', 'counselling', 'counseling', 'psychotherapy', 'cbt'] },

  // ---- Finance & Accounting -------------------------------------------
  { id: 'financial-reporting', label: 'Financial Reporting', category: 'Finance', aliases: ['financial statements', 'month-end close', 'monthly close', 'year-end close'] },
  { id: 'gaap', label: 'GAAP', category: 'Finance', aliases: ['us gaap', 'generally accepted accounting principles'] },
  { id: 'ifrs', label: 'IFRS', category: 'Finance', aliases: ['international financial reporting standards'] },
  { id: 'bookkeeping', label: 'Bookkeeping', category: 'Finance', aliases: ['accounts payable', 'accounts receivable', 'ap/ar', 'general ledger', 'reconciliation'] },
  { id: 'financial-modeling', label: 'Financial Modelling', category: 'Finance', aliases: ['financial modeling', 'dcf', 'discounted cash flow', 'valuation', 'three statement model'] },
  { id: 'budgeting', label: 'Budgeting & Forecasting', category: 'Finance', aliases: ['budgeting', 'forecasting', 'fp&a', 'variance analysis'] },
  { id: 'audit', label: 'Auditing', category: 'Finance', aliases: ['internal audit', 'external audit', 'sox', 'sarbanes-oxley'] },
  { id: 'taxation', label: 'Taxation', category: 'Finance', aliases: ['tax preparation', 'tax compliance', 'corporate tax', 'vat', 'gst'] },
  { id: 'cpa', label: 'CPA', category: 'Finance', aliases: ['certified public accountant', 'aca', 'acca', 'cima'] },
  { id: 'cfa', label: 'CFA', category: 'Finance', aliases: ['chartered financial analyst'] },
  { id: 'quickbooks', label: 'QuickBooks', category: 'Finance', aliases: ['xero', 'sage', 'netsuite', 'freshbooks'] },
  { id: 'sap-erp', label: 'SAP / ERP', category: 'Finance', aliases: ['sap', 'erp', 'oracle financials', 'workday financials'] },
  { id: 'risk-management', label: 'Risk Management', category: 'Finance', aliases: ['credit risk', 'market risk', 'operational risk', 'risk assessment'] },
  { id: 'aml-kyc', label: 'AML / KYC', category: 'Finance', aliases: ['anti-money laundering', 'know your customer', 'compliance screening'] },
  { id: 'treasury', label: 'Treasury', category: 'Finance', aliases: ['cash management', 'liquidity management', 'working capital'] },
  { id: 'payroll', label: 'Payroll', category: 'Finance', aliases: ['payroll processing', 'adp', 'payroll administration'] },

  // ---- Legal ------------------------------------------------------------
  { id: 'contract-law', label: 'Contract Law', category: 'Legal', aliases: ['contract drafting', 'contract negotiation', 'contract review', 'commercial contracts'] },
  { id: 'litigation', label: 'Litigation', category: 'Legal', aliases: ['civil litigation', 'dispute resolution', 'trial preparation'] },
  { id: 'legal-research', label: 'Legal Research', category: 'Legal', aliases: ['westlaw', 'lexisnexis', 'case law research'] },
  { id: 'compliance', label: 'Regulatory Compliance', category: 'Legal', aliases: ['compliance', 'regulatory affairs', 'gdpr', 'ccpa', 'data protection'] },
  { id: 'ip-law', label: 'Intellectual Property', category: 'Legal', aliases: ['patent law', 'trademark', 'copyright', 'ip law'] },
  { id: 'corporate-law', label: 'Corporate Law', category: 'Legal', aliases: ['m&a', 'mergers and acquisitions', 'corporate governance', 'due diligence'] },
  { id: 'employment-law', label: 'Employment Law', category: 'Legal', aliases: ['labour law', 'labor law', 'employment tribunal'] },
  { id: 'paralegal', label: 'Paralegal Support', category: 'Legal', aliases: ['legal assistant', 'legal case management', 'e-discovery', 'ediscovery'] },

  // ---- Marketing & Communications --------------------------------------
  { id: 'seo', label: 'SEO', category: 'Marketing', aliases: ['search engine optimisation', 'search engine optimization', 'organic search'] },
  { id: 'sem', label: 'SEM / Paid Search', category: 'Marketing', aliases: ['sem', 'google ads', 'adwords', 'ppc', 'paid search', 'paid media'] },
  { id: 'content-marketing', label: 'Content Marketing', category: 'Marketing', aliases: ['content strategy', 'copywriting', 'blogging', 'editorial'] },
  { id: 'social-media', label: 'Social Media Marketing', category: 'Marketing', aliases: ['social media', 'community management', 'instagram marketing', 'linkedin marketing'] },
  { id: 'email-marketing', label: 'Email Marketing', category: 'Marketing', aliases: ['mailchimp', 'klaviyo', 'marketing automation', 'hubspot', 'marketo'] },
  { id: 'brand-management', label: 'Brand Management', category: 'Marketing', aliases: ['brand strategy', 'brand identity', 'positioning'] },
  { id: 'market-research', label: 'Market Research', category: 'Marketing', aliases: ['consumer research', 'competitive analysis', 'focus groups', 'survey design'] },
  { id: 'google-analytics', label: 'Google Analytics', category: 'Marketing', aliases: ['ga4', 'web analytics', 'adobe analytics', 'mixpanel'] },
  { id: 'public-relations', label: 'Public Relations', category: 'Marketing', aliases: ['pr', 'media relations', 'press releases', 'crisis communications'] },
  { id: 'campaign-management', label: 'Campaign Management', category: 'Marketing', aliases: ['campaign planning', 'go-to-market', 'gtm'] },
  { id: 'crm-marketing', label: 'CRM', category: 'Marketing', aliases: ['salesforce', 'hubspot crm', 'customer relationship management', 'dynamics 365'] },

  // ---- Sales & Business Development ------------------------------------
  { id: 'b2b-sales', label: 'B2B Sales', category: 'Sales', aliases: ['enterprise sales', 'business to business', 'solution selling'] },
  { id: 'lead-generation', label: 'Lead Generation', category: 'Sales', aliases: ['prospecting', 'cold calling', 'outbound', 'demand generation'] },
  { id: 'account-management', label: 'Account Management', category: 'Sales', aliases: ['key accounts', 'client relationship management', 'customer success'] },
  { id: 'negotiation', label: 'Negotiation', category: 'Sales', aliases: ['deal negotiation', 'closing deals', 'commercial negotiation'] },
  { id: 'pipeline-management', label: 'Pipeline Management', category: 'Sales', aliases: ['sales pipeline', 'sales forecasting', 'quota attainment'] },
  { id: 'retail-sales', label: 'Retail Sales', category: 'Sales', aliases: ['point of sale', 'pos', 'merchandising', 'upselling'] },

  // ---- Human Resources --------------------------------------------------
  { id: 'recruiting', label: 'Recruiting', category: 'Human Resources', aliases: ['talent acquisition', 'sourcing', 'full-cycle recruiting', 'headhunting'] },
  { id: 'onboarding', label: 'Onboarding', category: 'Human Resources', aliases: ['employee onboarding', 'induction', 'orientation'] },
  { id: 'employee-relations', label: 'Employee Relations', category: 'Human Resources', aliases: ['employee relations', 'grievance handling', 'disciplinary procedures'] },
  { id: 'performance-management', label: 'Performance Management', category: 'Human Resources', aliases: ['performance reviews', 'appraisals', 'okrs', 'goal setting'] },
  { id: 'compensation', label: 'Compensation & Benefits', category: 'Human Resources', aliases: ['comp and ben', 'benefits administration', 'total rewards', 'salary benchmarking'] },
  { id: 'hris', label: 'HRIS', category: 'Human Resources', aliases: ['workday', 'bamboohr', 'successfactors', 'peoplesoft'] },
  { id: 'ld', label: 'Learning & Development', category: 'Human Resources', aliases: ['l&d', 'training and development', 'employee training'] },
  { id: 'dei', label: 'Diversity & Inclusion', category: 'Human Resources', aliases: ['dei', 'd&i', 'diversity equity inclusion'] },

  // ---- Operations & Supply Chain ---------------------------------------
  { id: 'supply-chain', label: 'Supply Chain', category: 'Operations', aliases: ['supply chain management', 'scm', 'demand planning'] },
  { id: 'logistics', label: 'Logistics', category: 'Operations', aliases: ['freight', 'shipping', 'distribution', 'warehousing', 'fulfilment', 'fulfillment'] },
  { id: 'inventory', label: 'Inventory Management', category: 'Operations', aliases: ['stock control', 'inventory control', 'cycle counting'] },
  { id: 'procurement', label: 'Procurement', category: 'Operations', aliases: ['purchasing', 'strategic sourcing', 'vendor management', 'supplier management'] },
  { id: 'lean', label: 'Lean / Six Sigma', category: 'Operations', aliases: ['lean manufacturing', 'six sigma', 'kaizen', 'continuous improvement', '5s'] },
  { id: 'quality-assurance', label: 'Quality Assurance', category: 'Operations', aliases: ['quality control', 'qa/qc', 'iso 9001', 'quality management'] },
  { id: 'process-improvement', label: 'Process Improvement', category: 'Operations', aliases: ['process optimisation', 'process optimization', 'workflow design', 'bpm'] },
  { id: 'health-safety', label: 'Health & Safety', category: 'Operations', aliases: ['ehs', 'osha', 'workplace safety', 'safety risk assessment', 'hse'] },

  // ---- Project & Product Management ------------------------------------
  { id: 'project-management', label: 'Project Management', category: 'Project Management', aliases: ['project delivery', 'programme management', 'program management'] },
  { id: 'pmp', label: 'PMP', category: 'Project Management', aliases: ['project management professional', 'prince2', 'prince 2'] },
  { id: 'stakeholder-mgmt', label: 'Stakeholder Management', category: 'Project Management', aliases: ['stakeholder engagement', 'client management'] },
  { id: 'budget-management', label: 'Budget Management', category: 'Project Management', aliases: ['cost control', 'resource planning', 'p&l ownership'] },
  { id: 'product-management', label: 'Product Management', category: 'Project Management', aliases: ['product owner', 'roadmap', 'product strategy', 'backlog management'] },
  { id: 'jira', label: 'Jira / Asana', category: 'Project Management', aliases: ['jira', 'asana', 'trello', 'monday.com', 'confluence', 'smartsheet'] },

  // ---- Design & Creative ------------------------------------------------
  { id: 'graphic-design', label: 'Graphic Design', category: 'Design', aliases: ['visual design', 'layout design', 'print design'] },
  { id: 'ux-design', label: 'UX Design', category: 'Design', aliases: ['user experience', 'ux research', 'usability testing', 'wireframing'] },
  { id: 'ui-design', label: 'UI Design', category: 'Design', aliases: ['user interface design', 'interaction design', 'visual interface'] },
  { id: 'figma', label: 'Figma', category: 'Design', aliases: ['sketch', 'adobe xd', 'invision'] },
  { id: 'adobe-creative', label: 'Adobe Creative Suite', category: 'Design', aliases: ['photoshop', 'illustrator', 'indesign', 'after effects', 'premiere pro', 'creative cloud'] },
  { id: 'video-production', label: 'Video Production', category: 'Design', aliases: ['video editing', 'videography', 'motion graphics', 'final cut'] },
  { id: 'photography', label: 'Photography', category: 'Design', aliases: ['photo editing', 'studio photography', 'lightroom'] },
  { id: 'cad', label: 'CAD', category: 'Design', aliases: ['autocad', 'solidworks', 'revit', 'catia', 'fusion 360'] },

  // ---- Engineering (non-software) --------------------------------------
  { id: 'mechanical-eng', label: 'Mechanical Engineering', category: 'Engineering', aliases: ['mechanical design', 'thermodynamics', 'fluid mechanics'] },
  { id: 'electrical-eng', label: 'Electrical Engineering', category: 'Engineering', aliases: ['circuit design', 'power systems', 'plc', 'scada'] },
  { id: 'civil-eng', label: 'Civil Engineering', category: 'Engineering', aliases: ['structural engineering', 'geotechnical', 'surveying'] },
  { id: 'manufacturing', label: 'Manufacturing', category: 'Engineering', aliases: ['production engineering', 'cnc', 'machining', 'assembly line', 'gmp'] },
  { id: 'construction-mgmt', label: 'Construction Management', category: 'Engineering', aliases: ['site management', 'construction supervision', 'building regulations'] },
  { id: 'maintenance', label: 'Maintenance & Repair', category: 'Engineering', aliases: ['preventive maintenance', 'troubleshooting equipment', 'facilities maintenance'] },

  // ---- Education & Research --------------------------------------------
  { id: 'teaching', label: 'Teaching', category: 'Education', aliases: ['classroom instruction', 'lesson planning', 'pedagogy', 'lecturing'] },
  { id: 'curriculum', label: 'Curriculum Development', category: 'Education', aliases: ['curriculum design', 'instructional design', 'syllabus development'] },
  { id: 'assessment', label: 'Student Assessment', category: 'Education', aliases: ['grading', 'exam design', 'formative assessment'] },
  { id: 'classroom-mgmt', label: 'Classroom Management', category: 'Education', aliases: ['behaviour management', 'behavior management', 'student engagement'] },
  { id: 'academic-research', label: 'Academic Research', category: 'Education', aliases: ['research methodology', 'literature review', 'peer review', 'publications', 'grant writing'] },
  { id: 'lab-techniques', label: 'Laboratory Techniques', category: 'Education', aliases: ['lab work', 'pcr', 'chromatography', 'spectroscopy', 'microscopy', 'assay development'] },
  { id: 'statistics', label: 'Statistics', category: 'Education', aliases: ['statistical analysis', 'spss', 'stata', 'biostatistics', 'regression analysis'] },

  // ---- Hospitality, Service & Trades -----------------------------------
  { id: 'customer-service', label: 'Customer Service', category: 'Service & Trades', aliases: ['client service', 'customer support', 'help desk', 'front desk', 'guest relations'] },
  { id: 'food-service', label: 'Food Service', category: 'Service & Trades', aliases: ['culinary', 'food preparation', 'catering', 'barista', 'food safety', 'haccp'] },
  { id: 'hospitality-mgmt', label: 'Hospitality Management', category: 'Service & Trades', aliases: ['hotel management', 'front office', 'housekeeping management', 'opera pms'] },
  { id: 'event-management', label: 'Event Management', category: 'Service & Trades', aliases: ['event planning', 'conference management', 'venue coordination'] },
  { id: 'electrical-trade', label: 'Electrical (Trade)', category: 'Service & Trades', aliases: ['electrician', 'wiring', 'electrical installation'] },
  { id: 'plumbing', label: 'Plumbing', category: 'Service & Trades', aliases: ['pipefitting', 'plumber'] },
  { id: 'hvac', label: 'HVAC', category: 'Service & Trades', aliases: ['heating ventilation air conditioning', 'refrigeration'] },
  { id: 'welding', label: 'Welding', category: 'Service & Trades', aliases: ['mig welding', 'tig welding', 'fabrication'] },
  { id: 'driving', label: 'Commercial Driving', category: 'Service & Trades', aliases: ['cdl', 'hgv', 'forklift', 'delivery driving'] },

  // ---- Administration ---------------------------------------------------
  { id: 'office-admin', label: 'Office Administration', category: 'Administration', aliases: ['administrative support', 'executive assistant', 'office management', 'diary management'] },
  { id: 'data-entry', label: 'Data Entry', category: 'Administration', aliases: ['record keeping', 'database administration', 'filing'] },
  { id: 'ms-office', label: 'Microsoft Office', category: 'Administration', aliases: ['excel', 'powerpoint', 'word', 'outlook', 'ms office', 'google workspace', 'sheets'] },
  { id: 'scheduling', label: 'Scheduling', category: 'Administration', aliases: ['calendar management', 'appointment scheduling', 'rota planning', 'shift planning'] },
  { id: 'documentation', label: 'Documentation', category: 'Administration', aliases: ['technical writing', 'report writing', 'minute taking', 'sop writing'] },

  // ---- Spoken languages -------------------------------------------------
  { id: 'lang-english', label: 'English', category: 'Spoken Languages', aliases: ['fluent english', 'native english'] },
  { id: 'lang-spanish', label: 'Spanish', category: 'Spoken Languages', aliases: ['espanol', 'español', 'fluent spanish'] },
  { id: 'lang-french', label: 'French', category: 'Spoken Languages', aliases: ['francais', 'français', 'fluent french'] },
  { id: 'lang-german', label: 'German', category: 'Spoken Languages', aliases: ['deutsch', 'fluent german'] },
  { id: 'lang-mandarin', label: 'Mandarin', category: 'Spoken Languages', aliases: ['chinese', 'putonghua'] },
  { id: 'lang-arabic', label: 'Arabic', category: 'Spoken Languages', aliases: ['fluent arabic'] },
  { id: 'lang-hindi', label: 'Hindi', category: 'Spoken Languages', aliases: ['fluent hindi'] },
  { id: 'lang-portuguese', label: 'Portuguese', category: 'Spoken Languages', aliases: ['portugues', 'português'] },
  { id: 'lang-japanese', label: 'Japanese', category: 'Spoken Languages', aliases: ['nihongo'] },

  // ---- Cross-industry soft skills --------------------------------------
  { id: 'time-management', label: 'Time Management', category: 'Soft Skills', aliases: ['prioritisation', 'prioritization', 'multitasking', 'deadline management'] },
  { id: 'adaptability', label: 'Adaptability', category: 'Soft Skills', aliases: ['flexibility', 'resilience', 'change management'] },
  { id: 'attention-detail', label: 'Attention to Detail', category: 'Soft Skills', aliases: ['detail oriented', 'accuracy', 'meticulous'] },
  { id: 'customer-focus', label: 'Customer Focus', category: 'Soft Skills', aliases: ['client focused', 'customer centric', 'service oriented'] },
  { id: 'negotiating-soft', label: 'Conflict Resolution', category: 'Soft Skills', aliases: ['mediation', 'de-escalation'] },
  { id: 'creativity', label: 'Creativity', category: 'Soft Skills', aliases: ['innovation', 'creative thinking', 'ideation'] },

  // ---- Soft skills -----------------------------------------------------
  { id: 'leadership', label: 'Leadership', category: 'Soft Skills', aliases: ['team lead', 'tech lead', 'mentoring', 'mentorship', 'managed a team'] },
  { id: 'communication', label: 'Communication', category: 'Soft Skills', aliases: ['presentation skills', 'written communication', 'verbal communication'] },
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

/**
 * Fail loudly on a duplicate key.
 *
 * The lookup is a Map, so a repeated alias silently overwrites — the second
 * skill simply stops being detectable, with no error anywhere. With 200+
 * entries across two dozen professions that is a matter of when, not if, so
 * the collision is turned into a startup crash instead of a silent gap.
 */
{
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const skill of TAXONOMY) {
    for (const key of [skill.id, skill.label.toLowerCase(), ...skill.aliases.map((a) => a.toLowerCase())]) {
      const owner = seen.get(key);
      if (owner && owner !== skill.id) collisions.push(`"${key}" claimed by both ${owner} and ${skill.id}`);
      seen.set(key, skill.id);
    }
  }
  if (collisions.length) {
    throw new Error(`Skill taxonomy has ${collisions.length} duplicate key(s):\n  ${collisions.join('\n  ')}`);
  }
}

/**
 * Phrases scanned for in resume text — longest first, so "react native" wins
 * over "react".
 *
 * Deliberately built from labels and aliases only, **not** from ids. An id is
 * an internal handle chosen for brevity, and many are ordinary English words:
 * `assessment`, `compliance`, `audit`, `statistics`, `documentation`. Scanning
 * for those matched any sentence containing the word — a nurse's "clinical
 * assessment" was being reported as the education skill "Student Assessment".
 *
 * Ids stay in LOOKUP because `canonical()` must still resolve them when a role
 * definition refers to a skill by id.
 */
const PHRASES = [
  ...new Set(
    TAXONOMY.flatMap((skill) => [
      skill.label.toLowerCase(),
      ...skill.aliases.map((a) => a.toLowerCase()),
    ]),
  ),
].sort((a, b) => b.length - a.length);

export const CATEGORIES: string[] = [...new Set(TAXONOMY.map((s) => s.category))];
export const ALL_SKILLS: Skill[] = TAXONOMY.map(({ id, label, category, aliases }) => ({
  id, label, category, aliases,
}));

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
 * Resolve any free-text term to the id it will carry as a requirement.
 *
 * This is the single source of truth for that mapping, and it exists because
 * there used to be two. `parseRequiredSkills` minted `custom:<label>` for a
 * term the taxonomy did not know, while the route that stored must-have flags
 * kept the raw label — so marking "Epic EHR" as must-have produced a weights
 * lookup for `custom:epic ehr` against a stored `"Epic EHR"`, which never
 * matched. The flag was silently dropped and the skill scored as optional.
 *
 * Both callers now derive the id here, so the two cannot drift again.
 */
export function resolveSkillId(term: string): string {
  const raw = term.trim();

  // A stored `custom:foo` came from a save made when the taxonomy did not know
  // "foo". It may know it now — adding "epic ehr" as an alias is exactly that
  // case — so the inner term is re-checked rather than trusted. Without this,
  // roles written before a taxonomy update keep pointing at an id that no
  // longer appears in their own requirement list, and the flag stays lost.
  if (raw.toLowerCase().startsWith('custom:')) {
    const inner = raw.slice('custom:'.length).trim();
    const relearned = canonical(inner);
    return relearned ? relearned.id : `custom:${inner.toLowerCase()}`;
  }

  const hit = canonical(raw);
  if (hit) return hit.id;
  return `custom:${raw.toLowerCase()}`;
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
    const id = resolveSkillId(term);
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
