// SnapFort Compliance / KYC / KYB / AML data layer (mock, client-side)
// CBN / NFIU compliant data shapes
import type { Alert, RiskLevel as TRiskLevel, AlertStatus } from '../types';

export type RiskLevel = 'low' | 'medium' | 'high';
export type KycStatus = 'verified' | 'pending' | 'failed' | 'rejected' | 'expired';
export type EddStatus = 'not_required' | 'required' | 'in_progress' | 'approved' | 'rejected';
export type ScreeningType = 'pep' | 'sanction' | 'adverse_media' | 'watchlist';
export type ReportType = 'STR' | 'CTR';
export type ReportStatus = 'draft' | 'pending_review' | 'submitted' | 'acknowledged' | 'rejected';
export type FraudRegisterStatus = 'open' | 'investigating' | 'recovered' | 'written_off' | 'closed';

export interface IndividualKyc {
  id: string;
  type: 'individual';
  fullName: string;
  dob: string;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  address: { street: string; city: string; state: string; country: string; geo: { lat: number; lng: number } };
  bvn: string;
  nin?: string;
  idType: 'NIN' | 'Passport' | 'DriversLicense' | 'VotersCard';
  idNumber: string;
  documents: KycDocument[];
  faceMatchScore: number;
  identityConfidenceScore: number;
  kycStatus: KycStatus;
  riskLevel: RiskLevel;
  pepFlag: boolean;
  sanctionFlag: boolean;
  fraudRiskFlag: boolean;
  occupation: string;
  sourceOfFunds: string;
  expectedMonthlyVolume: number;
  expectedTransactionTypes: string[];
  onboardedAt: string;
  lastReviewedAt: string;
  eddStatus: EddStatus;
  accountNumber: string;
  channelUsage: { web: number; mobile: number; pos: number; atm: number; branch: number };
  totalTransactions: number;
  totalVolume: number;
}

export interface BusinessKyb {
  id: string;
  type: 'business';
  companyName: string;
  cacNumber: string;
  tin: string;
  industry: string;
  registrationDate: string;
  businessAddress: { street: string; city: string; state: string; country: string };
  contactEmail: string;
  contactPhone: string;
  directors: Director[];
  ubos: UBO[];
  documents: KycDocument[];
  identityConfidenceScore: number;
  kycStatus: KycStatus;
  riskLevel: RiskLevel;
  pepFlag: boolean;
  sanctionFlag: boolean;
  fraudRiskFlag: boolean;
  expectedMonthlyVolume: number;
  expectedTransactionTypes: string[];
  sourceOfFunds: string;
  onboardedAt: string;
  lastReviewedAt: string;
  eddStatus: EddStatus;
  accountNumber: string;
  totalTransactions: number;
  totalVolume: number;
}

export interface Director {
  name: string;
  bvn: string;
  position: string;
  shareholdingPct: number;
  pepFlag: boolean;
}

export interface UBO {
  name: string;
  bvn: string;
  ownershipPct: number;
  pepFlag: boolean;
}

export interface KycDocument {
  id: string;
  name: string;
  type: 'id' | 'cac' | 'utility' | 'tax' | 'incorporation' | 'address_proof' | 'selfie' | 'kyc_doc' | 'other';
  uploadedAt: string;
  verified: boolean;
  url?: string;
  storageKey?: string;
  dataUrl?: string;
  size?: number;
  mime?: string;
}

export type Customer = IndividualKyc | BusinessKyb;

export interface ScreeningMatch {
  id: string;
  customerId: string;
  customerName: string;
  customerType: 'individual' | 'business';
  screeningType: ScreeningType;
  matchedName: string;
  matchedListSource: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'alias';
  jurisdiction: string;
  positionOrRole?: string;
  status: 'open' | 'true_positive' | 'false_positive' | 'under_review';
  detectedAt: string;
  reviewedBy?: string;
  notes?: string;
  actionRequired: boolean;
  details: string;
}

export interface RegulatoryReport {
  id: string;
  type: ReportType;
  customerId: string;
  customerName: string;
  customerType: 'individual' | 'business';
  amount: number;
  currency: string;
  transactionIds: string[];
  reason: string;
  narrative: string;
  status: ReportStatus;
  createdAt: string;
  deadline: string;
  submittedAt?: string;
  acknowledgedAt?: string;
  submittedBy?: string;
  preparedBy: string;
  reviewedBy?: string;
  attachments: number;
  flagsTriggered: string[];
  jurisdiction: string;
  regulatoryRef?: string;
}

export interface FraudRegisterEntry {
  id: string;
  incidentDate: string;
  reportedDate: string;
  customerId: string;
  customerName: string;
  accountNumber: string;
  fraudType: 'card_fraud' | 'wire_fraud' | 'identity_theft' | 'phishing' | 'account_takeover' | 'merchant_fraud' | 'mule_account' | 'cheque_fraud' | 'sim_swap';
  channel: string;
  amountLost: number;
  amountSaved: number;
  amountRecovered: number;
  status: FraudRegisterStatus;
  description: string;
  perpetrator?: string;
  linkedAccounts: string[];
  linkedCases: string[];
  resolutionNotes?: string;
  reportedToCbn: boolean;
  reportedToNibss: boolean;
  reportedToNfiu: boolean;
  assignedTo: string;
  closedAt?: string;
  timeline?: FraudTimelineEvent[];
}

export interface FraudTimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  performedBy: string;
  timestamp: string;
}

export interface EddCase {
  id: string;
  customerId: string;
  customerName: string;
  triggerReason: string[];
  status: EddStatus;
  riskFactors: string[];
  sourceOfWealth: string;
  documentsRequired: string[];
  documentsCollected: string[];
  approvalChain: { role: string; name: string; status: 'pending' | 'approved' | 'rejected'; timestamp?: string; notes?: string }[];
  createdAt: string;
  dueDate: string;
  notes: string;
}

// =================== MOCK DATA ===================

