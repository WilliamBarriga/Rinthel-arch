# Text DSL: a copy of LikeC4 and the only editable source

## Origin: a copy of LikeC4 that becomes independent right away

The Text DSL starts from the grammar, parser and model compiler code of LikeC4 (MIT), because it is the candidate that best covers a single Model with several Views, nesting and drill-down, compared with Mermaid (no shared model or AST) and D2 (Go, independent boards). The code is copied into this repo, with no fork or upstream remote, and as soon as we start changing it the connection with LikeC4 is cut: its new releases are not followed. We need our own changes because our Model requires Attributes as Edge endpoints, `source` and declared Node kinds, which C4 does not have. Only the language and the compiler are copied; render and layout are decided by the render ticket.

### Consequences

- The copyright notice and the MIT license of LikeC4 are kept.
- No security patches are inherited: what is copied is ours.
- LikeC4 may come back as an optional importer, never as a dependency of the core.

## The DSL is the only editable source; the Canonical form is derived

Only the Text DSL files are edited and versioned, and they compile one way into the Canonical form (our own Zod schema, not json-render). The canonical JSON is a build artifact and the contract for render, export and validation. Having two editable sources is discarded: LikeC4's round-trip to text is lossy and two sources create conflicts. Agents also write DSL, with a skill generated from the project catalog and a `validate` command with structured issues.
