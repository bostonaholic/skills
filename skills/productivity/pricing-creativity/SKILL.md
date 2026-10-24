---
name: pricing-creativity
description: Applies Blair Enns's Pricing Creativity frameworks to value-based pricing for creative and professional services firms. Use when pricing work by value, writing proposals with options, anchoring, structuring retainers, negotiating price or procurement, or moving off hourly billing.
argument-hint: "[<topic, framework, or chapter>]"
---

# Pricing Creativity

Paraphrased frameworks from Blair Enns's _Pricing Creativity_; credit the ideas
to Enns and the thinkers he cites. Dollar amounts are the book's examples;
scale them to the firm and client.

For a specific deal, get the facts the rules depend on before pricing: the
decision makers, the desired future state, what reaching it is worth, and the
stated budget. Ask for whichever are missing, and treat none as known until the
client states it.

## Value chain

Price before designing the work, in this order: Client, Value, Price, Cost, Solutions.

- Learn who the client is and what the desired future state is worth to them,
  set a price range, derive a cost ceiling (`ceiling` in [Figures](#figures)),
  and only then design the solution.
- Estimating hours first is the root mistake. Sell value (the desired future
  state), not inputs (hours) or outputs (deliverables).
- The test of a maximal sustainable price is the double thank-you, where both
  sides sincerely thank each other.

## The six rules

1. **Price the client, not the job.** Never answer a request for the price of a
   service with a number. Instead, ask the client for the deal facts
   above, and give no figure for this deal until all of them are in: no
   placeholder, example price, typical range, or guess. Publish guidance only,
   such as a minimum level of engagement (MLOE, set from the annual AGI
   target with `mloe` in [Figures](#figures)), never per-service prices,
   unless the firm is productized.
2. **Offer options.** Three, four at most, with the highest price last on the
   page. Never add a cheaper option to play it safe. Always price one option
   above the stated budget.
3. **Anchor high.** Include an anchor priced above where the client will buy,
   and present it first. When `anchor-rate` in [Figures](#figures) prints
   `"raise_prices":true`, raise every price. To build the anchor, or when the
   low option always wins or the anchor won't sell, read
   [options and proposals](references/options-and-proposals.md).
4. **Say a price before you show a price.** State the price or range aloud
   before it appears in writing, even for routine work with existing clients.
5. **Master the value conversation.** Read [the value conversation](references/value-conversation.md) before running one.
6. **Limit unpaid proposals to one page.** Option columns and prices, nothing
   else (no rationale, bios, hours, or line items), and never sent unattended:
   decline "just send the proposal", citing policy. Run the closing conversation per [options and proposals](references/options-and-proposals.md).

## Also read

- [Options and proposals](references/options-and-proposals.md) when building the options, running the closing conversation, or selling a paid diagnostic.
- [Models, discounts, and negotiation](references/models-discounts-negotiation.md) for retainers, leasing, points, Agile work, procurement, and firm-level pricing, and before answering any discount request or price objection.

## Figures

- Run `node "<skill-dir>/scripts/price-calc.mjs" <subcommand> <args>` for each
  figure a deal needs instead of computing it; the script header lists the
  subcommands (`ceiling`, `mloe`, `y-benchmarks`, `anchor-rate`, `round`) and
  their output.
- Treat a figure with `"rule_of_thumb":true` as a starting point to scale, not
  an exact answer.
- Exit 1 names a bad number on stderr: ask the user for it. Exit 2 is a
  malformed call: fix it.
- Without a shell, read the rule's constant in the script.

## Chapter index

Read the chapter for depth, and the [glossary](references/glossary.md) for an
exact term:

| Chapter                                                                   | Covers                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [ch01](references/chapters/ch01-what-price-for-a-logo.md)                 | subjective value and fairness, the double thank-you.                       |
| [ch02](references/chapters/ch02-price-like-a-marketer.md)                 | efficiency versus innovation, the 60/45/20 ceiling.                        |
| [ch03](references/chapters/ch03-inputs-outputs-or-value.md)               | hourly, fixed, and value pricing; AGI/FTE.                                 |
| [ch04](references/chapters/ch04-the-many-ways-you-deliver-value.md)       | value drivers, bundling, price integrity, client count.                    |
| [ch05](references/chapters/ch05-price-the-client-not-the-job.md)          | a request for a service's price, MLOE, what to publish.                    |
| [ch06](references/chapters/ch06-offer-options.md)                         | how many options, decoys, extremeness aversion.                            |
| [ch07](references/chapters/ch07-anchor-high.md)                           | setting and ordering the anchor.                                           |
| [ch08](references/chapters/ch08-say-a-price-before-you-show-a-price.md)   | stating a price aloud, early budget objections.                            |
| [ch09](references/chapters/ch09-master-the-value-conversation.md)         | the four conversations, the three-year question, the $X to $Y range.       |
| [ch10](references/chapters/ch10-limit-unpaid-proposals-to-one-page.md)    | the one-page proposal, diagnostics, the closing conversation.              |
| [ch11](references/chapters/ch11-crafting-high-priced-options.md)          | the anchor, the uncertainty discount, performance pay.                     |
| [ch12](references/chapters/ch12-framing-low-priced-options.md)            | the low option, time blocks, price buyers and poker players.               |
| [ch13](references/chapters/ch13-make-the-margin-in-the-middle.md)         | the middle option, the Home Depot Option, help forms.                      |
| [ch14](references/chapters/ch14-do-retainers-right.md)                    | retainers, open access, reserved capacity.                                 |
| [ch15](references/chapters/ch15-lease-instead-of-sell.md)                 | leasing, IP licensing, financed-amount clauses.                            |
| [ch16](references/chapters/ch16-sprints-points-tips-pay-what-you-like.md) | guarantees, tip clauses, points, Agile sprints.                            |
| [ch17](references/chapters/ch17-sell-risk-reduction.md)                   | the risk spectrum.                                                         |
| [ch18](references/chapters/ch18-nudge-nudge-wink-wink.md)                 | anchoring, social proof, framing, scarcity, charm prices, your own biases. |
| [ch19](references/chapters/ch19-never-discount.md)                        | courtesy discounts, the First-Job Rule.                                    |
| [ch20](references/chapters/ch20-alternatives-to-cutting-price.md)         | answering price objections without cutting price.                          |
| [ch21](references/chapters/ch21-remove-pricing-from-the-front-lines.md)   | policy, pricing authority, post-engagement review.                         |
| [ch22](references/chapters/ch22-negotiate-like-a-pro.md)                  | procurement, the power formula, the rabbit and the white knight.           |
| [ch23](references/chapters/ch23-begin-to-untether-from-time.md)           | moving off time, firm-level profit metrics.                                |
| [ch24](references/chapters/ch24-the-last-obstacle-is-you.md)              | underpricing rooted in self-esteem, money beliefs, or scarcity.            |

## Limits

- The airline fare table (ch04), visual illusions (ch06), low-option proposal table (ch12), and power formula (ch22) were reconstructed from surrounding text; treat them as moderate confidence.