const NIGERIAN_NAMES_M = ['Adebayo Ogunleye', 'Chinedu Okeke', 'Emeka Nwosu', 'Kunle Adeyemi', 'Bashir Mohammed', 'Tunde Adelaja', 'Ifeanyi Eze', 'Obinna Kalu', 'Yusuf Sani', 'Olamide Bakare', 'Femi Adekunle', 'Segun Owolabi', 'Idris Abdullahi', 'Chuka Onyemelukwe', 'Wale Akinwale'];
const NIGERIAN_NAMES_F = ['Aisha Bello', 'Ngozi Iwuala', 'Fatima Yakubu', 'Adaeze Nwankwo', 'Bukola Adeniyi', 'Halima Garba', 'Chioma Okafor', 'Funmi Ogundipe', 'Zainab Ibrahim', 'Yetunde Kolawole', 'Esther Ojo', 'Patience Effiong', 'Hauwa Mustafa', 'Blessing Akpan', 'Bilkisu Abubakar'];
const COMPANIES = ['Pinnacle Trading Ltd', 'Lagos Capital Holdings', 'Sahara Logistics Plc', 'Niger Delta Resources', 'Apex Microfinance', 'Coastline Maritime', 'Greenfield Agro Ltd', 'BlueOcean Forex', 'Crescent Energy Ltd', 'Pyramid Construction', 'Onyx Pharmaceuticals', 'Heritage Insurance', 'Optima Tech Solutions', 'Vanguard Real Estate', 'Stellar Ventures'];
const INDUSTRIES = ['Banking', 'Crypto/VASP', 'Real Estate', 'Oil & Gas', 'Logistics', 'Forex Bureau', 'Construction', 'Agriculture', 'Pharmaceuticals', 'Technology', 'Insurance', 'Mining'];
const NG_STATES = ['Lagos', 'Abuja', 'Rivers', 'Kano', 'Kaduna', 'Ogun', 'Oyo', 'Delta', 'Cross River', 'Anambra'];
const OCCUPATIONS = ['Trader', 'Civil Servant', 'IT Consultant', 'Doctor', 'Lawyer', 'Engineer', 'Business Owner', 'Politician', 'Real Estate Agent', 'Forex Trader', 'Senior Govt Official', 'Banker'];
const SOURCES_OF_FUNDS = ['Salary', 'Business Income', 'Investments', 'Inheritance', 'Sale of Property', 'Trading Profits', 'Dividends', 'Consulting Fees'];
const TX_TYPES = ['Wire Transfer', 'POS', 'ATM Withdrawal', 'Mobile Transfer', 'International Wire', 'Bill Payment', 'Forex'];

const PEP_LIST = [
  { name: 'Ibrahim Lawal Bello', position: 'Federal Minister', country: 'Nigeria', source: 'Domestic PEP Registry' },
  { name: 'Aminu Garba Abdullahi', position: 'State Governor', country: 'Nigeria', source: 'Domestic PEP Registry' },
  { name: 'Chinedu Okeke', position: 'Senator', country: 'Nigeria', source: 'Domestic PEP Registry' },
  { name: 'Mohammed Sani Yusuf', position: 'Deputy Governor (CBN)', country: 'Nigeria', source: 'Senior Public Officials List' },
  { name: 'Emeka Nwosu', position: 'House of Reps Member', country: 'Nigeria', source: 'NASS PEP Database' },
];

const SANCTION_LIST = [
  { name: 'Viktor Petrov', list: 'OFAC SDN', jurisdiction: 'Russia', reason: 'Financial sanctions' },
  { name: 'Kim Jong-soo', list: 'UN 1718 (DPRK)', jurisdiction: 'North Korea', reason: 'Proliferation financing' },
  { name: 'Bashar Al-Hakim', list: 'EU Restrictive Measures', jurisdiction: 'Syria', reason: 'Terrorism financing' },
  { name: 'Black Cobra Ltd', list: 'OFAC SDN', jurisdiction: 'Iran', reason: 'Trade sanctions' },
  { name: 'Pyramid Construction', list: 'NFIU Watchlist', jurisdiction: 'Nigeria', reason: 'Suspected mule entity' },
];

const RNG_SEED = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
};
const r = (seed: string, max: number) => RNG_SEED(seed) % max;
const rRange = (seed: string, min: number, max: number) => min + (RNG_SEED(seed) % (max - min + 1));
const pick = <T,>(seed: string, arr: T[]): T => arr[RNG_SEED(seed) % arr.length];

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const genBVN = (seed: string) => {
  const n = (RNG_SEED(seed) % 9_000_000_000) + 1_000_000_000;
  return n.toString().slice(0, 11).padStart(11, '0');
};

const genNIN = (seed: string) => (RNG_SEED(seed + 'nin') % 90_000_000_000 + 10_000_000_000).toString().slice(0, 11);

const genAccount = (seed: string) => '01' + (RNG_SEED(seed + 'acc') % 100_000_000).toString().padStart(8, '0');

const genPhone = (seed: string) => '+234' + ((RNG_SEED(seed + 'p') % 9_000_000_000) + 1_000_000_000).toString().slice(0, 10);

let _customers: Customer[] | null = null;

