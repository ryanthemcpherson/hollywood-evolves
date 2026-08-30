# Future of Hollywood Forecasting System

## Recommendation in one sentence

Build the show around **three plainly worded, resolvable forecasts per episode**, publish the probabilities and evidence before recording, let several deliberately different research agents forecast independently, then have a human editor aggregate, challenge, and translate the work into a story. The product is not “AI predicts Hollywood”; it is a public, scored record of what the show believed, why, and when it changed its mind.

## 1. What the audience sees

Each active forecast gets a small public card:

> **Will streaming exceed 50% of U.S. TV use in any monthly Nielsen Gauge report released by December 31, 2027?**  
> **Show forecast:** 64% (up from 58%)  
> **Closes:** December 31, 2027  
> **Resolves from:** Nielsen The Gauge  
> **Why:** two strongest reasons for; strongest reason against; one signpost that would move the number.  
> **Forecast history:** every dated probability and rationale.  
> **Status:** open / resolved yes / resolved no / invalid.

Nielsen describes The Gauge as a monthly macroanalysis of U.S. viewing across platforms, illustrating why stable recurring data products make good resolution sources.[6]

### The audience promise

1. **We ask questions normal people understand.** No jargon in the headline.
2. **Every probability is timestamped.** No rewriting history.
3. **Every question names its resolver in advance.** The show does not judge its own prediction after the fact.
4. **We update when evidence changes.** Each update says what changed the number.
5. **We keep score publicly.** Hits are not highlighted without misses.
6. **AI does research and proposes forecasts; people own publication and resolution.**

## 2. Question design: simple enough to score, important enough to discuss

### The question contract

A candidate does not enter the forecast ledger until one editor can fill these fields:

- `question`: one binary sentence beginning “Will…”
- `close_at`: final instant at which forecasts may update
- `resolve_by`: expected date of resolution
- `yes_criteria`: observable conditions that are jointly sufficient
- `no_criteria`: what happens if the deadline passes without a yes
- `resolver`: exact URL, filing system, data release, or named authority
- `fallback_resolver`: used only if the primary source disappears
- `ambiguity_notes`: definitions, geography, thresholds, company aliases
- `invalid_if`: conditions that make fair resolution impossible
- `base_rate_class`: comparable historical events
- `owner`: human responsible for resolution

Reject a question if reasonable people could read the criteria and resolve it differently. Prefer binary questions with a 1–24 month horizon. Numerical questions should usually be converted into one or two thresholds (“above $X?”), not a false-precision point estimate.

### High-value question families

| Family | Audience-facing example | Primary resolver | Why it matters |
|---|---|---|---|
| Audience behavior | Will streaming exceed 50% of U.S. TV use in any monthly Nielsen Gauge report by Dec. 31, 2027? | Nielsen monthly Gauge | Measures the distribution shift, not rhetoric |
| Economics | Will a named major streamer raise its U.S. ad-free monthly list price before a date? | Company pricing page archived at each check | Tests pricing power |
| Labor | Will SAG-AFTRA members authorize a strike in the next contract cycle by a date? | Union announcement | Connects technology and bargaining power |
| AI adoption | Will a feature released in at least 500 U.S. theaters publicly credit a generative-video vendor for final on-screen footage by a date? | Distributor press kit/credits plus theater-count source | Defines adoption through shipped work |
| Regulation/litigation | Will a specified AI/copyright case receive a merits ruling on a named issue by a date? | Court docket/order | Converts legal fog into a checkable milestone |
| Consolidation | Will a named studio transaction close by a date? | SEC filing/company announcement | Captures industry structure |
| Production | Will one of a fixed list of studios announce a fully animated feature made primarily with a specified generative pipeline by a date? | Studio announcement and production notes | Tracks frontier production methods |
| Release strategy | Will a named studio give at least three films a day-and-date U.S. theatrical/streaming release in a calendar year? | Fixed release ledger and distributor announcements | Tests window strategy |
| Performance | Will a named release exceed a prespecified opening-weekend domestic gross? | Named box-office data source | Easy to understand; useful calibration reps |
| Awards/legitimacy | Will an AI-disclosure rule be added to the published eligibility rules of a named major award by a date? | Award body rules | Tests institutional normalization |

