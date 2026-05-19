const pool = require("../db/pool");

const PLAYERS = [
  "Иванов", "Петров", "Сидоров", "Козлов", "Новиков",
  "Морозов", "Попов", "Лебедев", "Семёнов", "Егоров",
];

function randomPlayer() {
  return PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
}

function getMaxRounds(sportId) {
  return sportId === 1 ? 2 : 4;
}

async function getNextRoundRobinPair(leagueId, sportId) {
  try {
    const teamsRes = await pool.query(
      "SELECT id, rating FROM teams WHERE league_id = $1 ORDER BY id",
      [leagueId]
    );
    const teams = teamsRes.rows;
    if (teams.length < 2) return null;

    const maxRounds = getMaxRounds(sportId);
    const totalMatchesPerTeam = maxRounds * (teams.length - 1);

    const playedRes = await pool.query(
      "SELECT team_id, played FROM standings WHERE league_id = $1",
      [leagueId]
    );
    const playedMap = {};
    playedRes.rows.forEach(r => { playedMap[r.team_id] = r.played || 0; });
    teams.forEach(t => { if (!playedMap[t.id]) playedMap[t.id] = 0; });

    const minPlayed = Math.min(...teams.map(t => playedMap[t.id] || 0));

    if (minPlayed >= totalMatchesPerTeam) {
      return { seasonComplete: true };
    }

    const pendingRes = await pool.query(
      "SELECT home_team_id, away_team_id FROM matches WHERE league_id = $1 AND status IN ('scheduled','live')",
      [leagueId]
    );
    const busyTeams = new Set();
    pendingRes.rows.forEach(m => {
      busyTeams.add(m.home_team_id);
      busyTeams.add(m.away_team_id);
    });

    const pairCountRes = await pool.query(
      "SELECT home_team_id, away_team_id FROM matches WHERE league_id = $1 AND status = 'finished'",
      [leagueId]
    );
    const pairCount = {};
    pairCountRes.rows.forEach(m => {
      const key = [m.home_team_id, m.away_team_id].sort().join('_');
      pairCount[key] = (pairCount[key] || 0) + 1;
    });

    // Команды которые отстают (ещё не сыграли текущий круг)
    const teamsInCurrentRound = teams.filter(t => (playedMap[t.id] || 0) === minPlayed);
    const available = teamsInCurrentRound.filter(t => !busyTeams.has(t.id));
    if (available.length < 2) return null;

    const shuffled = [...available].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        const a = shuffled[i];
        const b = shuffled[j];
        const key = [a.id, b.id].sort().join('_');
        const timesPlayed = pairCount[key] || 0;

        if (timesPlayed < maxRounds) {
          const homeFirst = timesPlayed % 2 === 0 ? a : b;
          const awayFirst = timesPlayed % 2 === 0 ? b : a;
          return { home: homeFirst, away: awayFirst };
        }
      }
    }

    return null;
  } catch (err) {
    console.error("[RR] Error in getNextRoundRobinPair:", err.message);
    return null;
  }
}

async function generateRoundRobinMatch(leagueId, sportId) {
  try {
    const pair = await getNextRoundRobinPair(leagueId, sportId);
    if (!pair) return;
    if (pair.seasonComplete) {
      await handleSeasonComplete(leagueId, sportId);
      return;
    }

    const { home, away } = pair;
    const delayMinutes = Math.floor(Math.random() * 6) + 2;
    const startTime = new Date(Date.now() + delayMinutes * 60 * 1000);

    await pool.query(
      `INSERT INTO matches (home_team_id, away_team_id, league_id, sport_id, start_time, status, home_score, away_score, minute, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', 0, 0, 0, NOW())`,
      [home.id, away.id, leagueId, sportId, startTime]
    );

    console.log(`[SIM][RR] Лига ${leagueId}: команды ${home.id} vs ${away.id}`);
  } catch (err) {
    console.error("[SIM][RR] Generation error:", err.message);
  }
}

