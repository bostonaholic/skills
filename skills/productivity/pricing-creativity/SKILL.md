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

## Contents

- Core frameworks
- Figures
- Chapter index
- Limits

## Core frameworks

### Value chain

Price before designing the work, in this order: Client, Value, Price, Cost,
Solutions. Learn who the client is and what the desired future state is worth to
them, set a price range, derive a cost ceiling (`ceiling` in
[Figures](#figures)), and only then design the solution. Estimating hours
first is the root mistake. Sell value (the desired future state), not inputs
(hours) or outputs (deliverables). The test of a maximal sustainable price is
the double thank-you, where both sides sincerely thank each other.

### The six rules

1. **Price the client, not the job.** Never answer a request for the price of a
   service with a number. Instead, ask the client for the four deal facts
   above, and give no figure for this deal until all four are in: no
   placeholder, example price, typical range, or guess. Publish guidance only,
   such as a minimum level of engagement (MLOE, set from the annual AGI
   target with `mloe` in [Figures](#figures)), never per-service prices,
   unless the firm is productized.
2. **Offer options.** Three, four at most, with the highest price last on the
   page. Never add a cheaper option to play it safe.
3. **Anchor high.** Include an anchor priced above where the client will buy,
   and present it first. When `anchor-rate` in [Figures](#figures) prints
   `"raise_prices":true`, raise every price. Build the anchor with the
   money-no-object exercise: what the firm would do with no budget limit. If
   the low option always wins, close the gap between the low and middle
   options; if the anchor won't sell anyway, push it higher to flatter the
   middle.
4. **Say a price before you show a price.** State the price or range aloud
   before it appears in writing, even for routine work with existing clients.
5. **Master the value conversation.** See below.
6. **Limit unpaid proposals to one page.** Option columns and prices, nothing
   else (no rationale, bios, hours, or line items), and never sent unattended:
   decline "just send the proposal", citing policy. In the closing
   conversation, facilitate rather than close: restate the future state and its
   value, walk from the anchor down naming the trade-offs, and ask which option
   the group leans toward. When scoping needs research or the range is too
   wide, sell one paid diagnostic, with no options, promising priced options
   for the next phase.

### The value conversation

A sale is four conversations: probative, qualifying, value, and closing. The
Flip, where the client starts treating the firm as an expert rather than a
vendor, must happen by the value conversation, or the proposal shrinks to rates
and dates.

Early in qualifying, learn who the decision makers are, then ask Dan Sullivan's
three-year question in his exact wording: the client imagines meeting you three
years from now, delighted with the progress since, and describes what
happened. Then run four steps:

1. **Commit the client to the desired future state.** Recap their organizational
   needs and personal wants, then confirm the recap is right and complete.
2. **Agree on metrics** for each item.
3. **Agree on the value of success**, in profit where possible.
4. **Give pricing guidance** as a range from $X to $Y. The firm owns $Y and says
   it first, by anchoring against guaranteed value: ask whether a share of
   first-year profit (`y-benchmarks --profit` in [Figures](#figures)) would
   be fair if the outcome were guaranteed. Ask for the client's budget; that
   is $X. Keep the guarantee hypothetical. Alan Weiss's and the large
   consultancies' benchmarks for $Y come from `y-benchmarks --value` and
   `--savings`.

Never discuss solutions during this conversation. Before leaving, book the
closing conversation with every decision maker.

### Building the options

- **Make the margin in the middle.** Design the middle option to be the one most
  clients choose and the one with the highest margin. The Home Depot Option
  puts a diagnostic in the low option, full implementation in the anchor, and
  strategy plus help forms in the middle: knowledge transfer, oversight,
  standards, reporting, and open access.
- **Something for everyone.** The low option is a time block of junior hours
  (fixed minimum, paid in full up front, no hourly top-ups) with every other
  value driver stripped out, for the price buyer. The middle option holds
  the value drivers this client wants. The anchor sits on top.
- **A premium is insurance.** Prices sit on a risk spectrum from selling time
  (the client carries the risk, lowest price) to guaranteed value (the firm
  carries it, highest price). Name each option's risk when presenting, and
  always price one option above the stated budget. Guarantee client by
  client, never as policy. Pair a satisfaction guarantee with a tip clause for
  a single executive buyer; with many stakeholders, use the tip clause alone.
- **Price integrity.** Strategic prices are round (`round` in
  [Figures](#figures)). Use a charm price only to nudge toward the middle
  option.

### Pricing models

Never build a retainer by dividing the annual budget by 12. The two sound uses
are open access (paid, client-initiated access to principals) and reserved
capacity for large, sporadic implementation needs. Lease software-like
deliverables instead of selling them, protected by a deposit or
financed-amount clause; for creative IP, retain ownership and license its use.
Decline points systems and hour banks. For Agile work, fix the price of
discovery and tie the sprints to milestone incentives.

### Never discount

Discount only for loyal clients, shown on the estimate and invoice as a
courtesy discount line under the real price; ask the client to name the amount.
Never discount to win a new client: the first job must be profitable. Before
cutting price, match the objection:

- Affordability gets payment terms, and a cue to reach the executive.
- Risk gets a guarantee, or phase one paid up front with a money-back promise.
- Unwillingness gets value removed, never a lower price alone.
- Volume gets a trade for a larger written commitment.
- Anything else gets a walk-away, usually a pause before returning within days
  with a new structure.

### Negotiating

Power equals the client's desire for the firm divided by the firm's desire for
the client; the only real lever is a credible willingness to walk.

Procurement that appears after the closing conversation means the firm has
won: start with no, out-wait the waiter, decide give-gets in advance, and
trial-close before any concession. Answer "we need three bids" by inviting them
to get the bids. Procurement that appears before the closing conversation means
price will decide; consider not bidding. Beware being the rabbit (a bidder
invited only to push another firm's price down) and the white knight (your own
senior person who gives away margin late). Invoke policy over preference, and
let the person least invested in the deal set the price.

### Firm-level pricing

A firm is either a producer (efficiency, timesheets, 60/45/20 targets that
become a ceiling) or a marketer (innovation, its own prices); choose one. Hold
about 10 to 12 client relationships and grow by engagement size. Track AGI/FTE,
not hours: about $160k is respectable, and value pricers reach $250k or more.
To transition, give new clients new models and let old clients keep old prices.

## Figures

Run `node "<skill-dir>/scripts/price-calc.mjs" <subcommand> <args>` for each
figure a deal needs instead of computing it; the script header lists the
subcommands (`ceiling`, `mloe`, `y-benchmarks`, `anchor-rate`, `round`) and
their output. Treat a figure with `"rule_of_thumb":true` as a starting point to
scale, not an exact answer. Exit 1 names a bad number on stderr: ask the user
for it. Exit 2 is a malformed call: fix it. Without a shell, read the rule's
constant in the script.

## Chapter index

Read the chapter for depth, and the [glossary](references/glossary.md) for an
exact term:

- [ch01](references/chapters/ch01-what-price-for-a-logo.md): subjective value
  and fairness, the double thank-you.
- [ch02](references/chapters/ch02-price-like-a-marketer.md): efficiency versus
  innovation, the 60/45/20 ceiling.
- [ch03](references/chapters/ch03-inputs-outputs-or-value.md): hourly, fixed,
  and value pricing; AGI/FTE.
- [ch04](references/chapters/ch04-the-many-ways-you-deliver-value.md): value
  drivers, bundling, price integrity, client count.
- [ch05](references/chapters/ch05-price-the-client-not-the-job.md): a request
  for a service's price, MLOE, what to publish.
- [ch06](references/chapters/ch06-offer-options.md): how many options, decoys,
  extremeness aversion.
- [ch07](references/chapters/ch07-anchor-high.md): setting and ordering the
  anchor.
- [ch08](references/chapters/ch08-say-a-price-before-you-show-a-price.md):
  stating a price aloud, early budget objections.
- [ch09](references/chapters/ch09-master-the-value-conversation.md): the four
  conversations, the three-year question, the $X to $Y range.
- [ch10](references/chapters/ch10-limit-unpaid-proposals-to-one-page.md): the
  one-page proposal, diagnostics, the closing conversation.
- [ch11](references/chapters/ch11-crafting-high-priced-options.md): the anchor,
  the uncertainty discount, performance pay.
- [ch12](references/chapters/ch12-framing-low-priced-options.md): the low
  option, time blocks, price buyers and poker players.
- [ch13](references/chapters/ch13-make-the-margin-in-the-middle.md): the middle
  option, the Home Depot Option, help forms.
- [ch14](references/chapters/ch14-do-retainers-right.md): retainers, open
  access, reserved capacity.
- [ch15](references/chapters/ch15-lease-instead-of-sell.md): leasing, IP
  licensing, financed-amount clauses.
- [ch16](references/chapters/ch16-sprints-points-tips-pay-what-you-like.md):
  guarantees, tip clauses, points, Agile sprints.
- [ch17](references/chapters/ch17-sell-risk-reduction.md): the risk spectrum.
- [ch18](references/chapters/ch18-nudge-nudge-wink-wink.md): anchoring, social
  proof, framing, scarcity, charm prices, your own biases.
- [ch19](references/chapters/ch19-never-discount.md): courtesy discounts, the
  First-Job Rule.
- [ch20](references/chapters/ch20-alternatives-to-cutting-price.md): answering
  price objections without cutting price.
- [ch21](references/chapters/ch21-remove-pricing-from-the-front-lines.md):
  policy, pricing authority, post-engagement review.
- [ch22](references/chapters/ch22-negotiate-like-a-pro.md): procurement, the
  power formula, the rabbit and the white knight.
- [ch23](references/chapters/ch23-begin-to-untether-from-time.md): moving off
  time, firm-level profit metrics.
- [ch24](references/chapters/ch24-the-last-obstacle-is-you.md): underpricing
  rooted in self-esteem, money beliefs, or scarcity.

## Limits

The airline fare table (ch04), visual illusions (ch06), low-option proposal
table (ch12), and power formula (ch22) were reconstructed from surrounding text;
treat them as moderate confidence.