### Good recurring mix per episode

- **One consequential structural forecast** (12–24 months): labor, law, consolidation, AI adoption.
- **One medium-horizon operating forecast** (3–12 months): prices, release windows, production announcements.
- **One fast-resolving forecast** (2–12 weeks): opening performance, renewal, launch timing. These produce feedback and keep scoring visible.

Do not ask “Will AI replace actors?” Ask which observable event would convince the audience that displacement or augmentation has materially advanced.

## 3. Research ingestion

### Source ladder

The research store labels every item by authority rather than flattening all links into “evidence.”

1. **Primary/authoritative:** SEC and court filings; guild agreements and announcements; company earnings releases, pricing pages, investor decks, job postings; studio press kits and release calendars; patent records; award rules; government data.
2. **Measured industry data:** Nielsen, named box-office source, public platform top-ten data, labor statistics. Preserve methodology/version notes.
3. **High-quality trade reporting:** Variety, Deadline, The Hollywood Reporter, TheWrap, Bloomberg, WSJ, Financial Times. These surface events but do not override primary documents.
4. **Technical research:** arXiv plus published venues for generative video, dubbing, VFX, virtual production, copyright/provenance, recommendation, and media economics.
5. **Weak signals:** conference talks, vendor demos, podcasts, social posts, rumors. Useful for leads and scenarios, never sufficient alone for a strong factual claim.

### Minimal ingestion implementation

Run one scheduled job each morning and an on-demand job before episode research:

- **arXiv:** query Atom API categories `cs.CV`, `cs.AI`, `cs.CL`, `cs.HC`, `cs.MM`, plus keyword bundles such as `text-to-video`, `video generation`, `digital human`, `voice cloning`, `watermarking`, `content provenance`, `copyright`, and `recommendation`. Store arXiv ID **with version**, title, authors, submitted/updated dates, abstract, categories, PDF URL, query hit, and fetch time. The official API supports custom queries and returns Atom metadata including title, ID, dates, abstract, authors, links, and categories.[5]
- **News/trades:** licensed news API or RSS where permitted. Store canonical URL, outlet, byline, publication/update times, headline, extracted text or licensed excerpt, and fetch time.
- **Industry/primary feeds:** poll selected investor-relations pages, SEC submissions, guild sites, court dockets available to the team, award-rule pages, company price pages, and recurring measurement releases.
- **Deduplication:** canonical URL + normalized headline similarity; cluster rewrites of the same event while preserving every outlet.
- **Change detection:** hash source text and retain snapshots. Never overwrite an earlier document.
- **Entity/topic tags:** company, person, union, title, technology, legal case, forecast question, and source tier.

A retrieval-augmented forecasting system that searches relevant information, generates forecasts, and aggregates predictions has precedent in the research literature.[1] But a dynamic benchmark found expert forecasters outperforming its top LLM and emphasized genuinely future questions to avoid leakage.[2] Therefore, this system uses models as fallible research forecasters, not as an oracle or host substitute.

### Evidence packet produced for each question

The retrieval agent creates a dated packet, not a free-form “research summary”:

- exact question and resolution contract
- base-rate table and denominator definition
- chronological event timeline
- 5–12 strongest source cards, each with source tier, date, URL, claim, verbatim evidence span, and relevance
- evidence **for**, **against**, and **unknown**
- disputed facts and source conflicts
- current comparable/market forecast if one exists, clearly labeled so it does not contaminate independent forecasts
- stale-data and source-access warnings

Every factual sentence in the internal packet must point to a source card. A paper abstract is labeled as an author claim, not established fact; a vendor benchmark is labeled vendor evidence.

## 4. Mixture of agents: diversity by mandate, not by fake personalities