async function handleSeasonComplete(leagueId, sportId) {
  try {
    const existing = await pool.query(
      "SELECT id FROM seasons WHERE league_id = $1 AND status = 'countdown'",
      [leagueId]
    );
    if (existing.rows.length > 0) return;

    if (!sportId) {
      const lr = await pool.query("SELECT sport_id FROM leagues WHERE id = $1", [leagueId]);
      if (lr.rows.length === 0) return;
      sportId = Number(lr.rows[0].sport_id);
    }

    let orderClause;
    if (sportId === 3) {
      orderClause = `(CASE WHEN s.played > 0 THEN s.wins::float / s.played ELSE 0 END) DESC, (s.goals_for - s.goals_against) DESC`;
    } else {
      orderClause = `s.points DESC, (s.goals_for - s.goals_against) DESC, s.wins DESC`;
    }

    const champRes = await pool.query(`
      SELECT t.id, t.name FROM standings s
      JOIN teams t ON s.team_id = t.id
      WHERE s.league_id = $1
      ORDER BY ${orderClause}
      LIMIT 1
    `, [leagueId]);

    const champion = champRes.rows[0] || null;
    const nextSeasonStart = new Date(Date.now() + 60 * 1000);

    await pool.query(`
      INSERT INTO seasons (league_id, champion_team_id, status, next_season_at)
      VALUES ($1, $2, 'countdown', $3)
      ON CONFLICT (league_id) DO UPDATE SET
        champion_team_id = EXCLUDED.champion_team_id,
        status = 'countdown',
        next_season_at = EXCLUDED.next_season_at,
        completed_at = NOW()
    `, [leagueId, champion?.id || null, nextSeasonStart]);

    console.log(`[SIM][SEASON] Лига ${leagueId}: сезон завершён! Чемпион: ${champion?.name || 'Нет'}`);
  } catch (err) {
    console.error("[SIM][SEASON] handleSeasonComplete error:", err.message);
  }
}

async function startNewSeason(leagueId) {
  try {
    console.log(`[SIM][SEASON] Лига ${leagueId}: запуск нового сезона...`);

    await pool.query("DELETE FROM standings WHERE league_id = $1", [leagueId]);

    const teamsRes = await pool.query("SELECT id FROM teams WHERE league_id = $1", [leagueId]);
    for (const team of teamsRes.rows) {
      await pool.query(
        "INSERT INTO standings (team_id, league_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [team.id, leagueId]
      );
    }

    const finishedRes = await pool.query(
      "SELECT id FROM matches WHERE league_id = $1 AND status = 'finished'",
      [leagueId]
    );
    const matchIds = finishedRes.rows.map(r => r.id);
    if (matchIds.length > 0) {
      await pool.query("DELETE FROM events WHERE match_id = ANY($1)", [matchIds]);
      await pool.query("DELETE FROM matches WHERE id = ANY($1)", [matchIds]);
    }

    await pool.query(
      "UPDATE seasons SET status = 'active', next_season_at = NULL, ai_prediction = NULL, ai_prediction_updated = NULL WHERE league_id = $1",
      [leagueId]
    );

    console.log(`[SIM][SEASON] Лига ${leagueId}: новый сезон начался!`);
  } catch (err) {
    console.error("[SIM][SEASON] startNewSeason error:", err.message);
  }
}

function getEventSettings(sportId, ratingA, ratingB) {
  const avg = (ratingA + ratingB) / 2;
  const ratingModifier = 0.5 + avg / 100;
  switch (sportId) {
    case 2: return { scoreProb: 0.07 * ratingModifier, scoreType: "puck", cardProb: 0.04, cardType: "penalty" };
    case 3: return { scoreProb: 1.75 * ratingModifier, scoreType: "basket", cardProb: 0.02, cardType: "foul" };
    default: return { scoreProb: 0.015 + (avg / 100) * 0.01, scoreType: "goal", cardProb: 0.03, cardType: "yellow_card" };
  }
}

