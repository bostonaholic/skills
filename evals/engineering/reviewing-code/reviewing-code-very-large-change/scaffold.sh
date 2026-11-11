#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/billing src/inventory src/shipping
cat >package.json <<'EOF_1'
{
  "name": "acme-fulfillment",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "dayjs": "^1.11.10"
  }
}
EOF_1

cat >package-lock.json <<'EOF_2'
{
  "name": "acme-fulfillment",
  "version": "2.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "acme-fulfillment",
      "version": "2.0.0",
      "dependencies": {
        "dayjs": "^1.11.10"
      }
    },
    "node_modules/dayjs": {
      "version": "1.11.13",
      "resolved": "https://registry.npmjs.org/dayjs/-/dayjs-1.11.13.tgz",
      "integrity": "sha512-oaMBel6gjolK862uaPQOVTA7q3TZhuSvuMQAAglQDOWYO9A91IrAOUJEyKVlqJlHE0vq5p5UXxzdPfMH/x6xNg==",
      "license": "MIT"
    }
  }
}
EOF_2

cat >src/billing/credit-note.js <<'EOF_3'
"use strict";

function normalizeCreditNote(input) {
  return {
    id: String(input.id).trim(),
    memo: String(input.memo || "").trim(),
    customerName: String(input.customerName || "").trim(),
    creditCents: Math.round(Number(input.creditCents) || 0),
    issuedAt: input.issuedAt ? Date.parse(input.issuedAt) : null,
    status: input.status || "issued",
    applicationCount: Number.parseInt(input.applicationCount, 10) || 0,
    customerId: input.customerId ?? null,
  };
}

function creditNotesToCsvRows(creditNotes) {
  const header = ["id", "memo", "status", "creditCents", "applicationCount"];
  const rows = [header.join(",")];
  for (const creditNote of creditNotes) {
    const memo = `"${creditNote.memo.replaceAll('"', '""')}"`;
    rows.push([creditNote.id, memo, creditNote.status, creditNote.creditCents, creditNote.applicationCount].join(","));
  }
  return rows;
}

function creditNotesAbove(creditNotes, minimumCents) {
  const selected = [];
  for (const creditNote of creditNotes) {
    if (creditNote.creditCents >= minimumCents) {
      selected.push(creditNote);
    }
  }
  return selected;
}

function formatCreditNoteLabel(creditNote) {
  const amount = (creditNote.creditCents / 100).toFixed(2);
  const when = creditNote.issuedAt ? new Date(creditNote.issuedAt).toISOString().slice(0, 10) : "no date";
  return `${creditNote.memo} (${creditNote.status}) ${amount} on ${when}`;
}

function sortCreditNotesByIssuedAt(creditNotes) {
  return creditNotes.slice().sort((left, right) => {
    if (left.issuedAt === right.issuedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.issuedAt ?? Infinity) - (right.issuedAt ?? Infinity);
  });
}

function groupCreditNotesByCustomerId(creditNotes) {
  const groups = new Map();
  for (const creditNote of creditNotes) {
    const key = creditNote.customerId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(creditNote);
  }
  return groups;
}

function findCreditNoteById(creditNotes, id) {
  const match = creditNotes.find((creditNote) => creditNote.id === id);
  if (!match) {
    throw new Error(`creditNote not found: ${id}`);
  }
  return match;
}

function summarizeCreditNotes(creditNotes) {
  if (creditNotes.length === 0) {
    return { count: 0, smallest: null, largest: null, totalApplicationCount: 0 };
  }
  let smallest = creditNotes[0].creditCents;
  let largest = creditNotes[0].creditCents;
  let totalApplicationCount = 0;
  for (const creditNote of creditNotes) {
    smallest = Math.min(smallest, creditNote.creditCents);
    largest = Math.max(largest, creditNote.creditCents);
    totalApplicationCount += creditNote.applicationCount;
  }
  return { count: creditNotes.length, smallest, largest, totalApplicationCount };
}

const CREDIT_NOTE_NEXT_STATUS = {
  issued: ["applied", "expired"],
  applied: ["expired"],
  expired: [],
};

function canMoveCreditNoteTo(creditNote, nextStatus) {
  const allowed = CREDIT_NOTE_NEXT_STATUS[creditNote.status] || [];
  return allowed.includes(nextStatus);
}

module.exports = {
  normalizeCreditNote,
  creditNotesToCsvRows,
  creditNotesAbove,
  formatCreditNoteLabel,
  sortCreditNotesByIssuedAt,
  groupCreditNotesByCustomerId,
  findCreditNoteById,
  summarizeCreditNotes,
  canMoveCreditNoteTo,
};
EOF_3

cat >src/billing/invoice.js <<'EOF_4'
"use strict";

function invoicesAbove(invoices, minimumCents) {
  const selected = [];
  for (const invoice of invoices) {
    if (invoice.amountCents >= minimumCents) {
      selected.push(invoice);
    }
  }
  return selected;
}

function findInvoiceById(invoices, id) {
  const match = invoices.find((invoice) => invoice.id === id);
  if (!match) {
    throw new Error(`invoice not found: ${id}`);
  }
  return match;
}

function formatInvoiceLabel(invoice) {
  const amount = (invoice.amountCents / 100).toFixed(2);
  const when = invoice.dueAt ? new Date(invoice.dueAt).toISOString().slice(0, 10) : "no date";
  return `${invoice.customerName} (${invoice.status}) ${amount} on ${when}`;
}

function totalAmountCents(invoices) {
  let total = 0;
  for (const invoice of invoices) {
    total += invoice.amountCents;
  }
  return total;
}

function isInvoicePastDueAt(invoice, nowMs) {
  if (invoice.dueAt === null) {
    return false;
  }
  return invoice.status !== "void" && invoice.dueAt < nowMs;
}

function searchInvoices(invoices, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return invoices.slice();
  }
  return invoices.filter(
    (invoice) =>
      invoice.customerName.toLowerCase().includes(needle) ||
      invoice.reference.toLowerCase().includes(needle),
  );
}

function normalizeInvoice(input) {
  return {
    id: String(input.id).trim(),
    customerName: String(input.customerName || "").trim(),
    reference: String(input.reference || "").trim(),
    amountCents: Math.round(Number(input.amountCents) || 0),
    dueAt: input.dueAt ? Date.parse(input.dueAt) : null,
    status: input.status || "draft",
    lineCount: Number.parseInt(input.lineCount, 10) || 0,
    customerId: input.customerId ?? null,
  };
}

function averageAmountCentsPerCustomerId(invoices) {
  const sums = new Map();
  for (const invoice of invoices) {
    const entry = sums.get(invoice.customerId) || { total: 0, count: 0 };
    entry.total += invoice.amountCents;
    entry.count += 1;
    sums.set(invoice.customerId, entry);
  }
  const averages = new Map();
  for (const [key, entry] of sums) {
    averages.set(key, Math.round(entry.total / entry.count));
  }
  return averages;
}

function sortInvoicesByDueAt(invoices) {
  return invoices.slice().sort((left, right) => {
    if (left.dueAt === right.dueAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.dueAt ?? Infinity) - (right.dueAt ?? Infinity);
  });
}

module.exports = {
  invoicesAbove,
  findInvoiceById,
  formatInvoiceLabel,
  totalAmountCents,
  isInvoicePastDueAt,
  searchInvoices,
  normalizeInvoice,
  averageAmountCentsPerCustomerId,
  sortInvoicesByDueAt,
};
EOF_4

cat >src/billing/ledger-entry.js <<'EOF_5'
"use strict";

function isLedgerEntryPastBookedAt(ledgerEntry, nowMs) {
  if (ledgerEntry.bookedAt === null) {
    return false;
  }
  return ledgerEntry.status !== "reversed" && ledgerEntry.bookedAt < nowMs;
}

function sortLedgerEntriesByBookedAt(ledgerEntries) {
  return ledgerEntries.slice().sort((left, right) => {
    if (left.bookedAt === right.bookedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.bookedAt ?? Infinity) - (right.bookedAt ?? Infinity);
  });
}

function totalDeltaCents(ledgerEntries) {
  let total = 0;
  for (const ledgerEntry of ledgerEntries) {
    total += ledgerEntry.deltaCents;
  }
  return total;
}

function normalizeLedgerEntry(input) {
  return {
    id: String(input.id).trim(),
    account: String(input.account || "").trim(),
    narrative: String(input.narrative || "").trim(),
    deltaCents: Math.round(Number(input.deltaCents) || 0),
    bookedAt: input.bookedAt ? Date.parse(input.bookedAt) : null,
    status: input.status || "pending",
    sequence: Number.parseInt(input.sequence, 10) || 0,
    account: input.account ?? null,
  };
}

function findLedgerEntryById(ledgerEntries, id) {
  const match = ledgerEntries.find((ledgerEntry) => ledgerEntry.id === id);
  if (!match) {
    throw new Error(`ledgerEntry not found: ${id}`);
  }
  return match;
}

