const pool = require("../db/pool");

const PLAYERS = [
  "Иванов",
  "Петров",
  "Сидоров",
  "Козлов",
  "Новиков",
  "Морозов",
  "Попов",
  "Лебедев",
  "Семёнов",
  "Егоров",
];

function randomPlayer() {
  return PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
}

async function generateRandomMatch(status = "scheduled") {
  try {
    const leagueRes = await pool.query(`
      SELECT l.id, l.sport_id 
      FROM leagues l
      JOIN sports s ON l.sport_id = s.id
      ORDER BY RANDOM() 
      LIMIT 1
    `);

    if (leagueRes.rows.length === 0) return;
    const { id: leagueId, sport_id: sportId } = leagueRes.rows[0];

    const teamsRes = await pool.query(
      `
      SELECT id, rating FROM teams 
      WHERE league_id = $1 
      AND id NOT IN (
          SELECT home_team_id FROM matches WHERE status IN ('scheduled', 'live')
          UNION
          SELECT away_team_id FROM matches WHERE status IN ('scheduled', 'live')
      )
      ORDER BY RANDOM() 
      LIMIT 2
    `,
      [leagueId],
    );

    if (teamsRes.rows.length < 2) return;

    const teamA = teamsRes.rows[0];
    const teamB = teamsRes.rows[1];

    const delayMinutes =
      status === "live" ? 0 : Math.floor(Math.random() * 11) + 5;
    const startTime = new Date(Date.now() + delayMinutes * 60 * 1000);

    await pool.query(
      `INSERT INTO matches (home_team_id, away_team_id, league_id, sport_id, start_time, status, home_score, away_score, minute, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, NOW())`,
      [teamA.id, teamB.id, leagueId, sportId, startTime, status],
    );

    console.log(
      `[SIM][МАТЕМАТИКА] Сгенерирован матч [Статус: ${status.toUpperCase()}] (Спорт ID: ${sportId}): Команда ${teamA.id} vs ${teamB.id}`,
    );
  } catch (err) {
    console.error("[SIM] Generation error:", err.message);
  }
}

function getEventSettings(sportId, ratingA, ratingB) {
  const avg = (ratingA + ratingB) / 2;
  const ratingModifier = 0.5 + avg / 100;

  switch (sportId) {
    case 2:
      return {
        scoreProb: 0.07 * ratingModifier,
        scoreType: "puck",
        cardProb: 0.04,
        cardType: "penalty",
      };
    case 3:
      return {
        scoreProb: 1.35 * ratingModifier,
        scoreType: "basket",
        cardProb: 0.02,
        cardType: "foul",
      };
    default:
      return {
        scoreProb: 0.015 + (avg / 100) * 0.01,
        scoreType: "goal",
        cardProb: 0.03,
        cardType: "yellow_card",
      };
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
    if (sportId === 2) {
      if (newMinute > regularMaxMinutes + 20) {
        const homeWinsPenalties = Math.random() > 0.5;
        if (homeWinsPenalties) currentHomeScore += 1;
        else currentAwayScore += 1;

        const winnerTeamId = homeWinsPenalties
          ? match.home_team_id
          : match.away_team_id;
        await pool.query(
          "INSERT INTO events (match_id, minute, type, team_id, player_name) VALUES ($1, $2, 'puck', $3, 'Победный буллит')",
          [match.id, regularMaxMinutes + 20, winnerTeamId],
        );

        await finishAndAddToStandings(
          match,
          regularMaxMinutes + 20,
          currentHomeScore,
          currentAwayScore,
          isOvertime,
        );
        return;
      }
    }

    if (sportId === 3) {
      const otMinutesPlayed = newMinute - regularMaxMinutes;
      if (otMinutesPlayed > 0 && otMinutesPlayed % 5 === 0) {
        if (currentHomeScore !== currentAwayScore) {
          await finishAndAddToStandings(
            match,
            newMinute,
            currentHomeScore,
            currentAwayScore,
            isOvertime,
          );
          return;
        }
        await pool.query(
          "INSERT INTO events (match_id, minute, type, player_name) VALUES ($1, $2, 'overtime_start', 'Система (2-й ОТ или далее)')",
          [match.id, newMinute],
        );
      }
    }
  } else if (newMinute > regularMaxMinutes) {
    if (
      (sportId === 2 || sportId === 3) &&
      currentHomeScore === currentAwayScore
    ) {
      isOvertime = true;
      await pool.query(
        "INSERT INTO events (match_id, minute, type, player_name) VALUES ($1, $2, 'overtime_start', 'Система')",
        [match.id, regularMaxMinutes],
      );
    } else {
      await finishAndAddToStandings(
        match,
        regularMaxMinutes,
        currentHomeScore,
        currentAwayScore,
        isOvertime,
      );
      return;
    }
  }

  await pool.query(
    "UPDATE matches SET minute = $1, is_overtime = $2, updated_at = NOW() WHERE id = $3",
    [newMinute, isOvertime, match.id],
  );

  const teamsRes = await pool.query(
    "SELECT id, name, rating FROM teams WHERE id IN ($1, $2)",
    [match.home_team_id, match.away_team_id],
  );
  const hT = teamsRes.rows.find((t) => t.id === match.home_team_id);
  const aT = teamsRes.rows.find((t) => t.id === match.away_team_id);

  const settings = getEventSettings(
    sportId,
    hT?.rating || 50,
    aT?.rating || 50,
  );

  const homeTeamName = hT?.name || "Хозяева";
  const awayTeamName = aT?.name || "Гости";

  if (Math.random() < settings.scoreProb) {
    const side =
      Math.random() < hT?.rating / (hT?.rating + aT?.rating) ? "home" : "away";
    let points = 1;
    let type = settings.scoreType;

    if (sportId === 3) {
      const roll = Math.random();
      if (roll < 0.3) {
        points = 3;
        type = "3_pointer";
      } else if (roll < 0.9) {
        points = 2;
        type = "2_pointer";
      } else {
        points = 1;
        type = "free_throw";
      }
    }

    if (side === "home") currentHomeScore += points;
    else currentAwayScore += points;
    const scoringTeam = side === "home" ? homeTeamName : awayTeamName;

    await pool.query(
      `UPDATE matches SET ${side}_score = ${side}_score + $1, updated_at = NOW() WHERE id = $2`,
      [points, match.id],
    );
    await pool.query(
      "INSERT INTO events (match_id, minute, type, team_id, player_name) VALUES ($1,$2,$3,$4,$5)",
      [
        match.id,
        newMinute,
        type,
        side === "home" ? match.home_team_id : match.away_team_id,
        randomPlayer(),
      ],
    );

    const otMark = isOvertime ? " (ОТ)" : "";
    const scoreMessage = `Очки: +${points} (${newMinute}'${otMark}) — ${scoringTeam}`;
    await notifyFavoriteUsers(match.id, type, scoreMessage);

    if (sportId === 2 && isOvertime) {
      await finishAndAddToStandings(
        match,
        newMinute,
        currentHomeScore,
        currentAwayScore,
        isOvertime,
      );
      return;
    }
  }

  if (settings.cardProb > 0 && Math.random() < settings.cardProb) {
    const side = Math.random() < 0.5 ? "home" : "away";
    const teamId = side === "home" ? match.home_team_id : match.away_team_id;
    const penalizedTeam = side === "home" ? homeTeamName : awayTeamName;

    await pool.query(
      "INSERT INTO events (match_id, minute, type, team_id, player_name) VALUES ($1,$2,$3,$4,$5)",
      [match.id, newMinute, settings.cardType, teamId, randomPlayer()],
    );

    let cardText = "Нарушение правил";
    if (settings.cardType === "yellow_card") cardText = "🟨 Желтая карточка";
    if (settings.cardType === "penalty") cardText = "⏱️ Удаление 2 мин";
    if (settings.cardType === "foul") cardText = "⚠️ Фол";

    const cardMessage = `${cardText} (${newMinute}') — ${penalizedTeam}`;
    await notifyFavoriteUsers(match.id, settings.cardType, cardMessage);
  }
}