async function tickMatch(match) {
  const sportId = match.sport_id;
  let currentHomeScore = match.home_score;
  let currentAwayScore = match.away_score;
  let isOvertime = match.is_overtime || false;
  const newMinute = match.minute + 1;
  const regularMaxMinutes = sportId === 2 ? 60 : sportId === 3 ? 48 : 90;

  if (isOvertime) {
    if (sportId === 2 && newMinute > regularMaxMinutes + 20) {
      const homeWins = Math.random() > 0.5;
      if (homeWins) currentHomeScore += 1; else currentAwayScore += 1;
      await pool.query(
        "INSERT INTO events (match_id, minute, type, team_id, player_name) VALUES ($1, $2, 'puck', $3, 'Победный буллит')",
        [match.id, regularMaxMinutes + 20, homeWins ? match.home_team_id : match.away_team_id]
      );
      await finishAndAddToStandings(match, regularMaxMinutes + 20, currentHomeScore, currentAwayScore, isOvertime);
      return;
    }
    if (sportId === 3) {
      const otMins = newMinute - regularMaxMinutes;
      if (otMins > 0 && otMins % 5 === 0) {
        if (currentHomeScore !== currentAwayScore) {
          await finishAndAddToStandings(match, newMinute, currentHomeScore, currentAwayScore, isOvertime);
          return;
        }
      }
    }
  } else if (newMinute > regularMaxMinutes) {
    if ((sportId === 2 || sportId === 3) && currentHomeScore === currentAwayScore) {
      isOvertime = true;
      await pool.query("INSERT INTO events (match_id, minute, type, player_name) VALUES ($1, $2, 'overtime_start', 'Система')", [match.id, regularMaxMinutes]);
    } else {
      await finishAndAddToStandings(match, regularMaxMinutes, currentHomeScore, currentAwayScore, isOvertime);
      return;
    }
  }

  await pool.query("UPDATE matches SET minute = $1, is_overtime = $2, updated_at = NOW() WHERE id = $3", [newMinute, isOvertime, match.id]);

  const teamsRes = await pool.query("SELECT id, name, rating FROM teams WHERE id IN ($1, $2)", [match.home_team_id, match.away_team_id]);
  const hT = teamsRes.rows.find(t => t.id === match.home_team_id);
  const aT = teamsRes.rows.find(t => t.id === match.away_team_id);
  const settings = getEventSettings(sportId, hT?.rating || 50, aT?.rating || 50);

  if (Math.random() < settings.scoreProb) {
    const side = Math.random() < hT?.rating / (hT?.rating + aT?.rating) ? "home" : "away";
    let points = 1, type = settings.scoreType;
    if (sportId === 3) {
      const roll = Math.random();
      if (roll < 0.3) { points = 3; type = "3_pointer"; }
      else if (roll < 0.9) { points = 2; type = "2_pointer"; }
      else { points = 1; type = "free_throw"; }
    }
    if (side === "home") currentHomeScore += points; else currentAwayScore += points;
    await pool.query(`UPDATE matches SET ${side}_score = ${side}_score + $1, updated_at = NOW() WHERE id = $2`, [points, match.id]);
    await pool.query("INSERT INTO events (match_id, minute, type, team_id, player_name) VALUES ($1,$2,$3,$4,$5)",
      [match.id, newMinute, type, side === "home" ? match.home_team_id : match.away_team_id, randomPlayer()]);
    const name = side === "home" ? hT?.name : aT?.name;
    await notifyFavoriteUsers(match.id, type, `Очки: +${points} (${newMinute}'${isOvertime ? ' (ОТ)' : ''}) — ${name}`);
    if (sportId === 2 && isOvertime) {
      await finishAndAddToStandings(match, newMinute, currentHomeScore, currentAwayScore, isOvertime);
      return;
    }
  }

  if (settings.cardProb > 0 && Math.random() < settings.cardProb) {
    const side = Math.random() < 0.5 ? "home" : "away";
    const teamId = side === "home" ? match.home_team_id : match.away_team_id;
    await pool.query("INSERT INTO events (match_id, minute, type, team_id, player_name) VALUES ($1,$2,$3,$4,$5)",
      [match.id, newMinute, settings.cardType, teamId, randomPlayer()]);
    const name = side === "home" ? hT?.name : aT?.name;
    const cardText = settings.cardType === "yellow_card" ? "🟨 Желтая" : settings.cardType === "penalty" ? "⏱️ Удаление" : "⚠️ Фол";
    await notifyFavoriteUsers(match.id, settings.cardType, `${cardText} (${newMinute}') — ${name}`);
  }
}

