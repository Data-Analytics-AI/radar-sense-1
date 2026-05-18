export type AIIntent = 'transaction_analysis' | 'customer_analysis' | 'sar_draft' | 'analytics_summary' | 'case_summary' | 'general_answer';

export type SectionType = 'risk_factors' | 'table' | 'bullets' | 'timeline' | 'chart' | 'document' | 'metrics' | 'json' | 'text';

export type ActionType = 'create_case' | 'add_to_case' | 'draft_sar' | 'view_customer' | 'open_graph' | 'export' | 'view_transaction' | 'open_case' | 'open_analytics';

export interface AIResponseSection {
  type: SectionType;
  heading: string;
  items: string[];
  rows?: string[][];
  headers?: string[];
}

export interface AIResponseAction {
  type: ActionType;
  label: string;
  payload: Record<string, string>;
}

export interface AIResponseEnvelope {
  intent: AIIntent;
  title: string;
  summary: string;
  confidence: number;
  entities: {
    transaction_id: string | null;
    customer_id: string | null;
    case_id: string | null;
  };
  sections: AIResponseSection[];
  actions: AIResponseAction[];
  raw_text: string;
}

interface IntentMatch {
  intent: AIIntent;
  confidence: number;
  entities: AIResponseEnvelope['entities'];
}

const TXN_RE = /\bTXN-[A-Z0-9]{4,}\b/gi;
const CUST_RE = /\bCUST-[A-Z0-9]{3,}\b/gi;
const CASE_RE = /\bCASE-[A-Z0-9]{3,}\b/gi;

function extractEntities(text: string): AIResponseEnvelope['entities'] {
  const txnMatch = text.match(TXN_RE);
  const custMatch = text.match(CUST_RE);
  const caseMatch = text.match(CASE_RE);
  return {
    transaction_id: txnMatch?.[0]?.toUpperCase() || null,
    customer_id: custMatch?.[0]?.toUpperCase() || null,
    case_id: caseMatch?.[0]?.toUpperCase() || null,
  };
}

export function detectIntent(userPrompt: string, responseText: string): IntentMatch {
  const combined = (userPrompt + ' ' + responseText).toLowerCase();
  const entities = extractEntities(userPrompt + ' ' + responseText);

  const rules: { intent: AIIntent; keywords: RegExp[]; weight: number }[] = [
    {
      intent: 'sar_draft',
      keywords: [/draft\s+sar/i, /sar\s+narrative/i, /suspicious\s+activity\s+report/i, /sar\s+filing/i, /subject\s+information/i],
      weight: 1.0,
    },
    {
      intent: 'transaction_analysis',
      keywords: [/txn-/i, /transaction.*flag/i, /risk\s+driver/i, /risk\s+factor/i, /risk\s+score/i, /why\s+was.*flag/i, /transaction\s+analy/i, /fraud\s+indicator.*transaction/i],
      weight: 0.9,
    },
    {
      intent: 'customer_analysis',
      keywords: [/cust-/i, /customer\s+behav/i, /peer\s+group/i, /structuring\s+pattern/i, /customer\s+risk/i, /customer\s+profile/i, /velocity\s+pattern/i],
      weight: 0.9,
    },
    {
      intent: 'case_summary',
      keywords: [/case-/i, /summarize.*case/i, /case\s+summary/i, /case\s+timeline/i, /investigation\s+summary/i, /assigned\s+analyst/i, /escalat/i],
      weight: 0.85,
    },
    {
      intent: 'analytics_summary',
      keywords: [/this\s+week/i, /trend/i, /top\s+fraud\s+indicator/i, /distribution/i, /false\s+positive\s+rate/i, /fraud\s+rate/i, /alert\s+volume/i, /weekly/i, /monthly/i, /analytics/i],
      weight: 0.8,
    },
  ];

  let bestIntent: AIIntent = 'general_answer';
  let bestScore = 0;

  for (const rule of rules) {
    let matchCount = 0;
    for (const kw of rule.keywords) {
      if (kw.test(combined)) matchCount++;
    }
    if (matchCount > 0) {
      const score = Math.min(0.95, (matchCount / rule.keywords.length) * rule.weight + 0.4);
      if (score > bestScore) {
        bestScore = score;
        bestIntent = rule.intent;
      }
    }
  }

  if (bestIntent === 'transaction_analysis' && !entities.transaction_id && bestScore < 0.7) {
    bestScore = Math.max(0.5, bestScore - 0.15);
  }
  if (bestIntent === 'customer_analysis' && !entities.customer_id && bestScore < 0.7) {
    bestScore = Math.max(0.5, bestScore - 0.15);
  }
  if (bestIntent === 'case_summary' && !entities.case_id && bestScore < 0.7) {
    bestScore = Math.max(0.5, bestScore - 0.15);
  }

  if (bestScore < 0.55) {
    bestIntent = 'general_answer';
    bestScore = 0.9;
  }

  return { intent: bestIntent, confidence: Math.round(bestScore * 100) / 100, entities };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*---\s*$/gm, '')
    .trim();
}

