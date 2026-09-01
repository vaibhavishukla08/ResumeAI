/**
 * Role template catalogue.
 *
 * These are *templates*, not seeded roles. Every new account gets six starter
 * roles; dropping fifty-odd more into each workspace would bury the ones the
 * recruiter actually opened, and would copy the same rows into storage once per
 * user for no benefit. The catalogue lives in code, is read-only, and a user
 * instantiates the ones they want — at which point it becomes their own role,
 * editable and scoped to them like any other.
 *
 * `required` is written the way a recruiter would type it. Terms resolve
 * through the skill taxonomy on read, so an entry can use natural wording
 * ("Rota Planning") and still land on the library skill ("Scheduling").
 *
 * `mustHave` holds the two or three skills that genuinely disqualify a
 * candidate if absent — not everything desirable. Marking everything must-have
 * is the same as marking nothing.
 */

export interface RoleTemplate {
  id: string;
  title: string;
  department: string;
  /** Broad grouping for the picker. */
  sector: string;
  minYears: number;
  maxYears: number | null;
  description: string;
  required: string;
  mustHave: string[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  /* ------------------------------------------------------------ Engineering */
  {
    id: 'frontend-engineer', title: 'Frontend Engineer', department: 'Engineering', sector: 'Technology',
    minYears: 2, maxYears: null,
    description: 'Build accessible, performant interfaces in a modern component codebase. Own features end to end, from the design handover through to the tests that keep them working.',
    required: 'React, TypeScript, JavaScript, CSS, HTML, Testing, Accessibility, Git',
    mustHave: ['React', 'JavaScript'],
  },
  {
    id: 'fullstack-engineer', title: 'Full-Stack Engineer', department: 'Engineering', sector: 'Technology',
    minYears: 3, maxYears: null,
    description: 'Work across the whole request path: interface, API and schema. Comfortable owning a feature from database migration through to the rendered page.',
    required: 'JavaScript, TypeScript, React, Node.js, PostgreSQL, REST APIs, Testing, Git, Docker',
    mustHave: ['JavaScript', 'Node.js'],
  },
  {
    id: 'devops-engineer', title: 'DevOps Engineer', department: 'Engineering', sector: 'Technology',
    minYears: 3, maxYears: null,
    description: 'Own the path from commit to production. Build and maintain CI/CD, infrastructure as code, and the observability that makes an incident diagnosable rather than mysterious.',
    required: 'Docker, Kubernetes, Terraform, CI/CD, AWS, Linux, Observability, Python, Git',
    mustHave: ['Docker', 'CI/CD'],
  },
  {
    id: 'data-engineer', title: 'Data Engineer', department: 'Data & AI', sector: 'Technology',
    minYears: 3, maxYears: null,
    description: 'Design and run the pipelines the business reports from. Model data for analysis, keep freshness and lineage honest, and make failures visible before a stakeholder finds them.',
    required: 'Python, SQL, ETL, Airflow, Spark, PostgreSQL, Snowflake, Docker, AWS',
    mustHave: ['SQL', 'Python'],
  },
  {
    id: 'data-scientist', title: 'Data Scientist', department: 'Data & AI', sector: 'Technology',
    minYears: 2, maxYears: null,
    description: 'Turn messy data into decisions. Frame the question, build the model, and communicate the uncertainty as clearly as the result.',
    required: 'Python, SQL, Statistics, Machine Learning, Pandas, scikit-learn, Communication',
    mustHave: ['Python', 'Statistics'],
  },
  {
    id: 'mobile-engineer', title: 'Mobile Engineer', department: 'Engineering', sector: 'Technology',
    minYears: 3, maxYears: null,
    description: 'Ship and maintain a production mobile application. Own release trains, crash-free rate, and the platform conventions that make an app feel native.',
    required: 'React Native, iOS, Android, TypeScript, Testing, Git, REST APIs',
    mustHave: ['React Native'],
  },
  {
    id: 'qa-engineer', title: 'QA Engineer', department: 'Engineering', sector: 'Technology',
    minYears: 2, maxYears: null,
    description: 'Own quality as a discipline rather than a phase. Build automated coverage where it pays, and exploratory testing where it does not.',
    required: 'Testing, Python, JavaScript, CI/CD, REST APIs, Attention to Detail, Documentation',
    mustHave: ['Testing'],
  },
  {
    id: 'security-engineer', title: 'Security Engineer', department: 'Engineering', sector: 'Technology',
    minYears: 4, maxYears: null,
    description: 'Find and close real risk. Threat-model new work, review code and infrastructure, and turn incidents into controls that prevent the next one.',
    required: 'Security, Linux, Python, Docker, Kubernetes, AWS, Regulatory Compliance, System Design',
    mustHave: ['Security'],
  },
  {
    id: 'cloud-architect', title: 'Cloud Architect', department: 'Engineering', sector: 'Technology',
    minYears: 6, maxYears: null,
    description: 'Set the technical direction for cloud estate: cost, resilience and security. Make the trade-offs explicit and document why.',
    required: 'AWS, Azure, GCP, Terraform, Kubernetes, System Design, Security, Observability, Communication',
    mustHave: ['System Design'],
  },
  {
    id: 'engineering-manager', title: 'Engineering Manager', department: 'Engineering', sector: 'Technology',
    minYears: 6, maxYears: null,
    description: 'Lead a delivery team. Own hiring, growth and delivery predictability, while staying close enough to the work to make good technical calls.',
    required: 'Leadership, Agile, Project Management, System Design, Communication, Performance Management, Git',
    mustHave: ['Leadership'],
  },

  /* ------------------------------------------------------------- Healthcare */
  {
    id: 'staff-nurse', title: 'Staff Nurse', department: 'Clinical', sector: 'Healthcare',
    minYears: 1, maxYears: null,
    description: 'Deliver direct patient care on a general ward. Assess, administer and document accurately, escalating early when a patient deteriorates.',
    required: 'Patient Care, Clinical Assessment, Medication Administration, EHR / EMR, BLS / CPR, Infection Control, Communication, Time Management',
    mustHave: ['Patient Care', 'BLS / CPR'],
  },
  {
    id: 'icu-nurse', title: 'ICU / Critical Care Nurse', department: 'Clinical', sector: 'Healthcare',
    minYears: 3, maxYears: null,
    description: 'Care for ventilated and haemodynamically unstable patients. Titrate to protocol, anticipate deterioration, and lead at the bedside during an arrest.',
    required: 'Patient Care, Clinical Assessment, ACLS, BLS / CPR, Medication Administration, Pharmacology, EHR / EMR, Infection Control',
    mustHave: ['ACLS', 'Clinical Assessment'],
  },
  {
    id: 'medical-assistant', title: 'Medical Assistant', department: 'Clinical', sector: 'Healthcare',
    minYears: 0, maxYears: null,
    description: 'Support a busy outpatient clinic: rooming, vitals, phlebotomy and accurate records, keeping the schedule moving without cutting corners.',
    required: 'Patient Care, Phlebotomy, EHR / EMR, HIPAA Compliance, Scheduling, Customer Service, Attention to Detail',
    mustHave: ['Patient Care'],
  },
  {
    id: 'pharmacist', title: 'Pharmacist', department: 'Clinical', sector: 'Healthcare',
    minYears: 2, maxYears: null,
    description: 'Review and dispense safely, counsel patients, and catch the interaction the prescriber did not. Own controlled-drug governance.',
    required: 'Pharmacology, Medication Administration, Patient Care, Regulatory Compliance, EHR / EMR, Attention to Detail, Communication',
    mustHave: ['Pharmacology'],
  },
  {
    id: 'radiographer', title: 'Radiographer', department: 'Diagnostics', sector: 'Healthcare',
    minYears: 1, maxYears: null,
    description: 'Produce diagnostic-quality images safely. Position accurately, manage dose, and flag urgent findings to the reporting team.',
    required: 'Radiology, Patient Care, Clinical Assessment, Infection Control, HIPAA Compliance, Attention to Detail',
    mustHave: ['Radiology'],
  },
  {
    id: 'physiotherapist', title: 'Physiotherapist', department: 'Therapies', sector: 'Healthcare',
    minYears: 1, maxYears: null,
    description: 'Assess, plan and deliver rehabilitation. Set measurable goals with the patient and adjust the plan against progress rather than protocol.',
    required: 'Patient Care, Clinical Assessment, Care Planning, Communication, Documentation, Time Management',
    mustHave: ['Clinical Assessment'],
  },
  {
    id: 'mental-health-counsellor', title: 'Mental Health Counsellor', department: 'Clinical', sector: 'Healthcare',
    minYears: 2, maxYears: null,
    description: 'Provide assessment and talking therapy. Hold a caseload safely, manage risk, and keep records that would stand up to review.',
    required: 'Mental Health, Clinical Assessment, Care Planning, Communication, Documentation, HIPAA Compliance',
    mustHave: ['Mental Health'],
  },
  {
    id: 'practice-manager', title: 'Practice Manager', department: 'Operations', sector: 'Healthcare',
    minYears: 4, maxYears: null,
    description: 'Run the non-clinical side of a practice: staffing, rota, billing and compliance, so clinicians can do clinical work.',
    required: 'Office Administration, Scheduling, Leadership, Medical Coding, HIPAA Compliance, Budget Management, Customer Service',
    mustHave: ['Scheduling', 'Leadership'],
  },

  /* ---------------------------------------------------------------- Finance */
  {
    id: 'accountant', title: 'Accountant', department: 'Finance', sector: 'Finance',
    minYears: 2, maxYears: null,
    description: 'Own the ledger and the month-end close. Reconcile, prepare statements, and keep the audit trail clean enough that year-end is uneventful.',
    required: 'Bookkeeping, Financial Reporting, GAAP, Microsoft Office, SAP / ERP, Attention to Detail, Taxation',
    mustHave: ['Financial Reporting', 'Bookkeeping'],
  },
  {
    id: 'management-accountant', title: 'Management Accountant', department: 'Finance', sector: 'Finance',
    minYears: 3, maxYears: null,
    description: 'Partner with the business on cost and margin. Build the budget, explain the variance, and make the numbers usable by people who do not read ledgers.',
    required: 'Budgeting & Forecasting, Financial Reporting, Financial Modelling, Microsoft Office, SAP / ERP, Communication, CPA',
    mustHave: ['Budgeting & Forecasting'],
  },
  {
    id: 'internal-auditor', title: 'Internal Auditor', department: 'Finance', sector: 'Finance',
    minYears: 3, maxYears: null,
    description: 'Test controls and report honestly. Plan risk-based work, evidence findings properly, and follow remediation through to closure.',
    required: 'Auditing, Risk Management, Regulatory Compliance, Financial Reporting, GAAP, Documentation, Attention to Detail',
    mustHave: ['Auditing'],
  },
  {
    id: 'investment-analyst', title: 'Investment Analyst', department: 'Finance', sector: 'Finance',
    minYears: 2, maxYears: null,
    description: 'Research and value opportunities. Build the model, stress the assumptions, and write the memo that survives an investment committee.',
    required: 'Financial Modelling, Statistics, Microsoft Office, CFA, Market Research, Communication, Risk Management',
    mustHave: ['Financial Modelling'],
  },
  {
    id: 'compliance-officer', title: 'Compliance Officer', department: 'Risk & Compliance', sector: 'Finance',
    minYears: 3, maxYears: null,
    description: 'Keep the firm inside the rules and able to prove it. Own AML/KYC, monitoring and the regulatory reporting calendar.',
    required: 'Regulatory Compliance, AML / KYC, Risk Management, Auditing, Documentation, Attention to Detail, Communication',
    mustHave: ['Regulatory Compliance', 'AML / KYC'],
  },
  {
    id: 'payroll-specialist', title: 'Payroll Specialist', department: 'Finance', sector: 'Finance',
    minYears: 2, maxYears: null,
    description: 'Run payroll accurately and on time, every time. Own statutory deductions, year-end filings, and the queries that follow.',
    required: 'Payroll, Bookkeeping, Taxation, Microsoft Office, HRIS, Attention to Detail, Regulatory Compliance',
    mustHave: ['Payroll'],
  },
  {
    id: 'financial-controller', title: 'Financial Controller', department: 'Finance', sector: 'Finance',
    minYears: 6, maxYears: null,
    description: 'Own the integrity of the numbers and the team that produces them. Close the books, manage audit, and strengthen controls as the business scales.',
    required: 'Financial Reporting, GAAP, IFRS, Auditing, Budgeting & Forecasting, Leadership, SAP / ERP, CPA',
    mustHave: ['Financial Reporting', 'Leadership'],
  },

  /* ------------------------------------------------------------------ Legal */
  {
    id: 'corporate-solicitor', title: 'Corporate Solicitor', department: 'Legal', sector: 'Legal',
    minYears: 2, maxYears: null,
    description: 'Advise on transactions and governance. Draft and negotiate, run due diligence, and flag the risk the commercial team has not priced.',
    required: 'Corporate Law, Contract Law, Legal Research, Regulatory Compliance, Documentation, Communication',
    mustHave: ['Corporate Law', 'Contract Law'],
  },
  {
    id: 'litigation-associate', title: 'Litigation Associate', department: 'Legal', sector: 'Legal',
    minYears: 2, maxYears: null,
    description: 'Run disputes from pre-action through to hearing. Build the chronology, manage disclosure, and draft submissions that hold up.',
    required: 'Litigation, Legal Research, Contract Law, Documentation, Attention to Detail, Communication',
    mustHave: ['Litigation'],
  },
  {
    id: 'paralegal', title: 'Paralegal', department: 'Legal', sector: 'Legal',
    minYears: 0, maxYears: null,
    description: 'Support fee earners with research, bundling and disclosure. Keep matters organised so nothing is found late.',
    required: 'Paralegal Support, Legal Research, Documentation, Office Administration, Attention to Detail, Microsoft Office',
    mustHave: ['Paralegal Support'],
  },
  {
    id: 'contracts-manager', title: 'Contracts Manager', department: 'Legal', sector: 'Legal',
    minYears: 4, maxYears: null,
    description: 'Own the contract lifecycle commercially and legally: templates, negotiation, renewals and the obligations everyone forgets after signature.',
    required: 'Contract Law, Negotiation, Regulatory Compliance, Stakeholder Management, Documentation, Communication',
    mustHave: ['Contract Law'],
  },
  {
    id: 'data-protection-officer', title: 'Data Protection Officer', department: 'Legal', sector: 'Legal',
    minYears: 4, maxYears: null,
    description: 'Own privacy compliance: records of processing, DPIAs, subject requests and breach response. Advise the business in language it can act on.',
    required: 'Regulatory Compliance, Intellectual Property, Legal Research, Risk Management, Documentation, Security, Communication',
    mustHave: ['Regulatory Compliance'],
  },

  /* -------------------------------------------------------------- Marketing */
  {
    id: 'content-strategist', title: 'Content Strategist', department: 'Marketing', sector: 'Marketing',
    minYears: 3, maxYears: null,
    description: 'Own what gets published and why. Build the editorial calendar around search demand and buyer questions, and measure what actually converts.',
    required: 'Content Marketing, SEO, Brand Management, Google Analytics, Market Research, Communication',
    mustHave: ['Content Marketing', 'SEO'],
  },
  {
    id: 'performance-marketer', title: 'Performance Marketing Manager', department: 'Marketing', sector: 'Marketing',
    minYears: 3, maxYears: null,
    description: 'Run paid acquisition against a CAC target. Own budget allocation, creative testing and the attribution argument that follows.',
    required: 'SEM / Paid Search, Google Analytics, Campaign Management, Social Media Marketing, Statistics, Budget Management',
    mustHave: ['SEM / Paid Search', 'Google Analytics'],
  },
  {
    id: 'social-media-manager', title: 'Social Media Manager', department: 'Marketing', sector: 'Marketing',
    minYears: 2, maxYears: null,
    description: 'Own presence and community across channels. Plan, publish, respond, and know which numbers matter and which are vanity.',
    required: 'Social Media Marketing, Content Marketing, Brand Management, Google Analytics, Graphic Design, Communication',
    mustHave: ['Social Media Marketing'],
  },
  {
    id: 'pr-manager', title: 'PR & Communications Manager', department: 'Marketing', sector: 'Marketing',
    minYears: 4, maxYears: null,
    description: 'Own reputation. Build media relationships, land coverage, and run the communications when something goes wrong.',
    required: 'Public Relations, Content Marketing, Brand Management, Stakeholder Management, Communication, Documentation',
    mustHave: ['Public Relations'],
  },
  {
    id: 'product-marketing-manager', title: 'Product Marketing Manager', department: 'Marketing', sector: 'Marketing',
    minYears: 4, maxYears: null,
    description: 'Own positioning, launch and enablement. Translate what the product does into why a buyer should care.',
    required: 'Brand Management, Market Research, Campaign Management, Content Marketing, Product Management, Communication',
    mustHave: ['Market Research'],
  },

  /* ------------------------------------------------------------------ Sales */
  {
    id: 'sdr', title: 'Sales Development Representative', department: 'Sales', sector: 'Sales',
    minYears: 0, maxYears: null,
    description: 'Open conversations. Research accounts, run disciplined outbound, and qualify hard enough that the meeting is worth an AE’s time.',
    required: 'Lead Generation, B2B Sales, CRM, Communication, Time Management, Customer Focus',
    mustHave: ['Lead Generation'],
  },
  {
    id: 'account-executive', title: 'Account Executive', department: 'Sales', sector: 'Sales',
    minYears: 2, maxYears: null,
    description: 'Own the deal from qualification to close. Run a real process, manage a multi-stakeholder buying group, and forecast honestly.',
    required: 'B2B Sales, Negotiation, Pipeline Management, CRM, Account Management, Communication',
    mustHave: ['B2B Sales', 'Negotiation'],
  },
  {
    id: 'customer-success-manager', title: 'Customer Success Manager', department: 'Customer Success', sector: 'Sales',
    minYears: 2, maxYears: null,
    description: 'Own retention and expansion for a book of accounts. Drive adoption, spot risk early, and make renewal a formality.',
    required: 'Account Management, Customer Service, CRM, Communication, Stakeholder Management, Customer Focus',
    mustHave: ['Account Management'],
  },
  {
    id: 'sales-manager', title: 'Sales Manager', department: 'Sales', sector: 'Sales',
    minYears: 5, maxYears: null,
    description: 'Lead a quota-carrying team. Coach on deals, hold the forecast, and build a pipeline that does not depend on one hero.',
    required: 'B2B Sales, Pipeline Management, Leadership, Negotiation, CRM, Performance Management, Communication',
    mustHave: ['Leadership', 'Pipeline Management'],
  },
  {
    id: 'retail-store-manager', title: 'Retail Store Manager', department: 'Retail', sector: 'Sales',
    minYears: 3, maxYears: null,
    description: 'Run a store: people, stock, standards and takings. Build a rota that works and a team that stays.',
    required: 'Retail Sales, Leadership, Inventory Management, Scheduling, Customer Service, Budget Management',
    mustHave: ['Retail Sales', 'Leadership'],
  },

  /* --------------------------------------------------------------------- HR */
  {
    id: 'recruiter', title: 'Recruiter', department: 'People', sector: 'Human Resources',
    minYears: 2, maxYears: null,
    description: 'Own requisitions end to end. Source actively, keep candidates warm, and give hiring managers an honest read on the market.',
    required: 'Recruiting, Onboarding, HRIS, Communication, Stakeholder Management, Time Management',
    mustHave: ['Recruiting'],
  },
  {
    id: 'hr-business-partner', title: 'HR Business Partner', department: 'People', sector: 'Human Resources',
    minYears: 4, maxYears: null,
    description: 'Partner with leaders on people decisions: structure, performance, and the difficult conversations. Advise on risk without hiding behind policy.',
    required: 'Employee Relations, Performance Management, Employment Law, Compensation & Benefits, HRIS, Communication, Leadership',
    mustHave: ['Employee Relations'],
  },
  {
    id: 'ld-manager', title: 'Learning & Development Manager', department: 'People', sector: 'Human Resources',
    minYears: 4, maxYears: null,
    description: 'Build capability deliberately. Assess need, design programmes, and measure whether behaviour actually changed.',
    required: 'Learning & Development, Curriculum Development, Performance Management, Stakeholder Management, Communication',
    mustHave: ['Learning & Development'],
  },
  {
    id: 'hr-coordinator', title: 'HR Coordinator', department: 'People', sector: 'Human Resources',
    minYears: 0, maxYears: null,
    description: 'Keep the people operation running: onboarding, records, contracts and the queries that arrive daily.',
    required: 'Office Administration, Onboarding, HRIS, Documentation, Scheduling, Attention to Detail, Communication',
    mustHave: ['Onboarding'],
  },

  /* --------------------------------------------------- Operations & Supply */
  {
    id: 'operations-manager', title: 'Operations Manager', department: 'Operations', sector: 'Operations',
    minYears: 4, maxYears: null,
    description: 'Own throughput, cost and quality for a site or function. Find the constraint, fix it, and make the improvement stick.',
    required: 'Process Improvement, Lean / Six Sigma, Leadership, Budget Management, Quality Assurance, Health & Safety, Communication',
    mustHave: ['Process Improvement', 'Leadership'],
  },
  {
    id: 'supply-chain-analyst', title: 'Supply Chain Analyst', department: 'Operations', sector: 'Operations',
    minYears: 2, maxYears: null,
    description: 'Model demand and keep stock where it needs to be. Balance service level against working capital with evidence rather than instinct.',
    required: 'Supply Chain, Inventory Management, Logistics, Microsoft Office, SQL, Statistics, Attention to Detail',
    mustHave: ['Supply Chain'],
  },
  {
    id: 'warehouse-supervisor', title: 'Warehouse Supervisor', department: 'Logistics', sector: 'Operations',
    minYears: 2, maxYears: null,
    description: 'Run a shift safely and on time. Own pick accuracy, stock integrity and the team on the floor.',
    required: 'Logistics, Inventory Management, Health & Safety, Leadership, Scheduling, Commercial Driving',
    mustHave: ['Logistics', 'Health & Safety'],
  },
  {
    id: 'procurement-manager', title: 'Procurement Manager', department: 'Operations', sector: 'Operations',
    minYears: 4, maxYears: null,
    description: 'Own supplier strategy and spend. Run tenders properly, negotiate hard, and manage performance after the contract is signed.',
    required: 'Procurement, Negotiation, Contract Law, Supply Chain, Budget Management, Risk Management, Communication',
    mustHave: ['Procurement', 'Negotiation'],
  },
  {
    id: 'quality-manager', title: 'Quality Manager', department: 'Quality', sector: 'Operations',
    minYears: 4, maxYears: null,
    description: 'Own the quality system. Run audits, close non-conformances at root cause, and keep certification defensible.',
    required: 'Quality Assurance, Auditing, Process Improvement, Lean / Six Sigma, Documentation, Regulatory Compliance',
    mustHave: ['Quality Assurance'],
  },

  /* ------------------------------------------------- Design & Project Mgmt */
  {
    id: 'product-designer', title: 'Product Designer', department: 'Design', sector: 'Design',
    minYears: 3, maxYears: null,
    description: 'Own the problem as much as the pixels. Research, prototype, and ship with engineering rather than over the wall to them.',
    required: 'UX Design, UI Design, Figma, Accessibility, Adobe Creative Suite, Communication',
    mustHave: ['UX Design', 'Figma'],
  },
  {
    id: 'graphic-designer', title: 'Graphic Designer', department: 'Design', sector: 'Design',
    minYears: 1, maxYears: null,
    description: 'Produce brand-consistent work across print and digital, to brief and to deadline.',
    required: 'Graphic Design, Adobe Creative Suite, Brand Management, Figma, Attention to Detail, Creativity',
    mustHave: ['Graphic Design', 'Adobe Creative Suite'],
  },
  {
    id: 'video-editor', title: 'Video Editor', department: 'Creative', sector: 'Design',
    minYears: 2, maxYears: null,
    description: 'Cut footage into something that holds attention. Own the edit, the grade and the export specs for each platform.',
    required: 'Video Production, Adobe Creative Suite, Photography, Creativity, Attention to Detail, Time Management',
    mustHave: ['Video Production'],
  },
  {
    id: 'project-manager', title: 'Project Manager', department: 'Delivery', sector: 'Project Management',
    minYears: 3, maxYears: null,
    description: 'Deliver to scope, time and budget. Manage dependencies and risk actively, and tell stakeholders the truth early.',
    required: 'Project Management, Stakeholder Management, Budget Management, Agile, Jira / Asana, Documentation, Communication',
    mustHave: ['Project Management'],
  },
  {
    id: 'product-manager', title: 'Product Manager', department: 'Product', sector: 'Project Management',
    minYears: 3, maxYears: null,
    description: 'Own outcomes for a product area. Decide what not to build, and be able to defend why.',
    required: 'Product Management, Stakeholder Management, Market Research, Agile, Jira / Asana, Statistics, Communication',
    mustHave: ['Product Management'],
  },
  {
    id: 'business-analyst', title: 'Business Analyst', department: 'Delivery', sector: 'Project Management',
    minYears: 2, maxYears: null,
    description: 'Turn a vague business need into something buildable. Map the process, write the requirement, and validate it against reality.',
    required: 'Documentation, Process Improvement, SQL, Stakeholder Management, Microsoft Office, Communication, Agile',
    mustHave: ['Documentation'],
  },

  /* ------------------------------------------ Education, Trades & Services */
  {
    id: 'secondary-teacher', title: 'Secondary School Teacher', department: 'Teaching', sector: 'Education',
    minYears: 0, maxYears: null,
    description: 'Plan and teach an engaging curriculum, assess honestly, and manage a classroom so every student can learn.',
    required: 'Teaching, Curriculum Development, Student Assessment, Classroom Management, Communication, Documentation',
    mustHave: ['Teaching', 'Classroom Management'],
  },
  {
    id: 'university-lecturer', title: 'University Lecturer', department: 'Faculty', sector: 'Education',
    minYears: 3, maxYears: null,
    description: 'Teach at degree level and sustain an active research profile. Supervise students and contribute to the department beyond your own modules.',
    required: 'Teaching, Academic Research, Curriculum Development, Statistics, Communication, Documentation',
    mustHave: ['Teaching', 'Academic Research'],
  },
  {
    id: 'lab-technician', title: 'Laboratory Technician', department: 'Laboratory', sector: 'Education',
    minYears: 1, maxYears: null,
    description: 'Run assays accurately and keep the lab compliant. Own calibration, reagent stock and the records behind every result.',
    required: 'Laboratory Techniques, Documentation, Quality Assurance, Health & Safety, Attention to Detail, Statistics',
    mustHave: ['Laboratory Techniques'],
  },
  {
    id: 'site-supervisor', title: 'Construction Site Supervisor', department: 'Construction', sector: 'Service & Trades',
    minYears: 4, maxYears: null,
    description: 'Run a live site day to day: programme, subcontractors, and a safety culture that holds when nobody is watching.',
    required: 'Construction Management, Health & Safety, Leadership, Quality Assurance, Documentation, Scheduling',
    mustHave: ['Construction Management', 'Health & Safety'],
  },
  {
    id: 'electrician', title: 'Electrician', department: 'Trades', sector: 'Service & Trades',
    minYears: 2, maxYears: null,
    description: 'Install, test and certify electrical work to standard. Diagnose faults properly rather than replacing until it stops.',
    required: 'Electrical (Trade), Health & Safety, Maintenance & Repair, Documentation, Attention to Detail, Problem Solving',
    mustHave: ['Electrical (Trade)'],
  },
  {
    id: 'hvac-technician', title: 'HVAC Technician', department: 'Trades', sector: 'Service & Trades',
    minYears: 2, maxYears: null,
    description: 'Install and service heating, ventilation and refrigeration plant. Commission correctly and keep F-gas records straight.',
    required: 'HVAC, Maintenance & Repair, Health & Safety, Electrical (Trade), Customer Service, Documentation',
    mustHave: ['HVAC'],
  },
  {
    id: 'chef-de-partie', title: 'Chef de Partie', department: 'Kitchen', sector: 'Service & Trades',
    minYears: 2, maxYears: null,
    description: 'Run a section to spec through service. Own mise en place, consistency and food safety on your station.',
    required: 'Food Service, Time Management, Attention to Detail, Teamwork, Health & Safety, Inventory Management',
    mustHave: ['Food Service'],
  },
  {
    id: 'hotel-front-office-manager', title: 'Hotel Front Office Manager', department: 'Rooms', sector: 'Service & Trades',
    minYears: 3, maxYears: null,
    description: 'Own the guest journey from arrival to departure. Lead the desk team, manage the rota, and resolve complaints before they reach a review site.',
    required: 'Hospitality Management, Customer Service, Leadership, Scheduling, Communication, Budget Management',
    mustHave: ['Hospitality Management', 'Customer Service'],
  },
  {
    id: 'customer-support-specialist', title: 'Customer Support Specialist', department: 'Support', sector: 'Service & Trades',
    minYears: 0, maxYears: null,
    description: 'Resolve customer issues properly the first time. Write clearly, escalate what genuinely needs it, and spot the pattern behind repeat contacts.',
    required: 'Customer Service, Communication, Documentation, CRM, Problem Solving, Time Management',
    mustHave: ['Customer Service'],
  },
  {
    id: 'executive-assistant', title: 'Executive Assistant', department: 'Administration', sector: 'Administration',
    minYears: 3, maxYears: null,
    description: 'Protect an executive’s time and attention. Own the diary, travel and inbox triage, and handle confidential material without comment.',
    required: 'Office Administration, Scheduling, Microsoft Office, Documentation, Communication, Attention to Detail, Time Management',
    mustHave: ['Office Administration', 'Scheduling'],
  },
];

/** Grouped for the picker, in a stable order. */
export function templatesBySector(): { sector: string; templates: RoleTemplate[] }[] {
  const order: string[] = [];
  const groups = new Map<string, RoleTemplate[]>();

  for (const t of ROLE_TEMPLATES) {
    if (!groups.has(t.sector)) {
      groups.set(t.sector, []);
      order.push(t.sector);
    }
    groups.get(t.sector)!.push(t);
  }
  return order.map((sector) => ({ sector, templates: groups.get(sector)! }));
}

export function findTemplate(id: string): RoleTemplate | null {
  return ROLE_TEMPLATES.find((t) => t.id === id) ?? null;
}