async function finishAndAddToStandings(match, finalMinute, homeScore, awayScore, isOvertime) {
  await pool.query(
    "UPDATE matches SET status = 'finished', minute = $1, home_score = $2, away_score = $3, is_overtime = $4, updated_at = NOW() WHERE id = $5",
    [finalMinute, homeScore, awayScore, isOvertime, match.id]
  );
  await updateStandings({ ...match, home_score: homeScore, away_score: awayScore, is_overtime: isOvertime });
  if (match.league_id) {
    setImmediate(() => checkSeasonCompletion(match.league_id));
  }
}

async function checkSeasonCompletion(leagueId) {
  try {
    const activeRes = await pool.query(
      "SELECT COUNT(*) FROM matches WHERE league_id = $1 AND status IN ('scheduled','live')",
      [leagueId]
    );
    if (parseInt(activeRes.rows[0].count, 10) > 0) return;

    const seasonRes = await pool.query("SELECT status FROM seasons WHERE league_id = $1", [leagueId]);
    if (seasonRes.rows.length > 0 && seasonRes.rows[0].status === 'countdown') return;

    const leagueRes = await pool.query("SELECT sport_id FROM leagues WHERE id = $1", [leagueId]);
    if (leagueRes.rows.length === 0) return;
    const sportId = Number(leagueRes.rows[0].sport_id);

    const pair = await getNextRoundRobinPair(leagueId, sportId);
    if (pair && pair.seasonComplete) {
      await handleSeasonComplete(leagueId, sportId);
    }
  } catch (err) {
    console.error("[SIM] checkSeasonCompletion error:", err.message);
  }
}

async function notifyFavoriteUsers(matchId, eventType, message) {
  try {
    const favs = await pool.query("SELECT user_id FROM favorites WHERE match_id = $1", [matchId]);
    for (const fav of favs.rows) {
      await pool.query("INSERT INTO notifications (user_id, match_id, type, message) VALUES ($1, $2, $3, $4)",
        [fav.user_id, matchId, eventType, message]);
    }
  } catch (err) {
    console.error("[SIM] Notification error:", err.message);
  }
}

async function updateStandings(match) {
  try {
    const { home_team_id, away_team_id, home_score, away_score, league_id, is_overtime } = match;
    const leagueRes = await pool.query("SELECT sport_id FROM leagues WHERE id = $1", [league_id]);
    if (leagueRes.rows.length === 0) return;
    const sportId = Number(leagueRes.rows[0].sport_id);

    let hW=0,hD=0,hL=0,hP=0,aW=0,aD=0,aP=0,aL=0,hW_ot=0,hL_ot=0,aW_ot=0,aL_ot=0;

    if (sportId === 1) {
      if (home_score > away_score) { hW=1;hP=3;aL=1; }
      else if (home_score === away_score) { hD=1;hP=1;aD=1;aP=1; }
      else { hL=1;aW=1;aP=3; }
    } else if (sportId === 2) {
      if (home_score > away_score) {
        hW=is_overtime?0:1;hW_ot=is_overtime?1:0;hP=2;aL=is_overtime?0:1;aL_ot=is_overtime?1:0;aP=is_overtime?1:0;
      } else {
        hL=is_overtime?0:1;hL_ot=is_overtime?1:0;hP=is_overtime?1:0;aW=is_overtime?0:1;aW_ot=is_overtime?1:0;aP=2;
      }
    } else if (sportId === 3) {
      if (home_score > away_score) { hW=1;hP=1;aL=1;aP=0; }
      else { hL=1;hP=0;aW=1;aP=1; }
    }

    const upsert = async (tId, w, d, l, p, gf, ga, w_ot, l_ot) => {
      await pool.query(
        `INSERT INTO standings (team_id, league_id, played, wins, draws, losses, points, goals_for, goals_against, wins_ot, losses_ot)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (team_id, league_id) DO UPDATE SET
           played = standings.played + 1, wins = standings.wins + $3, draws = standings.draws + $4,
           losses = standings.losses + $5, points = standings.points + $6,
           goals_for = standings.goals_for + $7, goals_against = standings.goals_against + $8,
           wins_ot = COALESCE(standings.wins_ot,0) + $9, losses_ot = COALESCE(standings.losses_ot,0) + $10`,
        [tId, league_id, w, d, l, p, gf, ga, w_ot, l_ot]
      );
    };

    await upsert(home_team_id, hW, hD, hL, hP, home_score, away_score, hW_ot, hL_ot);
    await upsert(away_team_id, aW, aD, aL, aP, away_score, home_score, aW_ot, aL_ot);
  } catch (err) {
    console.error("[SIM] Standings error:", err.message);
  }
}