function validateLedgerEntry(ledgerEntry) {
  const errors = [];
  if (!ledgerEntry.id) {
    errors.push("ledgerEntry id is required");
  }
  if (!Number.isInteger(ledgerEntry.deltaCents) || ledgerEntry.deltaCents < 0) {
    errors.push("deltaCents must be a non-negative integer");
  }
  if (!["pending", "posted", "reversed"].includes(ledgerEntry.status)) {
    errors.push(`unknown ledgerEntry status: ${ledgerEntry.status}`);
  }
  if (typeof ledgerEntry.account !== "string" || ledgerEntry.account.trim() === "") {
    errors.push("account is required");
  }
  return errors;
}

function ledgerEntrysToCsvRows(ledgerEntries) {
  const header = ["id", "account", "status", "deltaCents", "sequence"];
  const rows = [header.join(",")];
  for (const ledgerEntry of ledgerEntries) {
    const account = `"${ledgerEntry.account.replaceAll('"', '""')}"`;
    rows.push([ledgerEntry.id, account, ledgerEntry.status, ledgerEntry.deltaCents, ledgerEntry.sequence].join(","));
  }
  return rows;
}

function summarizeLedgerEntries(ledgerEntries) {
  if (ledgerEntries.length === 0) {
    return { count: 0, smallest: null, largest: null, totalSequence: 0 };
  }
  let smallest = ledgerEntries[0].deltaCents;
  let largest = ledgerEntries[0].deltaCents;
  let totalSequence = 0;
  for (const ledgerEntry of ledgerEntries) {
    smallest = Math.min(smallest, ledgerEntry.deltaCents);
    largest = Math.max(largest, ledgerEntry.deltaCents);
    totalSequence += ledgerEntry.sequence;
  }
  return { count: ledgerEntries.length, smallest, largest, totalSequence };
}

function formatLedgerEntryLabel(ledgerEntry) {
  const amount = (ledgerEntry.deltaCents / 100).toFixed(2);
  const when = ledgerEntry.bookedAt ? new Date(ledgerEntry.bookedAt).toISOString().slice(0, 10) : "no date";
  return `${ledgerEntry.account} (${ledgerEntry.status}) ${amount} on ${when}`;
}

module.exports = {
  isLedgerEntryPastBookedAt,
  sortLedgerEntriesByBookedAt,
  totalDeltaCents,
  normalizeLedgerEntry,
  findLedgerEntryById,
  validateLedgerEntry,
  ledgerEntrysToCsvRows,
  summarizeLedgerEntries,
  formatLedgerEntryLabel,
};
EOF_5

cat >src/billing/payment.js <<'EOF_6'
"use strict";

function validatePayment(payment) {
  const errors = [];
  if (!payment.id) {
    errors.push("payment id is required");
  }
  if (!Number.isInteger(payment.paidCents) || payment.paidCents < 0) {
    errors.push("paidCents must be a non-negative integer");
  }
  if (!["pending", "settled", "failed"].includes(payment.status)) {
    errors.push(`unknown payment status: ${payment.status}`);
  }
  if (typeof payment.payerName !== "string" || payment.payerName.trim() === "") {
    errors.push("payerName is required");
  }
  return errors;
}

function isPaymentPastReceivedAt(payment, nowMs) {
  if (payment.receivedAt === null) {
    return false;
  }
  return payment.status !== "failed" && payment.receivedAt < nowMs;
}

function paymentsToCsvRows(payments) {
  const header = ["id", "payerName", "status", "paidCents", "attemptCount"];
  const rows = [header.join(",")];
  for (const payment of payments) {
    const payerName = `"${payment.payerName.replaceAll('"', '""')}"`;
    rows.push([payment.id, payerName, payment.status, payment.paidCents, payment.attemptCount].join(","));
  }
  return rows;
}

function findPaymentById(payments, id) {
  const match = payments.find((payment) => payment.id === id);
  if (!match) {
    throw new Error(`payment not found: ${id}`);
  }
  return match;
}

function totalPaidCents(payments) {
  let total = 0;
  for (const payment of payments) {
    total += payment.paidCents;
  }
  return total;
}

function averagePaidCentsPerInvoiceId(payments) {
  const sums = new Map();
  for (const payment of payments) {
    const entry = sums.get(payment.invoiceId) || { total: 0, count: 0 };
    entry.total += payment.paidCents;
    entry.count += 1;
    sums.set(payment.invoiceId, entry);
  }
  const averages = new Map();
  for (const [key, entry] of sums) {
    averages.set(key, Math.round(entry.total / entry.count));
  }
  return averages;
}

function formatPaymentLabel(payment) {
  const amount = (payment.paidCents / 100).toFixed(2);
  const when = payment.receivedAt ? new Date(payment.receivedAt).toISOString().slice(0, 10) : "no date";
  return `${payment.payerName} (${payment.status}) ${amount} on ${when}`;
}

function normalizePayment(input) {
  return {
    id: String(input.id).trim(),
    payerName: String(input.payerName || "").trim(),
    method: String(input.method || "").trim(),
    paidCents: Math.round(Number(input.paidCents) || 0),
    receivedAt: input.receivedAt ? Date.parse(input.receivedAt) : null,
    status: input.status || "pending",
    attemptCount: Number.parseInt(input.attemptCount, 10) || 0,
    invoiceId: input.invoiceId ?? null,
  };
}

module.exports = {
  validatePayment,
  isPaymentPastReceivedAt,
  paymentsToCsvRows,
  findPaymentById,
  totalPaidCents,
  averagePaidCentsPerInvoiceId,
  formatPaymentLabel,
  normalizePayment,
};
EOF_6

cat >src/billing/refund.js <<'EOF_7'
"use strict";

function summarizeRefunds(refunds) {
  if (refunds.length === 0) {
    return { count: 0, smallest: null, largest: null, totalItemCount: 0 };
  }
  let smallest = refunds[0].refundCents;
  let largest = refunds[0].refundCents;
  let totalItemCount = 0;
  for (const refund of refunds) {
    smallest = Math.min(smallest, refund.refundCents);
    largest = Math.max(largest, refund.refundCents);
    totalItemCount += refund.itemCount;
  }
  return { count: refunds.length, smallest, largest, totalItemCount };
}

function groupRefundsByPaymentId(refunds) {
  const groups = new Map();
  for (const refund of refunds) {
    const key = refund.paymentId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(refund);
  }
  return groups;
}

function normalizeRefund(input) {
  return {
    id: String(input.id).trim(),
    reason: String(input.reason || "").trim(),
    approverName: String(input.approverName || "").trim(),
    refundCents: Math.round(Number(input.refundCents) || 0),
    requestedAt: input.requestedAt ? Date.parse(input.requestedAt) : null,
    status: input.status || "requested",
    itemCount: Number.parseInt(input.itemCount, 10) || 0,
    paymentId: input.paymentId ?? null,
  };
}

const REFUND_NEXT_STATUS = {
  requested: ["approved", "rejected", "issued"],
  approved: ["rejected", "issued"],
  rejected: ["issued"],
  issued: [],
};

function canMoveRefundTo(refund, nextStatus) {
  const allowed = REFUND_NEXT_STATUS[refund.status] || [];
  return allowed.includes(nextStatus);
}

function refundsToCsvRows(refunds) {
  const header = ["id", "reason", "status", "refundCents", "itemCount"];
  const rows = [header.join(",")];
  for (const refund of refunds) {
    const reason = `"${refund.reason.replaceAll('"', '""')}"`;
    rows.push([refund.id, reason, refund.status, refund.refundCents, refund.itemCount].join(","));
  }
  return rows;
}

function searchRefunds(refunds, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return refunds.slice();
  }
  return refunds.filter(
    (refund) =>
      refund.reason.toLowerCase().includes(needle) ||
      refund.approverName.toLowerCase().includes(needle),
  );
}

function validateRefund(refund) {
  const errors = [];
  if (!refund.id) {
    errors.push("refund id is required");
  }
  if (!Number.isInteger(refund.refundCents) || refund.refundCents < 0) {
    errors.push("refundCents must be a non-negative integer");
  }
  if (!["requested", "approved", "rejected", "issued"].includes(refund.status)) {
    errors.push(`unknown refund status: ${refund.status}`);
  }
  if (typeof refund.reason !== "string" || refund.reason.trim() === "") {
    errors.push("reason is required");
  }
  return errors;
}

function isRefundPastRequestedAt(refund, nowMs) {
  if (refund.requestedAt === null) {
    return false;
  }
  return refund.status !== "issued" && refund.requestedAt < nowMs;
}

function formatRefundLabel(refund) {
  const amount = (refund.refundCents / 100).toFixed(2);
  const when = refund.requestedAt ? new Date(refund.requestedAt).toISOString().slice(0, 10) : "no date";
  return `${refund.reason} (${refund.status}) ${amount} on ${when}`;
}