Use 6–8 calls across at least two model families if budget permits. All forecasting agents receive the same question contract and frozen evidence cutoff. They forecast **independently before seeing one another’s numbers**.

| Role | Job | Required output |
|---|---|---|
| **Retriever / librarian** | Find and rank current evidence; create source cards; flag inaccessible primary sources | Evidence packet, no probability |
| **Base-rate analyst** | Define reference classes; estimate outside-view rate; test denominators | Probability, range, comparable table |
| **Industry operator** | Reason from incentives, production cycles, contracts, distribution, and organizational constraints | Probability, causal chain, signposts |
| **Technology scout** | Assess technical capability, cost curve, deployment readiness, and gap between demo and production | Probability, readiness evidence, bottlenecks |
| **Skeptic / red team** | Assume the emerging consensus is wrong; find disconfirming evidence, ambiguity, hype, and resolution traps | Probability, strongest contrary case, invalidation risk |
| **Scenario analyst** | Build 3–4 mutually comprehensible paths to yes/no and assign conditional weights | Scenario tree, probability, cruxes |
| **Source auditor** | Check every load-bearing claim against retrieved text; detect circular sourcing and copied press releases | Pass/fail report, unsupported claims |
| **Question judge** | Test resolution language without knowing desired answer | Ambiguity verdict and proposed edits |

Each forecaster returns structured fields:

```json
{
  "probability": 0.63,
  "credible_range": [0.45, 0.75],
  "base_rate": 0.35,
  "key_drivers_for": ["..."],
  "key_drivers_against": ["..."],
  "cruxes": ["observable fact that would move the forecast"],
  "next_signposts": [{"signal": "...", "move_points": 8}],
  "source_ids": ["..."],
  "confidence_in_evidence": "medium",
  "failure_or_ambiguity_flags": ["..."]
}
```

The show should not pay for 20 near-identical agents. Correlated prompts and shared sources create the illusion of a crowd. Role separation, independent forecasts, different model families, and one human forecast add more value than raw agent count.

## 5. Aggregation and human judgment

A review of expert aggregation methods finds no universally optimal aggregation model, so the show should begin with a transparent baseline and earn complexity through resolved data.[3]

### MVP aggregator

1. Convert each independent probability to log-odds.
2. Take the **median log-odds** across valid agent forecasts, which limits one extreme or broken agent.
3. Convert back to a probability.
4. Blend that result **75% agent aggregate / 25% independent human editor forecast**. The editor must submit before seeing agent outputs.
5. Round the published result to a whole percentage point.
6. If the range across agents exceeds 35 percentage points, publish “high disagreement,” require red-team review, and make disagreement part of the episode rather than hiding it.

The initial 75/25 split is a policy choice, not a claim of optimality. Freeze it for the first season so producers cannot tune weights around attractive answers.

### After sufficient resolutions

- After **30 resolved questions**, report agent-level scores but do not personalize weights yet.
- After **75 resolved questions**, test historical Brier-weighted ensembling out of sample. Weight by role/model performance, with shrinkage toward equal weights and a maximum weight cap so one lucky specialist cannot dominate.
- Calibrate only on held-out or rolling-origin data. Fit separate calibration curves by horizon or topic only when each bucket has enough outcomes; otherwise use a global correction.
- Extremize only if rolling validation shows improvement. Do not make probabilities more dramatic for entertainment.
- Keep the equal-weight/median baseline on the public dashboard. Any learned aggregator must beat it prospectively, not just in a backtest.

### Update rule

Each question has scheduled update checks (weekly for fast questions, monthly for long ones) and event-triggered updates. An update requires:

- previous probability, new probability, and timestamp
- new evidence IDs
- a one-sentence explanation of the delta
- which crux changed
- whether the question wording or resolver changed (normally prohibited after opening)

Question text and criteria are immutable once public. Material ambiguity discovered later leads to an addendum or invalidation, never silent editing.

## 6. Calibration, scoring, and public accountability