async function runSimulationTick() {
  try {
    // 1. Запускаем новые сезоны по таймеру
    const countdownSeasons = await pool.query(
      "SELECT league_id FROM seasons WHERE status = 'countdown' AND next_season_at <= NOW()"
    );
    for (const row of countdownSeasons.rows) {
      await startNewSeason(row.league_id);
    }

    // 2. Обрабатываем каждую лигу
    const leaguesRes = await pool.query("SELECT l.id, l.sport_id FROM leagues l");
    for (const league of leaguesRes.rows) {
      const leagueId = league.id;
      const sportId = Number(league.sport_id);

      const seasonRes = await pool.query("SELECT status FROM seasons WHERE league_id = $1", [leagueId]);
      if (seasonRes.rows.length > 0 && seasonRes.rows[0].status === 'countdown') continue;

      const statsRes = await pool.query(`
        SELECT status, COUNT(*) as count FROM matches
        WHERE league_id = $1 AND status IN ('live','scheduled') GROUP BY status
      `, [leagueId]);

      let live = 0, sched = 0;
      statsRes.rows.forEach(r => {
        if (r.status === "live") live = parseInt(r.count, 10);
        if (r.status === "scheduled") sched = parseInt(r.count, 10);
      });

      if (live + sched < 3 && Math.random() < 0.6) {
        await generateRoundRobinMatch(leagueId, sportId);
      }

      const ready = await pool.query(
        "SELECT id FROM matches WHERE league_id = $1 AND status = 'scheduled' AND start_time <= NOW() ORDER BY start_time ASC",
        [leagueId]
      );
      for (const m of ready.rows) {
        const total = live + sched;
        if (total === 0 || (live + 1) / total <= 0.7) {
          await pool.query("UPDATE matches SET status = 'live', updated_at = NOW() WHERE id = $1", [m.id]);
          live++; sched--;
        } else {
          await pool.query("UPDATE matches SET start_time = NOW() + INTERVAL '2 minutes', updated_at = NOW() WHERE id = $1", [m.id]);
        }
      }
    }

    // 3. Тикаем live матчи
    const liveMatches = await pool.query("SELECT * FROM matches WHERE status = 'live'");
    for (const match of liveMatches.rows) {
      await tickMatch(match);
    }

    // 4. Глобальная чистка
    const countRes = await pool.query("SELECT COUNT(*) FROM matches");
    if (parseInt(countRes.rows[0].count, 10) >= 100) {
      await pool.query(`DELETE FROM matches WHERE id IN (SELECT id FROM matches WHERE status='finished' ORDER BY updated_at ASC LIMIT 30)`);
    }
  } catch (err) {
    console.error("[SIM] Tick error:", err.message);
  }
}

let simulationInterval = null;

function startSimulation() {
  if (simulationInterval) return;
  simulationInterval = setInterval(runSimulationTick, 10000);
  console.log("[SIM] Round-Robin simulation started");
}

function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log("[SIM] Simulation stopped");
  }
}

module.exports = { startSimulation, stopSimulation, isRunning: () => simulationInterval !== null };