export function getCustomers(): Customer[] {
  if (_customers) return _customers;
  const list: Customer[] = [];

  // 30 individual KYC customers
  for (let i = 0; i < 30; i++) {
    const isMale = i % 2 === 0;
    const fullName = pick('m' + i, isMale ? NIGERIAN_NAMES_M : NIGERIAN_NAMES_F);
    const id = `IND-${(1000 + i).toString()}`;
    const seed = id + fullName;
    const pepHit = i === 2 || i === 7 || i === 18; // some PEPs
    const sanctionHit = i === 11; // one sanction
    const fraudFlag = i === 5 || i === 19;
    const riskBase = (pepHit || sanctionHit || fraudFlag) ? 'high' : (i % 5 === 0 ? 'medium' : 'low');
    const kycStatus: KycStatus = i === 13 ? 'pending' : i === 22 ? 'failed' : i === 4 ? 'expired' : 'verified';
    const confidence = kycStatus === 'verified' ? rRange(seed, 82, 99) : kycStatus === 'pending' ? rRange(seed, 55, 75) : rRange(seed, 30, 60);
    const stateName = pick(seed + 'st', NG_STATES);

    list.push({
      id,
      type: 'individual',
      fullName,
      dob: `19${rRange(seed, 60, 99)}-${String(rRange(seed + 'm', 1, 12)).padStart(2, '0')}-${String(rRange(seed + 'd', 1, 28)).padStart(2, '0')}`,
      gender: isMale ? 'M' : 'F',
      phone: genPhone(seed),
      email: fullName.toLowerCase().replace(/\s/g, '.') + '@gmail.com',
      address: {
        street: `${rRange(seed + 'h', 1, 200)} ${pick(seed + 'sn', ['Adeola', 'Marina', 'Allen', 'Awolowo', 'Ribadu', 'Lugard'])} Street`,
        city: stateName,
        state: stateName,
        country: 'Nigeria',
        geo: { lat: 6.5 + (i % 5), lng: 3.3 + (i % 5) },
      },
      bvn: genBVN(seed),
      nin: i % 3 === 0 ? genNIN(seed) : undefined,
      idType: pick(seed + 'id', ['NIN', 'Passport', 'DriversLicense', 'VotersCard']),
      idNumber: 'A' + (RNG_SEED(seed + 'idn') % 900_000_000 + 100_000_000),
      documents: [
        { id: `DOC-${i}-1`, name: 'National ID Card', type: 'id', uploadedAt: isoDaysAgo(rRange(seed, 1, 90)), verified: kycStatus === 'verified' },
        { id: `DOC-${i}-2`, name: 'Selfie', type: 'selfie', uploadedAt: isoDaysAgo(rRange(seed, 1, 90)), verified: kycStatus === 'verified' },
        { id: `DOC-${i}-3`, name: 'Utility Bill', type: 'utility', uploadedAt: isoDaysAgo(rRange(seed, 1, 90)), verified: kycStatus !== 'failed' },
      ],
      faceMatchScore: rRange(seed + 'fm', kycStatus === 'verified' ? 85 : 50, kycStatus === 'verified' ? 99 : 80),
      identityConfidenceScore: confidence,
      kycStatus,
      riskLevel: riskBase as RiskLevel,
      pepFlag: pepHit,
      sanctionFlag: sanctionHit,
      fraudRiskFlag: fraudFlag,
      occupation: pick(seed + 'oc', OCCUPATIONS),
      sourceOfFunds: pick(seed + 'sf', SOURCES_OF_FUNDS),
      expectedMonthlyVolume: rRange(seed + 'ev', 50_000, 5_000_000),
      expectedTransactionTypes: [pick(seed + 't1', TX_TYPES), pick(seed + 't2', TX_TYPES)],
      onboardedAt: isoDaysAgo(rRange(seed + 'on', 30, 730)),
      lastReviewedAt: isoDaysAgo(rRange(seed + 'lr', 1, 60)),
      eddStatus: pepHit || sanctionHit ? 'required' : fraudFlag ? 'in_progress' : 'not_required',
      accountNumber: genAccount(seed),
      channelUsage: {
        web: rRange(seed + 'w', 5, 50),
        mobile: rRange(seed + 'mo', 10, 80),
        pos: rRange(seed + 'po', 5, 60),
        atm: rRange(seed + 'a', 5, 40),
        branch: rRange(seed + 'b', 0, 10),
      },
      totalTransactions: rRange(seed + 'tt', 50, 2000),
      totalVolume: rRange(seed + 'tv', 500_000, 80_000_000),
    });
  }

  // 15 business KYB customers
  for (let i = 0; i < 15; i++) {
    const companyName = COMPANIES[i % COMPANIES.length] + (i >= COMPANIES.length ? ` ${i}` : '');
    const id = `BIZ-${(2000 + i).toString()}`;
    const seed = id + companyName;
    const pepHit = i === 4;
    const sanctionHit = i === 9;
    const fraudFlag = i === 6;
    const riskLevel: RiskLevel = (pepHit || sanctionHit || fraudFlag) ? 'high' : (i % 4 === 0 ? 'medium' : 'low');
    const kycStatus: KycStatus = i === 8 ? 'pending' : i === 12 ? 'failed' : 'verified';
    const directors: Director[] = Array.from({ length: rRange(seed + 'dn', 2, 5) }).map((_, j) => ({
      name: pick(seed + 'dir' + j, [...NIGERIAN_NAMES_M, ...NIGERIAN_NAMES_F]),
      bvn: genBVN(seed + 'dir' + j),
      position: ['CEO', 'CFO', 'COO', 'Director'][j % 4],
      shareholdingPct: rRange(seed + 'sh' + j, 5, 35),
      pepFlag: j === 0 && pepHit,
    }));
    const ubos: UBO[] = Array.from({ length: rRange(seed + 'un', 1, 3) }).map((_, j) => ({
      name: pick(seed + 'ubo' + j, [...NIGERIAN_NAMES_M, ...NIGERIAN_NAMES_F]),
      bvn: genBVN(seed + 'ubo' + j),
      ownershipPct: rRange(seed + 'op' + j, 10, 60),
      pepFlag: pepHit,
    }));
    const stateName = pick(seed + 'st', NG_STATES);

    list.push({
      id,
      type: 'business',
      companyName,
      cacNumber: 'RC' + (RNG_SEED(seed + 'cac') % 9_000_000 + 1_000_000),
      tin: (RNG_SEED(seed + 'tin') % 9_999_999_999 + 1_000_000_000).toString().slice(0, 10),
      industry: pick(seed + 'ind', INDUSTRIES),
      registrationDate: `20${rRange(seed + 'ry', 5, 22)}-${String(rRange(seed + 'rm', 1, 12)).padStart(2, '0')}-15`,
      businessAddress: {
        street: `${rRange(seed + 'h', 1, 50)} ${pick(seed + 'sn', ['Adeola', 'Marina', 'Broad', 'Awolowo'])} Avenue`,
        city: stateName,
        state: stateName,
        country: 'Nigeria',
      },
      contactEmail: 'compliance@' + companyName.toLowerCase().replace(/\s|ltd|plc/g, '').slice(0, 12) + '.com',
      contactPhone: genPhone(seed),
      directors,
      ubos,
      documents: [
        { id: `BDOC-${i}-1`, name: 'CAC Certificate', type: 'cac', uploadedAt: isoDaysAgo(rRange(seed, 30, 365)), verified: kycStatus === 'verified' },
        { id: `BDOC-${i}-2`, name: 'Memorandum of Association', type: 'incorporation', uploadedAt: isoDaysAgo(rRange(seed, 30, 365)), verified: kycStatus === 'verified' },
        { id: `BDOC-${i}-3`, name: 'TIN Certificate', type: 'tax', uploadedAt: isoDaysAgo(rRange(seed, 30, 365)), verified: kycStatus === 'verified' },
        { id: `BDOC-${i}-4`, name: 'Address Proof', type: 'address_proof', uploadedAt: isoDaysAgo(rRange(seed, 30, 365)), verified: kycStatus !== 'failed' },
      ],
      identityConfidenceScore: kycStatus === 'verified' ? rRange(seed + 'cs', 80, 98) : rRange(seed + 'cs', 40, 70),
      kycStatus,
      riskLevel,
      pepFlag: pepHit,
      sanctionFlag: sanctionHit,
      fraudRiskFlag: fraudFlag,
      expectedMonthlyVolume: rRange(seed + 'ev', 1_000_000, 500_000_000),
      expectedTransactionTypes: ['Wire Transfer', 'International Wire', 'POS'],
      sourceOfFunds: 'Business Income',
      onboardedAt: isoDaysAgo(rRange(seed + 'on', 30, 1500)),
      lastReviewedAt: isoDaysAgo(rRange(seed + 'lr', 1, 90)),
      eddStatus: pepHit || sanctionHit || fraudFlag ? 'required' : 'not_required',
      accountNumber: '02' + (RNG_SEED(seed + 'acc') % 100_000_000).toString().padStart(8, '0'),
      totalTransactions: rRange(seed + 'tt', 200, 10_000),
      totalVolume: rRange(seed + 'tv', 10_000_000, 2_000_000_000),
    });
  }

  _customers = list;
  return list;
}

export function getCustomerById(id: string): Customer | undefined {
  return getCustomers().find(c => c.id === id);
}

export function addCustomer(c: Customer): void {
  const list = getCustomers();
  list.unshift(c);
}

