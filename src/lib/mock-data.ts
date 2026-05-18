import { 
  Transaction, 
  Alert, 
  Case, 
  CaseNote,
  CaseStatus,
  CaseType,
  CaseTimelineEvent,
  LinkedEntity,
  Evidence,
  Customer, 
  Rule, 
  RuleConditionGroup,
  MLModel, 
  DashboardStats,
  TimeSeriesData,
  RiskLevel,
  TransactionType,
  Channel,
  IAMUser,
  UserRole,
  UserStatus,
  PrivilegeLevel,
  SSOProvider,
  RoleDefinition,
  UserSession,
  UserAuditEntry,
  AccessApproval,
  PERMISSION_GROUPS
} from '@/types';

// Helper to generate random ID
const generateId = () => Math.random().toString(36).substring(2, 15);

// Helper to get random item from array
const randomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random number in range
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate merchants
const merchants = [
  { id: 'M001', name: 'Amazon', mcc: '5411' },
  { id: 'M002', name: 'Walmart', mcc: '5411' },
  { id: 'M003', name: 'Shell Gas Station', mcc: '5541' },
  { id: 'M004', name: 'Starbucks', mcc: '5812' },
  { id: 'M005', name: 'Apple Store', mcc: '5732' },
  { id: 'M006', name: 'Netflix', mcc: '4899' },
  { id: 'M007', name: 'Uber', mcc: '4121' },
  { id: 'M008', name: 'Hotel Grand Hyatt', mcc: '7011' },
  { id: 'M009', name: 'Casino Royale', mcc: '7995' },
  { id: 'M010', name: 'Western Union', mcc: '6051' },
];

const countries = ['United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Japan', 'Nigeria', 'Russia', 'China', 'Brazil'];
const cities = ['New York', 'Los Angeles', 'London', 'Berlin', 'Paris', 'Tokyo', 'Lagos', 'Moscow', 'Beijing', 'São Paulo'];

const transactionTypes: TransactionType[] = ['credit_card', 'wire_transfer', 'ach', 'mobile', 'atm'];
const channels: Channel[] = ['pos', 'mobile', 'web', 'atm', 'branch'];

const riskReasons = [
  'Transaction amount 5.2x higher than customer average',
  'New device detected (never seen before)',
  'Geographic location unusual for this customer',
  'Transaction occurred at 3:15 AM, outside normal hours',
  'Velocity: 8 transactions in last 2 hours (vs. avg 2/day)',
  'Merchant on high-risk watchlist',
  'Rapid fund movement pattern detected',
  'Transaction just below reporting threshold',
  'IP address from VPN/proxy service',
  'Card testing pattern detected',
  'Beneficiary in high-risk jurisdiction',
  'Dormant account sudden reactivation'
];

// Generate random risk score
const generateRiskScore = (): { score: number; level: RiskLevel; mlProbability: number; anomalyScore: number } => {
  const rand = Math.random();
  let score: number;
  let level: RiskLevel;
  
  if (rand < 0.6) {
    score = randomRange(0, 25);
    level = 'low';
  } else if (rand < 0.8) {
    score = randomRange(26, 50);
    level = 'medium';
  } else if (rand < 0.95) {
    score = randomRange(51, 75);
    level = 'high';
  } else {
    score = randomRange(76, 100);
    level = 'critical';
  }
  
  return {
    score,
    level,
    mlProbability: Math.min(0.99, score / 100 + (Math.random() * 0.1 - 0.05)),
    anomalyScore: Math.min(1, score / 100 + (Math.random() * 0.2 - 0.1))
  };
};

// Generate transactions
export const generateTransactions = (count: number = 100): Transaction[] => {
  const transactions: Transaction[] = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const merchant = randomItem(merchants);
    const risk = generateRiskScore();
    const countryIndex = randomRange(0, countries.length - 1);
    const timestamp = new Date(now.getTime() - randomRange(0, 7 * 24 * 60 * 60 * 1000));
    
    const rulesTriggered: string[] = [];
    if (risk.level !== 'low') {
      const numRules = randomRange(1, 4);
      for (let j = 0; j < numRules; j++) {
        rulesTriggered.push(randomItem(riskReasons));
      }
    }
    
    transactions.push({
      id: `TXN-${generateId().toUpperCase()}`,
      customerId: `CUST-${randomRange(1000, 9999)}`,
      accountId: `ACC-${randomRange(100000, 999999)}`,
      amount: parseFloat((Math.random() * 10000 + 10).toFixed(2)),
      currency: 'USD',
      type: randomItem(transactionTypes),
      merchantId: merchant.id,
      merchantName: merchant.name,
      merchantCategoryCode: merchant.mcc,
      channel: randomItem(channels),
      deviceId: `DEV-${generateId()}`,
      ipAddress: `${randomRange(1, 255)}.${randomRange(1, 255)}.${randomRange(1, 255)}.${randomRange(1, 255)}`,
      geoLocation: {
        latitude: parseFloat((Math.random() * 180 - 90).toFixed(6)),
        longitude: parseFloat((Math.random() * 360 - 180).toFixed(6)),
        country: countries[countryIndex],
        city: cities[countryIndex]
      },
      timestamp: timestamp.toISOString(),
      cardNumberMasked: `****${randomRange(1000, 9999)}`,
      status: randomItem(['completed', 'completed', 'completed', 'pending', 'declined']),
      description: `Payment to ${merchant.name}`,
      riskScore: risk.score,
      riskLevel: risk.level,
      mlProbability: risk.mlProbability,
      anomalyScore: risk.anomalyScore,
      rulesTriggered
    });
  }
  
  return transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Generate alerts
