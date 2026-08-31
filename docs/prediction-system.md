# Prediction System

## Product promise

For each episode, turn one important industry uncertainty into a public, auditable probability:

1. **Define it** so a skeptical third party can resolve it.
2. **Forecast it** independently from complementary evidence.
3. **Publish it** with the reasons, uncertainty, and update history.
4. **Score it** when reality resolves the question.

This should initially be called a **forecast ledger** or **community forecast**, not a prediction market. A market implies trading, incentives, and potentially legal/compliance work that the MVP does not need.

## The simple-question standard

The audience should see one sentence. The system stores the detailed contract behind it.

A good question has:

- **One observable event** — not “How will AI change Hollywood?”
- **A named universe** — exact companies, courts, release threshold, geography, or dataset.
- **A deadline** — usually 18–36 months; close enough to update during the series.
- **A threshold** — launch, majority, top billing, two named services, 2,000 theaters, etc.
- **A pre-declared resolution source** — company filing, trade report, court docket, Box Office Mojo, an agreed research provider, or a source hierarchy.
- **A material consequence** — the answer should change how an executive thinks or acts.
- **A real disagreement zone** — avoid questions likely below 10% or above 90% unless the tail risk itself is the story.

Before publication, every question also receives a machine-readable **question contract**:

- `close_at` and expected `resolve_by`
- jointly sufficient `yes_criteria`
- deadline behavior / `no_criteria`
- primary and fallback resolver
- definitions, geography, thresholds, and entity aliases
- conditions that make the question invalid rather than yes or no
- reference class / base-rate definition
- named human resolution owner

Question wording and criteria become immutable when forecasting opens. Later ambiguity produces a dated addendum or invalidation, never a silent edit.

### The one-line audience pattern

> **Will [specific actor/event] cross [specific threshold] by [date]?**

Immediately beneath it:

> **Why it matters:** one sentence connecting the outcome to strategy, economics, labor, or creative control.

The detailed “resolution contract” can live behind a disclosure rather than burdening the question.

## Candidate season-one questions

These are starting points, not publishable contracts until Ian/DEG agree on definitions and sources.

1. **Customer Evolution** — By December 31, 2029, will at least three of Netflix, Disney+, Max, Peacock, and Paramount+ report more U.S. subscribers on ad-supported plans than ad-free plans?
2. **Media Supply Chain Evolution** — By December 31, 2028, will two major U.S. studios publicly confirm production use of an AI agent that can initiate media-supply-chain actions without per-action human approval?
3. **Creator Evolution** — By December 31, 2030, will a fully synthetic performer receive top billing in a film released in at least 2,000 U.S. theaters?
4. **Content Evolution** — By December 31, 2029, will a film with audience-selected narrative branches receive a release in at least 1,000 U.S. theaters?
5. **Commercial Evolution** — By December 31, 2028, will at least one of Netflix, Disney+, Max, Peacock, and Paramount+ launch click-to-buy product placement inside scripted programming?
6. **Audio Evolution** — By December 31, 2029, will at least two of Netflix, Disney+, Max, Peacock, and Paramount+ let viewers personalize dialogue, music, or effects levels for a scripted title?
7. **VFX Evolution** — By December 31, 2028, will a major studio publicly state that generative tools created more than half of the final VFX shots in a 2,000-theater release?
8. **Animation Evolution** — By December 31, 2029, will a final U.S. appellate decision hold that training a generative model on unlicensed copyrighted audiovisual works is not fair use?

## Mixture-of-forecasters architecture

Research on multi-agent forecasting warns that agents given identical evidence tend to herd; a 2026 paper reports improved results when agents receive shared baseline evidence plus different private evidence pools.[9] This should be a **mixture of evidence**, not merely a mixture of personas.

### 1. Question Editor

- Converts the episode theme into a binary or small ordered-outcome question.
- Writes the resolution contract and source hierarchy.
- Runs ambiguity and “edge case” tests before anyone forecasts.
- Does not forecast.

### 2. Evidence Router

Builds a dated evidence ledger, deduplicates syndicated stories, and routes complementary packets:

- **Outside-view packet:** base rates, analogous technology adoptions, prior forecasts.
- **Business packet:** earnings calls, filings, subscriber/revenue metrics, budgets, vendor announcements.
- **Technology packet:** arXiv, standards, benchmarks, patents, product releases, production case studies.
- **Operations packet:** workflow deployments, procurement, integrations, studio/vendor evidence.
- **Policy/labor packet:** courts, legislation, guild agreements, consent and IP rules.
- **Contrarian packet:** failure cases, retractions, non-adoption, hidden dependencies, weak definitions.

All agents get the same question contract and cutoff time, but not the same full corpus.

### 3. Independent Forecasters

Each forecaster returns structured fields before seeing anyone else:

- probability
- base rate / outside view
- three strongest drivers
- two reasons it may be wrong
- expected sign and size of the next material signal
- evidence IDs used
- confidence in evidence coverage

No free-form essay is accepted as the primary output.

### 4. Deliberation Round

Agents exchange only their probability, key rationale, and cited evidence. They may revise once, with a required change note. This prevents endless debate and preserves independence.

### 5. Resolver and Source Skeptic

A non-forecasting agent checks:

- source actually supports the claim
- publication date precedes the forecast cutoff
- duplicate reporting is not mistaken for independent confirmation
- question interpretation matches the resolution contract
- no “trend” number is invented from prose

### 6. Aggregator

Start with a transparent **median in log-odds space** across valid independent forecasts. It limits the effect of one broken or extreme agent while respecting probability structure. Do not let a final LLM simply choose the answer. If Ian or a human editor contributes to the system estimate, that forecast must be sealed before agent outputs are revealed and the blend must be fixed for the season rather than adjusted question by question.

Flag `high disagreement` when the agent range exceeds 35 percentage points. The disagreement becomes editorial material and triggers red-team review; it is not averaged away.

After enough resolved questions, test learned weights only out of sample and publish the method. Keep the simple median baseline visible. Good Judgment Open uses Brier scoring for probabilistic forecasts and preserves forecasts rather than allowing retroactive deletion.[11]

Keep four visible series separate:

- **Guest forecast** — frozen at recording, unless shown as a clearly labeled later update.
- **Community forecast** — aggregate of audience probabilities, with sample size.
- **Research-system forecast** — model aggregate and its version.
- **Outcome / status** — open, resolved yes/no, ambiguous/void, and resolution evidence.

## Updating beliefs

Never overwrite a number. Append a forecast event:

- timestamp and evidence cutoff
- prior and new probability
- material evidence IDs
- which forecasters changed
- short explanation of the delta
- system/model version

Current LLMs can under-react or update inconsistently when given new evidence, so every machine-generated update needs a deterministic evidence diff and editorial review rather than blind autopublishing.[10]

## Scoring and accountability

- **Primary metric:** mean Brier score for resolved binary questions; lower is better.
- Score and preserve the opening forecast, final pre-close forecast, and useful standardized snapshots.
- Compare against a frozen 50% baseline and a legitimate base-rate baseline where available.
- Publish calibration and sharpness together so a system that never leaves 50% does not appear useful merely because it is cautious.
- Exclude invalid questions from the score with the reason visible; never delete them.
- Show sample size beside every agent, category, and season score. Early rankings are provisional.
- Bound audience and system inputs to 1–99%, avoiding false claims of certainty.

Each episode should carry three forecasts: one consequential structural question, one medium-horizon operating question, and one fast-resolving question. Keep one as the headline forecast so the supporting questions create feedback and calibration reps without diluting the episode's main claim.

## Anti-slop editorial pipeline

1. Agents write structured claims, not publishable copy.
2. Every factual clause carries an evidence ID.
3. The editor sees disagreements and missing evidence, not a merged essay.
4. A writer produces no more than:
   - 40-word forecast summary
   - three drivers
   - two disconfirming signals
   - one “what changed” note
5. A separate verifier rejects uncited statistics, vague superlatives, repeated ideas, fake quotes, and unsupported causal language.
6. Ian approves the episode packet and any public interpretation.

Banned patterns: “rapidly evolving landscape,” “at the intersection of,” “revolutionary,” “game-changing,” decorative certainty, anonymous “experts say,” and trend lines derived from no quantitative series.

## MVP

Do not build the full autonomous system first.

- Three questions (Episode 01): structural, operating, and fast-resolving
- Five evidence lanes
- Three to five independent forecasts
- One deliberation round
- Transparent median/logit aggregation
- Human approval
- Immutable update ledger
- Simple audience probability input
- Brier scoring when resolved

### Explicitly out of scope

- real-money trading, wagering, or financial incentives
- autonomous publication or autonomous final resolution
- learned forecaster weights before enough live resolutions
- scraping or republishing paywalled text without permission
- elaborate debate loops, fine-tuning, or knowledge-graph complexity before the basic ledger proves useful

### Pilot success criteria

- every published factual claim has an internal evidence pointer and load-bearing claims have verified evidence spans
- zero silently edited question contracts or forecast histories
- forecast cards publish with, or before, their episode
- listeners can restate the question, probability, and principal crux
- the stable workflow stays small enough to support the podcast rather than becoming a separate platform company

If this produces a useful episode packet twice, automate the ingestion and monitoring. If it does not, more agents will only produce more prose.

## Sources

[9] https://arxiv.org/html/2607.01661v1
[10] https://arxiv.org/html/2509.23936v2
[11] https://www.gjopen.com/faq