module.exports = {
  summarizeRefunds,
  groupRefundsByPaymentId,
  normalizeRefund,
  canMoveRefundTo,
  refundsToCsvRows,
  searchRefunds,
  validateRefund,
  isRefundPastRequestedAt,
  formatRefundLabel,
};
EOF_7

cat >src/billing/subscription.js <<'EOF_8'
"use strict";

function isSubscriptionPastRenewsAt(subscription, nowMs) {
  if (subscription.renewsAt === null) {
    return false;
  }
  return subscription.status !== "cancelled" && subscription.renewsAt < nowMs;
}

function averageMonthlyCentsPerPlanId(subscriptions) {
  const sums = new Map();
  for (const subscription of subscriptions) {
    const entry = sums.get(subscription.planId) || { total: 0, count: 0 };
    entry.total += subscription.monthlyCents;
    entry.count += 1;
    sums.set(subscription.planId, entry);
  }
  const averages = new Map();
  for (const [key, entry] of sums) {
    averages.set(key, Math.round(entry.total / entry.count));
  }
  return averages;
}

function subscriptionsAbove(subscriptions, minimumCents) {
  const selected = [];
  for (const subscription of subscriptions) {
    if (subscription.monthlyCents >= minimumCents) {
      selected.push(subscription);
    }
  }
  return selected;
}

const SUBSCRIPTION_NEXT_STATUS = {
  trialing: ["active", "pastDue", "cancelled"],
  active: ["pastDue", "cancelled"],
  pastDue: ["cancelled"],
  cancelled: [],
};

function canMoveSubscriptionTo(subscription, nextStatus) {
  const allowed = SUBSCRIPTION_NEXT_STATUS[subscription.status] || [];
  return allowed.includes(nextStatus);
}

function totalMonthlyCents(subscriptions) {
  let total = 0;
  for (const subscription of subscriptions) {
    total += subscription.monthlyCents;
  }
  return total;
}

function groupSubscriptionsByPlanId(subscriptions) {
  const groups = new Map();
  for (const subscription of subscriptions) {
    const key = subscription.planId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(subscription);
  }
  return groups;
}

function subscriptionsToCsvRows(subscriptions) {
  const header = ["id", "planName", "status", "monthlyCents", "seatCount"];
  const rows = [header.join(",")];
  for (const subscription of subscriptions) {
    const planName = `"${subscription.planName.replaceAll('"', '""')}"`;
    rows.push([subscription.id, planName, subscription.status, subscription.monthlyCents, subscription.seatCount].join(","));
  }
  return rows;
}

function summarizeSubscriptions(subscriptions) {
  if (subscriptions.length === 0) {
    return { count: 0, smallest: null, largest: null, totalSeatCount: 0 };
  }
  let smallest = subscriptions[0].monthlyCents;
  let largest = subscriptions[0].monthlyCents;
  let totalSeatCount = 0;
  for (const subscription of subscriptions) {
    smallest = Math.min(smallest, subscription.monthlyCents);
    largest = Math.max(largest, subscription.monthlyCents);
    totalSeatCount += subscription.seatCount;
  }
  return { count: subscriptions.length, smallest, largest, totalSeatCount };
}

function splitSubscriptionsByStatus(subscriptions) {
  const byStatus = {};
  byStatus.trialing = [];
  byStatus.active = [];
  byStatus.pastDue = [];
  byStatus.cancelled = [];
  for (const subscription of subscriptions) {
    if (byStatus[subscription.status]) {
      byStatus[subscription.status].push(subscription);
    }
  }
  return byStatus;
}

module.exports = {
  isSubscriptionPastRenewsAt,
  averageMonthlyCentsPerPlanId,
  subscriptionsAbove,
  canMoveSubscriptionTo,
  totalMonthlyCents,
  groupSubscriptionsByPlanId,
  subscriptionsToCsvRows,
  summarizeSubscriptions,
  splitSubscriptionsByStatus,
};
EOF_8

cat >src/billing/tax-line.js <<'EOF_9'
"use strict";

function totalTaxCents(taxLines) {
  let total = 0;
  for (const taxLine of taxLines) {
    total += taxLine.taxCents;
  }
  return total;
}

function isTaxLinePastPostedAt(taxLine, nowMs) {
  if (taxLine.postedAt === null) {
    return false;
  }
  return taxLine.status !== "final" && taxLine.postedAt < nowMs;
}

function taxLinesToCsvRows(taxLines) {
  const header = ["id", "jurisdiction", "status", "taxCents", "rateBasisPoints"];
  const rows = [header.join(",")];
  for (const taxLine of taxLines) {
    const jurisdiction = `"${taxLine.jurisdiction.replaceAll('"', '""')}"`;
    rows.push([taxLine.id, jurisdiction, taxLine.status, taxLine.taxCents, taxLine.rateBasisPoints].join(","));
  }
  return rows;
}

function groupTaxLinesByInvoiceId(taxLines) {
  const groups = new Map();
  for (const taxLine of taxLines) {
    const key = taxLine.invoiceId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(taxLine);
  }
  return groups;
}

function sortTaxLinesByPostedAt(taxLines) {
  return taxLines.slice().sort((left, right) => {
    if (left.postedAt === right.postedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.postedAt ?? Infinity) - (right.postedAt ?? Infinity);
  });
}

function findTaxLineById(taxLines, id) {
  const match = taxLines.find((taxLine) => taxLine.id === id);
  if (!match) {
    throw new Error(`taxLine not found: ${id}`);
  }
  return match;
}

function validateTaxLine(taxLine) {
  const errors = [];
  if (!taxLine.id) {
    errors.push("taxLine id is required");
  }
  if (!Number.isInteger(taxLine.taxCents) || taxLine.taxCents < 0) {
    errors.push("taxCents must be a non-negative integer");
  }
  if (!["estimated", "final"].includes(taxLine.status)) {
    errors.push(`unknown taxLine status: ${taxLine.status}`);
  }
  if (typeof taxLine.jurisdiction !== "string" || taxLine.jurisdiction.trim() === "") {
    errors.push("jurisdiction is required");
  }
  return errors;
}

function taxLinesAbove(taxLines, minimumCents) {
  const selected = [];
  for (const taxLine of taxLines) {
    if (taxLine.taxCents >= minimumCents) {
      selected.push(taxLine);
    }
  }
  return selected;
}

function splitTaxLinesByStatus(taxLines) {
  const byStatus = {};
  byStatus.estimated = [];
  byStatus.final = [];
  for (const taxLine of taxLines) {
    if (byStatus[taxLine.status]) {
      byStatus[taxLine.status].push(taxLine);
    }
  }
  return byStatus;
}

module.exports = {
  totalTaxCents,
  isTaxLinePastPostedAt,
  taxLinesToCsvRows,
  groupTaxLinesByInvoiceId,
  sortTaxLinesByPostedAt,
  findTaxLineById,
  validateTaxLine,
  taxLinesAbove,
  splitTaxLinesByStatus,
};
EOF_9

cat >src/inventory/batch.js <<'EOF_10'
"use strict";

function isBatchPastBestBefore(batch, nowMs) {
  if (batch.bestBefore === null) {
    return false;
  }
  return batch.status !== "recalled" && batch.bestBefore < nowMs;
}

function totalValueCents(batches) {
  let total = 0;
  for (const batch of batches) {
    total += batch.valueCents;
  }
  return total;
}

function summarizeBatches(batches) {
  if (batches.length === 0) {
    return { count: 0, smallest: null, largest: null, totalUnitCount: 0 };
  }
  let smallest = batches[0].valueCents;
  let largest = batches[0].valueCents;
  let totalUnitCount = 0;
  for (const batch of batches) {
    smallest = Math.min(smallest, batch.valueCents);
    largest = Math.max(largest, batch.valueCents);
    totalUnitCount += batch.unitCount;
  }
  return { count: batches.length, smallest, largest, totalUnitCount };
}

function findBatchById(batches, id) {
  const match = batches.find((batch) => batch.id === id);
  if (!match) {
    throw new Error(`batch not found: ${id}`);
  }
  return match;
}

function normalizeBatch(input) {
  return {
    id: String(input.id).trim(),
    lotCode: String(input.lotCode || "").trim(),
    origin: String(input.origin || "").trim(),
    valueCents: Math.round(Number(input.valueCents) || 0),
    bestBefore: input.bestBefore ? Date.parse(input.bestBefore) : null,
    status: input.status || "quarantined",
    unitCount: Number.parseInt(input.unitCount, 10) || 0,
    sku: input.sku ?? null,
  };
}

function batchesAbove(batches, minimumCents) {
  const selected = [];
  for (const batch of batches) {
    if (batch.valueCents >= minimumCents) {
      selected.push(batch);
    }
  }
  return selected;
}