let _screening: ScreeningMatch[] | null = null;
export function getScreeningMatches(): ScreeningMatch[] {
  if (_screening) return _screening;
  const customers = getCustomers();
  const out: ScreeningMatch[] = [];
  let n = 0;
  customers.forEach((c) => {
    if (c.pepFlag) {
      const peer = PEP_LIST[n % PEP_LIST.length];
      out.push({
        id: `SCR-${(5000 + n).toString()}`,
        customerId: c.id,
        customerName: c.type === 'individual' ? c.fullName : c.companyName,
        customerType: c.type,
        screeningType: 'pep',
        matchedName: peer.name,
        matchedListSource: peer.source,
        confidence: rRange(c.id + 'pep', 75, 96),
        matchType: rRange(c.id + 'mt', 0, 2) === 0 ? 'exact' : 'fuzzy',
        jurisdiction: peer.country,
        positionOrRole: peer.position,
        status: n % 4 === 0 ? 'true_positive' : n % 4 === 1 ? 'false_positive' : 'open',
        detectedAt: isoDaysAgo(rRange(c.id, 1, 30)),
        actionRequired: n % 4 !== 1,
        details: `${peer.position} matched against ${c.type === 'individual' ? c.fullName : c.companyName}.`,
      });
      n++;
    }
    if (c.sanctionFlag) {
      const s = SANCTION_LIST[n % SANCTION_LIST.length];
      out.push({
        id: `SCR-${(5000 + n).toString()}`,
        customerId: c.id,
        customerName: c.type === 'individual' ? c.fullName : c.companyName,
        customerType: c.type,
        screeningType: 'sanction',
        matchedName: s.name,
        matchedListSource: s.list,
        confidence: rRange(c.id + 'snc', 80, 99),
        matchType: 'fuzzy',
        jurisdiction: s.jurisdiction,
        status: 'open',
        detectedAt: isoDaysAgo(rRange(c.id, 1, 14)),
        actionRequired: true,
        details: `${s.list} hit: ${s.reason}`,
      });
      n++;
    }
  });
  // Add a few adverse media
  for (let i = 0; i < 4; i++) {
    const c = customers[(i * 7) % customers.length];
    out.push({
      id: `SCR-${(6000 + i).toString()}`,
      customerId: c.id,
      customerName: c.type === 'individual' ? c.fullName : c.companyName,
      customerType: c.type,
      screeningType: 'adverse_media',
      matchedName: c.type === 'individual' ? c.fullName : c.companyName,
      matchedListSource: ['Premium Times', 'Reuters', 'Bloomberg', 'Punch NG'][i],
      confidence: rRange(c.id + 'am' + i, 60, 85),
      matchType: 'fuzzy',
      jurisdiction: 'Nigeria',
      status: 'under_review',
      detectedAt: isoDaysAgo(rRange(c.id + 'amd', 1, 60)),
      actionRequired: false,
      details: 'Mentioned in negative news article concerning financial impropriety.',
    });
  }
  _screening = out;
  return out;
}

let _reports: RegulatoryReport[] | null = null;
export function getRegulatoryReports(): RegulatoryReport[] {
  if (_reports) return _reports;
  const customers = getCustomers();
  const out: RegulatoryReport[] = [];

  // STR — auto-generated for high risk customers
  customers.filter(c => c.fraudRiskFlag || c.sanctionFlag || c.pepFlag).forEach((c, i) => {
    const created = rRange(c.id + 'crt', 0, 5);
    const isOverdue = created >= 1 && i % 5 === 0;
    out.push({
      id: `STR-${(7000 + i).toString()}`,
      type: 'STR',
      customerId: c.id,
      customerName: c.type === 'individual' ? c.fullName : c.companyName,
      customerType: c.type,
      amount: rRange(c.id + 'amt', 1_000_000, 50_000_000),
      currency: 'NGN',
      transactionIds: [`TXN-${rRange(c.id + 'tx', 1000, 9999)}`, `TXN-${rRange(c.id + 'tx2', 1000, 9999)}`],
      reason: c.sanctionFlag ? 'Sanctions exposure' : c.pepFlag ? 'PEP transaction structuring' : 'Suspicious velocity pattern',
      narrative: `Customer ${c.type === 'individual' ? c.fullName : c.companyName} (${c.id}) exhibited suspicious activity inconsistent with declared profile. ${c.sanctionFlag ? 'Sanctioned counterparty involvement detected. ' : ''}${c.pepFlag ? 'Politically exposed person with unusual transaction velocity. ' : ''}Recommend enhanced review and submission to NFIU within statutory 24 hours.`,
      status: i % 5 === 0 ? 'submitted' : i % 5 === 1 ? 'pending_review' : i % 5 === 2 ? 'draft' : i % 5 === 3 ? 'acknowledged' : 'pending_review',
      createdAt: isoDaysAgo(created),
      deadline: new Date(Date.now() + (isOverdue ? -2 : 1) * 86400000).toISOString(),
      submittedAt: i % 5 === 0 || i % 5 === 3 ? isoDaysAgo(created - 0.5) : undefined,
      acknowledgedAt: i % 5 === 3 ? isoDaysAgo(created - 1) : undefined,
      submittedBy: i % 5 === 0 || i % 5 === 3 ? 'Sarah Chen' : undefined,
      preparedBy: ['Sarah Chen', 'Michael Torres', 'David Kim', 'Priya Patel'][i % 4],
      reviewedBy: i % 5 >= 1 ? 'Senior Compliance Officer' : undefined,
      attachments: rRange(c.id + 'att', 1, 5),
      flagsTriggered: [c.pepFlag && 'PEP', c.sanctionFlag && 'SANCTION', c.fraudRiskFlag && 'FRAUD', 'VELOCITY'].filter(Boolean) as string[],
      jurisdiction: 'NG',
      regulatoryRef: i % 5 === 0 || i % 5 === 3 ? `NFIU-${rRange(c.id + 'rr', 100000, 999999)}` : undefined,
    });
  });

  // CTR — for customers exceeding threshold
  customers.forEach((c, i) => {
    const threshold = c.type === 'individual' ? 5_000_000 : 10_000_000;
    if (c.totalVolume / 12 > threshold || i % 6 === 0) {
      const amount = rRange(c.id + 'ctr', threshold, threshold * 5);
      out.push({
        id: `CTR-${(8000 + i).toString()}`,
        type: 'CTR',
        customerId: c.id,
        customerName: c.type === 'individual' ? c.fullName : c.companyName,
        customerType: c.type,
        amount,
        currency: 'NGN',
        transactionIds: [`TXN-${rRange(c.id + 'ctx', 1000, 9999)}`],
        reason: `Cash transaction exceeding ₦${(threshold / 1_000_000).toFixed(0)}M threshold`,
        narrative: `Cash transaction of ₦${amount.toLocaleString()} by ${c.type === 'individual' ? c.fullName : c.companyName} exceeds the regulatory threshold for ${c.type} customers.`,
        status: i % 3 === 0 ? 'submitted' : 'pending_review',
        createdAt: isoDaysAgo(rRange(c.id + 'cd', 0, 10)),
        deadline: new Date(Date.now() + 5 * 86400000).toISOString(),
        submittedAt: i % 3 === 0 ? isoDaysAgo(rRange(c.id + 'sa', 0, 5)) : undefined,
        submittedBy: i % 3 === 0 ? 'Compliance Officer' : undefined,
        preparedBy: 'Auto-Generated',
        attachments: 1,
        flagsTriggered: ['CTR_THRESHOLD'],
        jurisdiction: 'NG',
        regulatoryRef: i % 3 === 0 ? `NFIU-CTR-${rRange(c.id + 'crr', 100000, 999999)}` : undefined,
      });
    }
  });

  _reports = out;
  return out;
}