async function finishAndAddToStandings(
  match,
  finalMinute,
  homeScore,
  awayScore,
  isOvertime,
) {
  await pool.query(
    "UPDATE matches SET status = 'finished', minute = $1, home_score = $2, away_score = $3, is_overtime = $4, updated_at = NOW() WHERE id = $5",
    [finalMinute, homeScore, awayScore, isOvertime, match.id],
  );

  const finalMatchData = {
    ...match,
    home_score: homeScore,
    away_score: awayScore,
    is_overtime: isOvertime,
  };

  await updateStandings(finalMatchData);
}

async function notifyFavoriteUsers(matchId, eventType, message) {
  try {
    const favs = await pool.query(
      "SELECT user_id FROM favorites WHERE match_id = $1",
      [matchId],
    );
    for (const fav of favs.rows) {
      await pool.query(
        "INSERT INTO notifications (user_id, match_id, type, message) VALUES ($1, $2, $3, $4)",
        [fav.user_id, matchId, eventType, message],
      );
    }
  } catch (err) {
    console.error("[SIM] Notification error:", err.message);
  }
}

async function updateStandings(match) {
  try {
    const {
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      league_id,
      is_overtime,
    } = match;

    const leagueRes = await pool.query(
      "SELECT sport_id FROM leagues WHERE id = $1",
      [league_id],
    );
    if (leagueRes.rows.length === 0) return;
    const sportId = Number(leagueRes.rows[0].sport_id);

    let hW = 0,
      hD = 0,
      hL = 0,
      hP = 0;
    let aW = 0,
      aD = 0,
      aL = 0,
      aP = 0;
    let hW_ot = 0,
      hL_ot = 0,
      aW_ot = 0,
      aL_ot = 0;

    if (sportId === 1) {
      if (home_score > away_score) {
        hW = 1;
        hP = 3;
        aL = 1;
      } else if (home_score === away_score) {
        hD = 1;
        hP = 1;
        aD = 1;
        aP = 1;
      } else {
        hL = 1;
        aW = 1;
        aP = 3;
      }
    } else if (sportId === 2) {
      if (home_score > away_score) {
        hW = is_overtime ? 0 : 1;
        hW_ot = is_overtime ? 1 : 0;
        hP = 2;
        aL = is_overtime ? 0 : 1;
        aL_ot = is_overtime ? 1 : 0;
        aP = is_overtime ? 1 : 0;
      } else {
        hL = is_overtime ? 0 : 1;
        hL_ot = is_overtime ? 1 : 0;
        hP = is_overtime ? 1 : 0;
        aW = is_overtime ? 0 : 1;
        aW_ot = is_overtime ? 1 : 0;
        aP = 2;
      } 
    } else if (sportId === 3) {
      if (home_score > away_score) {
        hW = 1;
        hP = 1;
        aL = 1;
        aP = 0;
      } else {
        hL = 1;
        hP = 0;
        aW = 1;
        aP = 1;
      }
    }

    const upsert = async (tId, w, d, l, p, gf, ga, w_ot, l_ot) => {
      await pool.query(
        `INSERT INTO standings (team_id, league_id, played, wins, draws, losses, points, goals_for, goals_against, wins_ot, losses_ot)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (team_id, league_id) DO UPDATE SET
           played = standings.played + 1, 
           wins = standings.wins + $3, 
           draws = standings.draws + $4,
           losses = standings.losses + $5, 
           points = standings.points + $6,
           goals_for = standings.goals_for + $7, 
           goals_against = standings.goals_against + $8,
           wins_ot = COALESCE(standings.wins_ot, 0) + $9,
           losses_ot = COALESCE(standings.losses_ot, 0) + $10`,
        [tId, league_id, w, d, l, p, gf, ga, w_ot, l_ot],
      );
    };

    await upsert(
      home_team_id,
      hW,
      hD,
      hL,
      hP,
      home_score,
      away_score,
      hW_ot,
      hL_ot,
    );
    await upsert(
      away_team_id,
      aW,
      aD,
      aL,
      aP,
      away_score,
      home_score,
      aW_ot,
      aL_ot,
    );
  } catch (err) {
    console.error("[SIM] Standings error:", err.message);
  }
}

