# Skill necessity sweep, 2026-11-17 to 2026-11-20

Record of one run of `scripts/eval-necessity.mjs` over the `readonly` cases,
to find skills the current models no longer need.

## Setup

- Eval cases from commit `1e9d6ea`. Scored with the report script as of this
  record, which ignores the `fired` grader when deciding a run passed.
- Claude Code 2.1.325, judge `haiku`, `--runs 3` per invocation.
- Reference model `sonnet`; target model `claude-fable-5-2`.
- Fable hit the account's weekly limit twice (2026-11-17). Runs cut off by
  it are excluded (`3dffac9`), and each affected skill was rerun after the
  limit reset. Fable skills left `UNCLEAR` after the first pass were rerun
  until each case had 9 runs per arm.
- `bash`-tag cases were not run.

## Cost

| Step                                                 | Cost    |
| ---------------------------------------------------- | ------- |
| Sonnet, every `readonly` case                        | $89.59  |
| Fable, every `readonly` case (partial, weekly limit) | $176.22 |
| Fable, reruns of limit-hit skills                    | $360.68 |
| Fable, reruns of `UNCLEAR` skills to 9 runs          | $49.80  |
| Total                                                | $676.29 |

## Verdict counts

| Model            | NEEDED | FIX-CASE | NO-GAIN | UNCLEAR |
| ---------------- | ------ | -------- | ------- | ------- |
| sonnet           | 32     | 21       | 0       | 7       |
| claude-fable-5-2 | 44     | 12       | 2       | 2       |

`sonnet` has no `NO-GAIN` because each of its cases has 3 runs per arm, and
`NO-GAIN` needs 9.

## Findings

1. `NO-GAIN` on Fable, `UNPROVEN` (no model showed a gain):
   - `hillclimbing`: 18/18 with, 18/18 without. Rests on the `trigger` and
     `guard` cases only; its `core` case is `bash` and was not run.
   - `testing-behavior-not-implementation`: 9/9 with, 9/9 without. Rests on
     the `core` case only; `trigger` and `guard` are `bash`.
2. Fewer passes with the skill than without it on Fable, both `FIX-CASE`:
   `simplifying-ruby-code` 5/9 against 6/9, and `writing-commit-messages`
   3/6 against 5/6.
3. `scripting-the-work` is `NEEDED` on Fable (22/27 against 9/27) while its
   `fired` grader passed 0/18. The without-arm removes the whole plugin, so
   the gain may come from another skill.
4. `UNCLEAR` on Fable: `merging-dependabot-prs` (26/27 against 24/27) and
   `writing-prose` (9/9 against 8/9). `writing-prose` read as `NEEDED` until
   the report stopped counting `fired` graders scored in both arms, which no
   without-arm run can pass.
5. `FIX-CASE` on Fable, the with-arm failing its own case:
   `conducting-deep-research`, `cutting-skills`, `diagnosing-react-code`,
   `explaining-architecture`, `improving-codebases`, `opening-prs`,
   `simplifying-ruby-code`, `stacking-prs` (0/9 in both arms),
   `untangling-codebases`, `updating-changelogs`, `writing-commit-messages`,
   `writing-playbooks`.

## Report output

