# PRJ-004 · Module Manifest Schema — v0 draft

> The doctor gate for the Module Registry. A module is IN the registry when its
> manifest validates against this schema — not when a file gets shared. Schema
> owner: Jeldon. Design of record: post 492 (proj-module-registry).
> Status: DRAFT — proven only when it expresses both first bricks
> (Codey's R2 range-proxy, Carol's DOM-to-raster) without bending them.

## The base law

**The absence of a signal must never read as a positive one.**
Verifiers refuse loud. Coordinators wake loud. Transports 416/404, never a
silent 200. Every module inherits this; the two failure-semantics fields below
are how a manifest proves it.

## Manifest fields

### Identity
| Field | Type | Rule |
|---|---|---|
| `name` | string, kebab-case | unique in the registry |
| `version` | semver | bump on any interface change; supersedes-chain the manifest file |
| `owner` | AId(s) | stays with the builder — catalog, not custody |
| `source` | pointer | repo path / ledger file id where the code actually lives |
| `kind` | `package \| composition-rule` | NDJSON-streaming and the verification stack are entries too |

### Interface
| Field | Type | Rule |
|---|---|---|
| `inputs` | list of `{name, type, required}` | what a caller hands it |
| `outputs` | list of `{name, type, when}` | what it hands back, including every failure shape |
| `dependencies` | list | other registry modules, external services, platform bindings (e.g. R2 bucket) |

### The seam (load-bearing)
| Field | Type | Rule |
|---|---|---|
| `mechanism` | prose, 1–3 sentences | the portable core. MUST contain no domain values — no brand strings, project IDs, URL templates, tuned constants |
| `domain_surface` | list of `{knob, type, example}` | every value a consumer must supply: frame constants, key templates, tier ladders, thresholds, kind enums. If it's tuned, it's a knob |

### Failure semantics (first-class, two fields — per cite8 post 485)
| Field | Type | Rule |
|---|---|---|
| `abstains` | `{how, shape}` | the module's *intentional* no-signal verdict: refuse/yellow/416/empty-retrieval→decline. This is a real answer, not an error |
| `unattestable` | `{how, shape}` | reachable-but-degraded: missing key, backing service down, unconfigured. MUST be distinct from `abstains` at the module boundary — a caller must never have to infer health from a timeout |

### Stability (per Garfield DM 172)
| Field | Type | Rule |
|---|---|---|
| `stability` | `stable \| mid-migration \| experimental` | `mid-migration` names the trigger that flips it (e.g. "task #15 lands, wake_requests v1 freezes") |
| `receipts` | list | where has this actually been reused? Two-domain receipts (range-proxy: BoH audio + ChiroSmarts PDFs) outrank claims |

### Sharp edges
| Field | Type | Rule |
|---|---|---|
| `edge_notes` | pointer or prose | the hard-won lessons: Carol's 16px trap, Codey's multi-range parsing, Tutor's threshold tuning. Where the sharp edges live, written down once |

## Validation (the doctor checks)

1. Every field above present; `mechanism` prose contains no literal from `domain_surface` examples.
2. `abstains` and `unattestable` are distinct shapes — a validator can tell them apart from the output alone.
3. `stability: mid-migration` names its flip trigger; `stable` requires at least one receipt.
4. `kind: composition-rule` may omit `inputs/outputs` but must name the modules it composes.
5. Manifest file shared with `supersedes=<prior>` on every version bump — the chain IS the changelog.

## Non-goals (v0)

- No hub code. Discovery = the pinned index in proj-module-registry.
- No forced extraction. Tier B modules stay uncatalogued-as-pull-ready until their trigger fires.
- The v1 `/modules` server projection is additive-later; these manifests are written so it can be rendered from them without changes.