export const generateAlerts = (transactions: Transaction[]): Alert[] => {
  const alerts: Alert[] = [];
  const alertableTransactions = transactions.filter(t => t.riskLevel !== 'low');
  
  alertableTransactions.slice(0, 50).forEach(t => {
    alerts.push({
      id: `ALT-${generateId().toUpperCase()}`,
      type: randomItem(['fraud', 'aml', 'rule', 'model']),
      transactionId: t.id,
      customerId: t.customerId,
      riskScore: t.riskScore,
      severity: t.riskLevel,
      status: randomItem(['open', 'open', 'open', 'under_investigation', 'escalated', 'closed']),
      assignedTo: Math.random() > 0.3 ? `analyst-${randomRange(1, 5)}` : undefined,
      createdAt: t.timestamp,
      updatedAt: new Date().toISOString(),
      resolution: 'pending',
      contributingFactors: t.rulesTriggered,
      modelVersion: 'v2.3.1',
      ruleIds: [`RULE-${randomRange(1, 20)}`],
      description: `${t.riskLevel.toUpperCase()} risk transaction detected: ${t.description}`
    });
  });
  
  return alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Generate cases
const generateCaseTimeline = (caseId: string, createdAt: string, status: CaseStatus, assignedTo: string | undefined, alertCount: number): CaseTimelineEvent[] => {
  const events: CaseTimelineEvent[] = [];
  const baseTime = new Date(createdAt).getTime();

  events.push({
    id: `tl-${caseId}-1`,
    type: 'alert_triggered',
    title: 'Alert Triggered',
    description: `${alertCount} alert(s) triggered automated case creation`,
    performedBy: 'system',
    timestamp: new Date(baseTime).toISOString(),
    metadata: { alertCount: String(alertCount) }
  });

  events.push({
    id: `tl-${caseId}-2`,
    type: 'case_created',
    title: 'Case Opened',
    description: 'Case created and queued for investigation',
    performedBy: 'system',
    timestamp: new Date(baseTime + 60000).toISOString()
  });

  if (assignedTo) {
    events.push({
      id: `tl-${caseId}-3`,
      type: 'assigned',
      title: `Assigned to ${assignedTo.replace('-', ' ')}`,
      description: 'Auto-assigned by workload balancer',
      performedBy: 'system',
      timestamp: new Date(baseTime + 120000).toISOString(),
      metadata: { assignee: assignedTo }
    });
  }

  if (status === 'in_review' || status === 'escalated' || status === 'closed') {
    events.push({
      id: `tl-${caseId}-4`,
      type: 'status_change',
      title: 'Investigation Started',
      description: 'Case moved to In Review status',
      performedBy: assignedTo || 'analyst-1',
      timestamp: new Date(baseTime + 3600000).toISOString(),
      metadata: { from: 'open', to: 'in_review' }
    });

    events.push({
      id: `tl-${caseId}-5`,
      type: 'evidence_added',
      title: 'Evidence Attached',
      description: 'Transaction logs and system reports attached',
      performedBy: assignedTo || 'analyst-1',
      timestamp: new Date(baseTime + 7200000).toISOString()
    });

    events.push({
      id: `tl-${caseId}-6`,
      type: 'note_added',
      title: 'Investigation Note Added',
      description: 'Analyst documented initial findings',
      performedBy: assignedTo || 'analyst-1',
      timestamp: new Date(baseTime + 14400000).toISOString()
    });
  }

  if (status === 'escalated') {
    events.push({
      id: `tl-${caseId}-7`,
      type: 'escalated',
      title: 'Case Escalated',
      description: 'Escalated to senior compliance team for review',
      performedBy: assignedTo || 'analyst-1',
      timestamp: new Date(baseTime + 28800000).toISOString(),
      metadata: { reason: 'High risk indicators detected' }
    });
  }

  if (status === 'closed') {
    events.push({
      id: `tl-${caseId}-8`,
      type: 'resolution',
      title: 'Case Resolved',
      description: 'Investigation completed and case closed',
      performedBy: assignedTo || 'analyst-1',
      timestamp: new Date(baseTime + 86400000).toISOString(),
      metadata: { outcome: 'fraud_confirmed' }
    });
  }

  return events;
};

const generateLinkedEntities = (caseId: string, caseType: CaseType): LinkedEntity[] => {
  const entities: LinkedEntity[] = [];
  const vendorNames = ['TechCorp Ltd', 'Global Payments Inc', 'FastShip Logistics', 'Digital Services Co', 'Oceanic Trading'];
  const employeeNames = ['Sarah Chen', 'Michael Torres', 'Emily Watson', 'James Kim', 'Priya Patel'];
  const contractRefs = ['CNTR-2024-0891', 'CNTR-2024-1247', 'CNTR-2023-0456'];
  const invoiceRefs = ['INV-2025-00342', 'INV-2025-00567', 'INV-2024-01234'];

  const hash = caseId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const entityCount = (hash % 3) + 2;

  for (let i = 0; i < entityCount; i++) {
    const idx = (hash + i) % 5;
    if (i === 0) {
      entities.push({
        id: `ent-${caseId}-${i}`,
        type: 'vendor',
        name: vendorNames[idx],
        reference: `VND-${1000 + idx}`,
        relationship: randomItem(['payee', 'merchant', 'intermediary']),
        riskIndicator: caseType === 'aml' ? 'high' : 'medium',
        addedBy: 'system',
        addedAt: new Date(Date.now() - randomRange(1, 10) * 86400000).toISOString(),
        notes: 'Flagged in previous investigations'
      });
    } else if (i === 1) {
      entities.push({
        id: `ent-${caseId}-${i}`,
        type: 'employee',
        name: employeeNames[idx],
        reference: `EMP-${2000 + idx}`,
        relationship: 'account_manager',
        addedBy: `analyst-${(idx % 5) + 1}`,
        addedAt: new Date(Date.now() - randomRange(1, 5) * 86400000).toISOString()
      });
    } else if (i === 2) {
      entities.push({
        id: `ent-${caseId}-${i}`,
        type: 'contract',
        name: `Service Agreement - ${vendorNames[idx]}`,
        reference: contractRefs[idx % contractRefs.length],
        relationship: 'associated_contract',
        addedBy: `analyst-${(idx % 5) + 1}`,
        addedAt: new Date(Date.now() - randomRange(1, 7) * 86400000).toISOString()
      });
    } else {
      entities.push({
        id: `ent-${caseId}-${i}`,
        type: 'invoice',
        name: `Invoice from ${vendorNames[idx]}`,
        reference: invoiceRefs[idx % invoiceRefs.length],
        relationship: 'linked_payment',
        riskIndicator: 'low',
        addedBy: 'system',
        addedAt: new Date(Date.now() - randomRange(1, 3) * 86400000).toISOString()
      });
    }
  }

  return entities;
};

const generateEvidence = (caseId: string, createdAt: string): Evidence[] => {
  const baseTime = new Date(createdAt).getTime();
  const evidence: Evidence[] = [];
  const hash = caseId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  const systemEvidence: Evidence[] = [
    {
      id: `ev-${caseId}-1`,
      caseId,
      fileName: 'transaction_log_export.csv',
      fileType: 'transaction_log',
      fileSize: 245760,
      mimeType: 'text/csv',
      source: 'system_generated',
      sourceAttribution: 'SnapFort Transaction Monitor',
      tags: ['transactions', 'auto-generated'],
      description: 'Exported transaction log for flagged period',
      uploadedBy: 'system',
      uploadedAt: new Date(baseTime + 300000).toISOString(),
      custodyChain: [
        { action: 'uploaded', performedBy: 'system', timestamp: new Date(baseTime + 300000).toISOString(), details: 'Auto-generated by alert trigger' },
        { action: 'viewed', performedBy: `analyst-${(hash % 5) + 1}`, timestamp: new Date(baseTime + 3600000).toISOString() }
      ]
    },
    {
      id: `ev-${caseId}-2`,
      caseId,
      fileName: 'risk_assessment_report.pdf',
      fileType: 'report',
      fileSize: 1048576,
      mimeType: 'application/pdf',
      source: 'system_generated',
      sourceAttribution: 'SnapFort Risk Engine',
      tags: ['risk-assessment', 'auto-generated', 'ml-analysis'],
      description: 'ML-generated risk assessment with contributing factors',
      uploadedBy: 'system',
      uploadedAt: new Date(baseTime + 600000).toISOString(),
      custodyChain: [
        { action: 'uploaded', performedBy: 'system', timestamp: new Date(baseTime + 600000).toISOString(), details: 'Auto-generated risk assessment' },
        { action: 'viewed', performedBy: `analyst-${(hash % 5) + 1}`, timestamp: new Date(baseTime + 3700000).toISOString() },
        { action: 'downloaded', performedBy: `analyst-${(hash % 5) + 1}`, timestamp: new Date(baseTime + 7200000).toISOString(), details: 'Downloaded for compliance review' }
      ]
    }
  ];

  evidence.push(...systemEvidence);

  if (hash % 3 === 0) {
    evidence.push({
      id: `ev-${caseId}-3`,
      caseId,
      fileName: 'customer_communication_screenshot.png',
      fileType: 'screenshot',
      fileSize: 524288,
      mimeType: 'image/png',
      source: 'manual_upload',
      sourceAttribution: `Analyst ${(hash % 5) + 1}`,
      tags: ['customer-communication', 'manual'],
      description: 'Screenshot of suspicious customer communication',
      uploadedBy: `analyst-${(hash % 5) + 1}`,
      uploadedAt: new Date(baseTime + 14400000).toISOString(),
      custodyChain: [
        { action: 'uploaded', performedBy: `analyst-${(hash % 5) + 1}`, timestamp: new Date(baseTime + 14400000).toISOString(), details: 'Manually uploaded during investigation' },
        { action: 'tagged', performedBy: `analyst-${(hash % 5) + 1}`, timestamp: new Date(baseTime + 14500000).toISOString(), details: 'Tagged as customer-communication' }
      ]
    });
  }

  if (hash % 2 === 0) {
    evidence.push({
      id: `ev-${caseId}-4`,
      caseId,
      fileName: 'external_watchlist_match.pdf',
      fileType: 'document',
      fileSize: 204800,
      mimeType: 'application/pdf',
      source: 'external_feed',
      sourceAttribution: 'OFAC Sanctions List',
      tags: ['sanctions', 'external', 'watchlist'],
      description: 'External sanctions list match report',
      uploadedBy: 'system',
      uploadedAt: new Date(baseTime + 900000).toISOString(),
      custodyChain: [
        { action: 'uploaded', performedBy: 'system', timestamp: new Date(baseTime + 900000).toISOString(), details: 'Imported from external feed' },
        { action: 'viewed', performedBy: `analyst-${(hash % 5) + 1}`, timestamp: new Date(baseTime + 5400000).toISOString() }
      ]
    });
  }

  evidence.push({
    id: `ev-${caseId}-5`,
    caseId,
    fileName: 'investigation_notes.docx',
    fileType: 'document',
    fileSize: 102400,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    source: 'manual_upload',
    sourceAttribution: `Analyst ${(hash % 5) + 1}`,
    tags: ['notes', 'investigation', 'manual'],
    description: 'Detailed investigation notes and findings',
    uploadedBy: `analyst-${(hash % 5) + 1}`,
    uploadedAt: new Date(baseTime + 28800000).toISOString(),
    custodyChain: [
      { action: 'uploaded', performedBy: `analyst-${(hash % 5) + 1}`, timestamp: new Date(baseTime + 28800000).toISOString(), details: 'Investigation documentation' }
    ]
  });

  return evidence;
};

const generateCaseNotes = (caseId: string, assignedTo: string | undefined, createdAt: string): CaseNote[] => {
  const baseTime = new Date(createdAt).getTime();
  const analyst = assignedTo || 'analyst-1';
  const notes: CaseNote[] = [
    {
      id: `note-${caseId}-1`,
      caseId,
      authorId: analyst,
      authorName: analyst.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: 'Initial review completed. Transaction patterns show unusual velocity and amount distribution. Proceeding with deeper investigation into linked accounts.',
      timestamp: new Date(baseTime + 7200000).toISOString(),
      type: 'comment'
    },
    {
      id: `note-${caseId}-2`,
      caseId,
      authorId: 'system',
      authorName: 'System',
      content: 'Automated risk assessment attached. ML model confidence: 87%. Top contributing factors: velocity anomaly, geographic mismatch, device fingerprint change.',
      timestamp: new Date(baseTime + 600000).toISOString(),
      type: 'evidence'
    },
    {
      id: `note-${caseId}-3`,
      caseId,
      authorId: analyst,
      authorName: analyst.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: 'Contacted customer via secure channel. Customer denies transactions. Initiating chargeback process and flagging account for enhanced monitoring.',
      timestamp: new Date(baseTime + 14400000).toISOString(),
      type: 'action_taken',
      mentions: ['compliance-team']
    }
  ];
  return notes;
};

export const generateCases = (alerts: Alert[]): Case[] => {
  const cases: Case[] = [];
  const groupedAlerts = new Map<string, Alert[]>();
  
  alerts.forEach(a => {
    const existing = groupedAlerts.get(a.customerId) || [];
    existing.push(a);
    groupedAlerts.set(a.customerId, existing);
  });
  
  let caseCount = 0;
  groupedAlerts.forEach((customerAlerts, customerId) => {
    if (customerAlerts.length >= 2 && caseCount < 20) {
      const caseId = `CASE-${generateId().toUpperCase()}`;
      const status: CaseStatus = randomItem(['open', 'in_review', 'closed']);
      const assignedTo = `analyst-${randomRange(1, 5)}`;
      const createdAt = customerAlerts[0].createdAt;
      const caseType: CaseType = randomItem(['fraud', 'aml', 'mixed']);
      cases.push({
        id: caseId,
        type: caseType,
        alertIds: customerAlerts.slice(0, 5).map(a => a.id),
        transactionIds: customerAlerts.slice(0, 5).map(a => a.transactionId),
        customerId,
        assignedTo,
        priority: randomItem(['medium', 'high', 'critical']),
        status,
        createdAt,
        updatedAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + randomRange(1, 7) * 24 * 60 * 60 * 1000).toISOString(),
        tags: randomItem([['velocity', 'high-amount'], ['geographic', 'new-device'], ['structuring', 'aml']]),
        notes: generateCaseNotes(caseId, assignedTo, createdAt),
        timeline: generateCaseTimeline(caseId, createdAt, status, assignedTo, customerAlerts.length),
        linkedEntities: generateLinkedEntities(caseId, caseType),
        evidence: generateEvidence(caseId, createdAt),
        description: `Investigation into suspicious ${caseType} activity for customer ${customerId}`
      });
      caseCount++;
    }
  });

  if (cases.length === 0) {
    const fallbackAlerts = alerts.slice(0, Math.min(alerts.length, 10));
    const statuses: CaseStatus[] = ['open', 'in_review', 'escalated', 'closed', 'open'];
    const types: CaseType[] = ['fraud', 'aml', 'mixed', 'fraud', 'aml'];
    const priorities: RiskLevel[] = ['critical', 'high', 'medium', 'high', 'critical'];
    const tagSets = [
      ['velocity', 'high-amount'],
      ['geographic', 'new-device'],
      ['structuring', 'aml'],
      ['card-testing', 'bot-detected'],
      ['cross-border', 'pep-linked']
    ];

    for (let i = 0; i < 5; i++) {
      const alert = fallbackAlerts[i % fallbackAlerts.length];
      const caseId = `CASE-${(1001 + i).toString()}`;
      const createdAt = new Date(Date.now() - randomRange(1, 14) * 24 * 60 * 60 * 1000).toISOString();
      const assignedTo = `analyst-${i + 1}`;
      cases.push({
        id: caseId,
        type: types[i],
        alertIds: alert ? [alert.id] : [`ALR-FALLBACK-${i}`],
        transactionIds: alert ? [alert.transactionId] : [`TXN-FALLBACK-${i}`],
        customerId: alert?.customerId || `CUST-${randomRange(1000, 9999)}`,
        assignedTo,
        priority: priorities[i],
        status: statuses[i],
        createdAt,
        updatedAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + randomRange(1, 7) * 24 * 60 * 60 * 1000).toISOString(),
        tags: tagSets[i],
        notes: generateCaseNotes(caseId, assignedTo, createdAt),
        timeline: generateCaseTimeline(caseId, createdAt, statuses[i], assignedTo, 1),
        linkedEntities: generateLinkedEntities(caseId, types[i]),
        evidence: generateEvidence(caseId, createdAt),
        description: `Investigation into suspicious ${types[i]} activity`
      });
    }
  }
  
  return cases;
};