For binary outcomes, use the Brier score `(p - y)^2`, where lower is better; it is a strictly proper scoring rule, meaning truthful probability reporting is optimal in expectation.[4]

### What to score

- **Primary metric:** mean Brier score across resolved binary questions.
- **Skill score:** improvement versus two frozen baselines: 50% and a simple base-rate forecast where a legitimate reference class exists.
- **Calibration chart:** predicted probabilities bucketed (for display, broad bins until the sample is large) versus observed frequency.
- **Sharpness:** distribution of published probabilities; calibration without ever leaving 50% is not useful.
- **Update value:** Brier score of the opening forecast versus the final pre-close forecast.
- **Coverage/participation:** score an agent only on assigned forecasts; show N beside every score.
- **By horizon and domain:** only once sample sizes are shown and large enough to avoid leaderboard theater.

### Scoring policy details

- Score the **latest forecast before close** as the headline score.
- Also preserve and score the opening forecast and standardized snapshots (for example, 180/90/30/7 days before resolution when applicable).
- No probability of exactly 0% or 100%; UI bounds at 1% and 99%.
- Invalid questions are excluded with a public reason and still visible.
- Corrections create a new ledger event; they never replace old records.
- Publish both aggregate and component forecasts after close or after the episode embargo, so the system is auditable without letting agents anchor on one another during production.
- Bootstrap confidence intervals later; early-season rankings should be explicitly called provisional.

## 7. Anti-AI-slop editorial pipeline

The enemy is not grammatical error. It is unsupported synthesis, repetitive abstractions, fake certainty, bland consensus, and prose that sounds informed while saying nothing falsifiable.

### Gates

1. **Source gate:** every factual claim maps to an evidence span. Primary source required for decisive claims when available. Circular stories that all trace to one press release count as one source.
2. **Question gate:** the independent question judge can resolve hypothetical edge cases. Failed questions are rewritten before any forecast is public.
3. **Independence gate:** forecast numbers are sealed until all first passes arrive.
4. **Contradiction gate:** red team must state the best case against the aggregate and identify at least one fact that could reverse it.
5. **Specificity gate:** delete claims that lack a named actor, mechanism, date, threshold, or evidence. “AI will transform content” cannot survive.
6. **Voice gate:** an editor rewrites from source cards and forecast rationales, not from a generated draft. Keep concrete nouns, short sentences, and acknowledged uncertainty.
7. **Read-aloud gate:** the host challenges every paragraph: “What does this mean?”, “How do we know?”, “What would change our mind?” Remove anything the host cannot defend without looking at model output.
8. **Fact-check gate:** a second human checks script claims, numbers, names, quotations, dates, and resolution wording against sources.
9. **Originality gate:** compare the final script against model drafts and sources for suspicious phrase overlap; quotations remain marked.
10. **Post-publication gate:** link the evidence packet, forecast card, transcript, and correction channel in show notes.

### Editorial rules

- AI output is a lead, never a source.
- No invented composite quotation, anecdote, insider, or consensus.
- Say “the paper’s authors report” rather than turning preprint findings into fact.
- Distinguish capability, commercial deployment, and economically material adoption.
- Report model disagreement rather than averaging away the interesting part.
- One episode must contain at least one credible “nothing much changes” path.
- If a forecast cannot be explained in two minutes using three decisive facts, it is not ready for air.

## 8. Episode workflow for a small team

### Roles

- **Editor/producer (1 FTE):** question selection, resolution contracts, final editorial judgment, forecast ledger.
- **Researcher/fact-checker (1 FTE):** evidence packets, source verification, post-resolution checks.
- **Host (part time):** independent human forecast, interviews, script ownership.
- **Engineer/data producer (0.25–0.5 FTE):** ingestion jobs, database, dashboard, reliability.

A two-person core can start if the producer also hosts and engineering is contractor-supported, but the person writing the final script should not be its only fact-checker.

### Weekly cadence