function batchsToCsvRows(batches) {
  const header = ["id", "lotCode", "status", "valueCents", "unitCount"];
  const rows = [header.join(",")];
  for (const batch of batches) {
    const lotCode = `"${batch.lotCode.replaceAll('"', '""')}"`;
    rows.push([batch.id, lotCode, batch.status, batch.valueCents, batch.unitCount].join(","));
  }
  return rows;
}

function sortBatchesByBestBefore(batches) {
  return batches.slice().sort((left, right) => {
    if (left.bestBefore === right.bestBefore) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.bestBefore ?? Infinity) - (right.bestBefore ?? Infinity);
  });
}

module.exports = {
  isBatchPastBestBefore,
  totalValueCents,
  summarizeBatches,
  findBatchById,
  normalizeBatch,
  batchesAbove,
  batchsToCsvRows,
  sortBatchesByBestBefore,
};
EOF_10

cat >src/inventory/purchase-order.js <<'EOF_11'
"use strict";

function formatPurchaseOrderLabel(purchaseOrder) {
  const amount = (purchaseOrder.totalCents / 100).toFixed(2);
  const when = purchaseOrder.expectedAt ? new Date(purchaseOrder.expectedAt).toISOString().slice(0, 10) : "no date";
  return `${purchaseOrder.poNumber} (${purchaseOrder.status}) ${amount} on ${when}`;
}

const PURCHASE_ORDER_NEXT_STATUS = {
  draft: ["sent", "received", "cancelled"],
  sent: ["received", "cancelled"],
  received: ["cancelled"],
  cancelled: [],
};

function canMovePurchaseOrderTo(purchaseOrder, nextStatus) {
  const allowed = PURCHASE_ORDER_NEXT_STATUS[purchaseOrder.status] || [];
  return allowed.includes(nextStatus);
}

function searchPurchaseOrders(purchaseOrders, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return purchaseOrders.slice();
  }
  return purchaseOrders.filter(
    (purchaseOrder) =>
      purchaseOrder.poNumber.toLowerCase().includes(needle) ||
      purchaseOrder.buyerName.toLowerCase().includes(needle),
  );
}

function summarizePurchaseOrders(purchaseOrders) {
  if (purchaseOrders.length === 0) {
    return { count: 0, smallest: null, largest: null, totalLineCount: 0 };
  }
  let smallest = purchaseOrders[0].totalCents;
  let largest = purchaseOrders[0].totalCents;
  let totalLineCount = 0;
  for (const purchaseOrder of purchaseOrders) {
    smallest = Math.min(smallest, purchaseOrder.totalCents);
    largest = Math.max(largest, purchaseOrder.totalCents);
    totalLineCount += purchaseOrder.lineCount;
  }
  return { count: purchaseOrders.length, smallest, largest, totalLineCount };
}

function validatePurchaseOrder(purchaseOrder) {
  const errors = [];
  if (!purchaseOrder.id) {
    errors.push("purchaseOrder id is required");
  }
  if (!Number.isInteger(purchaseOrder.totalCents) || purchaseOrder.totalCents < 0) {
    errors.push("totalCents must be a non-negative integer");
  }
  if (!["draft", "sent", "received", "cancelled"].includes(purchaseOrder.status)) {
    errors.push(`unknown purchaseOrder status: ${purchaseOrder.status}`);
  }
  if (typeof purchaseOrder.poNumber !== "string" || purchaseOrder.poNumber.trim() === "") {
    errors.push("poNumber is required");
  }
  return errors;
}

function normalizePurchaseOrder(input) {
  return {
    id: String(input.id).trim(),
    poNumber: String(input.poNumber || "").trim(),
    buyerName: String(input.buyerName || "").trim(),
    totalCents: Math.round(Number(input.totalCents) || 0),
    expectedAt: input.expectedAt ? Date.parse(input.expectedAt) : null,
    status: input.status || "draft",
    lineCount: Number.parseInt(input.lineCount, 10) || 0,
    supplierId: input.supplierId ?? null,
  };
}

function findPurchaseOrderById(purchaseOrders, id) {
  const match = purchaseOrders.find((purchaseOrder) => purchaseOrder.id === id);
  if (!match) {
    throw new Error(`purchaseOrder not found: ${id}`);
  }
  return match;
}

function splitPurchaseOrdersByStatus(purchaseOrders) {
  const byStatus = {};
  byStatus.draft = [];
  byStatus.sent = [];
  byStatus.received = [];
  byStatus.cancelled = [];
  for (const purchaseOrder of purchaseOrders) {
    if (byStatus[purchaseOrder.status]) {
      byStatus[purchaseOrder.status].push(purchaseOrder);
    }
  }
  return byStatus;
}

module.exports = {
  formatPurchaseOrderLabel,
  canMovePurchaseOrderTo,
  searchPurchaseOrders,
  summarizePurchaseOrders,
  validatePurchaseOrder,
  normalizePurchaseOrder,
  findPurchaseOrderById,
  splitPurchaseOrdersByStatus,
};
EOF_11

cat >src/inventory/reservation.js <<'EOF_12'
"use strict";

function reservationsAbove(reservations, minimumCents) {
  const selected = [];
  for (const reservation of reservations) {
    if (reservation.heldValueCents >= minimumCents) {
      selected.push(reservation);
    }
  }
  return selected;
}

function findReservationById(reservations, id) {
  const match = reservations.find((reservation) => reservation.id === id);
  if (!match) {
    throw new Error(`reservation not found: ${id}`);
  }
  return match;
}

function validateReservation(reservation) {
  const errors = [];
  if (!reservation.id) {
    errors.push("reservation id is required");
  }
  if (!Number.isInteger(reservation.heldValueCents) || reservation.heldValueCents < 0) {
    errors.push("heldValueCents must be a non-negative integer");
  }
  if (!["held", "released", "consumed"].includes(reservation.status)) {
    errors.push(`unknown reservation status: ${reservation.status}`);
  }
  if (typeof reservation.orderReference !== "string" || reservation.orderReference.trim() === "") {
    errors.push("orderReference is required");
  }
  return errors;
}

const RESERVATION_NEXT_STATUS = {
  held: ["released", "consumed"],
  released: ["consumed"],
  consumed: [],
};

function canMoveReservationTo(reservation, nextStatus) {
  const allowed = RESERVATION_NEXT_STATUS[reservation.status] || [];
  return allowed.includes(nextStatus);
}

function groupReservationsByOrderReference(reservations) {
  const groups = new Map();
  for (const reservation of reservations) {
    const key = reservation.orderReference;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(reservation);
  }
  return groups;
}

function splitReservationsByStatus(reservations) {
  const byStatus = {};
  byStatus.held = [];
  byStatus.released = [];
  byStatus.consumed = [];
  for (const reservation of reservations) {
    if (byStatus[reservation.status]) {
      byStatus[reservation.status].push(reservation);
    }
  }
  return byStatus;
}

function totalHeldValueCents(reservations) {
  let total = 0;
  for (const reservation of reservations) {
    total += reservation.heldValueCents;
  }
  return total;
}

function sortReservationsByExpiresAt(reservations) {
  return reservations.slice().sort((left, right) => {
    if (left.expiresAt === right.expiresAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.expiresAt ?? Infinity) - (right.expiresAt ?? Infinity);
  });
}

function normalizeReservation(input) {
  return {
    id: String(input.id).trim(),
    orderReference: String(input.orderReference || "").trim(),
    sku: String(input.sku || "").trim(),
    heldValueCents: Math.round(Number(input.heldValueCents) || 0),
    expiresAt: input.expiresAt ? Date.parse(input.expiresAt) : null,
    status: input.status || "held",
    quantity: Number.parseInt(input.quantity, 10) || 0,
    orderReference: input.orderReference ?? null,
  };
}

module.exports = {
  reservationsAbove,
  findReservationById,
  validateReservation,
  canMoveReservationTo,
  groupReservationsByOrderReference,
  splitReservationsByStatus,
  totalHeldValueCents,
  sortReservationsByExpiresAt,
  normalizeReservation,
};
EOF_12

cat >src/inventory/stock-item.js <<'EOF_13'
"use strict";

function formatStockItemLabel(stockItem) {
  const amount = (stockItem.unitCostCents / 100).toFixed(2);
  const when = stockItem.countedAt ? new Date(stockItem.countedAt).toISOString().slice(0, 10) : "no date";
  return `${stockItem.sku} (${stockItem.status}) ${amount} on ${when}`;
}

function averageUnitCostCentsPerWarehouseId(stockItems) {
  const sums = new Map();
  for (const stockItem of stockItems) {
    const entry = sums.get(stockItem.warehouseId) || { total: 0, count: 0 };
    entry.total += stockItem.unitCostCents;
    entry.count += 1;
    sums.set(stockItem.warehouseId, entry);
  }
  const averages = new Map();
  for (const [key, entry] of sums) {
    averages.set(key, Math.round(entry.total / entry.count));
  }
  return averages;
}

