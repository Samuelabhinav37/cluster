import { describe, expect, it } from "vitest";
import { addCrash, issueUrl, MAX_CRASHES, redact, reportBody } from "./crashLog";

describe("crash log", () => {
  it("strips emails and sign-in tokens", () => {
    expect(redact("from a.b+c@mail.example.co.uk with Bearer abc.def ya29.A0x-y_z")).toBe("from <email> with Bearer <token> <token>");
  });

  it("counts a repeat instead of adding a row, newest first, capped", () => {
    let list = addCrash([], { where: "dashboard", message: "boom", at: 1 });
    list = addCrash(list, { where: "background", message: "other", at: 2 });
    list = addCrash(list, { where: "dashboard", message: "boom", at: 3 });
    expect(list.map((c) => [c.message, c.times, c.at])).toEqual([["boom", 2, 3], ["other", 1, 2]]);
    for (let i = 0; i < 30; i++) list = addCrash(list, { where: "dashboard", message: `e${i}`, at: i });
    expect(list).toHaveLength(MAX_CRASHES);
  });

  it("keeps the report short enough for a GitHub link and redacts the run log", () => {
    const crashes = Array.from({ length: 20 }, (_, i) => ({ where: "dashboard" as const, message: `e${i}`, stack: "x".repeat(1500), at: 0, times: 1 }));
    const body = reportBody("1.0", crashes, "read for me@x.com");
    expect(body.length).toBeLessThan(6100);
    expect(reportBody("1.0", [], "read for me@x.com")).toContain("<email>");
    expect(issueUrl(body)).toMatch(/^https:\/\/github\.com\/.+\/issues\/new\?title=Crash\+report/);
  });
});