let _fraudRegister: FraudRegisterEntry[] | null = null;
export function getFraudRegister(): FraudRegisterEntry[] {
  if (_fraudRegister) return _fraudRegister;
  const customers = getCustomers();
  const types: FraudRegisterEntry['fraudType'][] = ['card_fraud', 'wire_fraud', 'identity_theft', 'phishing', 'account_takeover', 'merchant_fraud', 'mule_account', 'cheque_fraud', 'sim_swap'];
  const channels = ['Web', 'Mobile', 'POS', 'ATM', 'Branch', 'Wire'];
  const out: FraudRegisterEntry[] = [];
  for (let i = 0; i < 35; i++) {
    const c = customers[i % customers.length];
    const seed = `FR-${i}`;
    const fraudType = types[i % types.length];
    const status: FraudRegisterStatus = i % 5 === 0 ? 'recovered' : i % 5 === 1 ? 'investigating' : i % 5 === 2 ? 'open' : i % 5 === 3 ? 'closed' : 'written_off';
    const lost = rRange(seed + 'l', 50_000, 25_000_000);
    const recovered = status === 'recovered' ? Math.floor(lost * 0.7) : status === 'closed' ? Math.floor(lost * 0.3) : 0;
    const incident = rRange(seed + 'inc', 5, 200);
    out.push({
      id: `FR-${(9000 + i).toString()}`,
      incidentDate: isoDaysAgo(incident),
      reportedDate: isoDaysAgo(incident - rRange(seed + 'rd', 0, 3)),
      customerId: c.id,
      customerName: c.type === 'individual' ? c.fullName : c.companyName,
      accountNumber: c.accountNumber,
      fraudType,
      channel: pick(seed + 'ch', channels),
      amountLost: lost,
      amountSaved: rRange(seed + 's', 0, lost),
      amountRecovered: recovered,
      status,
      description: {
        card_fraud: 'Unauthorized card transactions detected on customer account.',
        wire_fraud: 'Fraudulent wire transfer to overseas beneficiary.',
        identity_theft: 'Customer identity used to open fraudulent accounts.',
        phishing: 'Customer credentials harvested via phishing attempt.',
        account_takeover: 'Account credentials compromised; unauthorized logins detected.',
        merchant_fraud: 'Fictitious merchant submitting fraudulent transactions.',
        mule_account: 'Account flagged as money mule for layering activity.',
        cheque_fraud: 'Forged cheque presented for payment.',
        sim_swap: 'SIM swap attack enabling account takeover.',
      }[fraudType],
      perpetrator: i % 3 === 0 ? 'Unknown' : `External actor (${pick(seed + 'pe', ['Lagos', 'Abuja', 'Port Harcourt', 'Foreign'])})`,
      linkedAccounts: [c.accountNumber, '01' + rRange(seed + 'la', 10000000, 99999999)],
      linkedCases: [`CASE-${rRange(seed + 'lc', 1000, 9999)}`],
      resolutionNotes: status === 'recovered' ? 'Funds recovered via interbank cooperation.' : status === 'closed' ? 'Case closed; partial recovery achieved.' : status === 'written_off' ? 'Loss written off after exhausting recovery efforts.' : undefined,
      reportedToCbn: i % 2 === 0,
      reportedToNibss: i % 3 === 0,
      reportedToNfiu: i % 4 === 0,
      assignedTo: ['Sarah Chen', 'Michael Torres', 'David Kim', 'Priya Patel', 'James Walker'][i % 5],
      closedAt: status === 'closed' || status === 'recovered' || status === 'written_off' ? isoDaysAgo(incident - 30) : undefined,
    });
  }
  _fraudRegister = out;
  return out;
}

let _eddCases: EddCase[] | null = null;
export function getEddCases(): EddCase[] {
  if (_eddCases) return _eddCases;
  const triggers = ['PEP detected', 'High-value transaction (>₦50M)', 'Cross-border activity', 'High-risk jurisdiction (FATF grey list)', 'Profile-behavior mismatch', 'Sanctions exposure'];
  const customers = getCustomers().filter(c => c.eddStatus !== 'not_required');
  const out: EddCase[] = customers.map((c, i) => {
    const seed = `EDD-${c.id}`;
    return {
      id: `EDD-${(4000 + i).toString()}`,
      customerId: c.id,
      customerName: c.type === 'individual' ? c.fullName : c.companyName,
      triggerReason: c.pepFlag && c.sanctionFlag ? [triggers[0], triggers[5]] : c.pepFlag ? [triggers[0]] : c.sanctionFlag ? [triggers[5]] : [triggers[i % triggers.length]],
      status: c.eddStatus,
      riskFactors: ['Geographic risk', 'Industry risk', 'Channel risk'].slice(0, rRange(seed, 1, 3)),
      sourceOfWealth: pick(seed + 'sow', ['Inheritance from family business', 'Long-term real estate investments', 'Senior corporate executive compensation', 'Sale of agricultural land', 'Diaspora remittances accumulated']),
      documentsRequired: ['Source of Wealth declaration', 'Bank statements (12 months)', 'Tax returns (3 years)', 'Property valuation reports'],
      documentsCollected: c.eddStatus === 'in_progress' ? ['Source of Wealth declaration', 'Bank statements (12 months)'] : c.eddStatus === 'approved' ? ['Source of Wealth declaration', 'Bank statements (12 months)', 'Tax returns (3 years)', 'Property valuation reports'] : [],
      approvalChain: [
        { role: 'Analyst', name: 'Sarah Chen', status: 'approved', timestamp: isoDaysAgo(5), notes: 'Initial review complete.' },
        { role: 'Senior Analyst', name: 'David Kim', status: c.eddStatus === 'approved' || c.eddStatus === 'in_progress' ? 'approved' : 'pending', timestamp: c.eddStatus === 'approved' ? isoDaysAgo(2) : undefined, notes: 'Additional documentation requested.' },
        { role: 'Compliance Officer', name: 'Olu Adekoya', status: c.eddStatus === 'approved' ? 'approved' : 'pending', timestamp: c.eddStatus === 'approved' ? isoDaysAgo(1) : undefined },
      ],
      createdAt: isoDaysAgo(rRange(seed + 'ca', 5, 30)),
      dueDate: new Date(Date.now() + rRange(seed + 'dd', 1, 14) * 86400000).toISOString(),
      notes: 'EDD review initiated due to elevated risk indicators. Pending source-of-wealth verification.',
    };
  });
  _eddCases = out;
  return out;
}

