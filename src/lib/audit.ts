type AuditDetails = Record<string, unknown>;

export function auditLog(event: string, details: AuditDetails): void {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };

  console.warn(JSON.stringify(payload));
}
