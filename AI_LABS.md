# AI Labs

Joe's private Labs tab provides experimental estimates. Generating estimates and saving browser experiments do not change tracked picks. **Use this pick in AI Tracker** explicitly applies a pick to the private AI Tracker before kickoff. Human competition entries are separate.

## Automatic team model

Opening Labs or selecting a round automatically fills the goal estimates and calculates probabilities for upcoming fixtures. **Refresh automatic estimates** reruns this process. Open a fixture to inspect the sample, estimated goals and the three highest expected-points picks. Editing inputs is optional; advanced rho settings are collapsed by default. Saving an experiment records a local trial; manual edits are labelled as overrides. To use the recommended pick in the private tracked experiment, press **Use this pick in AI Tracker** before kickoff. An existing tracker entry for the round is required.

Review **AI Tracker comparisons** for each revised fixture's original and current picks, change time and recorded points. Revisions and model context are stored across devices behind Joe's PIN check. The first saved round timestamp is preserved. The database rejects changes at or after the stored fixture kickoff, changes to fixtures with recorded results, and deletion of AI history. It keeps an audit entry for every changed pick, including administrator revisions. Client-side changes also verify the expected previous pick and fixture identity to prevent overwriting a stale device's data.

The privileged writer is in the unexposed `pl_ai_private` schema; its public RPC is an invoker wrapper. Private audit tables have RLS and no client grants. The existing PIN-protected tracker reader returns audit records for the requested season. Reference SQL is in `supabase/schema/ai_lab_revisions.sql` and `supabase/schema/ai_tracker_with_revisions.sql`.

The existing `football-scores?competition=…&season=…` feed supplies current-season results from football-data.org. Competitions are kept separate, including mixed Premier League/Championship rounds. An in-memory snapshot is reused for 15 minutes; generation after expiry fetches a fresh snapshot. Failed refreshes clear the affected fixture inputs rather than presenting old estimates as fresh.

`ai-team-model.js` fits a goals-based baseline:

- Finished results only, within the July–June season. Duplicate fixtures, invalid scores and matches starting within four hours of generation are excluded.
- Minimum 20 competition matches and three matches per team. Club matching uses explicit aliases and unique provider names/short names; no fuzzy substring match.
- League home and away goal averages use a 45-day exponential half-life.
- Team attack and concession ratios use the last ten matches, normalized to the league's venue scoring rate. Five equivalent league-average games shrink each ratio towards one.
- Two simultaneous opponent-strength adjustment passes use the opponents' earlier fitted attack/concession ratios. A final venue ratio is fitted against those ratings. Overall and venue ratios receive equal weight.
- Home estimate = league home goal average × home attack × away concession ratio; away estimate mirrors it. Estimates are bounded to the calculator's 0.1–6 range.
- Rho defaults to zero. The existing Poisson/Dixon–Coles calculator ranks scores using `6 × P(result) + 10 × P(exact score)`.

These are goal-based estimates, **not measured shot xG**. The half-life, shrinkage and venue weights are provisional, not tuned or validated claims of improved accuracy. Champions League estimates use Champions League results only and do not adjust for differing domestic-league strength. Injury/lineup adjustments, an xG provider, persistent storage for unapplied experiments and time-ordered model backtesting remain future work. Recent-result summaries show their actual available sample size.

Automatic experiment records include the model version, estimates, training cutoff, source, fetch time, competition, recent sample and warnings. Local history can be modified or removed by the browser owner and is not an audited historical backtest. Old manual experiments remain readable.

## Verification

Run `node --test tests/ai-team-model.test.cjs` and `node --check ai-labs.js`.

Regression checks cover team aliases, mixed competitions, deduplication, invalid scores, season boundaries, future/overlapping-match exclusion, neutral and stronger-team cases, ambiguous names, sparse samples and kickoff locking. Browser-flow verification should also cover generating a mixed round, saving provenance, manual overrides, feed failure, round changes during loading, and switching away from Joe before an asynchronous request completes.