function summarizeStockItems(stockItems) {
  if (stockItems.length === 0) {
    return { count: 0, smallest: null, largest: null, totalOnHand: 0 };
  }
  let smallest = stockItems[0].unitCostCents;
  let largest = stockItems[0].unitCostCents;
  let totalOnHand = 0;
  for (const stockItem of stockItems) {
    smallest = Math.min(smallest, stockItem.unitCostCents);
    largest = Math.max(largest, stockItem.unitCostCents);
    totalOnHand += stockItem.onHand;
  }
  return { count: stockItems.length, smallest, largest, totalOnHand };
}

const STOCK_ITEM_NEXT_STATUS = {
  active: ["discontinued"],
  discontinued: [],
};

function canMoveStockItemTo(stockItem, nextStatus) {
  const allowed = STOCK_ITEM_NEXT_STATUS[stockItem.status] || [];
  return allowed.includes(nextStatus);
}

function groupStockItemsByWarehouseId(stockItems) {
  const groups = new Map();
  for (const stockItem of stockItems) {
    const key = stockItem.warehouseId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(stockItem);
  }
  return groups;
}

function isStockItemPastCountedAt(stockItem, nowMs) {
  if (stockItem.countedAt === null) {
    return false;
  }
  return stockItem.status !== "discontinued" && stockItem.countedAt < nowMs;
}

function stockItemsToCsvRows(stockItems) {
  const header = ["id", "sku", "status", "unitCostCents", "onHand"];
  const rows = [header.join(",")];
  for (const stockItem of stockItems) {
    const sku = `"${stockItem.sku.replaceAll('"', '""')}"`;
    rows.push([stockItem.id, sku, stockItem.status, stockItem.unitCostCents, stockItem.onHand].join(","));
  }
  return rows;
}

function splitStockItemsByStatus(stockItems) {
  const byStatus = {};
  byStatus.active = [];
  byStatus.discontinued = [];
  for (const stockItem of stockItems) {
    if (byStatus[stockItem.status]) {
      byStatus[stockItem.status].push(stockItem);
    }
  }
  return byStatus;
}

module.exports = {
  formatStockItemLabel,
  averageUnitCostCentsPerWarehouseId,
  summarizeStockItems,
  canMoveStockItemTo,
  groupStockItemsByWarehouseId,
  isStockItemPastCountedAt,
  stockItemsToCsvRows,
  splitStockItemsByStatus,
};
EOF_13

cat >src/inventory/stock-move.js <<'EOF_14'
"use strict";

function findStockMoveById(stockMoves, id) {
  const match = stockMoves.find((stockMove) => stockMove.id === id);
  if (!match) {
    throw new Error(`stockMove not found: ${id}`);
  }
  return match;
}

function stockMovesAbove(stockMoves, minimumCents) {
  const selected = [];
  for (const stockMove of stockMoves) {
    if (stockMove.movedValueCents >= minimumCents) {
      selected.push(stockMove);
    }
  }
  return selected;
}

function normalizeStockMove(input) {
  return {
    id: String(input.id).trim(),
    fromBin: String(input.fromBin || "").trim(),
    toBin: String(input.toBin || "").trim(),
    movedValueCents: Math.round(Number(input.movedValueCents) || 0),
    movedAt: input.movedAt ? Date.parse(input.movedAt) : null,
    status: input.status || "planned",
    quantity: Number.parseInt(input.quantity, 10) || 0,
    sku: input.sku ?? null,
  };
}

function sortStockMovesByMovedAt(stockMoves) {
  return stockMoves.slice().sort((left, right) => {
    if (left.movedAt === right.movedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.movedAt ?? Infinity) - (right.movedAt ?? Infinity);
  });
}

function summarizeStockMoves(stockMoves) {
  if (stockMoves.length === 0) {
    return { count: 0, smallest: null, largest: null, totalQuantity: 0 };
  }
  let smallest = stockMoves[0].movedValueCents;
  let largest = stockMoves[0].movedValueCents;
  let totalQuantity = 0;
  for (const stockMove of stockMoves) {
    smallest = Math.min(smallest, stockMove.movedValueCents);
    largest = Math.max(largest, stockMove.movedValueCents);
    totalQuantity += stockMove.quantity;
  }
  return { count: stockMoves.length, smallest, largest, totalQuantity };
}

function splitStockMovesByStatus(stockMoves) {
  const byStatus = {};
  byStatus.planned = [];
  byStatus.done = [];
  byStatus.cancelled = [];
  for (const stockMove of stockMoves) {
    if (byStatus[stockMove.status]) {
      byStatus[stockMove.status].push(stockMove);
    }
  }
  return byStatus;
}

function averageMovedValueCentsPerSku(stockMoves) {
  const sums = new Map();
  for (const stockMove of stockMoves) {
    const entry = sums.get(stockMove.sku) || { total: 0, count: 0 };
    entry.total += stockMove.movedValueCents;
    entry.count += 1;
    sums.set(stockMove.sku, entry);
  }
  const averages = new Map();
  for (const [key, entry] of sums) {
    averages.set(key, Math.round(entry.total / entry.count));
  }
  return averages;
}

function totalMovedValueCents(stockMoves) {
  let total = 0;
  for (const stockMove of stockMoves) {
    total += stockMove.movedValueCents;
  }
  return total;
}

function isStockMovePastMovedAt(stockMove, nowMs) {
  if (stockMove.movedAt === null) {
    return false;
  }
  return stockMove.status !== "cancelled" && stockMove.movedAt < nowMs;
}

module.exports = {
  findStockMoveById,
  stockMovesAbove,
  normalizeStockMove,
  sortStockMovesByMovedAt,
  summarizeStockMoves,
  splitStockMovesByStatus,
  averageMovedValueCentsPerSku,
  totalMovedValueCents,
  isStockMovePastMovedAt,
};
EOF_14

cat >src/inventory/supplier.js <<'EOF_15'
"use strict";

function normalizeSupplier(input) {
  return {
    id: String(input.id).trim(),
    legalName: String(input.legalName || "").trim(),
    contactEmail: String(input.contactEmail || "").trim(),
    creditLimitCents: Math.round(Number(input.creditLimitCents) || 0),
    reviewedAt: input.reviewedAt ? Date.parse(input.reviewedAt) : null,
    status: input.status || "approved",
    leadTimeDays: Number.parseInt(input.leadTimeDays, 10) || 0,
    country: input.country ?? null,
  };
}

function sortSuppliersByReviewedAt(suppliers) {
  return suppliers.slice().sort((left, right) => {
    if (left.reviewedAt === right.reviewedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.reviewedAt ?? Infinity) - (right.reviewedAt ?? Infinity);
  });
}

function summarizeSuppliers(suppliers) {
  if (suppliers.length === 0) {
    return { count: 0, smallest: null, largest: null, totalLeadTimeDays: 0 };
  }
  let smallest = suppliers[0].creditLimitCents;
  let largest = suppliers[0].creditLimitCents;
  let totalLeadTimeDays = 0;
  for (const supplier of suppliers) {
    smallest = Math.min(smallest, supplier.creditLimitCents);
    largest = Math.max(largest, supplier.creditLimitCents);
    totalLeadTimeDays += supplier.leadTimeDays;
  }
  return { count: suppliers.length, smallest, largest, totalLeadTimeDays };
}

function findSupplierById(suppliers, id) {
  const match = suppliers.find((supplier) => supplier.id === id);
  if (!match) {
    throw new Error(`supplier not found: ${id}`);
  }
  return match;
}

function averageCreditLimitCentsPerCountry(suppliers) {
  const sums = new Map();
  for (const supplier of suppliers) {
    const entry = sums.get(supplier.country) || { total: 0, count: 0 };
    entry.total += supplier.creditLimitCents;
    entry.count += 1;
    sums.set(supplier.country, entry);
  }
  const averages = new Map();
  for (const [key, entry] of sums) {
    averages.set(key, Math.round(entry.total / entry.count));
  }
  return averages;
}

function isSupplierPastReviewedAt(supplier, nowMs) {
  if (supplier.reviewedAt === null) {
    return false;
  }
  return supplier.status !== "blocked" && supplier.reviewedAt < nowMs;
}

function suppliersToCsvRows(suppliers) {
  const header = ["id", "legalName", "status", "creditLimitCents", "leadTimeDays"];
  const rows = [header.join(",")];
  for (const supplier of suppliers) {
    const legalName = `"${supplier.legalName.replaceAll('"', '""')}"`;
    rows.push([supplier.id, legalName, supplier.status, supplier.creditLimitCents, supplier.leadTimeDays].join(","));
  }
  return rows;
}

function validateSupplier(supplier) {
  const errors = [];
  if (!supplier.id) {
    errors.push("supplier id is required");
  }
  if (!Number.isInteger(supplier.creditLimitCents) || supplier.creditLimitCents < 0) {
    errors.push("creditLimitCents must be a non-negative integer");
  }
  if (!["approved", "probation", "blocked"].includes(supplier.status)) {
    errors.push(`unknown supplier status: ${supplier.status}`);
  }
  if (typeof supplier.legalName !== "string" || supplier.legalName.trim() === "") {
    errors.push("legalName is required");
  }
  return errors;
}