**Thursday–Friday: candidate generation**
- Agents scan source changes and propose 10 candidate questions.
- Producer selects 3–5 using impact, clarity, resolvability, horizon balance, and novelty.
- Question judge and researcher draft resolution contracts.

**Monday: freeze evidence**
- Retrieve through a visible cutoff time.
- Researcher verifies the packet and removes bad/circular sources.
- Human host submits a sealed forecast.
- Forecast agents run independently; automated schema and citation checks execute.

**Tuesday: aggregate and challenge**
- Compute aggregate mechanically.
- Red team reviews spread, missing evidence, and resolution traps.
- Producer holds a 30-minute forecast council: decide publish / revise question before opening / defer.
- Publish forecast cards and archive the exact evidence snapshot.

**Wednesday: editorial production**
- Build an outline: cold open; scoreboard; new evidence; three forecasts; strongest disagreement; guest/operator perspective; “what would change our mind.”
- Human writes and speaks the final script.
- Separate fact-check pass and read-aloud pass.

**Thursday: record and publish**
- Record with probabilities already frozen; late evidence becomes a clearly labeled update.
- Show notes link cards, methodology, transcript, and sources.

**Daily/weekly automation**
- Check source feeds, broken resolvers, close dates, and pending updates.
- Produce a resolution queue; only a human can mark final resolution.

**Monthly calibration segment**
- Resolve eligible questions.
- Show wins, misses, largest probability changes, current Brier score, and calibration chart.
- Spend more airtime on the most confident miss than on the easiest win.

## 9. Data model and audit trail

A small Postgres database is enough:

- `questions`: immutable question contract and version hash
- `sources`: metadata, source tier, canonical URL, publication/fetch times, content hash
- `source_snapshots`: immutable extracted content location and retrieval status
- `evidence_cards`: question/source link, claim, verbatim span, stance, reviewer
- `forecasts`: question, forecaster ID/version, probability, rationale JSON, evidence cutoff, created time, sealed/unsealed time
- `aggregates`: algorithm version, input forecast IDs, probability, disagreement metrics
- `updates`: previous/new forecast IDs, delta reason, triggering evidence
- `resolutions`: outcome, resolution source snapshot, resolver, review status, notes
- `scores`: scoring-policy version and computed metrics
- `editorial_checks`: gate, reviewer, status, notes

Use object storage or a private repository for source snapshots where licensing allows; otherwise store hashes, metadata, and permitted excerpts. The public site exposes question contracts, aggregate history, resolutions, scores, and permissible evidence links. Every scheduled run logs code version, prompt version, model identifier, source cutoff, and input/output hashes.

## 10. Eight-week MVP

### In scope

- 20–30 active binary questions across 5 fixed categories.
- Three forecasts per episode and one monthly scorecard.
- Six agent roles using two model families; no fine-tuning.
- arXiv API, 10–15 curated feeds/pages, and manual uploads of key filings/data.
- Postgres plus a simple job runner.
- Internal evidence-packet view and a public static forecast-card site.
- Median-log-odds aggregator with fixed human blend.
- Brier scoring, probability history, resolution queue, calibration chart.
- Human question approval, fact-check, and resolution.

### Explicitly out of scope

- Fully autonomous publication or resolution.
- Hundreds of questions, personalization, prediction-market trading, audience wagering, or financial incentives.
- Scraping paywalled full text without permission.
- Learned agent weights or domain-specific calibration before enough outcomes.
- Fine-tuning, vector-database complexity beyond clear retrieval needs, elaborate knowledge graphs, and simulated “agent debates” that do not improve forecasts.
- Continuous numerical distributions; start binary.

### MVP success criteria

- At least 95% of published factual claims have verified evidence links in the internal audit.
- Zero silently edited question contracts or forecast histories.
- At least 20 questions resolve within the pilot, providing real feedback.
- Every episode ships its public forecast cards before or with the audio.
- The team can produce one episode without more than two person-days of research/editorial labor after the pipeline stabilizes.
- Audience research shows listeners can restate the question, probability, and main crux.