// Generate customers
export const generateCustomers = (count: number = 50): Customer[] => {
  const customers: Customer[] = [];
  const occupations = ['Software Engineer', 'Doctor', 'Teacher', 'Business Owner', 'Student', 'Retired', 'Lawyer', 'Accountant'];
  
  for (let i = 0; i < count; i++) {
    const countryIndex = randomRange(0, countries.length - 1);
    customers.push({
      id: `CUST-${randomRange(1000, 9999)}`,
      name: `Customer ${i + 1}`,
      email: `customer${i + 1}@example.com`,
      phone: `+1-${randomRange(100, 999)}-${randomRange(100, 999)}-${randomRange(1000, 9999)}`,
      accountAge: randomRange(1, 120),
      totalTransactions: randomRange(10, 500),
      avgTransactionAmount: parseFloat((Math.random() * 500 + 50).toFixed(2)),
      riskProfile: randomItem(['low', 'low', 'low', 'medium', 'high']),
      country: countries[countryIndex],
      occupation: randomItem(occupations),
      isPep: Math.random() < 0.05,
      lastActivity: new Date(Date.now() - randomRange(0, 30) * 24 * 60 * 60 * 1000).toISOString()
    });
  }
  
  return customers;
};

export const generateRules = (): Rule[] => [
  {
    id: 'RULE-001',
    name: 'High Amount Single Transaction',
    description: 'Flag transactions exceeding $10,000 from any channel',
    type: 'amount',
    category: 'fraud',
    condition: 'amount > 10000',
    threshold: 10000,
    priority: 1,
    isActive: true,
    severity: 'high',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2025-11-20T00:00:00Z',
    triggeredCount: 245,
    currentVersion: 2,
    conditionGroup: {
      id: 'cg-001',
      logic: 'AND',
      conditions: [
        { id: 'c-001-1', field: 'amount', operator: 'greater_than', value: 10000 },
        { id: 'c-001-2', field: 'risk_score', operator: 'greater_equal', value: 30 }
      ]
    },
    actions: [
      { type: 'flag' },
      { type: 'alert', config: { team: 'fraud-ops' } }
    ],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-001-v1', logic: 'AND', conditions: [{ id: 'c-v1-1', field: 'amount', operator: 'greater_than', value: 10000 }] }, actions: [{ type: 'flag' }], severity: 'medium', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial rule creation' },
      { version: 2, conditionGroup: { id: 'cg-001', logic: 'AND', conditions: [{ id: 'c-001-1', field: 'amount', operator: 'greater_than', value: 10000 }, { id: 'c-001-2', field: 'risk_score', operator: 'greater_equal', value: 30 }] }, actions: [{ type: 'flag' }, { type: 'alert', config: { team: 'fraud-ops' } }], severity: 'high', changedBy: 'analyst-1', changedAt: '2025-11-20T00:00:00Z', changeNote: 'Added risk score threshold and alert action' }
    ],
    auditLog: [
      { id: 'a-001-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'Rule created with amount > $10,000 condition' },
      { id: 'a-001-2', action: 'updated', performedBy: 'analyst-1', timestamp: '2025-11-20T00:00:00Z', details: 'Added risk score condition and alert action' }
    ]
  },
  {
    id: 'RULE-002',
    name: 'Velocity Check - Hourly',
    description: 'More than 5 transactions from same customer in 1 hour',
    type: 'velocity',
    category: 'fraud',
    condition: 'velocity_count > 5 within 1h',
    threshold: 5,
    priority: 2,
    isActive: true,
    severity: 'medium',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    triggeredCount: 156,
    currentVersion: 1,
    conditionGroup: {
      id: 'cg-002',
      logic: 'AND',
      conditions: [
        { id: 'c-002-1', field: 'velocity_count', operator: 'greater_than', value: 5, timeWindow: { value: 1, unit: 'hours' }, entityScope: 'customer' }
      ]
    },
    actions: [{ type: 'flag' }, { type: 'require_review' }],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-002', logic: 'AND', conditions: [{ id: 'c-002-1', field: 'velocity_count', operator: 'greater_than', value: 5, timeWindow: { value: 1, unit: 'hours' }, entityScope: 'customer' }] }, actions: [{ type: 'flag' }, { type: 'require_review' }], severity: 'medium', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial creation' }
    ],
    auditLog: [
      { id: 'a-002-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'Velocity check rule created' }
    ]
  },
  {
    id: 'RULE-003',
    name: 'Impossible Travel',
    description: 'Transactions from distant locations within short time window',
    type: 'geographic',
    category: 'fraud',
    condition: 'country != last_country AND time_diff < 1h',
    threshold: 500,
    priority: 1,
    isActive: true,
    severity: 'critical',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-06-10T00:00:00Z',
    triggeredCount: 34,
    currentVersion: 2,
    conditionGroup: {
      id: 'cg-003',
      logic: 'AND',
      conditions: [
        { id: 'cg-003-nested', logic: 'OR', conditions: [
          { id: 'c-003-1', field: 'country', operator: 'not_equals', value: 'last_country' },
          { id: 'c-003-2', field: 'ip_address', operator: 'not_equals', value: 'last_ip' }
        ] } satisfies RuleConditionGroup,
        { id: 'c-003-3', field: 'amount', operator: 'greater_than', value: 500 }
      ]
    },
    actions: [{ type: 'block' }, { type: 'alert', config: { team: 'fraud-ops' } }, { type: 'escalate' }],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-003-v1', logic: 'AND', conditions: [{ id: 'c-003-v1-1', field: 'country', operator: 'not_equals', value: 'last_country' }] }, actions: [{ type: 'flag' }], severity: 'high', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial rule' },
      { version: 2, conditionGroup: { id: 'cg-003', logic: 'AND', conditions: [{ id: 'cg-003-nested', logic: 'OR' as const, conditions: [{ id: 'c-003-1', field: 'country', operator: 'not_equals', value: 'last_country' }, { id: 'c-003-2', field: 'ip_address', operator: 'not_equals', value: 'last_ip' }] }, { id: 'c-003-3', field: 'amount', operator: 'greater_than', value: 500 }] }, actions: [{ type: 'block' }, { type: 'alert', config: { team: 'fraud-ops' } }, { type: 'escalate' }], severity: 'critical', changedBy: 'analyst-2', changedAt: '2024-06-10T00:00:00Z', changeNote: 'Added IP check and block action' }
    ],
    auditLog: [
      { id: 'a-003-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'Impossible travel rule created' },
      { id: 'a-003-2', action: 'updated', performedBy: 'analyst-2', timestamp: '2024-06-10T00:00:00Z', details: 'Enhanced with IP address check and block action' },
      { id: 'a-003-3', action: 'simulated', performedBy: 'analyst-2', timestamp: '2024-06-09T00:00:00Z', details: 'Simulation run: 34 hits in 10,000 transactions (0.34% hit rate)' }
    ]
  },
  {
    id: 'RULE-004',
    name: 'Structuring Detection',
    description: 'Multiple transactions just below $10,000 reporting threshold',
    type: 'amount',
    category: 'aml',
    condition: 'amount BETWEEN 9000 AND 10000 AND count > 3 in 24h',
    threshold: 3,
    priority: 1,
    isActive: true,
    severity: 'critical',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    triggeredCount: 89,
    currentVersion: 1,
    conditionGroup: {
      id: 'cg-004',
      logic: 'AND',
      conditions: [
        { id: 'c-004-1', field: 'amount', operator: 'between', value: 9000, secondaryValue: 10000 },
        { id: 'c-004-2', field: 'velocity_count', operator: 'greater_than', value: 3, timeWindow: { value: 24, unit: 'hours' }, entityScope: 'customer' }
      ]
    },
    actions: [{ type: 'flag' }, { type: 'escalate' }, { type: 'notify', config: { team: 'aml-compliance' } }],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-004', logic: 'AND', conditions: [{ id: 'c-004-1', field: 'amount', operator: 'between', value: 9000, secondaryValue: 10000 }, { id: 'c-004-2', field: 'velocity_count', operator: 'greater_than', value: 3, timeWindow: { value: 24, unit: 'hours' }, entityScope: 'customer' }] }, actions: [{ type: 'flag' }, { type: 'escalate' }, { type: 'notify', config: { team: 'aml-compliance' } }], severity: 'critical', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial structuring detection rule' }
    ],
    auditLog: [
      { id: 'a-004-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'AML structuring detection rule created' }
    ]
  },
  {
    id: 'RULE-005',
    name: 'High-Risk Country',
    description: 'Transaction originating from FATF high-risk jurisdiction',
    type: 'geographic',
    category: 'aml',
    condition: 'country IN high_risk_countries',
    threshold: 0,
    priority: 2,
    isActive: true,
    severity: 'medium',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    triggeredCount: 178,
    currentVersion: 1,
    conditionGroup: {
      id: 'cg-005',
      logic: 'AND',
      conditions: [
        { id: 'c-005-1', field: 'country', operator: 'in', value: 'Iran,North Korea,Myanmar,Syria' }
      ]
    },
    actions: [{ type: 'flag' }, { type: 'require_review' }],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-005', logic: 'AND', conditions: [{ id: 'c-005-1', field: 'country', operator: 'in', value: 'Iran,North Korea,Myanmar,Syria' }] }, actions: [{ type: 'flag' }, { type: 'require_review' }], severity: 'medium', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial creation' }
    ],
    auditLog: [
      { id: 'a-005-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'High-risk country rule created' }
    ]
  },
  {
    id: 'RULE-006',
    name: 'New Device + High Amount',
    description: 'Transaction from unrecognized device exceeding $5,000',
    type: 'device',
    category: 'fraud',
    condition: 'is_new_device AND amount > 5000',
    threshold: 5000,
    priority: 1,
    isActive: true,
    severity: 'high',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    triggeredCount: 67,
    currentVersion: 1,
    conditionGroup: {
      id: 'cg-006',
      logic: 'AND',
      conditions: [
        { id: 'c-006-1', field: 'device_id', operator: 'equals', value: 'new_device' },
        { id: 'c-006-2', field: 'amount', operator: 'greater_than', value: 5000 }
      ]
    },
    actions: [{ type: 'flag' }, { type: 'alert', config: { team: 'fraud-ops' } }],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-006', logic: 'AND', conditions: [{ id: 'c-006-1', field: 'device_id', operator: 'equals', value: 'new_device' }, { id: 'c-006-2', field: 'amount', operator: 'greater_than', value: 5000 }] }, actions: [{ type: 'flag' }, { type: 'alert', config: { team: 'fraud-ops' } }], severity: 'high', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial creation' }
    ],
    auditLog: [
      { id: 'a-006-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'New device high amount rule created' }
    ]
  },
  {
    id: 'RULE-007',
    name: 'After Hours High-Value',
    description: 'High-value transaction between 2 AM and 5 AM local time',
    type: 'time',
    category: 'fraud',
    condition: 'time_hour BETWEEN 2 AND 5 AND amount > 1000',
    threshold: 1000,
    priority: 3,
    isActive: false,
    severity: 'low',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2025-08-01T00:00:00Z',
    triggeredCount: 123,
    currentVersion: 1,
    conditionGroup: {
      id: 'cg-007',
      logic: 'AND',
      conditions: [
        { id: 'c-007-1', field: 'time_hour', operator: 'between', value: 2, secondaryValue: 5 },
        { id: 'c-007-2', field: 'amount', operator: 'greater_than', value: 1000 }
      ]
    },
    actions: [{ type: 'flag' }],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-007', logic: 'AND', conditions: [{ id: 'c-007-1', field: 'time_hour', operator: 'between', value: 2, secondaryValue: 5 }, { id: 'c-007-2', field: 'amount', operator: 'greater_than', value: 1000 }] }, actions: [{ type: 'flag' }], severity: 'low', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial creation' }
    ],
    auditLog: [
      { id: 'a-007-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'After hours rule created' },
      { id: 'a-007-2', action: 'deactivated', performedBy: 'analyst-3', timestamp: '2025-08-01T00:00:00Z', details: 'Disabled due to high false positive rate' }
    ]
  },
  {
    id: 'RULE-008',
    name: 'Rapid Fund Movement',
    description: 'Large inbound followed by rapid outbound within 30 minutes',
    type: 'velocity',
    category: 'aml',
    condition: 'velocity_count > 2 within 30m AND amount > 5000',
    threshold: 0.9,
    priority: 1,
    isActive: true,
    severity: 'critical',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    triggeredCount: 45,
    currentVersion: 1,
    conditionGroup: {
      id: 'cg-008',
      logic: 'AND',
      conditions: [
        { id: 'c-008-1', field: 'velocity_count', operator: 'greater_than', value: 2, timeWindow: { value: 30, unit: 'minutes' }, entityScope: 'account' },
        { id: 'c-008-2', field: 'amount', operator: 'greater_than', value: 5000 }
      ]
    },
    actions: [{ type: 'block' }, { type: 'escalate' }, { type: 'notify', config: { team: 'aml-compliance' } }],
    versions: [
      { version: 1, conditionGroup: { id: 'cg-008', logic: 'AND', conditions: [{ id: 'c-008-1', field: 'velocity_count', operator: 'greater_than', value: 2, timeWindow: { value: 30, unit: 'minutes' }, entityScope: 'account' }, { id: 'c-008-2', field: 'amount', operator: 'greater_than', value: 5000 }] }, actions: [{ type: 'block' }, { type: 'escalate' }, { type: 'notify', config: { team: 'aml-compliance' } }], severity: 'critical', changedBy: 'admin', changedAt: '2024-01-15T00:00:00Z', changeNote: 'Initial rapid fund movement rule' }
    ],
    auditLog: [
      { id: 'a-008-1', action: 'created', performedBy: 'admin', timestamp: '2024-01-15T00:00:00Z', details: 'Rapid fund movement rule created' }
    ]
  }
];

