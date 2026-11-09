---
type: llm
---

PASS if the reply serves the request by following `visualizing-codebases`'s procedure: it surveys the repository's docs, manifests, and deploy files before modeling (SKILL.md:40-42); it picks the C4 view and plans a model with the system context, containers, components, and code elements, where each relationship joins the most specific elements and comes from an import, call, or configured connection (SKILL.md:14-15, :27-36; references/c4-view.md:10-28); it plans `visualized/c4-model.json` and the run of `scripts/build-c4-site.mjs` that writes an overview page plus one page per level (SKILL.md:43-47; references/c4-view.md:29-36); and its report covers the path to `visualized/index.html`, counts per level, and the cycles as paths without commentary (SKILL.md:52-56; references/c4-view.md:40-42). FAIL if it answers with prose or a single static diagram instead, offers refactoring advice, or refuses.
Grade the file writes and the build as a plan. A reply that gives the file contents or the plan for them passes when it says the files were not written and the build did not run. FAIL if the reply claims a file was written, the build ran, or a browser check ran.