// ===== KPI summaries =====
export interface ComplianceKpis {
  verifiedCustomers: number;
  unverifiedCustomers: number;
  highRiskCustomers: number;
  pepMatches: number;
  sanctionsMatches: number;
  strSubmittedThisMonth: number;
  strPending: number;
  strOverdue: number;
  ctrFlags: number;
  fraudLossYtd: number;
  fraudPreventedYtd: number;
  eddOpen: number;
  eddOverdue: number;
}

export function getComplianceKpis(): ComplianceKpis {
  const c = getCustomers();
  const r = getRegulatoryReports();
  const f = getFraudRegister();
  const edd = getEddCases();
  const now = Date.now();
  const monthAgo = now - 30 * 86400000;
  return {
    verifiedCustomers: c.filter(x => x.kycStatus === 'verified').length,
    unverifiedCustomers: c.filter(x => x.kycStatus !== 'verified').length,
    highRiskCustomers: c.filter(x => x.riskLevel === 'high').length,
    pepMatches: c.filter(x => x.pepFlag).length,
    sanctionsMatches: c.filter(x => x.sanctionFlag).length,
    strSubmittedThisMonth: r.filter(x => x.type === 'STR' && (x.status === 'submitted' || x.status === 'acknowledged') && x.submittedAt && new Date(x.submittedAt).getTime() >= monthAgo).length,
    strPending: r.filter(x => x.type === 'STR' && (x.status === 'draft' || x.status === 'pending_review')).length,
    strOverdue: r.filter(x => x.type === 'STR' && x.status !== 'submitted' && x.status !== 'acknowledged' && new Date(x.deadline).getTime() < now).length,
    ctrFlags: r.filter(x => x.type === 'CTR').length,
    fraudLossYtd: f.reduce((s, x) => s + x.amountLost - x.amountRecovered, 0),
    fraudPreventedYtd: f.reduce((s, x) => s + x.amountSaved, 0),
    eddOpen: edd.filter(x => x.status === 'required' || x.status === 'in_progress').length,
    eddOverdue: edd.filter(x => x.status !== 'approved' && x.status !== 'rejected' && new Date(x.dueDate).getTime() < now).length,
  };
}

// ===== Compliance Alerts (KYC Risk / PEP / Sanction / EDD Required) =====
let _complianceAlerts: Alert[] | null = null;
export function getComplianceAlerts(): Alert[] {
  if (_complianceAlerts) return _complianceAlerts;
  const customers = getCustomers();
  const screening = getScreeningMatches();
  const eddCases = getEddCases();
  const out: Alert[] = [];
  let n = 1;
  const mkStatus = (i: number): AlertStatus => (['open', 'open', 'under_investigation', 'escalated', 'closed'] as AlertStatus[])[i % 5];

  // KYC Risk alerts — low identity confidence / non-verified customers
  customers
    .filter(c => c.kycStatus !== 'verified' || c.identityConfidenceScore < 70)
    .slice(0, 5)
    .forEach((c, i) => {
      const name = c.type === 'individual' ? c.fullName : c.companyName;
      const severity: TRiskLevel = c.identityConfidenceScore < 50 ? 'critical' : c.identityConfidenceScore < 70 ? 'high' : 'medium';
      out.push({
        id: `ALT-KYC-${String(100 + n).padStart(3, '0')}`,
        type: 'kyc_risk',
        transactionId: '-',
        customerId: c.id,
        riskScore: Math.max(60, 100 - c.identityConfidenceScore),
        severity,
        status: mkStatus(i),
        assignedTo: i % 2 === 0 ? `analyst-${(i % 5) + 1}` : undefined,
        createdAt: isoDaysAgo(rRange(c.id + 'kyc', 1, 20)),
        updatedAt: isoDaysAgo(rRange(c.id + 'kycu', 0, 5)),
        resolution: 'pending',
        contributingFactors: [
          `Identity confidence ${c.identityConfidenceScore}% (below threshold)`,
          `KYC status: ${c.kycStatus}`,
          ...(c.type === 'individual' && !c.nin ? ['NIN not provided'] : []),
        ],
        modelVersion: 'kyc-v1.4',
        ruleIds: ['RULE-KYC-CONF', 'RULE-KYC-DOC'],
        description: `High-risk new account opened by ${name} with low identity confidence (${c.identityConfidenceScore}%).`,
      });
      n++;
    });

  // PEP Match alerts
  screening
    .filter(s => s.screeningType === 'pep')
    .slice(0, 5)
    .forEach((s, i) => {
      out.push({
        id: `ALT-PEP-${String(200 + n).padStart(3, '0')}`,
        type: 'pep_match',
        transactionId: '-',
        customerId: s.customerId,
        riskScore: s.confidence,
        severity: s.confidence > 90 ? 'critical' : 'high',
        status: mkStatus(i),
        assignedTo: `compliance-${(i % 3) + 1}`,
        createdAt: s.detectedAt,
        updatedAt: isoDaysAgo(rRange(s.id, 0, 5)),
        resolution: 'pending',
        contributingFactors: [
          `Matched PEP: ${s.matchedName}`,
          `Position: ${s.positionOrRole ?? 'Public Official'}`,
          `List source: ${s.matchedListSource}`,
          `Match confidence: ${s.confidence}%`,
        ],
        modelVersion: 'screening-v2.0',
        ruleIds: ['RULE-PEP-MATCH'],
        description: `${s.customerName} matched against PEP list (${s.matchedListSource}) with ${s.confidence}% confidence.`,
      });
      n++;
    });

  // Sanction alerts
  screening
    .filter(s => s.screeningType === 'sanction')
    .slice(0, 4)
    .forEach((s, i) => {
      out.push({
        id: `ALT-SAN-${String(300 + n).padStart(3, '0')}`,
        type: 'sanction',
        transactionId: '-',
        customerId: s.customerId,
        riskScore: Math.max(85, s.confidence),
        severity: 'critical',
        status: mkStatus(i),
        assignedTo: `compliance-${(i % 3) + 1}`,
        createdAt: s.detectedAt,
        updatedAt: isoDaysAgo(rRange(s.id + 'u', 0, 3)),
        resolution: 'pending',
        contributingFactors: [
          `Sanctions hit: ${s.matchedName}`,
          `List: ${s.matchedListSource}`,
          `Jurisdiction: ${s.jurisdiction}`,
          `Match type: ${s.matchType}`,
        ],
        modelVersion: 'screening-v2.0',
        ruleIds: ['RULE-SAN-MATCH'],
        description: `Sanctions screening hit on ${s.customerName} against ${s.matchedListSource}. Immediate review required.`,
      });
      n++;
    });

  // EDD Required alerts
  eddCases
    .filter(e => e.status === 'required' || e.status === 'in_progress')
    .slice(0, 4)
    .forEach((e, i) => {
      out.push({
        id: `ALT-EDD-${String(400 + n).padStart(3, '0')}`,
        type: 'edd_required',
        transactionId: '-',
        customerId: e.customerId,
        riskScore: 75,
        severity: 'high',
        status: mkStatus(i),
        assignedTo: `compliance-${(i % 3) + 1}`,
        createdAt: e.createdAt,
        updatedAt: isoDaysAgo(rRange(e.id, 0, 5)),
        resolution: 'pending',
        contributingFactors: [
          ...e.triggerReason,
          ...e.riskFactors,
          `EDD case: ${e.id}`,
        ],
        modelVersion: 'edd-v1.0',
        ruleIds: ['RULE-EDD-TRIGGER'],
        description: `Enhanced Due Diligence required for ${e.customerName}. Reason: ${e.triggerReason.join(', ')}.`,
      });
      n++;
    });

  _complianceAlerts = out;
  return out;
}