## 11. Key failure modes and controls

| Failure mode | Consequence | Control |
|---|---|---|
| Ambiguous or self-judged questions | Credibility collapses at resolution | Predeclared criteria, resolver, fallback, independent question judge |
| Questions chosen for virality rather than scoreability | Sensational, unresolvable show | Fixed selection rubric and horizon/category quotas |
| Agent monoculture/correlation | False confidence | Independent sealed passes, role diversity, two model families, human forecast |
| Retrieval recency gaps or paywall bias | Important evidence omitted | Source coverage dashboard, primary-source watchlist, manual upload path |
| Press-release laundering/circular reporting | Multiple links mimic corroboration | Provenance clustering; count root source, not article count |
| arXiv novelty mistaken for readiness | Technical hype becomes commercial forecast | Separate capability, deployment, and adoption evidence; operator role |
| Hallucinated citations or source mismatch | “Auditable” record is fake | Verbatim evidence spans and source-auditor hard gate |
| Data leakage/look-ahead in evaluation | Inflated model scores | Freeze source cutoff, archive inputs, forecast only unresolved future events, log model/prompt versions |
| Overfitting learned weights/calibration | Backtest wins, live failure | Long equal-weight baseline, shrinkage, rolling validation, prospective comparison |
| Resolution-source methodology changes | Apparent outcomes are incomparable | Snapshot methodology, define invalid/fallback rules, disclose breaks |
| Probability theater (63% with no basis) | Numbers decorate opinions | Base-rate requirement, cruxes, range, and scoring |
| Incentive to avoid bold calls | Calibrated but useless 50% forecasts | Report sharpness and skill versus baselines, not Brier alone |
| Incentive to chase easy questions | Good score, low audience value | Publish impact tier; score calibration separately from editorial value |
| Editorial smoothing erases disagreement | Bland AI consensus | Make spread and dissent a recurring segment |
| Host repeats generated claims without ownership | Robotic, indefensible audio | Human rewrite and read-aloud defense gate |
| Small sample leaderboard claims | Noisy ranking presented as truth | Show N and uncertainty; label early results provisional |
| Silent corrections or cherry-picked wins | Loss of trust | Append-only public ledger and mandatory monthly misses segment |
| Legal/licensing problems | Takedowns or blocked pipeline | Respect feed/API terms; store permissible excerpts/hashes; legal review for redistribution |
| Automation burden exceeds show value | Small team becomes platform company | Curated sources, binary questions, manual exception paths, eight-week scope cap |

## 12. Editorial format that makes forecasting good audio

A repeatable 40-minute structure:

1. **Scoreboard (4 min):** one resolution, one changed forecast, one miss.
2. **Signal, not noise (6 min):** three new research findings; why each does or does not matter.
3. **Forecast 1 — structural (10 min):** base rate, mechanism, probability, dissent.
4. **Forecast 2 — operating (8 min):** same compressed format.
5. **Forecast 3 — fast (5 min):** accessible listener question.
6. **Guest/operator test (5 min):** ask what the system is missing, not for generic futurism.
7. **Cruxes (2 min):** the observable signs that will move next week’s numbers.

The hook is disciplined disagreement under uncertainty. The payoff is returning months later and finding out whether the show learned anything.

## Sources

[1] https://arxiv.org/abs/2402.18563 — Approaching Human-Level Forecasting with Language Models
[2] https://arxiv.org/html/2409.19839v5 — ForecastBench: A Dynamic Benchmark of AI Forecasting Capabilities
[3] https://pmc.ncbi.nlm.nih.gov/articles/PMC7996321 — Aggregating predictions from experts: a review
[4] https://arxiv.org/html/2504.01781v1 — Proper scoring rules for estimation and forecast evaluation
[5] https://info.arxiv.org/help/api/user-manual.html — arXiv API User's Manual
[6] https://www.nielsen.com/data-center/the-gauge — Nielsen The Gauge
