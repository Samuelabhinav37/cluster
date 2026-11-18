// Test-only: evaluates the Gmail search queries Cluster writes into its
// filters (categoryQueries.ts) against message metadata, so tests can see
// what the filters label on arrival, before Cluster's own pass runs.
// shortcut: covers only the grammar categoryQueries emits (field:(a OR "b c"),
// {OR groups}, (AND groups), -negation, category:); Gmail's own tokenizer and
// matching are approximated as lowercase whole words. Upgrade if the filters
// start using other operators.
import type { NormalizedMessageMetadata } from "../lib/providers/emailProvider";

type Node =
  | { t: "and"; kids: Node[] }
  | { t: "or"; kids: Node[] }
  | { t: "not"; kid: Node }
  | { t: "term"; field: string; values: string[] };

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hasPhrase(hay: string[], phrase: string): boolean {
  const p = words(phrase);
  if (p.length === 0) return false;
  for (let i = 0; i + p.length <= hay.length; i++) if (p.every((w, k) => hay[i + k] === w)) return true;
  return false;
}

function fromMatches(address: string, v: string): boolean {
  const a = address.toLowerCase();
  const x = v.toLowerCase();
  return a === x || a.endsWith(`@${x}`) || a.endsWith(`.${x}`);
}

/** Parses one query into a tree. */
export function parseQuery(q: string): Node {
  let i = 0;
  const skip = () => {
    while (q[i] === " ") i++;
  };
  // A list of values inside field:( ... ), split on OR.
  const values = (): string[] => {
    const out: string[] = [];
    i++; // (
    while (i < q.length && q[i] !== ")") {
      skip();
      if (q[i] === '"') {
        const end = q.indexOf('"', i + 1);
        out.push(q.slice(i + 1, end));
        i = end + 1;
      } else {
        let j = i;
        while (j < q.length && q[j] !== " " && q[j] !== ")") j++;
        const w = q.slice(i, j);
        if (w !== "OR") out.push(w);
        i = j;
      }
      skip();
    }
    i++; // )
    return out;
  };
  const one = (): Node => {
    skip();
    if (q[i] === "-") {
      i++;
      return { t: "not", kid: one() };
    }
    if (q[i] === "{" || q[i] === "(") {
      const close = q[i] === "{" ? "}" : ")";
      const kind = q[i] === "{" ? "or" : "and";
      i++;
      const kids: Node[] = [];
      for (skip(); q[i] !== close; skip()) kids.push(one());
      i++;
      return { t: kind, kids };
    }
    let j = i;
    while (q[j] !== ":" ) j++;
    const field = q.slice(i, j);
    i = j + 1;
    if (q[i] === "(") return { t: "term", field, values: values() };
    if (q[i] === '"') {
      const end = q.indexOf('"', i + 1);
      const v = q.slice(i + 1, end);
      i = end + 1;
      return { t: "term", field, values: [v] };
    }
    let k = i;
    while (k < q.length && q[k] !== " " && q[k] !== ")" && q[k] !== "}") k++;
    const v = q.slice(i, k);
    i = k;
    return { t: "term", field, values: [v] };
  };
  const kids: Node[] = [];
  for (skip(); i < q.length; skip()) kids.push(one());
  return { t: "and", kids };
}

export function matches(node: Node, m: NormalizedMessageMetadata): boolean {
  switch (node.t) {
    case "and":
      return node.kids.every((k) => matches(k, m));
    case "or":
      return node.kids.some((k) => matches(k, m));
    case "not":
      return !matches(node.kid, m);
    case "term": {
      if (node.field === "subject") {
        const hay = words(m.subject ?? "");
        return node.values.some((v) => hasPhrase(hay, v));
      }
      if (node.field === "from") return node.values.some((v) => fromMatches(m.fromAddress ?? "", v));
      if (node.field === "category") return node.values.some((v) => (m.labelIds ?? []).includes(`CATEGORY_${v.toUpperCase()}`));
      throw new Error(`gmailQuery: unsupported field ${node.field}`);
    }
  }
}

export function queryMatches(q: string, m: NormalizedMessageMetadata): boolean {
  return matches(parseQuery(q), m);
}
