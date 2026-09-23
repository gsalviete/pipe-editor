# Tracker

Where work items (cards) live. Local Markdown mode: cards are files under `tasks/`
(format: ship-it `shared/card-format.md`). The GitHub remote exists, but `gh` is not
installed and cards are intentionally kept local.

```
platform: markdown
scope: tasks/
product_docs: docs/product/
base_branch: main
language: user                 # artifact language: user (default) | en | pt-BR | ...
```