// Generate ML models
export const generateModels = (): MLModel[] => [
  {
    id: 'MODEL-001',
    name: 'Logistic Regression Baseline',
    type: 'logistic_regression',
    version: 'v1.2.0',
    trainedAt: '2024-01-10T00:00:00Z',
    trainingDataSize: 50000,
    featuresUsed: ['amount', 'velocity_1h', 'velocity_24h', 'geo_distance', 'time_of_day', 'is_new_device'],
    metrics: {
      accuracy: 0.92,
      precision: 0.85,
      recall: 0.78,
      f1Score: 0.81,
      aucRoc: 0.89,
      falsePositiveRate: 0.05,
      truePositiveRate: 0.78
    },
    isActive: false
  },
  {
    id: 'MODEL-002',
    name: 'Random Forest Classifier',
    type: 'random_forest',
    version: 'v2.1.0',
    trainedAt: '2024-01-15T00:00:00Z',
    trainingDataSize: 75000,
    featuresUsed: ['amount', 'velocity_1h', 'velocity_24h', 'geo_distance', 'time_of_day', 'is_new_device', 'merchant_risk', 'device_age', 'customer_tenure'],
    metrics: {
      accuracy: 0.94,
      precision: 0.88,
      recall: 0.82,
      f1Score: 0.85,
      aucRoc: 0.93,
      falsePositiveRate: 0.04,
      truePositiveRate: 0.82
    },
    isActive: false
  },
  {
    id: 'MODEL-003',
    name: 'XGBoost Production Model',
    type: 'xgboost',
    version: 'v2.3.1',
    trainedAt: '2024-01-20T00:00:00Z',
    trainingDataSize: 100000,
    featuresUsed: ['amount', 'velocity_1h', 'velocity_6h', 'velocity_24h', 'geo_distance', 'time_of_day', 'day_of_week', 'is_new_device', 'is_new_ip', 'merchant_risk', 'device_age', 'customer_tenure', 'avg_amount_30d', 'stddev_amount_30d', 'channel_frequency'],
    metrics: {
      accuracy: 0.96,
      precision: 0.91,
      recall: 0.87,
      f1Score: 0.89,
      aucRoc: 0.95,
      falsePositiveRate: 0.03,
      truePositiveRate: 0.87
    },
    isActive: true
  },
  {
    id: 'MODEL-004',
    name: 'Isolation Forest Anomaly',
    type: 'isolation_forest',
    version: 'v1.5.0',
    trainedAt: '2024-01-18T00:00:00Z',
    trainingDataSize: 100000,
    featuresUsed: ['amount', 'velocity_1h', 'geo_distance', 'time_of_day', 'transaction_frequency'],
    metrics: {
      accuracy: 0.88,
      precision: 0.75,
      recall: 0.92,
      f1Score: 0.83,
      aucRoc: 0.90,
      falsePositiveRate: 0.08,
      truePositiveRate: 0.92
    },
    isActive: true
  }
];

