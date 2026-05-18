// Server-side rendering of regulatory reports (PDF + XML).
//
// PDF is produced with `pdfkit` so we don't depend on a headless browser.
// The output mirrors the on-screen layout of RegulatoryReporting.tsx in
// content (header, subject, transaction details, narrative, workflow) but is
// a minimal black-on-white compliance document.
//
// XML mirrors the client-side `buildXml` exactly — both client and server
// must produce byte-identical XML so a downloaded artifact matches what the
// analyst saw in the UI when they hit "Submit".

import PDFDocument from "pdfkit";
import type { RegulatoryReportRow } from "../shared/schema.js";

function escapeXml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function fmtMoney(n: number, currency: string): string {
  const sym = currency === "NGN" ? "NGN " : `${currency} `;
  return sym + Number(n ?? 0).toLocaleString("en-US");
}

export function renderReportXml(r: RegulatoryReportRow): string {
  const txnIds = (r.transactionIds ?? []) as string[];
  const flags = (r.flagsTriggered ?? []) as string[];
  return `<?xml version="1.0" encoding="UTF-8"?>
<NfiuReport xmlns="urn:nfiu:cbn:report:1.0" reportType="${r.type}" id="${escapeXml(r.id)}">
  <Header>
    <ReportId>${escapeXml(r.id)}</ReportId>
    <ReportType>${r.type}</ReportType>
    <Status>${escapeXml(r.status)}</Status>
    <Jurisdiction>${escapeXml(r.jurisdiction)}</Jurisdiction>
    <CreatedAt>${escapeXml((r.createdAt as unknown as Date)?.toISOString?.() ?? r.createdAt)}</CreatedAt>
    <Deadline>${escapeXml((r.deadline as unknown as Date)?.toISOString?.() ?? r.deadline)}</Deadline>
    ${r.submittedAt ? `<SubmittedAt>${escapeXml((r.submittedAt as unknown as Date)?.toISOString?.() ?? r.submittedAt)}</SubmittedAt>` : ""}
    ${r.acknowledgedAt ? `<AcknowledgedAt>${escapeXml((r.acknowledgedAt as unknown as Date)?.toISOString?.() ?? r.acknowledgedAt)}</AcknowledgedAt>` : ""}
    ${r.regulatoryRef ? `<RegulatoryRef>${escapeXml(r.regulatoryRef)}</RegulatoryRef>` : ""}
  </Header>
  <Subject>
    <CustomerId>${escapeXml(r.customerId)}</CustomerId>
    <CustomerName>${escapeXml(r.customerName)}</CustomerName>
    <CustomerType>${escapeXml(r.customerType)}</CustomerType>
  </Subject>
  <Transaction>
    <Amount currency="${escapeXml(r.currency)}">${r.amount}</Amount>
    <Reason>${escapeXml(r.reason)}</Reason>
    <TransactionIds>
      ${txnIds.map(t => `<TransactionId>${escapeXml(t)}</TransactionId>`).join("\n      ")}
    </TransactionIds>
    <FlagsTriggered>
      ${flags.map(f => `<Flag>${escapeXml(f)}</Flag>`).join("\n      ")}
    </FlagsTriggered>
  </Transaction>
  <Narrative><![CDATA[${r.narrative}]]></Narrative>
  <Workflow>
    <PreparedBy>${escapeXml(r.preparedBy)}</PreparedBy>
    ${r.reviewedBy ? `<ReviewedBy>${escapeXml(r.reviewedBy)}</ReviewedBy>` : ""}
    ${r.submittedBy ? `<SubmittedBy>${escapeXml(r.submittedBy)}</SubmittedBy>` : ""}
    <Attachments>${r.attachments}</Attachments>
  </Workflow>
</NfiuReport>`;
}

export async function renderReportPdf(r: RegulatoryReportRow): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 48 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const title = r.type === "STR" ? "Suspicious Transaction Report" : "Currency Transaction Report";

      // Header
      doc.fontSize(18).fillColor("#0f172a").text(title, { continued: false });
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor("#475569").text("SnapFort Compliance · NFIU / CBN Submission");
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor("#0f172a").text(`Report ID: ${r.id}`);
      doc.fontSize(9).fillColor("#475569").text(`Status: ${String(r.status).replace("_", " ").toUpperCase()}`);
      if (r.regulatoryRef) doc.text(`Regulatory Ref: ${r.regulatoryRef}`);
      doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor("#0f172a").stroke();
      doc.moveDown(0.8);

      const section = (label: string) => {
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor("#475569").text(label.toUpperCase());
        doc.moveTo(48, doc.y + 1).lineTo(547, doc.y + 1).strokeColor("#e2e8f0").stroke();
        doc.moveDown(0.3);
      };
      const row = (k: string, v: string) => {
        const y = doc.y;
        doc.fontSize(9).fillColor("#475569").text(k, 48, y, { width: 140 });
        doc.fontSize(10).fillColor("#0f172a").text(v || "—", 188, y, { width: 359 });
        doc.moveDown(0.2);
      };

      section("Report Header");
      row("Report Type", r.type);
      row("Jurisdiction", r.jurisdiction);
      row("Created", fmtDate(r.createdAt));
      row("Deadline", fmtDate(r.deadline));
      row("Submitted", fmtDate(r.submittedAt));
      row("Acknowledged", fmtDate(r.acknowledgedAt));

      section("Subject");
      row("Customer Name", r.customerName);
      row("Customer ID", r.customerId);
      row("Customer Type", r.customerType);

      section("Transaction Details");
      row("Amount", `${fmtMoney(r.amount as unknown as number, r.currency)} (${r.currency})`);
      row("Reason", r.reason);
      const txnIds = (r.transactionIds ?? []) as string[];
      row("Transaction IDs", txnIds.length ? txnIds.join(", ") : "—");
      const flags = (r.flagsTriggered ?? []) as string[];
      row("Flags Triggered", flags.length ? flags.join(", ") : "—");

      section("Narrative");
      doc.fontSize(10).fillColor("#0f172a").text(r.narrative || "—", 48, doc.y, { width: 499, align: "left" });
      doc.moveDown(0.4);

      section("Workflow & Approvals");
      row("Prepared By", r.preparedBy);
      row("Reviewed By", r.reviewedBy ?? "—");
      row("Submitted By", r.submittedBy ?? "—");
      row("Attachments", String(r.attachments ?? 0));

      doc.moveDown(1);
      doc.fontSize(8).fillColor("#64748b").text(
        `Generated by SnapFort Compliance · ${new Date().toISOString()} · Confidential — for regulatory use only.`,
        48,
        doc.y,
        { width: 499, align: "center" },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