function splitSuppliersByStatus(suppliers) {
  const byStatus = {};
  byStatus.approved = [];
  byStatus.probation = [];
  byStatus.blocked = [];
  for (const supplier of suppliers) {
    if (byStatus[supplier.status]) {
      byStatus[supplier.status].push(supplier);
    }
  }
  return byStatus;
}

module.exports = {
  normalizeSupplier,
  sortSuppliersByReviewedAt,
  summarizeSuppliers,
  findSupplierById,
  averageCreditLimitCentsPerCountry,
  isSupplierPastReviewedAt,
  suppliersToCsvRows,
  validateSupplier,
  splitSuppliersByStatus,
};
EOF_15

cat >src/inventory/warehouse.js <<'EOF_16'
"use strict";

function isWarehousePastOpenedAt(warehouse, nowMs) {
  if (warehouse.openedAt === null) {
    return false;
  }
  return warehouse.status !== "closed" && warehouse.openedAt < nowMs;
}

function sortWarehousesByOpenedAt(warehouses) {
  return warehouses.slice().sort((left, right) => {
    if (left.openedAt === right.openedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.openedAt ?? Infinity) - (right.openedAt ?? Infinity);
  });
}

const WAREHOUSE_NEXT_STATUS = {
  open: ["closing", "closed"],
  closing: ["closed"],
  closed: [],
};

function canMoveWarehouseTo(warehouse, nextStatus) {
  const allowed = WAREHOUSE_NEXT_STATUS[warehouse.status] || [];
  return allowed.includes(nextStatus);
}

function findWarehouseById(warehouses, id) {
  const match = warehouses.find((warehouse) => warehouse.id === id);
  if (!match) {
    throw new Error(`warehouse not found: ${id}`);
  }
  return match;
}

function searchWarehouses(warehouses, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return warehouses.slice();
  }
  return warehouses.filter(
    (warehouse) =>
      warehouse.code.toLowerCase().includes(needle) ||
      warehouse.city.toLowerCase().includes(needle),
  );
}

function groupWarehousesByRegion(warehouses) {
  const groups = new Map();
  for (const warehouse of warehouses) {
    const key = warehouse.region;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(warehouse);
  }
  return groups;
}

function validateWarehouse(warehouse) {
  const errors = [];
  if (!warehouse.id) {
    errors.push("warehouse id is required");
  }
  if (!Number.isInteger(warehouse.monthlyRentCents) || warehouse.monthlyRentCents < 0) {
    errors.push("monthlyRentCents must be a non-negative integer");
  }
  if (!["open", "closing", "closed"].includes(warehouse.status)) {
    errors.push(`unknown warehouse status: ${warehouse.status}`);
  }
  if (typeof warehouse.code !== "string" || warehouse.code.trim() === "") {
    errors.push("code is required");
  }
  return errors;
}

function splitWarehousesByStatus(warehouses) {
  const byStatus = {};
  byStatus.open = [];
  byStatus.closing = [];
  byStatus.closed = [];
  for (const warehouse of warehouses) {
    if (byStatus[warehouse.status]) {
      byStatus[warehouse.status].push(warehouse);
    }
  }
  return byStatus;
}

function totalMonthlyRentCents(warehouses) {
  let total = 0;
  for (const warehouse of warehouses) {
    total += warehouse.monthlyRentCents;
  }
  return total;
}

module.exports = {
  isWarehousePastOpenedAt,
  sortWarehousesByOpenedAt,
  canMoveWarehouseTo,
  findWarehouseById,
  searchWarehouses,
  groupWarehousesByRegion,
  validateWarehouse,
  splitWarehousesByStatus,
  totalMonthlyRentCents,
};
EOF_16

cat >src/shipping/carrier.js <<'EOF_17'
"use strict";

function totalBaseRateCents(carriers) {
  let total = 0;
  for (const carrier of carriers) {
    total += carrier.baseRateCents;
  }
  return total;
}

function splitCarriersByStatus(carriers) {
  const byStatus = {};
  byStatus.active = [];
  byStatus.suspended = [];
  for (const carrier of carriers) {
    if (byStatus[carrier.status]) {
      byStatus[carrier.status].push(carrier);
    }
  }
  return byStatus;
}

const CARRIER_NEXT_STATUS = {
  active: ["suspended"],
  suspended: [],
};

function canMoveCarrierTo(carrier, nextStatus) {
  const allowed = CARRIER_NEXT_STATUS[carrier.status] || [];
  return allowed.includes(nextStatus);
}

function isCarrierPastContractEndsAt(carrier, nowMs) {
  if (carrier.contractEndsAt === null) {
    return false;
  }
  return carrier.status !== "suspended" && carrier.contractEndsAt < nowMs;
}

function summarizeCarriers(carriers) {
  if (carriers.length === 0) {
    return { count: 0, smallest: null, largest: null, totalDailyPickupLimit: 0 };
  }
  let smallest = carriers[0].baseRateCents;
  let largest = carriers[0].baseRateCents;
  let totalDailyPickupLimit = 0;
  for (const carrier of carriers) {
    smallest = Math.min(smallest, carrier.baseRateCents);
    largest = Math.max(largest, carrier.baseRateCents);
    totalDailyPickupLimit += carrier.dailyPickupLimit;
  }
  return { count: carriers.length, smallest, largest, totalDailyPickupLimit };
}

function normalizeCarrier(input) {
  return {
    id: String(input.id).trim(),
    name: String(input.name || "").trim(),
    serviceLevel: String(input.serviceLevel || "").trim(),
    baseRateCents: Math.round(Number(input.baseRateCents) || 0),
    contractEndsAt: input.contractEndsAt ? Date.parse(input.contractEndsAt) : null,
    status: input.status || "active",
    dailyPickupLimit: Number.parseInt(input.dailyPickupLimit, 10) || 0,
    serviceLevel: input.serviceLevel ?? null,
  };
}

function sortCarriersByContractEndsAt(carriers) {
  return carriers.slice().sort((left, right) => {
    if (left.contractEndsAt === right.contractEndsAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.contractEndsAt ?? Infinity) - (right.contractEndsAt ?? Infinity);
  });
}

function findCarrierById(carriers, id) {
  const match = carriers.find((carrier) => carrier.id === id);
  if (!match) {
    throw new Error(`carrier not found: ${id}`);
  }
  return match;
}

function formatCarrierLabel(carrier) {
  const amount = (carrier.baseRateCents / 100).toFixed(2);
  const when = carrier.contractEndsAt ? new Date(carrier.contractEndsAt).toISOString().slice(0, 10) : "no date";
  return `${carrier.name} (${carrier.status}) ${amount} on ${when}`;
}

module.exports = {
  totalBaseRateCents,
  splitCarriersByStatus,
  canMoveCarrierTo,
  isCarrierPastContractEndsAt,
  summarizeCarriers,
  normalizeCarrier,
  sortCarriersByContractEndsAt,
  findCarrierById,
  formatCarrierLabel,
};
EOF_17

cat >src/shipping/delivery-window.js <<'EOF_18'
"use strict";

function splitDeliveryWindowsByStatus(deliveryWindows) {
  const byStatus = {};
  byStatus.offered = [];
  byStatus.booked = [];
  byStatus.missed = [];
  for (const deliveryWindow of deliveryWindows) {
    if (byStatus[deliveryWindow.status]) {
      byStatus[deliveryWindow.status].push(deliveryWindow);
    }
  }
  return byStatus;
}

function isDeliveryWindowPastStartsAt(deliveryWindow, nowMs) {
  if (deliveryWindow.startsAt === null) {
    return false;
  }
  return deliveryWindow.status !== "missed" && deliveryWindow.startsAt < nowMs;
}

function groupDeliveryWindowsByPostcode(deliveryWindows) {
  const groups = new Map();
  for (const deliveryWindow of deliveryWindows) {
    const key = deliveryWindow.postcode;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(deliveryWindow);
  }
  return groups;
}

function deliveryWindowsAbove(deliveryWindows, minimumCents) {
  const selected = [];
  for (const deliveryWindow of deliveryWindows) {
    if (deliveryWindow.surchargeCents >= minimumCents) {
      selected.push(deliveryWindow);
    }
  }
  return selected;
}

function searchDeliveryWindows(deliveryWindows, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return deliveryWindows.slice();
  }
  return deliveryWindows.filter(
    (deliveryWindow) =>
      deliveryWindow.postcode.toLowerCase().includes(needle) ||
      deliveryWindow.slotName.toLowerCase().includes(needle),
  );
}