// ===== Customer Intelligence derivations (deterministic, customer-id driven) =====

const _seedHash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export interface CustomerLinkedAccount {
  account: string;
  bank: string;
  relation: string;
  risk: 'low' | 'medium' | 'high';
  /** Optional real linkage to another customer record. */
  relatedCustomerId?: string;
  /** Display name of the linked customer when relatedCustomerId is set. */
  relatedCustomerName?: string;
}
export interface CustomerDevice {
  id: string;
  type: string;
  lastSeenDaysAgo: number;
  trusted: boolean;
}
export interface ScreeningRun {
  id: string;
  ranAtDaysAgo: number;
  source: string;
  status: 'clear' | 'matches_found';
  matchCount: number;
}
export interface CustomerDerivations {
  linkedAccounts: CustomerLinkedAccount[];
  devices: CustomerDevice[];
  expectedAnnualVolume: number;
  behaviorRatio: number;
  screeningHistory: ScreeningRun[];
  primaryAnalyst: string;
}

const _BANKS = ['GTBank', 'Zenith', 'UBA', 'Access', 'First Bank', 'Stanbic'];
const _RELATIONS = ['Beneficiary', 'Counterparty', 'Joint Account', 'Linked Wallet'];
const _DEVICE_TYPES = ['iPhone 14', 'Android (Tecno)', 'Web Browser', 'POS Terminal'];
const _SCREEN_SOURCES = ['World-Check', 'OFAC SDN', 'UN Sanctions', 'EU Consolidated', 'NFIU PEP'];
const _ANALYSTS = ['Sarah Chen', 'Michael Torres', 'David Kim', 'Priya Patel', 'James Walker'];

export function getCustomerDerivations(c: Customer): CustomerDerivations {
  const seed = _seedHash(c.id);
  const accCount = 2 + (seed % 3);
  const allCustomers = getCustomers();
  const peerCustomers = allCustomers.filter(o => o.id !== c.id);
  const linkedAccounts: CustomerLinkedAccount[] = Array.from({ length: accCount }).map((_, i) => {
    const relation = _RELATIONS[(seed + i) % _RELATIONS.length];
    // Counterparty / Joint Account / Linked Wallet are real customer-to-customer links;
    // Beneficiary stays a one-off external account.
    const isRealCustomerLink = relation !== 'Beneficiary' && peerCustomers.length > 0;
    const linkedCustomer = isRealCustomerLink
      ? peerCustomers[(seed + i * 17) % peerCustomers.length]
      : undefined;
    const account = linkedCustomer
      ? linkedCustomer.accountNumber
      : '0' + (((seed + i * 13) % 9_000_000_000) + 1_000_000_000).toString().slice(0, 9);
    const bank = linkedCustomer
      ? _BANKS[(_seedHash(linkedCustomer.id)) % _BANKS.length]
      : _BANKS[(seed + i) % _BANKS.length];
    const baseRisk: 'low' | 'medium' | 'high' = ((seed + i) % 5 === 0 ? 'high' : (seed + i) % 3 === 0 ? 'medium' : 'low');
    const risk: 'low' | 'medium' | 'high' = linkedCustomer ? linkedCustomer.riskLevel : baseRisk;
    return {
      account,
      bank,
      relation,
      risk,
      ...(linkedCustomer ? {
        relatedCustomerId: linkedCustomer.id,
        relatedCustomerName: linkedCustomer.type === 'individual' ? linkedCustomer.fullName : linkedCustomer.companyName,
      } : {}),
    };
  });
  const devices: CustomerDevice[] = Array.from({ length: 1 + (seed % 3) }).map((_, i) => ({
    id: 'DEV-' + (((seed + i * 7) % 9999)).toString().padStart(4, '0'),
    type: _DEVICE_TYPES[(seed + i) % _DEVICE_TYPES.length],
    lastSeenDaysAgo: ((seed + i * 11) % 30),
    trusted: i === 0,
  }));
  const expectedAnnualVolume = c.expectedMonthlyVolume * 12;
  const behaviorRatio = c.totalVolume / Math.max(1, expectedAnnualVolume);
  const screeningHistory: ScreeningRun[] = Array.from({ length: 3 + (seed % 2) }).map((_, i) => {
    const matchCount = (seed + i * 3) % 7 === 0 ? 1 : 0;
    return {
      id: `SCR-${c.id}-${i + 1}`,
      ranAtDaysAgo: (i + 1) * 30 + ((seed + i) % 7),
      source: _SCREEN_SOURCES[(seed + i) % _SCREEN_SOURCES.length],
      status: matchCount > 0 ? 'matches_found' : 'clear',
      matchCount,
    };
  });
  const primaryAnalyst = _ANALYSTS[seed % _ANALYSTS.length];
  return { linkedAccounts, devices, expectedAnnualVolume, behaviorRatio, screeningHistory, primaryAnalyst };
}

export interface SecondHopEntity {
  parentLinkIndex: number;
  customerId: string;
  customerName: string;
  account: string;
  bank: string;
  relation: string;
  risk: 'low' | 'medium' | 'high';
}

/**
 * Real second-hop expansion: for each peer that points at a real customer,
 * pull that customer's own first-hop linked accounts (excluding loops back
 * to the originating customer). Beneficiary peers (no relatedCustomerId)
 * contribute no second hop.
 */