```text
addressing-pr-comments sonnet NEEDED with 9/9 without 3/9 fired 6/6 cost $0.1087 $0.0511 +112.6%
addressing-pr-comments claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.5457 $0.2687 +103%
attaching-pr-screenshots sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.0781 $0.0357 +119.1%
attaching-pr-screenshots claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.4011 $0.1865 +115.1%
auditing-agent-token-usage sonnet NEEDED with 5/9 without 0/9 fired 5/6 cost $0.0704 $0.0361 +94.8%
auditing-agent-token-usage claude-fable-5-2 NEEDED with 8/9 without 0/9 fired 6/6 cost $0.3651 $0.1913 +90.9%
auditing-complexity sonnet NEEDED with 9/9 without 3/9 fired 6/6 cost $0.1103 $0.0466 +136.9%
auditing-complexity claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.9760 $0.2252 +333.4%
auditing-rails-tech-debt sonnet FIX-CASE with 6/9 without 3/9 fired 6/6 cost $0.0974 $0.0504 +93.3%
auditing-rails-tech-debt claude-fable-5-2 NEEDED with 7/9 without 3/9 fired 6/6 cost $0.8859 $0.2348 +277.4%
auditing-repo-security sonnet FIX-CASE with 5/9 without 3/9 fired 6/6 cost $0.1121 $0.0424 +164.4%
auditing-repo-security claude-fable-5-2 NEEDED with 6/9 without 3/9 fired 6/6 cost $0.6154 $0.2015 +205.4%
auditing-tests sonnet NEEDED with 7/9 without 3/9 fired 6/6 cost $0.1089 $0.0417 +161%
auditing-tests claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $1.2876 $0.1928 +567.8%
being-extremely-fucking-brief sonnet NEEDED with 8/9 without 3/9 fired 5/6 cost $0.0807 $0.0542 +49%
being-extremely-fucking-brief claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.3419 $0.2261 +51.2%
capturing-screenshots sonnet NEEDED with 9/9 without 3/9 fired 6/6 cost $0.0848 $0.0514 +64.9%
capturing-screenshots claude-fable-5-2 NEEDED with 9/9 without 4/9 fired 6/6 cost $1.0376 $0.6572 +57.9%
choosing-determinism sonnet FIX-CASE with 5/9 without 4/9 fired 3/6 cost $0.0676 $0.0324 +108.4%
choosing-determinism claude-fable-5-2 NEEDED with 8/9 without 4/9 fired 6/6 cost $0.3599 $0.1579 +127.9%
composing-agent-prompts sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.0873 $0.0530 +64.6%
composing-agent-prompts claude-fable-5-2 NEEDED with 7/9 without 3/9 fired 6/6 cost $0.5779 $0.5188 +11.4%
conducting-deep-research sonnet FIX-CASE with 6/9 without 6/9 fired 6/6 cost $0.1960 $0.0395 +396.3%
conducting-deep-research claude-fable-5-2 FIX-CASE with 3/6 without 3/8 fired 3/3 cost $4.2886 $0.3583 +1096.9%
configuring-zsh sonnet NEEDED with 9/9 without 3/9 fired 6/6 cost $0.0779 $0.0381 +104.7%
configuring-zsh claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.4665 $0.2657 +75.6%
cutting-skills sonnet FIX-CASE with 3/6 without 3/6 fired 0/3 cost $0.0650 $0.0324 +100.6%
cutting-skills claude-fable-5-2 FIX-CASE with 4/6 without 3/6 fired 3/3 cost $0.3118 $0.1536 +103%
defining-problems sonnet UNCLEAR with 8/9 without 4/9 fired 6/6 cost $0.0714 $0.0307 +132.4%
defining-problems claude-fable-5-2 NEEDED with 7/9 without 3/9 fired 6/6 cost $0.2941 $0.1481 +98.6%
diagnosing-react-code sonnet FIX-CASE with 2/9 without 0/9 fired 3/6 cost $0.0743 $0.0406 +82.9%
diagnosing-react-code claude-fable-5-2 FIX-CASE with 3/9 without 0/9 fired 6/6 cost $0.3510 $0.2218 +58.2%
drawing-mermaid-diagrams sonnet FIX-CASE with 6/9 without 6/9 fired 3/6 cost $0.0652 $0.0268 +143.1%
drawing-mermaid-diagrams claude-fable-5-2 NEEDED with 9/9 without 6/9 fired 6/6 cost $0.2839 $0.1251 +126.9%
explaining-architecture sonnet FIX-CASE with 3/9 without 3/9 fired 0/6 cost $0.0816 $0.0472 +72.9%
explaining-architecture claude-fable-5-2 FIX-CASE with 5/9 without 3/9 fired 6/6 cost $0.3935 $0.2239 +75.8%
explaining-code sonnet FIX-CASE with 4/9 without 4/9 fired 6/6 cost $0.0688 $0.0348 +97.6%
explaining-code claude-fable-5-2 NEEDED with 6/9 without 5/9 fired 6/6 cost $0.2945 $0.1864 +57.9%
freeing-disk-space sonnet NEEDED with 5/9 without 1/9 fired 6/6 cost $0.0990 $0.0545 +81.8%
freeing-disk-space claude-fable-5-2 NEEDED with 9/9 without 0/9 fired 6/6 cost $0.4523 $0.2809 +61%
grooming-backlogs sonnet NEEDED with 6/9 without 1/9 fired 6/6 cost $0.1444 $0.0467 +209%
grooming-backlogs claude-fable-5-2 NEEDED with 7/9 without 1/9 fired 6/6 cost $0.7691 $0.2213 +247.5%
hillclimbing sonnet UNCLEAR with 6/6 without 6/6 fired 0/3 cost $0.0694 $0.0363 +91.3%
hillclimbing claude-fable-5-2 NO-GAIN with 18/18 without 18/18 fired 9/9 cost $0.3538 $0.1593 +122.2%
improving-codebases sonnet FIX-CASE with 3/9 without 3/9 fired 6/6 cost $0.0968 $0.0367 +163.9%
improving-codebases claude-fable-5-2 FIX-CASE with 5/9 without 3/9 fired 6/6 cost $0.9982 $0.4524 +120.7%
improving-prompts sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.0743 $0.0329 +126.1%
improving-prompts claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.3397 $0.1717 +97.8%
investigating-design-rationale sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.0927 $0.0446 +107.8%
investigating-design-rationale claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.4493 $0.1994 +125.3%
landing-prs sonnet NEEDED with 8/9 without 4/9 fired 6/6 cost $0.0872 $0.0358 +143.9%
landing-prs claude-fable-5-2 NEEDED with 30/36 without 14/34 fired 24/24 cost $0.3577 $0.1665 +114.8%
learning-from-mistakes sonnet FIX-CASE with 4/9 without 0/9 fired 4/6 cost $0.0769 $0.0371 +107.2%
learning-from-mistakes claude-fable-5-2 NEEDED with 19/27 without 5/27 fired 18/18 cost $0.4325 $0.3379 +28%
making-code-agent-friendly sonnet NEEDED with 13/18 without 3/18 fired 15/15 cost $0.1273 $0.0430 +196.3%
making-code-agent-friendly claude-fable-5-2 NEEDED with 17/18 without 3/18 fired 15/15 cost $0.6094 $0.1977 +208.2%
merging-dependabot-prs sonnet FIX-CASE with 4/9 without 3/9 fired 1/3 cost $0.0697 $0.0360 +93.7%
merging-dependabot-prs claude-fable-5-2 UNCLEAR with 26/27 without 24/27 fired 9/9 cost $0.3131 $0.1773 +76.6%
modernizing-prs sonnet NEEDED with 12/12 without 3/12 fired 3/3 cost $0.0793 $0.0339 +133.7%
modernizing-prs claude-fable-5-2 NEEDED with 11/12 without 7/12 fired 3/3 cost $0.3354 $0.1633 +105.4%
opening-prs sonnet FIX-CASE with 3/12 without 3/12 fired 8/9 cost $0.0965 $0.0356 +171.4%
opening-prs claude-fable-5-2 FIX-CASE with 6/18 without 6/18 fired 12/12 cost $0.3887 $0.1687 +130.4%
prototyping-ui sonnet NEEDED with 9/9 without 3/9 fired 6/6 cost $0.1246 $0.0679 +83.4%
prototyping-ui claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.8802 $0.4129 +113.1%
proving-claims sonnet NEEDED with 7/9 without 3/9 fired 5/6 cost $0.1472 $0.0391 +276.4%
proving-claims claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.4972 $0.1788 +178.1%
redesigning-from-first-principles sonnet FIX-CASE with 7/9 without 5/9 fired 0/3 cost $0.0826 $0.0431 +91.4%
redesigning-from-first-principles claude-fable-5-2 NEEDED with 9/9 without 5/9 fired 0/3 cost $0.5351 $0.2970 +80.2%
redoing-implementations sonnet FIX-CASE with 6/9 without 4/9 fired 0/3 cost $0.0868 $0.0486 +78.6%
redoing-implementations claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 0/3 cost $0.3637 $0.2277 +59.7%
reflecting sonnet FIX-CASE with 6/9 without 3/9 fired 3/3 cost $0.1208 $0.0349 +245.6%
reflecting claude-fable-5-2 NEEDED with 7/9 without 3/9 fired 3/3 cost $0.5682 $0.1580 +259.5%
removing-comments sonnet NEEDED with 6/6 without 3/6 fired 0/3 cost $0.1678 $0.0373 +349.5%
removing-comments claude-fable-5-2 NEEDED with 6/6 without 3/6 fired 0/3 cost $1.3144 $0.5692 +130.9%
reviewing-code sonnet NEEDED with 14/24 without 3/24 fired 21/21 cost $0.3384 $0.0601 +462.7%
reviewing-code claude-fable-5-2 NEEDED with 18/24 without 3/24 fired 21/21 cost $1.0515 $0.3881 +170.9%
reviewing-design-docs sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.4778 $0.0393 +1115.7%
reviewing-design-docs claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $1.6084 $0.1888 +751.7%
reviewing-security sonnet FIX-CASE with 6/12 without 3/12 fired 9/9 cost $0.1566 $0.0369 +324.1%
reviewing-security claude-fable-5-2 NEEDED with 9/12 without 3/12 fired 9/9 cost $0.5463 $0.1833 +198.1%
scripting-the-work sonnet NEEDED with 8/9 without 3/9 fired 0/6 cost $0.0679 $0.0330 +105.6%
scripting-the-work claude-fable-5-2 NEEDED with 22/27 without 9/27 fired 0/18 cost $0.4030 $0.2173 +85.5%
simplifying-ruby-code sonnet UNCLEAR with 8/9 without 8/9 fired 3/6 cost $0.0793 $0.0375 +111.4%
simplifying-ruby-code claude-fable-5-2 FIX-CASE with 5/9 without 9/9 fired 6/6 cost $0.8451 $0.3205 +163.6%
stacking-prs sonnet FIX-CASE with 0/9 without 1/9 fired 6/6 cost $0.0851 $0.0371 +129.2%
stacking-prs claude-fable-5-2 FIX-CASE with 0/9 without 0/9 fired 6/6 cost $0.4981 $0.2416 +106.2%
summarizing-friction-logs sonnet NEEDED with 9/9 without 3/9 fired 6/6 cost $0.0897 $0.0446 +101.1%
summarizing-friction-logs claude-fable-5-2 NEEDED with 9/9 without 4/9 fired 6/6 cost $0.3668 $0.2286 +60.4%
summarizing-shipped-work sonnet NEEDED with 6/9 without 2/9 fired 6/6 cost $0.0898 $0.0465 +93%
summarizing-shipped-work claude-fable-5-2 NEEDED with 8/9 without 1/9 fired 6/6 cost $0.3982 $0.2579 +54.4%
testing-behavior-not-implementation sonnet UNCLEAR with 3/3 without 3/3 fired - cost $0.0611 $0.0274 +122.9%
testing-behavior-not-implementation claude-fable-5-2 NO-GAIN with 9/9 without 9/9 fired - cost $0.2648 $0.1286 +105.9%
testing-the-premise sonnet NEEDED with 6/9 without 3/9 fired 0/6 cost $0.0648 $0.0319 +103.4%
testing-the-premise claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 3/6 cost $0.3032 $0.1479 +105.1%
untangling-codebases sonnet NEEDED with 6/9 without 3/9 fired 3/6 cost $0.0835 $0.0450 +85.5%
untangling-codebases claude-fable-5-2 FIX-CASE with 5/9 without 3/9 fired 3/6 cost $0.3852 $0.2156 +78.6%
updating-changelogs sonnet FIX-CASE with 3/6 without 3/6 fired 3/3 cost $0.0716 $0.0314 +128.2%
updating-changelogs claude-fable-5-2 FIX-CASE with 3/6 without 3/6 fired 3/3 cost $0.3624 $0.2480 +46.1%
verifying-production-changes sonnet UNCLEAR with 8/9 without 6/9 fired 6/6 cost $0.0734 $0.0333 +120.5%
verifying-production-changes claude-fable-5-2 NEEDED with 9/9 without 6/9 fired 6/6 cost $0.3913 $0.1924 +103.4%
visualizing-codebases sonnet FIX-CASE with 3/9 without 1/9 fired 6/6 cost $0.0852 $0.0356 +139.1%
visualizing-codebases claude-fable-5-2 NEEDED with 5/9 without 2/9 fired 6/6 cost $0.3556 $0.1748 +103.4%
watching-authored-prs sonnet NEEDED with 9/9 without 1/9 fired 6/6 cost $0.0784 $0.0324 +142.2%
watching-authored-prs claude-fable-5-2 NEEDED with 9/9 without 0/9 fired 6/6 cost $0.3083 $0.1834 +68.1%
watching-reviewed-prs sonnet NEEDED with 23/27 without 6/27 fired 0/21 cost $0.1550 $0.0488 +217.3%
watching-reviewed-prs claude-fable-5-2 NEEDED with 27/27 without 6/27 fired 0/21 cost $0.5670 $0.2286 +148.1%
writing-acceptance-criteria sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.0726 $0.0296 +145%
writing-acceptance-criteria claude-fable-5-2 NEEDED with 9/9 without 6/9 fired 6/6 cost $0.3145 $0.1421 +121.4%
writing-commit-messages sonnet FIX-CASE with 4/6 without 3/6 fired 3/3 cost $0.0661 $0.0269 +145.2%
writing-commit-messages claude-fable-5-2 FIX-CASE with 3/6 without 5/6 fired 3/3 cost $0.3548 $0.1469 +141.5%
writing-no-comments sonnet UNCLEAR with 5/6 without 5/6 fired 2/3 cost $0.0692 $0.0343 +101.9%
writing-no-comments claude-fable-5-2 NEEDED with 6/6 without 3/6 fired 3/3 cost $0.8750 $0.4691 +86.5%
writing-playbooks sonnet NEEDED with 7/9 without 2/9 fired 3/3 cost $0.1497 $0.0699 +114.3%
writing-playbooks claude-fable-5-2 FIX-CASE with 6/9 without 3/9 fired 3/3 cost $0.7699 $0.6439 +19.6%
writing-prose sonnet UNCLEAR with 8/9 without 9/9 fired 4/6 cost $0.0696 $0.0305 +128.4%
writing-prose claude-fable-5-2 UNCLEAR with 9/9 without 8/9 fired 6/6 cost $0.3136 $0.1536 +104.1%
writing-system-prompts sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.0841 $0.0393 +114.2%
writing-system-prompts claude-fable-5-2 NEEDED with 9/9 without 3/9 fired 6/6 cost $0.4152 $0.2246 +84.8%
writing-technical-design-docs sonnet NEEDED with 8/9 without 3/9 fired 6/6 cost $0.3022 $0.0590 +411.9%
writing-technical-design-docs claude-fable-5-2 NEEDED with 6/9 without 3/9 fired 6/6 cost $1.9787 $0.2902 +581.9%
hillclimbing claude-fable-5-2 UNPROVEN
testing-behavior-not-implementation claude-fable-5-2 UNPROVEN
```