function summarizeDeliveryWindows(deliveryWindows) {
  if (deliveryWindows.length === 0) {
    return { count: 0, smallest: null, largest: null, totalCapacity: 0 };
  }
  let smallest = deliveryWindows[0].surchargeCents;
  let largest = deliveryWindows[0].surchargeCents;
  let totalCapacity = 0;
  for (const deliveryWindow of deliveryWindows) {
    smallest = Math.min(smallest, deliveryWindow.surchargeCents);
    largest = Math.max(largest, deliveryWindow.surchargeCents);
    totalCapacity += deliveryWindow.capacity;
  }
  return { count: deliveryWindows.length, smallest, largest, totalCapacity };
}

const DELIVERY_WINDOW_NEXT_STATUS = {
  offered: ["booked", "missed"],
  booked: ["missed"],
  missed: [],
};

function canMoveDeliveryWindowTo(deliveryWindow, nextStatus) {
  const allowed = DELIVERY_WINDOW_NEXT_STATUS[deliveryWindow.status] || [];
  return allowed.includes(nextStatus);
}

function formatDeliveryWindowLabel(deliveryWindow) {
  const amount = (deliveryWindow.surchargeCents / 100).toFixed(2);
  const when = deliveryWindow.startsAt ? new Date(deliveryWindow.startsAt).toISOString().slice(0, 10) : "no date";
  return `${deliveryWindow.postcode} (${deliveryWindow.status}) ${amount} on ${when}`;
}

function normalizeDeliveryWindow(input) {
  return {
    id: String(input.id).trim(),
    postcode: String(input.postcode || "").trim(),
    slotName: String(input.slotName || "").trim(),
    surchargeCents: Math.round(Number(input.surchargeCents) || 0),
    startsAt: input.startsAt ? Date.parse(input.startsAt) : null,
    status: input.status || "offered",
    capacity: Number.parseInt(input.capacity, 10) || 0,
    postcode: input.postcode ?? null,
  };
}

module.exports = {
  splitDeliveryWindowsByStatus,
  isDeliveryWindowPastStartsAt,
  groupDeliveryWindowsByPostcode,
  deliveryWindowsAbove,
  searchDeliveryWindows,
  summarizeDeliveryWindows,
  canMoveDeliveryWindowTo,
  formatDeliveryWindowLabel,
  normalizeDeliveryWindow,
};
EOF_18

cat >src/shipping/label.js <<'EOF_19'
"use strict";

function formatLabelLabel(label) {
  const amount = (label.postageCents / 100).toFixed(2);
  const when = label.printedAt ? new Date(label.printedAt).toISOString().slice(0, 10) : "no date";
  return `${label.format} (${label.status}) ${amount} on ${when}`;
}

function isLabelPastPrintedAt(label, nowMs) {
  if (label.printedAt === null) {
    return false;
  }
  return label.status !== "voided" && label.printedAt < nowMs;
}

function labelsAbove(labels, minimumCents) {
  const selected = [];
  for (const label of labels) {
    if (label.postageCents >= minimumCents) {
      selected.push(label);
    }
  }
  return selected;
}

function splitLabelsByStatus(labels) {
  const byStatus = {};
  byStatus.queued = [];
  byStatus.printed = [];
  byStatus.voided = [];
  for (const label of labels) {
    if (byStatus[label.status]) {
      byStatus[label.status].push(label);
    }
  }
  return byStatus;
}

function summarizeLabels(labels) {
  if (labels.length === 0) {
    return { count: 0, smallest: null, largest: null, totalCopies: 0 };
  }
  let smallest = labels[0].postageCents;
  let largest = labels[0].postageCents;
  let totalCopies = 0;
  for (const label of labels) {
    smallest = Math.min(smallest, label.postageCents);
    largest = Math.max(largest, label.postageCents);
    totalCopies += label.copies;
  }
  return { count: labels.length, smallest, largest, totalCopies };
}

function searchLabels(labels, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return labels.slice();
  }
  return labels.filter(
    (label) =>
      label.format.toLowerCase().includes(needle) ||
      label.trackingNumber.toLowerCase().includes(needle),
  );
}

function totalPostageCents(labels) {
  let total = 0;
  for (const label of labels) {
    total += label.postageCents;
  }
  return total;
}

const LABEL_NEXT_STATUS = {
  queued: ["printed", "voided"],
  printed: ["voided"],
  voided: [],
};

function canMoveLabelTo(label, nextStatus) {
  const allowed = LABEL_NEXT_STATUS[label.status] || [];
  return allowed.includes(nextStatus);
}

function groupLabelsByShipmentId(labels) {
  const groups = new Map();
  for (const label of labels) {
    const key = label.shipmentId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(label);
  }
  return groups;
}

module.exports = {
  formatLabelLabel,
  isLabelPastPrintedAt,
  labelsAbove,
  splitLabelsByStatus,
  summarizeLabels,
  searchLabels,
  totalPostageCents,
  canMoveLabelTo,
  groupLabelsByShipmentId,
};
EOF_19

cat >src/shipping/parcel.js <<'EOF_20'
"use strict";

function formatParcelLabel(parcel) {
  const amount = (parcel.insuredCents / 100).toFixed(2);
  const when = parcel.packedAt ? new Date(parcel.packedAt).toISOString().slice(0, 10) : "no date";
  return `${parcel.barcode} (${parcel.status}) ${amount} on ${when}`;
}

function summarizeParcels(parcels) {
  if (parcels.length === 0) {
    return { count: 0, smallest: null, largest: null, totalWeightGrams: 0 };
  }
  let smallest = parcels[0].insuredCents;
  let largest = parcels[0].insuredCents;
  let totalWeightGrams = 0;
  for (const parcel of parcels) {
    smallest = Math.min(smallest, parcel.insuredCents);
    largest = Math.max(largest, parcel.insuredCents);
    totalWeightGrams += parcel.weightGrams;
  }
  return { count: parcels.length, smallest, largest, totalWeightGrams };
}

function validateParcel(parcel) {
  const errors = [];
  if (!parcel.id) {
    errors.push("parcel id is required");
  }
  if (!Number.isInteger(parcel.insuredCents) || parcel.insuredCents < 0) {
    errors.push("insuredCents must be a non-negative integer");
  }
  if (!["open", "sealed", "lost"].includes(parcel.status)) {
    errors.push(`unknown parcel status: ${parcel.status}`);
  }
  if (typeof parcel.barcode !== "string" || parcel.barcode.trim() === "") {
    errors.push("barcode is required");
  }
  return errors;
}

function totalInsuredCents(parcels) {
  let total = 0;
  for (const parcel of parcels) {
    total += parcel.insuredCents;
  }
  return total;
}

function groupParcelsByShipmentId(parcels) {
  const groups = new Map();
  for (const parcel of parcels) {
    const key = parcel.shipmentId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(parcel);
  }
  return groups;
}

function sortParcelsByPackedAt(parcels) {
  return parcels.slice().sort((left, right) => {
    if (left.packedAt === right.packedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.packedAt ?? Infinity) - (right.packedAt ?? Infinity);
  });
}

function parcelsToCsvRows(parcels) {
  const header = ["id", "barcode", "status", "insuredCents", "weightGrams"];
  const rows = [header.join(",")];
  for (const parcel of parcels) {
    const barcode = `"${parcel.barcode.replaceAll('"', '""')}"`;
    rows.push([parcel.id, barcode, parcel.status, parcel.insuredCents, parcel.weightGrams].join(","));
  }
  return rows;
}

function searchParcels(parcels, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return parcels.slice();
  }
  return parcels.filter(
    (parcel) =>
      parcel.barcode.toLowerCase().includes(needle) ||
      parcel.contents.toLowerCase().includes(needle),
  );
}

module.exports = {
  formatParcelLabel,
  summarizeParcels,
  validateParcel,
  totalInsuredCents,
  groupParcelsByShipmentId,
  sortParcelsByPackedAt,
  parcelsToCsvRows,
  searchParcels,
};
EOF_20

cat >src/shipping/return-request.js <<'EOF_21'
"use strict";

function sortReturnRequestsByOpenedAt(returnRequests) {
  return returnRequests.slice().sort((left, right) => {
    if (left.openedAt === right.openedAt) {
      return left.id < right.id ? -1 : 1;
    }
    return (left.openedAt ?? Infinity) - (right.openedAt ?? Infinity);
  });
}

function findReturnRequestById(returnRequests, id) {
  const match = returnRequests.find((returnRequest) => returnRequest.id === id);
  if (!match) {
    throw new Error(`returnRequest not found: ${id}`);
  }
  return match;
}

const RETURN_REQUEST_NEXT_STATUS = {
  open: ["inTransit", "received", "closed"],
  inTransit: ["received", "closed"],
  received: ["closed"],
  closed: [],
};

function canMoveReturnRequestTo(returnRequest, nextStatus) {
  const allowed = RETURN_REQUEST_NEXT_STATUS[returnRequest.status] || [];
  return allowed.includes(nextStatus);
}

function searchReturnRequests(returnRequests, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return returnRequests.slice();
  }
  return returnRequests.filter(
    (returnRequest) =>
      returnRequest.reason.toLowerCase().includes(needle) ||
      returnRequest.customerEmail.toLowerCase().includes(needle),
  );
}

