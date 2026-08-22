import { describe, expect, it } from "vitest";
import { buildCsv } from "@/core/commission/reports";

describe("buildCsv (Icelandic Excel conventions)", () => {
  it("starts with a UTF-8 BOM and uses semicolons + CRLF", () => {
    const csv = buildCsv(["month", "total_isk"], [["2026-08", 1568600]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿month;total_isk\r\n2026-08;1568600\r\n");
  });

  it("quotes fields containing delimiters, quotes or newlines", () => {
    const csv = buildCsv(["a"], [['semi;colon'], ['quo"te'], ["line\nbreak"]]);
    expect(csv).toContain('"semi;colon"');
    expect(csv).toContain('"quo""te"');
    expect(csv).toContain('"line\nbreak"');
  });
});
