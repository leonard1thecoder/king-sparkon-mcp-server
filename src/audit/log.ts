/**
 * Audit log (§20). Every MCP invocation creates a record with the §20 fields.
 * Stateless deployment: an in-process ring buffer (per instance) plus
 * structured JSON log lines. Never records tokens, secrets, or credentials.
 */

export interface AuditRecord {
  userId: number | null;
  agentId: string | null;
  role: string | null;
  tool: string;
  resourceType: string | null;
  resourceId: string | null;
  action: string;
  consentId: string | null;
  mandateId: number | string | null;
  amount: number | string | null;
  currency: string | null;
  result: string;
  requestId: string;
  timestamp: string;
}

const BUFFER_SIZE = 500;
const buffer: AuditRecord[] = [];

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const scrubbed: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (/token|secret|password|credential|pin|card|passphrase/i.test(key)) {
      scrubbed[key] = "[redacted]";
    } else if (typeof entry === "object") {
      scrubbed[key] = sanitize(entry);
    } else {
      scrubbed[key] = entry;
    }
  }
  return scrubbed;
}

export function auditInvocation(record: AuditRecord): AuditRecord {
  const entry = sanitize(record) as AuditRecord;
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.splice(0, buffer.length - BUFFER_SIZE);
  console.log(JSON.stringify({ mcp_audit: entry }));
  return entry;
}

export function recentAudit(limit = 50): AuditRecord[] {
  return buffer.slice(-Math.max(1, Math.min(limit, BUFFER_SIZE)));
}
