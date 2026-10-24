# AI Labs

Joe's private Labs tab provides experimental estimates separately from official locked predictions. No automatic generation or saving action calls a prediction-submission endpoint.

## Automatic team model

Select a round and press **Generate estimates for this round**. Open a fixture to inspect the sample, estimated goals and the three highest expected-points picks. Saving before kickoff records a local experiment; manual edits are labelled as overrides.

The existing `football-scores?competition=…&season=…` feed supplies current-season results from football-data.org. Competitions are kept separate, including mixed Premier League/Championship rounds. An in-memory snapshot is reused for 15 minutes; generation after expiry fetches a fresh snapshot. Failed refreshes clear the affected fixture inputs rather than presenting old estimates as fresh.

`ai-team-model.js` fits a goals-based baseline:

- Finished results only, within the July–June season. Duplicate fixtures, invalid scores and matches starting within four hours of generation are excluded.
- Minimum 20 competition matches and three matches per team. Club matching uses explicit aliases and unique provider names/short names; no fuzzy substring match.
- League home and away goal averages use a 45-day exponential half-life.
- Team attack and concession ratios use the last ten matches, normalized to the league's venue scoring rate. Five equivalent league-average games shrink each ratio towards one.
- Two simultaneous opponent-strength adjustment passes use the opponents' earlier fitted attack/concession ratios. A final venue ratio is fitted against those ratings. Overall and venue ratios receive equal weight.
- Home estimate = league home goal average × home attack × away concession ratio; away estimate mirrors it. Estimates are bounded to the calculator's 0.1–6 range.
- Rho defaults to zero. The existing Poisson/Dixon–Coles calculator ranks scores using `6 × P(result) + 10 × P(exact score)`.

These are goal-based estimates, **not measured shot xG**. The half-life, shrinkage and venue weights are provisional, not tuned or validated claims of improved accuracy. Champions League estimates use Champions League results only and do not adjust for differing domestic-league strength. Injury/lineup adjustments, an xG provider, persistent experiment storage and time-ordered model comparison remain future work. Recent-result summaries show their actual available sample size.

Automatic experiment records include the model version, estimates, training cutoff, source, fetch time, competition, recent sample and warnings. Local history can be modified or removed by the browser owner and is not an audited historical backtest. Old manual experiments remain readable.

## Verification

Run `node --test tests/ai-team-model.test.cjs` and `node --check ai-labs.js`.

Regression checks cover team aliases, mixed competitions, deduplication, invalid scores, season boundaries, future/overlapping-match exclusion, neutral and stronger-team cases, ambiguous names, sparse samples and kickoff locking. Browser-flow verification should also cover generating a mixed round, saving provenance, manual overrides, feed failure, round changes during loading, and switching away from Joe before an asynchronous request completes.
