const PrizeMoney = (() => {
  const WEEKEND_RATE = 5;
  const MIDWEEK_RATE = 1;
  const londonDay = new Intl.DateTimeFormat("en-GB", {weekday: "short", timeZone: "Europe/London"});
  const gbp = new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP", maximumFractionDigits: 0, minimumFractionDigits: 0});

  function isWeekend(game) {
    const main = game.fixtures.filter(f => f[4] !== "Championship");
    const dates = (main.length ? main : game.fixtures).map(f => new Date(f[3]));
    if (!dates.length || dates.some(d => !Number.isFinite(d.getTime()))) throw Error("Round kickoffs are missing");
    return dates.some(d => ["Sat", "Sun"].includes(londonDay.format(d)));
  }

  function buildLedger(games, results, seasonKey) {
    const scored = new Map();
    for (const {game_id, fixture_index} of results) {
      if (!scored.has(game_id)) scored.set(game_id, new Set());
      scored.get(game_id).add(fixture_index);
    }
    const rounds = games.filter(g => g.season_key === seasonKey).sort((a, b) => Date.parse(a.reveal_at) - Date.parse(b.reveal_at)).map(g => ({
      id: g.id, label: g.round_label || g.title, month: g.month_key, weekend: isWeekend(g),
      complete: g.fixtures.every((_, i) => scored.get(g.id)?.has(i))
    }));
    const months = [...new Set(rounds.map(r => r.month))].sort().map(key => {
      const scoringRounds = rounds.filter(r => r.month === key);
      return {
        key, complete: scoringRounds.every(r => r.complete),
        weekend: scoringRounds.filter(r => r.weekend),
        midweek: scoringRounds.filter(r => !r.weekend)
      };
    });
    return {months, midweek: rounds.filter(r => !r.weekend), complete: rounds.length > 0 && rounds.every(r => r.complete)};
  }

  function leaders(rows, players) {
    const byPlayer = new Map(rows.map(row => [row.player, row.points]));
    const points = players.map(p => byPlayer.get(p));
    if (points.some(p => p == null || p === "" || !Number.isSafeInteger(Number(p)))) throw Error("Standings are missing");
    const best = Math.max(...points.map(Number));
    return players.filter((_, i) => Number(points[i]) === best);
  }

  function amount(roundCount, rate, players, winner) {
    const perPlayer = roundCount * rate;
    return {
      perPlayer, total: perPlayer * (players.length - 1),
      transfers: winner && players.includes(winner) && perPlayer > 0
        ? players.filter(player => player !== winner).map(from => ({from, to: winner, amount: perPlayer})) : []
    };
  }

  async function read(query) {
    const {data, error} = await query;
    if (error || !Array.isArray(data)) throw Error("Could not load prize data");
    return data;
  }

  async function readResults(db, games) {
    const now = Date.now();
    const started = games.filter(g => Date.parse(g.reveal_at) <= now);
    const results = [];
    // The public results function is also used by Predictions Hub. The underlying table is private.
    const batchSize = 8;
    for (let offset = 0; offset < started.length; offset += batchSize) {
      const batch = await Promise.all(started.slice(offset, offset + batchSize).map(async ({id}) => {
        const scores = await read(db.rpc("get_game_results", {p_game_id: id}));
        return scores.map(({fixture_index}) => ({game_id: id, fixture_index}));
      }));
      results.push(...batch.flat());
    }
    return results;
  }

  function mount({db, seasonKey, players, monthLabel, esc}) {
    const monthPicker = document.getElementById("prizeMonthSelect");
    const monthContent = document.getElementById("prizeMonthContent");
    const seasonContent = document.getElementById("prizeSeasonContent");
    const refreshBtn = document.getElementById("refreshPrizeBtn");
    let ledger = null, version = 0, selectedMonth = "";
    const money = value => gbp.format(value);
    const roundCount = (n, name) => `${n} ${name} round${n === 1 ? "" : "s"}`;
    const finishedCount = rounds => rounds.filter(r => r.complete).length;
    const labels = rounds => rounds.map(r => esc(r.label)).join(", ");
    const failed = '<p class="warn">Could not load prize money. Try refreshing.</p>';

    document.getElementById("prizeRules").textContent =
      `Monthly winner: ${money(WEEKEND_RATE)} per weekend round from each other player. Season winner: ${money(MIDWEEK_RATE)} per midweek round from each other player. Each round counts once, based on when its main competition plays.`;

    async function standings(monthKey) {
      return leaders(await read(db.rpc("pl_leaderboard", {p_month_key: monthKey, p_season_key: seasonKey})), players);
    }

    function payment(count, rate, winners) {
      if (winners.length !== 1) {
        return `<p class="warn">Tied for first: ${winners.map(esc).join(", ")}. Agree who wins before transferring.</p>`;
      }
      const winner = winners[0];
      const prize = amount(count, rate, players, winner);
      return `<div class="prizeSummary"><strong>${money(prize.total)}</strong><span>Total to ${esc(winner)}</span></div>
        <table class="leader prizeTransfers" aria-label="Transfers to ${esc(winner)}"><thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Amount</th></tr></thead>
        <tbody>${prize.transfers.map(t => `<tr><td>${esc(t.from)}</td><td>${esc(t.to)}</td><td><b>${money(t.amount)}</b></td></tr>`).join("")}</tbody></table>`;
    }

    async function renderMonth() {
      const month = ledger?.months.find(m => m.key === monthPicker.value);
      if (!month) return;
      const request = version;
      selectedMonth = month.key;
      const count = month.weekend.length;
      const midweekFinished = finishedCount(month.midweek);
      const midweekAmount = amount(midweekFinished, MIDWEEK_RATE, players);
      const weekendNote = count ? `<p class="small">${roundCount(count, "weekend")} · ${money(count * WEEKEND_RATE)} per other player<br>${labels(month.weekend)}</p>` : "";
      const contribution = `<div class="prizeContribution"><b>${money(midweekAmount.total)} towards the season prize</b><div class="small">${roundCount(midweekFinished, "midweek")} completed · ${money(midweekAmount.perPlayer)} per other player</div>
        ${month.midweek.length ? `<div class="small">${labels(month.midweek)}${midweekFinished < month.midweek.length ? ` · ${month.midweek.length - midweekFinished} still to finish` : ""}</div>` : ""}</div>`;
      if (!count || !month.complete) {
        monthContent.innerHTML = weekendNote + `<p class="small">${count ? "Transfers will show here once all the month's results are in." : "No weekend prize for this month."}</p>` + contribution;
        return;
      }
      monthContent.innerHTML = '<p class="small">Checking the monthly winner…</p>';
      try {
        const winners = await standings(month.key);
        if (request === version && monthPicker.value === month.key) monthContent.innerHTML = payment(count, WEEKEND_RATE, winners) + weekendNote + contribution;
      } catch {
        if (request === version && monthPicker.value === month.key) monthContent.innerHTML = failed;
      }
    }

    async function renderSeason() {
      const request = version;
      const count = finishedCount(ledger.midweek);
      const total = amount(count, MIDWEEK_RATE, players);
      const detail = `<p class="small">${roundCount(count, "midweek")} completed · ${money(total.perPlayer)} per other player</p>`;
      if (!ledger.complete || !count) {
        seasonContent.innerHTML = `<div class="prizeSummary"><strong>${money(total.total)}</strong><span>Built up so far</span></div>${detail}
          <p class="small">${ledger.complete ? "No midweek prize this season." : "Pay the overall winner after the season’s final results are in."}</p>`;
        return;
      }
      try {
        const winners = await standings(null);
        if (request === version) seasonContent.innerHTML = payment(count, MIDWEEK_RATE, winners) + detail;
      } catch {
        if (request === version) seasonContent.innerHTML = failed;
      }
    }

    async function refresh() {
      const request = ++version;
      ledger = null;
      monthPicker.disabled = refreshBtn.disabled = true;
      monthContent.innerHTML = '<p class="small">Loading prize money…</p>';
      seasonContent.innerHTML = "";
      try {
        const games = (await read(db.rpc("list_pl_games"))).filter(g => g.season_key === seasonKey);
        if (!games.length) throw Error("No rounds found");
        const results = await readResults(db, games);
        if (request !== version) return;
        ledger = buildLedger(games, results, seasonKey);
        const months = ledger.months;
        monthPicker.innerHTML = months.map(m => `<option value="${esc(m.key)}">${esc(monthLabel(m.key))}</option>`).join("");
        monthPicker.value = months.find(m => m.key === selectedMonth)?.key || [...months].reverse().find(m => m.complete && m.weekend.length)?.key || months[0].key;
        monthPicker.disabled = false;
        await Promise.all([renderMonth(), renderSeason()]);
      } catch {
        if (request === version) monthContent.innerHTML = failed;
      } finally {
        if (request === version) refreshBtn.disabled = false;
      }
    }

    function clear() {
      version++;
      ledger = null;
      monthContent.textContent = seasonContent.textContent = "";
    }

    monthPicker.onchange = renderMonth;
    refreshBtn.onclick = refresh;
    return {refresh, clear};
  }

  return {buildLedger, leaders, amount, mount};
})();

if (typeof module === "object" && module.exports) module.exports = PrizeMoney;
