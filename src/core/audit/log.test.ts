import { describe, expect, it } from "vitest";
import { logAudit } from "@/core/audit/log";
import type { AuditWriter } from "@/core/audit/log";

function captureWriter() {
  const calls: unknown[] = [];
  const writer: AuditWriter = {
    auditLog: {
      create: async (args) => {
        calls.push(args.data);
        return {};
      },
    },
  };
  return { writer, calls };
}

describe("logAudit", () => {
  it("omits tenantId entirely when the caller does not set one", async () => {
    // The tenant-scoped client stamps tenantId itself and throws on an
    // explicit null — the key must be absent, not null (regression).
    const { writer, calls } = captureWriter();
    await logAudit(writer, { action: "THJODSKRA_LOOKUP" });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0] as object)).not.toContain("tenantId");
  });

  it("passes an explicit tenantId through (including null for platform events)", async () => {
    const { writer, calls } = captureWriter();
    await logAudit(writer, { action: "LOGIN", tenantId: "t1" });
    await logAudit(writer, { action: "LOGIN_FAILED", tenantId: null });
    expect(calls[0]).toMatchObject({ tenantId: "t1" });
    expect(calls[1]).toMatchObject({ tenantId: null });
  });
});