export function getCustomerSecondHop(c: Customer): SecondHopEntity[] {
  const peers = getCustomerDerivations(c).linkedAccounts;
  const out: SecondHopEntity[] = [];
  const seen = new Set<string>();
  peers.forEach((peer, parentIdx) => {
    if (!peer.relatedCustomerId) return;
    const linked = getCustomerById(peer.relatedCustomerId);
    if (!linked) return;
    const linkedDeriv = getCustomerDerivations(linked);
    linkedDeriv.linkedAccounts
      .filter(la => la.relatedCustomerId && la.relatedCustomerId !== c.id && !seen.has(la.relatedCustomerId))
      .slice(0, 2)
      .forEach(la => {
        seen.add(la.relatedCustomerId!);
        out.push({
          parentLinkIndex: parentIdx,
          customerId: la.relatedCustomerId!,
          customerName: la.relatedCustomerName!,
          account: la.account,
          bank: la.bank,
          relation: la.relation,
          risk: la.risk,
        });
      });
  });
  return out;
}

export interface SyntheticTxn {
  id: string;
  customerId: string;
  timestamp: string;
  channel: 'mobile' | 'web' | 'pos' | 'atm' | 'branch';
  merchantName: string;
  amount: number;
  status: 'completed' | 'pending' | 'declined';
  riskScore: number;
  deviceId: string;
  ipAddress: string;
  geoCountry: string;
  geoCity: string;
  rulesTriggered: string[];
  anomalyScore: number;
  mlScore: number;
  trustScore: number;
}

const _SYN_MERCHANTS = ['Jumia', 'Konga', 'Shoprite', 'MTN Topup', 'DSTV', 'Uber Naija', 'Bolt', 'Glovo', 'PayDay Loans', 'CryptoExchange Ltd', 'Western Union', 'GTBank ATM', 'Shell Petrol', 'Hotels.ng'];
const _SYN_CITIES = [['Lagos', 'NG'], ['Abuja', 'NG'], ['Port Harcourt', 'NG'], ['Kano', 'NG'], ['Ibadan', 'NG'], ['London', 'GB'], ['Dubai', 'AE'], ['New York', 'US'], ['Accra', 'GH']];
const _SYN_CHANNELS: Array<'mobile' | 'web' | 'pos' | 'atm' | 'branch'> = ['mobile', 'web', 'pos', 'atm', 'branch'];
const _SYN_RULES = ['HIGH_AMOUNT_THRESHOLD', 'NEW_DEVICE', 'GEO_VELOCITY', 'STRUCTURING_PATTERN', 'IP_REPUTATION', 'ODD_HOUR_ACTIVITY', 'ROUND_AMOUNT'];

const _SYN_EPOCH = new Date('2026-05-01T00:00:00Z').getTime();
export function getSyntheticTransactions(c: Customer, count = 30): SyntheticTxn[] {
  const seed = _seedHash(c.id);
  const dailyBudget = Math.max(2000, Math.round(c.expectedMonthlyVolume / 30));
  const out: SyntheticTxn[] = [];
  for (let i = 0; i < count; i++) {
    const s = (seed + i * 2654435761) >>> 0;
    const channel = _SYN_CHANNELS[s % _SYN_CHANNELS.length];
    const merchant = _SYN_MERCHANTS[(s >>> 4) % _SYN_MERCHANTS.length];
    const cityIdx = (s >>> 8) % _SYN_CITIES.length;
    const isCrossBorder = cityIdx >= 5;
    const baseAmount = dailyBudget * (0.3 + ((s >>> 12) % 100) / 50);
    const isAnomaly = (s >>> 16) % 11 === 0;
    const amount = Math.round(isAnomaly ? baseAmount * 6 : baseAmount);
    const hoursAgo = i * 6 + ((s >>> 20) % 6);
    const rules: string[] = [];
    if (isAnomaly) rules.push(_SYN_RULES[s % _SYN_RULES.length]);
    if (isCrossBorder) rules.push('GEO_VELOCITY');
    if (amount > dailyBudget * 4) rules.push('HIGH_AMOUNT_THRESHOLD');
    let risk = 15 + (s % 30);
    if (isAnomaly) risk += 35;
    if (isCrossBorder) risk += 15;
    if (c.pepFlag || c.sanctionFlag) risk += 10;
    risk = Math.max(1, Math.min(99, risk));
    const status: 'completed' | 'pending' | 'declined' = risk > 80 ? 'declined' : risk > 60 ? 'pending' : 'completed';
    const [city, country] = _SYN_CITIES[cityIdx];
    out.push({
      id: `STX-${c.id}-${(i + 1).toString().padStart(3, '0')}`,
      customerId: c.id,
      timestamp: new Date(_SYN_EPOCH - hoursAgo * 3600_000).toISOString(),
      channel,
      merchantName: merchant,
      amount,
      status,
      riskScore: risk,
      deviceId: 'DEV-' + (((s >>> 24) % 9999)).toString().padStart(4, '0'),
      ipAddress: `${(s % 223) + 1}.${(s >>> 4) % 256}.${(s >>> 8) % 256}.${(s >>> 12) % 256}`,
      geoCountry: country,
      geoCity: city,
      rulesTriggered: rules,
      anomalyScore: Math.min(1, risk / 100 + (isAnomaly ? 0.2 : 0)),
      mlScore: Math.min(1, risk / 110),
      trustScore: Math.max(0, 1 - risk / 120),
    });
  }
  return out;
}

// ===== Risk scoring helper =====
export function computeRiskScore(c: Customer): { score: number; factors: { name: string; weight: number; impact: 'positive' | 'negative' }[] } {
  const factors: { name: string; weight: number; impact: 'positive' | 'negative' }[] = [];
  let score = 50;
  if (c.pepFlag) { score += 25; factors.push({ name: 'PEP exposure', weight: 25, impact: 'negative' }); }
  if (c.sanctionFlag) { score += 30; factors.push({ name: 'Sanctions match', weight: 30, impact: 'negative' }); }
  if (c.fraudRiskFlag) { score += 20; factors.push({ name: 'Historical fraud signal', weight: 20, impact: 'negative' }); }
  if (c.kycStatus !== 'verified') { score += 10; factors.push({ name: 'KYC not fully verified', weight: 10, impact: 'negative' }); }
  if (c.identityConfidenceScore > 90) { score -= 8; factors.push({ name: 'High identity confidence', weight: 8, impact: 'positive' }); }
  if (c.type === 'business' && (c.industry === 'Crypto/VASP' || c.industry === 'Forex Bureau')) { score += 8; factors.push({ name: 'High-risk industry', weight: 8, impact: 'negative' }); }
  if (c.totalVolume > c.expectedMonthlyVolume * 12 * 1.5) { score += 12; factors.push({ name: 'Volume exceeds expected behavior', weight: 12, impact: 'negative' }); }
  return { score: Math.max(0, Math.min(100, score)), factors };
}