async function runSimulationTick() {
  try {
    await pool.query(
      "DELETE FROM matches WHERE status = 'finished' AND updated_at < NOW() - INTERVAL '1 day'",
    );

    const statsRes = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM matches 
      WHERE status IN ('live', 'scheduled') 
      GROUP BY status
    `);

    let currentLive = 0;
    let currentScheduled = 0;

    statsRes.rows.forEach((row) => {
      if (row.status === "live") currentLive = parseInt(row.count, 10);
      if (row.status === "scheduled")
        currentScheduled = parseInt(row.count, 10);
    });

    const activeTotal = currentLive + currentScheduled;

    if (activeTotal < 25) {
      if (Math.random() < 0.5) {
        const nextTotal = activeTotal + 1;

        const currentLiveRatio = nextTotal > 0 ? currentLive / nextTotal : 0;

        let targetStatus = "scheduled";

        if (currentLiveRatio < 0.3) {
          targetStatus = "live";
        } else if ((currentLive + 1) / nextTotal <= 0.7) {
          targetStatus = Math.random() < 0.4 ? "live" : "scheduled";
        } else {
          targetStatus = "scheduled";
        }

        await generateRandomMatch(targetStatus);
      }
    }

    const readyToLiveRes = await pool.query(
      "SELECT id FROM matches WHERE status = 'scheduled' AND start_time <= NOW() ORDER BY start_time ASC",
    );

    let tempLiveCount = currentLive;
    let tempScheduledCount = currentScheduled;

    for (const matchRow of readyToLiveRes.rows) {
      const totalActiveNow = tempLiveCount + tempScheduledCount;
      const futureLiveRatio =
        totalActiveNow > 0 ? (tempLiveCount + 1) / totalActiveNow : 0;

      if (futureLiveRatio <= 0.7) {
        await pool.query(
          "UPDATE matches SET status = 'live', updated_at = NOW() WHERE id = $1",
          [matchRow.id],
        );
        tempLiveCount++;
        tempScheduledCount--;
      } else {
        await pool.query(
          "UPDATE matches SET start_time = NOW() + INTERVAL '2 minutes', updated_at = NOW() WHERE id = $1",
          [matchRow.id],
        );
        console.log(
          `[SIM][ЗАЩИТА] Старт матча ID ${matchRow.id} отложен на 2 мин: превышен лимит LIVE (70%)`,
        );
      }
    }

    const liveMatches = await pool.query(
      "SELECT * FROM matches WHERE status = 'live'",
    );
    for (const match of liveMatches.rows) {
      await tickMatch(match);
    }
  } catch (err) {
    console.error("[SIM] Tick error:", err.message);
  }
}

let simulationInterval = null;

function startSimulation() {
  if (simulationInterval) return;
  simulationInterval = setInterval(runSimulationTick, 10000);
  console.log(
    "[SIM] Multi-sport simulation started (Limit: 25, Balance: 30%-70%)",
  );
}

function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log("[SIM] Multi-sport simulation stopped by Admin");
  }
}

module.exports = {
  startSimulation,
  stopSimulation,
  isRunning: () => simulationInterval !== null,
};
