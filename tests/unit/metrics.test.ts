import { describe, expect, it } from "vitest";
import { computeSearchMetrics } from "@/server/analytics/metrics";

describe("computeSearchMetrics", () => {
  it("ne compte jamais « Sans réponse » comme un refus", () => {
    const m = computeSearchMetrics({ sent: 2, no_response: 5, followed_up: 1, rejected: 1, interview_scheduled: 1 });
    expect(m.sent).toBe(10);
    expect(m.negative).toBe(1);
    expect(m.awaiting).toBe(8);
    expect(m.responded).toBe(2);
    expect(m.responseRate).toBeCloseTo(0.2);
  });

  it("n'invente pas de taux sans candidature envoyée", () => {
    const m = computeSearchMetrics({ to_analyze: 3 });
    expect(m.responseRate).toBeNull();
    expect(m.interviewRate).toBeNull();
    expect(m.pipeline.find((p) => p.key === "prep")?.count).toBe(3);
  });
});
