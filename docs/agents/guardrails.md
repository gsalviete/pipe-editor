# Guardrails (Layer 2)

Project rules on top of ship-it's universal invariants. These only tighten.

```
protected: []
forbidden:
  - git commit                 # the owner reviews and commits; agents leave changes uncommitted in the working tree
  - git push
  - opening pull requests / merge requests
notes: >
  Workflow is implement → hand off for human review in the working tree. Spec-first
  rule from CLAUDE.md applies: no implementation code without an Accepted spec
  covering it. Keep the Pipeline IR provider-neutral (ADR-0003).
```
