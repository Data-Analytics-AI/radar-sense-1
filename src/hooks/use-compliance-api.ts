import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  Customer,
  IndividualKyc,
  BusinessKyb,
  KycDocument,
  ScreeningMatch,
  EddCase,
} from '@/lib/compliance-data';

type IndividualRow = Omit<IndividualKyc, 'documents'> & { documents?: KycDocument[] };

type BusinessRow = Omit<BusinessKyb, 'documents' | 'businessAddress' | 'contactEmail' | 'contactPhone'> & {
  documents?: KycDocument[];
  businessAddress?: BusinessKyb['businessAddress'];
  contactEmail?: string;
  contactPhone?: string;
  address?: BusinessKyb['businessAddress'];
  email?: string;
  phone?: string;
};

type CustomerRow = IndividualRow | BusinessRow;

const EMPTY_BUSINESS_ADDRESS: BusinessKyb['businessAddress'] = {
  street: '', city: '', state: '', country: 'Nigeria',
};

function adaptCustomer(row: CustomerRow): Customer {
  const documents: KycDocument[] = Array.isArray(row.documents) ? row.documents : [];
  if (row.type === 'business') {
    const businessAddress = row.businessAddress ?? row.address ?? EMPTY_BUSINESS_ADDRESS;
    const contactEmail = row.contactEmail ?? row.email ?? '';
    const contactPhone = row.contactPhone ?? row.phone ?? '';
    const { address: _address, email: _email, phone: _phone, ...rest } = row;
    return { ...rest, documents, businessAddress, contactEmail, contactPhone };
  }
  return { ...row, documents };
}

export function useCustomersQuery() {
  return useQuery<CustomerRow[], Error, Customer[]>({
    queryKey: ['/api/customers'],
    select: (rows) => (Array.isArray(rows) ? rows.map(adaptCustomer) : []),
  });
}

export function useScreeningQuery() {
  return useQuery<ScreeningMatch[]>({
    queryKey: ['/api/screening'],
    select: (rows) => (Array.isArray(rows) ? rows : []),
  });
}

export function useEddCasesQuery() {
  return useQuery<EddCase[]>({
    queryKey: ['/api/edd-cases'],
    select: (rows) => (Array.isArray(rows) ? rows : []),
  });
}

export interface CustomerInsert {
  id: string;
  type: 'individual' | 'business';
  displayName: string;
  email: string;
  phone: string;
  accountNumber: string;
  sourceOfFunds: string;
  expectedMonthlyVolume: number;
  expectedTransactionTypes: string[];
  totalTransactions: number;
  totalVolume: number;
  identityConfidenceScore: number;
  kycStatus: string;
  riskLevel: string;
  pepFlag: boolean;
  sanctionFlag: boolean;
  fraudRiskFlag: boolean;
  eddStatus: string;
  address: { street: string; city: string; state: string; country: string };
  // individual-only
  fullName?: string;
  dob?: string;
  gender?: string;
  bvn?: string;
  idType?: string;
  idNumber?: string;
  occupation?: string;
  channelUsage?: { web: number; mobile: number; pos: number; atm: number; branch: number };
  // business-only
  companyName?: string;
  cacNumber?: string;
  tin?: string;
  industry?: string;
  registrationDate?: string;
  directors?: unknown[];
  ubos?: unknown[];
}

export interface DocumentInsert {
  id: string;
  name: string;
  type: string;
  verified: boolean;
  storageKey: string;
  size: number;
  mime: string;
}

export interface CreateCustomerPayload {
  customer: CustomerInsert;
  documents: DocumentInsert[];
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) =>
      apiRequest('POST', '/api/customers', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/customers'] });
      qc.invalidateQueries({ queryKey: ['/api/edd-cases'] });
      qc.invalidateQueries({ queryKey: ['/api/screening'] });
    },
  });
}

export interface OnboardingFormInput {
  type?: 'individual' | 'business';
  fullName?: string;
  email?: string;
  phone?: string;
  bvn?: string;
  cacNumber?: string;
  idType?: string;
  idNumber?: string;
  sourceOfFunds?: string;
  expectedMonthlyVolume?: number;
  documents?: Array<{ name?: string; size?: number; type?: string; storageKey?: string }>;
}

export function buildCustomerPayloadFromForm(rawInput: OnboardingFormInput): CreateCustomerPayload {
  const type: 'individual' | 'business' = rawInput.type ?? 'individual';
  const fullName = rawInput.fullName ?? '';
  const email = rawInput.email ?? '';
  const phone = rawInput.phone ?? '';
  const sourceOfFunds = rawInput.sourceOfFunds ?? 'Salary';
  const expectedMonthlyVolume = Math.max(0, Math.trunc(rawInput.expectedMonthlyVolume ?? 0));

  const baseId = `${type === 'individual' ? 'IND' : 'BIZ'}-NEW-${Math.floor(
    Math.random() * 9000 + 1000,
  )}`;
  const accountNumber =
    (type === 'individual' ? '01' : '02') +
    Math.floor(Math.random() * 90_000_000 + 10_000_000);

  const shared: CustomerInsert = {
    id: baseId,
    type,
    displayName: fullName,
    email,
    phone,
    accountNumber,
    sourceOfFunds,
    expectedMonthlyVolume,
    expectedTransactionTypes: ['Wire Transfer'],
    totalTransactions: 0,
    totalVolume: 0,
    identityConfidenceScore: 50,
    kycStatus: 'pending',
    riskLevel: 'medium',
    pepFlag: false,
    sanctionFlag: false,
    fraudRiskFlag: false,
    eddStatus: 'not_required',
    address: { street: 'N/A', city: 'Lagos', state: 'Lagos', country: 'Nigeria' },
  };

  const customer: CustomerInsert =
    type === 'individual'
      ? {
          ...shared,
          fullName,
          dob: '1990-01-01',
          gender: 'M',
          bvn: rawInput.bvn || '00000000000',
          idType: rawInput.idType || 'NIN',
          idNumber: rawInput.idNumber || 'A000000000',
          occupation: 'Unspecified',
          channelUsage: { web: 0, mobile: 0, pos: 0, atm: 0, branch: 0 },
        }
      : {
          ...shared,
          companyName: fullName,
          cacNumber: rawInput.cacNumber || 'RC0000000',
          tin: '0000000000',
          industry: 'Technology',
          registrationDate: '2020-01-15',
          directors: [],
          ubos: [],
        };

  const documents: DocumentInsert[] = (rawInput.documents ?? []).map((d, i) => ({
    id: `${baseId}-DOC-${i + 1}`,
    name: d.name ?? 'document',
    type: 'kyc_doc',
    verified: false,
    storageKey: d.storageKey ?? '',
    size: d.size ?? 0,
    mime: d.type ?? 'application/octet-stream',
  }));

  return { customer, documents };
}
