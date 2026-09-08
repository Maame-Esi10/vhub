import {
  NOTIFICATION_RETENTION_DAYS,
  outreachIdsInBatch,
  retentionCutoff,
  selectDeletableNotifications,
  type RetentionCandidate,
} from "../notificationRetention";

describe("retentionCutoff", () => {
  it("subtracts the retention window from the given instant", () => {
    const now = new Date("2026-09-08T08:00:00.000Z");
    const cutoff = retentionCutoff(now, 180);
    expect(cutoff.toISOString()).toBe("2026-03-12T08:00:00.000Z");
  });

  it("defaults to the documented six-month window", () => {
    const now = new Date("2026-09-08T08:00:00.000Z");
    expect(retentionCutoff(now).getTime()).toBe(
      retentionCutoff(now, NOTIFICATION_RETENTION_DAYS).getTime()
    );
    expect(NOTIFICATION_RETENTION_DAYS).toBe(180);
  });

  it("does not mutate the instant it is given", () => {
    const now = new Date("2026-09-08T08:00:00.000Z");
    retentionCutoff(now);
    expect(now.toISOString()).toBe("2026-09-08T08:00:00.000Z");
  });
});

describe("selectDeletableNotifications", () => {
  const candidates: RetentionCandidate[] = [
    { id: "n1", outreachId: "finished" },
    { id: "n2", outreachId: "still-running" },
    { id: "n3", outreachId: null },
    { id: "n4", outreachId: "finished" },
  ];

  it("keeps every row belonging to an outreach that has not finished", () => {
    const deletable = selectDeletableNotifications(candidates, new Set(["still-running"]));
    expect(deletable).toEqual(["n1", "n3", "n4"]);
  });

  it("never protects a row that refers to no outreach", () => {
    // Nothing dedupes on these: both passes that read their own rows back
    // scope the read by outreach_id, so a null can carry no marker.
    const deletable = selectDeletableNotifications([{ id: "n3", outreachId: null }], new Set());
    expect(deletable).toEqual(["n3"]);
  });

  it("deletes nothing when every candidate belongs to a live outreach", () => {
    const live = new Set(["finished", "still-running"]);
    expect(selectDeletableNotifications(candidates.slice(0, 2), live)).toEqual([]);
  });

  it("handles an empty batch", () => {
    expect(selectDeletableNotifications([], new Set(["x"]))).toEqual([]);
  });
});

describe("outreachIdsInBatch", () => {
  it("returns each outreach once and drops the nulls", () => {
    const ids = outreachIdsInBatch([
      { id: "n1", outreachId: "a" },
      { id: "n2", outreachId: "a" },
      { id: "n3", outreachId: null },
      { id: "n4", outreachId: "b" },
    ]);
    expect(new Set(ids)).toEqual(new Set(["a", "b"]));
    expect(ids).toHaveLength(2);
  });

  it("returns nothing when no candidate names an outreach", () => {
    expect(outreachIdsInBatch([{ id: "n1", outreachId: null }])).toEqual([]);
  });
});