function isReturnRequestPastOpenedAt(returnRequest, nowMs) {
  if (returnRequest.openedAt === null) {
    return false;
  }
  return returnRequest.status !== "closed" && returnRequest.openedAt < nowMs;
}

function splitReturnRequestsByStatus(returnRequests) {
  const byStatus = {};
  byStatus.open = [];
  byStatus.inTransit = [];
  byStatus.received = [];
  byStatus.closed = [];
  for (const returnRequest of returnRequests) {
    if (byStatus[returnRequest.status]) {
      byStatus[returnRequest.status].push(returnRequest);
    }
  }
  return byStatus;
}

function validateReturnRequest(returnRequest) {
  const errors = [];
  if (!returnRequest.id) {
    errors.push("returnRequest id is required");
  }
  if (!Number.isInteger(returnRequest.refundableCents) || returnRequest.refundableCents < 0) {
    errors.push("refundableCents must be a non-negative integer");
  }
  if (!["open", "inTransit", "received", "closed"].includes(returnRequest.status)) {
    errors.push(`unknown returnRequest status: ${returnRequest.status}`);
  }
  if (typeof returnRequest.reason !== "string" || returnRequest.reason.trim() === "") {
    errors.push("reason is required");
  }
  return errors;
}

function returnRequestsToCsvRows(returnRequests) {
  const header = ["id", "reason", "status", "refundableCents", "itemCount"];
  const rows = [header.join(",")];
  for (const returnRequest of returnRequests) {
    const reason = `"${returnRequest.reason.replaceAll('"', '""')}"`;
    rows.push([returnRequest.id, reason, returnRequest.status, returnRequest.refundableCents, returnRequest.itemCount].join(","));
  }
  return rows;
}

module.exports = {
  sortReturnRequestsByOpenedAt,
  findReturnRequestById,
  canMoveReturnRequestTo,
  searchReturnRequests,
  isReturnRequestPastOpenedAt,
  splitReturnRequestsByStatus,
  validateReturnRequest,
  returnRequestsToCsvRows,
};
EOF_21

cat >src/shipping/route.js <<'EOF_22'
"use strict";

function groupRoutesByCarrierId(routes) {
  const groups = new Map();
  for (const route of routes) {
    const key = route.carrierId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(route);
  }
  return groups;
}

function validateRoute(route) {
  const errors = [];
  if (!route.id) {
    errors.push("route id is required");
  }
  if (!Number.isInteger(route.costCents) || route.costCents < 0) {
    errors.push("costCents must be a non-negative integer");
  }
  if (!["scheduled", "running", "finished"].includes(route.status)) {
    errors.push(`unknown route status: ${route.status}`);
  }
  if (typeof route.origin !== "string" || route.origin.trim() === "") {
    errors.push("origin is required");
  }
  return errors;
}

function splitRoutesByStatus(routes) {
  const byStatus = {};
  byStatus.scheduled = [];
  byStatus.running = [];
  byStatus.finished = [];
  for (const route of routes) {
    if (byStatus[route.status]) {
      byStatus[route.status].push(route);
    }
  }
  return byStatus;
}

function summarizeRoutes(routes) {
  if (routes.length === 0) {
    return { count: 0, smallest: null, largest: null, totalStopCount: 0 };
  }
  let smallest = routes[0].costCents;
  let largest = routes[0].costCents;
  let totalStopCount = 0;
  for (const route of routes) {
    smallest = Math.min(smallest, route.costCents);
    largest = Math.max(largest, route.costCents);
    totalStopCount += route.stopCount;
  }
  return { count: routes.length, smallest, largest, totalStopCount };
}

function routesToCsvRows(routes) {
  const header = ["id", "origin", "status", "costCents", "stopCount"];
  const rows = [header.join(",")];
  for (const route of routes) {
    const origin = `"${route.origin.replaceAll('"', '""')}"`;
    rows.push([route.id, origin, route.status, route.costCents, route.stopCount].join(","));
  }
  return rows;
}

function routesAbove(routes, minimumCents) {
  const selected = [];
  for (const route of routes) {
    if (route.costCents >= minimumCents) {
      selected.push(route);
    }
  }
  return selected;
}

function searchRoutes(routes, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return routes.slice();
  }
  return routes.filter(
    (route) =>
      route.origin.toLowerCase().includes(needle) ||
      route.destination.toLowerCase().includes(needle),
  );
}

function normalizeRoute(input) {
  return {
    id: String(input.id).trim(),
    origin: String(input.origin || "").trim(),
    destination: String(input.destination || "").trim(),
    costCents: Math.round(Number(input.costCents) || 0),
    departsAt: input.departsAt ? Date.parse(input.departsAt) : null,
    status: input.status || "scheduled",
    stopCount: Number.parseInt(input.stopCount, 10) || 0,
    carrierId: input.carrierId ?? null,
  };
}

function formatRouteLabel(route) {
  const amount = (route.costCents / 100).toFixed(2);
  const when = route.departsAt ? new Date(route.departsAt).toISOString().slice(0, 10) : "no date";
  return `${route.origin} (${route.status}) ${amount} on ${when}`;
}

module.exports = {
  groupRoutesByCarrierId,
  validateRoute,
  splitRoutesByStatus,
  summarizeRoutes,
  routesToCsvRows,
  routesAbove,
  searchRoutes,
  normalizeRoute,
  formatRouteLabel,
};
EOF_22

cat >src/shipping/shipment.js <<'EOF_23'
"use strict";

function findShipmentById(shipments, id) {
  const match = shipments.find((shipment) => shipment.id === id);
  if (!match) {
    throw new Error(`shipment not found: ${id}`);
  }
  return match;
}

function shipmentsToCsvRows(shipments) {
  const header = ["id", "recipientName", "status", "declaredValueCents", "parcelCount"];
  const rows = [header.join(",")];
  for (const shipment of shipments) {
    const recipientName = `"${shipment.recipientName.replaceAll('"', '""')}"`;
    rows.push([shipment.id, recipientName, shipment.status, shipment.declaredValueCents, shipment.parcelCount].join(","));
  }
  return rows;
}

function groupShipmentsByCarrierId(shipments) {
  const groups = new Map();
  for (const shipment of shipments) {
    const key = shipment.carrierId;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(shipment);
  }
  return groups;
}

function averageDeclaredValueCentsPerCarrierId(shipments) {
  const sums = new Map();
  for (const shipment of shipments) {
    const entry = sums.get(shipment.carrierId) || { total: 0, count: 0 };
    entry.total += shipment.declaredValueCents;
    entry.count += 1;
    sums.set(shipment.carrierId, entry);
  }
  const averages = new Map();
  for (const [key, entry] of sums) {
    averages.set(key, Math.round(entry.total / entry.count));
  }
  return averages;
}

function summarizeShipments(shipments) {
  if (shipments.length === 0) {
    return { count: 0, smallest: null, largest: null, totalParcelCount: 0 };
  }
  let smallest = shipments[0].declaredValueCents;
  let largest = shipments[0].declaredValueCents;
  let totalParcelCount = 0;
  for (const shipment of shipments) {
    smallest = Math.min(smallest, shipment.declaredValueCents);
    largest = Math.max(largest, shipment.declaredValueCents);
    totalParcelCount += shipment.parcelCount;
  }
  return { count: shipments.length, smallest, largest, totalParcelCount };
}

function splitShipmentsByStatus(shipments) {
  const byStatus = {};
  byStatus.created = [];
  byStatus.packed = [];
  byStatus.shipped = [];
  byStatus.delivered = [];
  for (const shipment of shipments) {
    if (byStatus[shipment.status]) {
      byStatus[shipment.status].push(shipment);
    }
  }
  return byStatus;
}

function searchShipments(shipments, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return shipments.slice();
  }
  return shipments.filter(
    (shipment) =>
      shipment.recipientName.toLowerCase().includes(needle) ||
      shipment.trackingNumber.toLowerCase().includes(needle),
  );
}

const SHIPMENT_NEXT_STATUS = {
  created: ["packed", "shipped", "delivered"],
  packed: ["shipped", "delivered"],
  shipped: ["delivered"],
  delivered: [],
};

function canMoveShipmentTo(shipment, nextStatus) {
  const allowed = SHIPMENT_NEXT_STATUS[shipment.status] || [];
  return allowed.includes(nextStatus);
}

function totalDeclaredValueCents(shipments) {
  let total = 0;
  for (const shipment of shipments) {
    total += shipment.declaredValueCents;
  }
  return total;
}

module.exports = {
  findShipmentById,
  shipmentsToCsvRows,
  groupShipmentsByCarrierId,
  averageDeclaredValueCentsPerCarrierId,
  summarizeShipments,
  splitShipmentsByStatus,
  searchShipments,
  canMoveShipmentTo,
  totalDeclaredValueCents,
};
EOF_23

git init -q
git add -A