function extractSections(text: string): AIResponseSection[] {
  const sections: AIResponseSection[] = [];
  const headingRe = /^#{1,4}\s+(.+)$/gm;
  const parts: { heading: string; body: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = headingRe.exec(text)) !== null) {
    if (lastIndex < match.index) {
      const prevBody = text.slice(lastIndex, match.index).trim();
      if (prevBody && parts.length > 0) {
        parts[parts.length - 1].body = prevBody;
      } else if (prevBody) {
        parts.push({ heading: '', body: prevBody });
      }
    }
    parts.push({ heading: match[1].replace(/\*\*/g, '').trim(), body: '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      if (parts.length > 0 && !parts[parts.length - 1].body) {
        parts[parts.length - 1].body = remaining;
      } else {
        parts.push({ heading: '', body: remaining });
      }
    }
  }

  if (parts.length === 0) {
    parts.push({ heading: '', body: text });
  }

  for (const part of parts) {
    const body = part.body.trim();
    if (!body) continue;

    const tableMatch = body.match(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/);
    if (tableMatch) {
      const headers = tableMatch[1].split('|').map(h => h.trim()).filter(Boolean);
      const rowLines = tableMatch[2].trim().split('\n');
      const rows = rowLines.map(line =>
        line.split('|').map(c => c.replace(/\*\*/g, '').trim()).filter(Boolean)
      );
      sections.push({ type: 'table', heading: part.heading, items: [], headers, rows });
      const remainingBody = body.replace(tableMatch[0], '').trim();
      if (remainingBody) {
        const bullets = extractBullets(remainingBody);
        if (bullets.length > 0) {
          sections.push({ type: 'bullets', heading: '', items: bullets });
        }
      }
      continue;
    }

    const bullets = extractBullets(body);
    if (bullets.length > 0) {
      sections.push({ type: 'bullets', heading: part.heading, items: bullets });
    } else {
      const cleaned = stripMarkdown(body);
      if (cleaned) {
        sections.push({ type: 'text', heading: part.heading, items: [cleaned] });
      }
    }
  }

  return sections;
}

function extractBullets(text: string): string[] {
  const lines = text.split('\n');
  const bullets: string[] = [];
  for (const line of lines) {
    const stripped = line.trim();
    const bulletMatch = stripped.match(/^[-*•]\s+(.+)$/) || stripped.match(/^\d+[.)]\s+(.+)$/);
    if (bulletMatch) {
      bullets.push(stripMarkdown(bulletMatch[1]));
    }
  }
  return bullets;
}

function inferTitle(intent: AIIntent, entities: AIResponseEnvelope['entities']): string {
  switch (intent) {
    case 'transaction_analysis':
      return entities.transaction_id ? `Transaction Analysis: ${entities.transaction_id}` : 'Transaction Analysis';
    case 'customer_analysis':
      return entities.customer_id ? `Customer Risk Profile: ${entities.customer_id}` : 'Customer Risk Profile';
    case 'sar_draft':
      return entities.case_id ? `SAR Draft: ${entities.case_id}` : 'SAR Narrative Draft';
    case 'analytics_summary':
      return 'Analytics & Trends Summary';
    case 'case_summary':
      return entities.case_id ? `Case Summary: ${entities.case_id}` : 'Case Summary';
    case 'general_answer':
      return 'AI Analysis';
  }
}

function inferActions(intent: AIIntent, entities: AIResponseEnvelope['entities']): AIResponseAction[] {
  const actions: AIResponseAction[] = [];
  switch (intent) {
    case 'transaction_analysis':
      actions.push({ type: 'create_case', label: 'Create Case', payload: { transaction_id: entities.transaction_id || '' } });
      actions.push({ type: 'draft_sar', label: 'Draft SAR', payload: {} });
      if (entities.transaction_id) actions.push({ type: 'view_transaction', label: 'View Transaction', payload: { id: entities.transaction_id } });
      break;
    case 'customer_analysis':
      if (entities.customer_id) actions.push({ type: 'view_customer', label: 'View Customer', payload: { id: entities.customer_id } });
      actions.push({ type: 'open_graph', label: 'Open Graph Network', payload: {} });
      actions.push({ type: 'create_case', label: 'Create Case', payload: {} });
      break;
    case 'sar_draft':
      actions.push({ type: 'export', label: 'Export PDF', payload: { format: 'pdf' } });
      actions.push({ type: 'add_to_case', label: 'Save to Case', payload: { case_id: entities.case_id || '' } });
      break;
    case 'analytics_summary':
      actions.push({ type: 'open_analytics', label: 'Open Analytics', payload: {} });
      actions.push({ type: 'export', label: 'Export Report', payload: { format: 'csv' } });
      break;
    case 'case_summary':
      if (entities.case_id) actions.push({ type: 'open_case', label: 'Open Case', payload: { id: entities.case_id } });
      actions.push({ type: 'draft_sar', label: 'Draft SAR', payload: {} });
      actions.push({ type: 'export', label: 'Export Summary', payload: { format: 'pdf' } });
      break;
    case 'general_answer':
      actions.push({ type: 'export', label: 'Copy Response', payload: {} });
      break;
  }
  return actions;
}

export function parseAIResponse(userPrompt: string, rawText: string): AIResponseEnvelope {
  const { intent, confidence, entities } = detectIntent(userPrompt, rawText);
  const sections = extractSections(rawText);
  const firstText = sections.find(s => s.type === 'text' || s.type === 'bullets');
  const summary = firstText?.items?.[0]?.slice(0, 200) || rawText.slice(0, 200).replace(/[#*\-]/g, '').trim();

  return {
    intent,
    title: inferTitle(intent, entities),
    summary,
    confidence,
    entities,
    sections,
    actions: inferActions(intent, entities),
    raw_text: rawText,
  };
}