// Generate dashboard stats
export const generateDashboardStats = (): DashboardStats => ({
  totalTransactions: 1247893,
  transactionsToday: 3456,
  totalVolume: 45678901234,
  volumeToday: 12567890,
  fraudDetectionRate: 94.5,
  falsePositiveRate: 3.2,
  openAlerts: 47,
  openCases: 12,
  amountSaved: 2345678,
  avgResolutionTime: 4.5
});

// Generate time series data for charts
export const generateTimeSeriesData = (days: number = 7, metric: 'transactions' | 'volume' | 'fraud_rate' | 'alerts'): TimeSeriesData[] => {
  const data: TimeSeriesData[] = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    let value: number;
    
    switch (metric) {
      case 'transactions':
        value = randomRange(2500, 4000);
        break;
      case 'volume':
        value = randomRange(8000000, 15000000);
        break;
      case 'fraud_rate':
        value = parseFloat((Math.random() * 2 + 2).toFixed(2));
        break;
      case 'alerts':
        value = randomRange(30, 80);
        break;
      default:
        value = randomRange(100, 500);
    }
    
    data.push({
      timestamp: date.toISOString(),
      value,
      label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    });
  }
  
  return data;
};

// Generate hourly data for intraday charts
export const generateHourlyData = (hours: number = 24): TimeSeriesData[] => {
  const data: TimeSeriesData[] = [];
  const now = new Date();
  
  for (let i = hours - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 60 * 60 * 1000);
    data.push({
      timestamp: date.toISOString(),
      value: randomRange(100, 250),
      label: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
  }
  
  return data;
};

// Distribution data
export const getRiskDistribution = (): { name: string; value: number; color: string }[] => [
  { name: 'Low', value: 60, color: 'hsl(var(--risk-low))' },
  { name: 'Medium', value: 25, color: 'hsl(var(--risk-medium))' },
  { name: 'High', value: 10, color: 'hsl(var(--risk-high))' },
  { name: 'Critical', value: 5, color: 'hsl(var(--risk-critical))' }
];

export const getChannelDistribution = (): { name: string; value: number }[] => [
  { name: 'POS', value: 35 },
  { name: 'Mobile', value: 28 },
  { name: 'Web', value: 22 },
  { name: 'ATM', value: 10 },
  { name: 'Branch', value: 5 }
];

// ==================== IAM MOCK DATA ====================

const IAM_USERS_DATA: Array<{
  name: string; email: string; roles: UserRole[]; privilegeLevel: PrivilegeLevel;
  status: UserStatus; department: string; team: string; title: string;
  mfaEnabled: boolean; ssoProvider: SSOProvider; authMethod: 'local' | 'sso';
  failedLogins24h: number;
}> = [
  { name: 'John Doe', email: 'john.doe@snapnet.com', roles: ['admin'], privilegeLevel: 'admin', status: 'active', department: 'Technology', team: 'Platform', title: 'System Administrator', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Sarah Smith', email: 'sarah.smith@snapnet.com', roles: ['risk_analyst'], privilegeLevel: 'elevated', status: 'active', department: 'Risk', team: 'Fraud Detection', title: 'Senior Risk Analyst', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Mike Johnson', email: 'mike.j@snapnet.com', roles: ['compliance_officer'], privilegeLevel: 'elevated', status: 'active', department: 'Compliance', team: 'Regulatory', title: 'Compliance Officer', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 1 },
  { name: 'Emily Brown', email: 'emily.b@snapnet.com', roles: ['aml_analyst'], privilegeLevel: 'standard', status: 'active', department: 'Risk', team: 'AML', title: 'AML Analyst', mfaEnabled: true, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 0 },
  { name: 'David Wilson', email: 'david.w@snapnet.com', roles: ['auditor'], privilegeLevel: 'standard', status: 'suspended', department: 'Compliance', team: 'Internal Audit', title: 'Internal Auditor', mfaEnabled: false, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 0 },
  { name: 'Lisa Chen', email: 'lisa.chen@snapnet.com', roles: ['viewer'], privilegeLevel: 'standard', status: 'active', department: 'Operations', team: 'Support', title: 'Operations Analyst', mfaEnabled: true, ssoProvider: 'okta', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Robert Taylor', email: 'robert.t@snapnet.com', roles: ['admin', 'risk_analyst'], privilegeLevel: 'admin', status: 'active', department: 'Technology', team: 'Security', title: 'Security Director', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Amanda Garcia', email: 'amanda.g@snapnet.com', roles: ['risk_analyst', 'aml_analyst'], privilegeLevel: 'elevated', status: 'active', department: 'Risk', team: 'Fraud Detection', title: 'Risk Analyst', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 2 },
  { name: 'James Lee', email: 'james.lee@snapnet.com', roles: ['compliance_officer'], privilegeLevel: 'elevated', status: 'active', department: 'Compliance', team: 'Regulatory', title: 'Senior Compliance Analyst', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Nina Patel', email: 'nina.p@snapnet.com', roles: ['aml_analyst'], privilegeLevel: 'standard', status: 'active', department: 'Risk', team: 'AML', title: 'AML Investigator', mfaEnabled: false, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 0 },
  { name: 'Carlos Rivera', email: 'carlos.r@snapnet.com', roles: ['viewer'], privilegeLevel: 'standard', status: 'invited', department: 'Operations', team: 'Support', title: 'Junior Analyst', mfaEnabled: false, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 0 },
  { name: 'Helen Park', email: 'helen.p@snapnet.com', roles: ['risk_analyst'], privilegeLevel: 'elevated', status: 'active', department: 'Risk', team: 'Fraud Detection', title: 'Lead Risk Analyst', mfaEnabled: true, ssoProvider: 'okta', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Tom Richards', email: 'tom.r@snapnet.com', roles: ['auditor'], privilegeLevel: 'standard', status: 'active', department: 'Compliance', team: 'Internal Audit', title: 'Auditor', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Diana Murphy', email: 'diana.m@snapnet.com', roles: ['admin'], privilegeLevel: 'admin', status: 'active', department: 'Technology', team: 'Platform', title: 'IT Manager', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Frank Novak', email: 'frank.n@snapnet.com', roles: ['aml_analyst'], privilegeLevel: 'standard', status: 'locked', department: 'Risk', team: 'AML', title: 'AML Analyst II', mfaEnabled: true, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 5 },
  { name: 'Grace Kim', email: 'grace.k@snapnet.com', roles: ['compliance_officer', 'auditor'], privilegeLevel: 'elevated', status: 'active', department: 'Compliance', team: 'Regulatory', title: 'Compliance Director', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Ivan Petrov', email: 'ivan.p@snapnet.com', roles: ['viewer'], privilegeLevel: 'standard', status: 'deactivated', department: 'Operations', team: 'Support', title: 'Former Contractor', mfaEnabled: false, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 0 },
  { name: 'Julia West', email: 'julia.w@snapnet.com', roles: ['risk_analyst'], privilegeLevel: 'standard', status: 'active', department: 'Risk', team: 'Fraud Detection', title: 'Risk Analyst', mfaEnabled: true, ssoProvider: 'azure_ad', authMethod: 'sso', failedLogins24h: 0 },
  { name: 'Kevin Zhao', email: 'kevin.z@snapnet.com', roles: ['aml_analyst'], privilegeLevel: 'standard', status: 'active', department: 'Risk', team: 'AML', title: 'AML Analyst', mfaEnabled: false, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 3 },
  { name: 'Maria Santos', email: 'maria.s@snapnet.com', roles: ['viewer'], privilegeLevel: 'standard', status: 'invited', department: 'Compliance', team: 'Regulatory', title: 'Regulatory Intern', mfaEnabled: false, ssoProvider: 'none', authMethod: 'local', failedLogins24h: 0 },
];

const AUDIT_ACTIONS = [
  'Viewed transaction TXN-4821', 'Created case CASE-1012', 'Updated rule RULE-003',
  'Exported compliance report', 'Investigated alert ALT-2891', 'Changed user role',
  'Approved access request', 'Downloaded evidence file', 'Ran rule simulation',
  'Viewed analytics dashboard', 'Updated case status', 'Added investigation note',
  'Linked entity to case', 'Exported audit log', 'Reset user password',
  'Terminated user session', 'Suspended user account', 'Created new user',
];

const DEVICES = ['Windows 11 / Chrome 120', 'macOS Sonoma / Safari 17', 'Windows 10 / Edge 121', 'macOS Ventura / Chrome 120', 'Ubuntu 22 / Firefox 121', 'iPad OS 17 / Safari'];
const IPS = ['192.168.1.45', '10.0.0.23', '172.16.0.88', '192.168.5.12', '10.0.1.100', '172.16.2.44', '192.168.3.67'];
const LOCATIONS = ['New York, US', 'London, UK', 'Singapore, SG', 'Toronto, CA', 'Frankfurt, DE', 'Sydney, AU', 'Mumbai, IN'];

export const generateIAMUsers = (): IAMUser[] => {
  return IAM_USERS_DATA.map((u, idx) => {
    const id = `USR-${String(idx + 1).padStart(3, '0')}`;
    const daysAgo = idx === 4 ? 30 : idx === 16 ? 60 : randomRange(0, 7);
    const hoursAgo = randomRange(1, 23);
    const lastLogin = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000).toISOString();
    const lastActivity = new Date(Date.now() - randomRange(0, 3) * 3600000 * 1000).toISOString();
    const createdDaysAgo = randomRange(60, 400);

    const sessions: UserSession[] = u.status === 'active' ? Array.from({ length: randomRange(1, 3) }, (_, si) => ({
      id: `SES-${id}-${si + 1}`,
      device: DEVICES[randomRange(0, DEVICES.length - 1)],
      browser: DEVICES[randomRange(0, DEVICES.length - 1)].split(' / ')[1] || 'Chrome',
      ipAddress: IPS[randomRange(0, IPS.length - 1)],
      location: LOCATIONS[randomRange(0, LOCATIONS.length - 1)],
      loginTime: new Date(Date.now() - randomRange(0, 48) * 3600000).toISOString(),
      lastActivity: new Date(Date.now() - randomRange(0, 4) * 3600000).toISOString(),
      isActive: si === 0,
    })) : [];

    const auditLog: UserAuditEntry[] = Array.from({ length: randomRange(5, 15) }, (_, ai) => ({
      id: `AUD-${id}-${ai + 1}`,
      action: AUDIT_ACTIONS[randomRange(0, AUDIT_ACTIONS.length - 1)],
      timestamp: new Date(Date.now() - randomRange(0, 30) * 86400000 - randomRange(0, 23) * 3600000).toISOString(),
      ipAddress: IPS[randomRange(0, IPS.length - 1)],
      details: AUDIT_ACTIONS[randomRange(0, AUDIT_ACTIONS.length - 1)],
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const approvals: AccessApproval[] = u.privilegeLevel !== 'standard' ? [{
      id: `APR-${id}-1`,
      requestedRole: u.roles[0],
      requestedBy: u.name,
      requestedAt: new Date(Date.now() - createdDaysAgo * 86400000 + 86400000).toISOString(),
      approver: 'John Doe',
      approvedAt: new Date(Date.now() - createdDaysAgo * 86400000 + 172800000).toISOString(),
      status: 'approved' as const,
      reason: `Role required for ${u.title} responsibilities`,
    }] : [];

    return {
      id,
      email: u.email,
      name: u.name,
      roles: u.roles,
      privilegeLevel: u.privilegeLevel,
      status: u.status,
      department: u.department,
      team: u.team,
      title: u.title,
      mfaEnabled: u.mfaEnabled,
      ssoProvider: u.ssoProvider,
      authMethod: u.authMethod,
      lastLogin,
      lastLoginIp: IPS[randomRange(0, IPS.length - 1)],
      lastLoginLocation: LOCATIONS[randomRange(0, LOCATIONS.length - 1)],
      lastLoginDevice: DEVICES[randomRange(0, DEVICES.length - 1)],
      lastActivity,
      lastActivityAction: AUDIT_ACTIONS[randomRange(0, AUDIT_ACTIONS.length - 1)],
      failedLogins24h: u.failedLogins24h,
      createdAt: new Date(Date.now() - createdDaysAgo * 86400000).toISOString(),
      createdBy: idx === 0 ? 'System' : 'John Doe',
      sessions,
      auditLog,
      approvals,
    };
  });
};

export const generateRoleDefinitions = (): RoleDefinition[] => {
  const allPerms = Object.values(PERMISSION_GROUPS).flat();
  return [
    { id: 'role-admin', name: 'admin', label: 'Admin', description: 'Full system access including user management, configuration, and all operational capabilities', privilegeLevel: 'admin', permissions: allPerms, userCount: 3 },
    { id: 'role-risk', name: 'risk_analyst', label: 'Risk Analyst', description: 'Alert investigation, case management, rule creation, and fraud detection operations', privilegeLevel: 'elevated', permissions: ['view_live_monitoring', 'export_monitoring_data', 'view_alerts', 'manage_alerts', 'view_cases', 'manage_cases', 'create_cases', 'view_rules', 'create_rules', 'edit_rules', 'simulate_rules', 'view_analytics', 'export_reports', 'view_dashboards', 'view_fraud_register', 'log_fraud_incident'], userCount: 4 },
    { id: 'role-compliance', name: 'compliance_officer', label: 'Compliance Officer', description: 'SAR/STR filing, regulatory reporting, audit access, and compliance monitoring', privilegeLevel: 'elevated', permissions: ['view_live_monitoring', 'view_alerts', 'view_cases', 'manage_cases', 'view_rules', 'view_analytics', 'export_reports', 'view_dashboards', 'view_audit_logs', 'view_reports', 'file_reports', 'view_fraud_register'], userCount: 3 },
    { id: 'role-aml', name: 'aml_analyst', label: 'AML Analyst', description: 'Anti-money laundering investigation, suspicious activity monitoring, and AML case management', privilegeLevel: 'standard', permissions: ['view_live_monitoring', 'view_alerts', 'manage_alerts', 'view_cases', 'manage_cases', 'create_cases', 'view_rules', 'view_analytics', 'view_dashboards', 'view_reports', 'view_fraud_register', 'log_fraud_incident'], userCount: 4 },
    { id: 'role-ml-engineer', name: 'ml_engineer', label: 'ML Engineer', description: 'Model training, retraining, evaluation, and deployment of fraud/AML detection models', privilegeLevel: 'elevated', permissions: ['view_live_monitoring', 'view_alerts', 'view_cases', 'view_rules', 'view_analytics', 'view_dashboards', 'view_models', 'retrain_models', 'deploy_models'], userCount: 1 },
    { id: 'role-auditor', name: 'auditor', label: 'Auditor', description: 'Read-only access to audit trails, compliance reports, and system activity logs', privilegeLevel: 'standard', permissions: ['view_live_monitoring', 'view_alerts', 'view_cases', 'view_rules', 'view_analytics', 'export_reports', 'view_dashboards', 'view_audit_logs', 'view_reports', 'view_fraud_register'], userCount: 3 },
    { id: 'role-viewer', name: 'viewer', label: 'Viewer', description: 'Basic read-only access to dashboards and monitoring views', privilegeLevel: 'standard', permissions: ['view_live_monitoring', 'view_alerts', 'view_cases', 'view_analytics', 'view_dashboards'], userCount: 4 },
  ];
};

/**
 * Canonical demo accounts — one per business role. Seeded on every boot via
 * `reconcileDemoAccounts()` in server/seed.ts so the user-switcher in the
 * header always has a stable set of role-based accounts to act as.
 */
/**
 * Names of roles that are reconciled on every server boot from
 * `generateRoleDefinitions()`. Any role NOT in this set is treated as
 * an admin-created custom role and is left untouched by the reconciler
 * (so its label / description / permissionKeys persist across restarts).
 * Used by the Roles editor UI to lock canonical rows against deletion.
 */
export const CANONICAL_ROLE_NAMES: readonly UserRole[] = [
  'admin', 'risk_analyst', 'compliance_officer', 'aml_analyst',
  'ml_engineer', 'auditor', 'viewer',
] as const;

export const CANONICAL_DEMO_ACCOUNTS: Array<{
  id: string; email: string; name: string; role: UserRole; title: string; department: string;
}> = [
  { id: 'USR-DEMO-ADMIN',      email: 'admin@snapfort.demo',      name: 'Demo Admin',             role: 'admin',              title: 'System Administrator',  department: 'Technology' },
  { id: 'USR-DEMO-RISK',       email: 'risk@snapfort.demo',       name: 'Demo Risk Analyst',      role: 'risk_analyst',       title: 'Senior Risk Analyst',   department: 'Risk' },
  { id: 'USR-DEMO-COMPLIANCE', email: 'compliance@snapfort.demo', name: 'Demo Compliance Officer',role: 'compliance_officer', title: 'Compliance Officer',    department: 'Compliance' },
  { id: 'USR-DEMO-AML',        email: 'aml@snapfort.demo',        name: 'Demo AML Analyst',       role: 'aml_analyst',        title: 'AML Analyst',           department: 'Risk' },
  { id: 'USR-DEMO-MLENG',      email: 'ml@snapfort.demo',         name: 'Demo ML Engineer',       role: 'ml_engineer',        title: 'ML Engineer',           department: 'Data Science' },
  { id: 'USR-DEMO-AUDITOR',    email: 'auditor@snapfort.demo',    name: 'Demo Auditor',           role: 'auditor',            title: 'Internal Auditor',      department: 'Compliance' },
  { id: 'USR-DEMO-VIEWER',     email: 'viewer@snapfort.demo',     name: 'Demo Viewer',            role: 'viewer',             title: 'Read-only Observer',    department: 'Operations' },
];

// Initialize all mock data
export const initializeMockData = () => {
  const transactions = generateTransactions(200);
  const alerts = generateAlerts(transactions);
  const cases = generateCases(alerts);
  const customers = generateCustomers(50);
  const rules = generateRules();
  const models = generateModels();
  const stats = generateDashboardStats();
  const iamUsers = generateIAMUsers();
  const roleDefinitions = generateRoleDefinitions();
  
  return {
    transactions,
    alerts,
    cases,
    customers,
    rules,
    models,
    stats,
    iamUsers,
    roleDefinitions
  };
};

let _cachedData: ReturnType<typeof initializeMockData> | null = null;

export const getCachedMockData = () => {
  if (!_cachedData) {
    _cachedData = initializeMockData();
  }
  return _cachedData;
};

const MOCK_DATA_EVENT = 'snapfort:mock-data-changed';

export const notifyMockDataChanged = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MOCK_DATA_EVENT));
  }
};

export const subscribeMockData = (cb: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(MOCK_DATA_EVENT, cb);
  return () => window.removeEventListener(MOCK_DATA_EVENT, cb);
};

export const addAlertToCache = (a: Alert): void => {
  const data = getCachedMockData();
  data.alerts.unshift(a);
  notifyMockDataChanged();
};

export const updateAlertInCache = (id: string, patch: Partial<Alert>): Alert | null => {
  const data = getCachedMockData();
  const i = data.alerts.findIndex(a => a.id === id);
  if (i < 0) return null;
  data.alerts[i] = { ...data.alerts[i], ...patch, updatedAt: new Date().toISOString() };
  notifyMockDataChanged();
  return data.alerts[i];
};

export const addCaseToCache = (c: Case): void => {
  const data = getCachedMockData();
  data.cases.unshift(c);
  notifyMockDataChanged();
};

export interface AlertNote { author: string; text: string; ts: string }
const _alertNotes: Record<string, AlertNote[]> = {};

export const getAlertNotes = (alertId: string): AlertNote[] => _alertNotes[alertId] || [];

export const addAlertNote = (alertId: string, note: AlertNote): void => {
  if (!_alertNotes[alertId]) _alertNotes[alertId] = [];
  _alertNotes[alertId].push(note);
  notifyMockDataChanged();
};

export const buildAlertFromTransaction = (t: Transaction, overrides: Partial<Alert> = {}): Alert => ({
  id: `ALT-${generateId().toUpperCase()}`,
  type: 'fraud',
  transactionId: t.id,
  customerId: t.customerId,
  riskScore: t.riskScore,
  severity: t.riskLevel === 'low' ? 'medium' : t.riskLevel,
  status: 'open',
  assignedTo: undefined,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolution: 'pending',
  contributingFactors: t.rulesTriggered.length ? t.rulesTriggered : ['Manual review requested'],
  modelVersion: 'v2.3.1',
  ruleIds: [],
  description: `Manually-created alert from transaction ${t.id}: ${t.description}`,
  ...overrides,
});

export const buildCaseFromAlert = (a: Alert, overrides: Partial<Case> = {}): Case => {
  const now = new Date().toISOString();
  return {
    id: `CASE-${generateId().toUpperCase()}`,
    type: a.type === 'aml' || a.type === 'pep_match' || a.type === 'sanction' ? 'aml' : 'fraud',
    alertIds: [a.id],
    transactionIds: a.transactionId ? [a.transactionId] : [],
    customerId: a.customerId,
    assignedTo: a.assignedTo,
    priority: a.severity,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    tags: ['from-alert'],
    notes: [],
    timeline: [{
      id: `TL-${generateId().toUpperCase()}`,
      type: 'case_created',
      title: 'Case created',
      description: `Case created from alert ${a.id}`,
      performedBy: a.assignedTo || 'analyst-1',
      timestamp: now,
    }],
    linkedEntities: [],
    evidence: [],
    description: a.description,
    ...overrides,
  } as Case;
};

export const buildCaseFromTransaction = (t: Transaction, overrides: Partial<Case> = {}): Case => {
  const now = new Date().toISOString();
  return {
    id: `CASE-${generateId().toUpperCase()}`,
    type: t.amount > 10000 ? 'aml' : 'fraud',
    alertIds: [],
    transactionIds: [t.id],
    customerId: t.customerId,
    assignedTo: undefined,
    priority: t.riskLevel === 'low' ? 'medium' : t.riskLevel,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    tags: ['from-transaction'],
    notes: [],
    timeline: [{
      id: `TL-${generateId().toUpperCase()}`,
      type: 'case_created',
      title: 'Case created',
      description: `Case opened from transaction ${t.id}`,
      performedBy: 'analyst-1',
      timestamp: now,
    }],
    linkedEntities: [],
    evidence: [],
    description: `Investigation opened for transaction ${t.id}: ${t.description}`,
    ...overrides,
  } as Case;
};
