import { describe, expect, it } from "vitest";
import { movedTo, SWEEP_SENDERS, tallyMoves, VOTE_GAP_MS } from "./learnFromMoves";

const bucketOf = new Map([
  ["L1", "newsletter" as const],
  ["L2", "shopping" as const],
]);

describe("learn from Gmail moves", () => {
  it("counts only a swap of one Cluster label for another", () => {
    expect(
      movedTo(
        [
          { address: "News@Brew.com", added: ["L2"], removed: ["L1", "INBOX"] },
          { address: "a@x.com", added: ["L2"], removed: [] },
          { address: "b@x.com", added: [], removed: ["L1"] },
          { address: "c@x.com", added: ["STARRED"], removed: ["UNREAD"] },
        ],
        bucketOf,
      ),
    ).toEqual([["news@brew.com", "shopping"]]);
  });

  it("learns on the second swap to the same label, and restarts on a different one", () => {
    const one = tallyMoves({}, [["a@x.com", "shopping"]], {}, 0);
    expect(one).toEqual({ votes: { "a@x.com": { bucket: "shopping", n: 1, at: 0 } }, learned: [] });
    expect(tallyMoves(one.votes, [["a@x.com", "shopping"]], {}, VOTE_GAP_MS)).toEqual({ votes: {}, learned: [["a@x.com", "shopping"]] });
    expect(tallyMoves(one.votes, [["a@x.com", "travel"]], {}, 1).votes).toEqual({ "a@x.com": { bucket: "travel", n: 1, at: 1 } });
  });

  it("needs the second swap 15 minutes after the first", () => {
    const one = tallyMoves({}, [["a@x.com", "shopping"]], {}, 0);
    const soon = tallyMoves(one.votes, [["a@x.com", "shopping"]], {}, VOTE_GAP_MS - 1);
    expect(soon).toEqual({ votes: one.votes, learned: [] });
  });

  it("counts one vote per sender per pass, and a sweep of one label teaches nothing", () => {
    const page = Array.from({ length: 5 }, () => ({ address: "a@x.com", added: ["L2"], removed: ["L1"] }));
    expect(movedTo(page, bucketOf)).toEqual([["a@x.com", "shopping"]]);
    const sweep = Array.from({ length: SWEEP_SENDERS }, (_, i) => ({ address: `s${i}@x.com`, added: ["L2"], removed: ["L1"] }));
    expect(movedTo(sweep, bucketOf)).toEqual([]);
    expect(movedTo(sweep.slice(1), bucketOf)).toHaveLength(SWEEP_SENDERS - 1);
  });

  it("ignores a swap that matches a saved correction", () => {
    expect(tallyMoves({}, [["a@x.com", "shopping"]], { "a@x.com": "shopping" })).toEqual({ votes: {}, learned: [] });
  });
});

describe("moves out of the Screener and into Personal", () => {
  it("counts a move out of the Screener into a label, and a move into Personal", () => {
    const targets = new Map<string, "jobs" | "personal">([
      ["LJ", "jobs"],
      ["LP", "personal"],
    ]);
    const from = new Set(["LJ", "LP", "LS"]);
    expect(
      movedTo(
        [
          { address: "recruiter@staffing.example", added: ["LJ"], removed: ["LS"] },
          { address: "friend@corp.example", added: ["LP"], removed: ["LJ"] },
          // Screener back to the inbox teaches nothing.
          { address: "x@y.example", added: ["INBOX"], removed: ["LS"] },
        ],
        targets,
        from,
      ),
    ).toEqual([
      ["recruiter@staffing.example", "jobs"],
      ["friend@corp.example", "personal"],
    ]);
  });
});
