# Third-party data

Cluster is free and open source and is never sold. It ships or publishes these outside lists. Each
is refreshed weekly by `.github/workflows/refresh-datasets.yml` and checked by
`scripts/dataset-guard.mjs` before it's committed. Each generated file records its own source and
the date it was built.

| Data | Source | Licence or terms | File |
|---|---|---|---|
| Throwaway mail domains | [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) | CC0 1.0 | `src/lib/data/spamDomains.generated.json` |
| Toxic domains | [StopForumSpam](https://www.stopforumspam.com/) | StopForumSpam terms. Used in a free product, never sold | same |
| Malware hosts | [URLhaus](https://urlhaus.abuse.ch/), abuse.ch | [abuse.ch terms](https://abuse.ch/terms-of-use/): free for not-for-profit use | `src/lib/data/malwareDomains.generated.json` |
| Phishing hosts | [phishunt.io](https://phishunt.io/) | CC0 1.0. A listing is a suspicion, not a verdict | `src/lib/data/phishingHosts.generated.json` |
| Brand mark certificates | Each company's own BIMI record and certificate | The companies' trademarks, shown only to identify that company's own mail | `public/data/brand-registry.json`, `public/data/brand-logos.json` |
| Company websites | [Wikidata](https://www.wikidata.org/) | CC0 1.0 | `public/data/brand-registry.json` |
| Popular domains (to pick which ones to check) | [Tranco](https://tranco-list.eu/) | Used only to choose candidates, not republished | none |
| Sender icons | Each site's own favicon, via Google's favicon service | The sites' own marks, shown only to identify that site's own mail | `public/data/sender-icons.json` |
| Public Suffix List | [publicsuffix.org](https://publicsuffix.org/) | [MPL 2.0](https://mozilla.org/MPL/2.0/) | `public/data/public-suffix.json` |
| Lookalike characters | [Unicode UTS #39 confusables](https://www.unicode.org/Public/security/latest/confusables.txt) | [Unicode License v3](https://www.unicode.org/license.txt) | `src/lib/data/confusables.generated.json` |

All lists are provided by their sources "as is". A list entry makes Cluster warn or hold mail. It
never deletes mail on its own.
