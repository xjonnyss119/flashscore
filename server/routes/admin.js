const express = require("express");
const router = express.Router();
const { requireAdmin } = require("../middleware/auth");
const simulation = require("../simulation/engine");
const pool = require("../db/pool");

router.get("/simulation/status", requireAdmin, (req, res) => {
  res.json({ running: !!simulation.isRunning() });
});

router.post("/simulation/start", requireAdmin, (req, res) => {
  try {
    simulation.startSimulation();
    res.json({ success: true, running: simulation.isRunning() });
  } catch (err) {
    console.error("Ошибка при старте симуляции:", err);
    res.status(500).json({ error: "Не удалось запустить симуляцию" });
  }
});

router.post("/simulation/stop", requireAdmin, (req, res) => {
  try {
    simulation.stopSimulation();
    res.json({ success: true, running: simulation.isRunning() });
  } catch (err) {
    console.error("Ошибка при остановке симуляции:", err);
    res.status(500).json({ error: "Не удалось остановить симуляцию" });
  }
});

router.post("/leagues", requireAdmin, async (req, res) => {
  const { name, country } = req.body;
  const sport_id = parseInt(req.body.sport_id, 10);

  if (!name || !country || isNaN(sport_id)) {
    console.log("Ошибка: Валидация лиги не прошла");
    return res
      .status(400)
      .json({ error: "Заполните все поля и выберите вид спорта" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO leagues (name, country, sport_id) VALUES ($1, $2, $3) RETURNING *",
      [name, country, sport_id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Критическая ошибка БД при создании лиги:", err);
    res.status(500).json({ error: "Ошибка при создании лиги" });
  }
});

router.post("/teams", requireAdmin, async (req, res) => {
  const { name } = req.body;
  const league_id = parseInt(req.body.league_id, 10);
  const rating = parseInt(req.body.rating, 10) || 50;

  if (!name || isNaN(league_id)) {
    console.log(
      "Ошибка: Валидация команды не прошла. Имя или league_id пустые/не числа",
    );
    return res
      .status(400)
      .json({ error: "Укажите название команды и выберите лигу" });
  }

  if (rating > 99 || rating < 0) {
    console.log(
      `Ошибка: Валидация рейтинга не прошла. Передан рейтинг: ${rating}`,
    );
    return res
      .status(400)
      .json({ error: "Рейтинг команды должен быть в диапазоне от 0 до 99" });
  }

  try {
    const leagueRes = await pool.query(
      "SELECT sport_id FROM leagues WHERE id = $1",
      [league_id],
    );

    if (leagueRes.rows.length === 0) {
      console.log(`Ошибка: Лига с ID ${league_id} не найдена в базе данных`);
      return res.status(404).json({ error: "Указанная лига не найдена" });
    }

    const sportId = parseInt(leagueRes.rows[0].sport_id, 10);

    const result = await pool.query(
      "INSERT INTO teams (name, league_id, sport_id, rating) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, league_id, sportId, rating],
    );

    const newTeam = result.rows[0];
    console.log(
      `[ADMIN] Команда "${newTeam.name}" успешно создана с ID: ${newTeam.id}`,
    );

    await pool.query(
      `INSERT INTO standings (team_id, league_id) 
       VALUES ($1, $2) 
       ON CONFLICT (team_id, league_id) DO NOTHING`,
      [newTeam.id, league_id],
    );
    console.log(
      `[ADMIN] Строка в standings для команды ID ${newTeam.id} успешно инициализирована.`,
    );

    res.json(newTeam);
  } catch (err) {
    console.error("Критическая ошибка БД при добавлении команды:", err);
    res.status(500).json({ error: "Ошибка при добавлении команды" });
  }
});

router.patch("/matches/:id", async (req, res) => {
  const matchId = req.params.id;
  const { status, home_score, away_score, minute } = req.body;

  try {
    if (status === "finished") {
      const matchRes = await pool.query(
        "SELECT sport_id FROM matches WHERE id = $1",
        [matchId],
      );
      if (matchRes.rows.length === 0) {
        return res.status(404).json({ error: "Матч не найден" });
      }

      const sportId = matchRes.rows[0].sport_id;
      const finalMinute = sportId === 2 ? 60 : sportId === 3 ? 48 : 90;

      await pool.query(
        "UPDATE matches SET status = 'finished', minute = $1, updated_at = NOW() WHERE id = $2",
        [finalMinute, matchId],
      );
      return res.json({ success: true, message: "Матч успешно завершен" });
    }

    await pool.query(
      `UPDATE matches 
       SET home_score = COALESCE($1, home_score), 
           away_score = COALESCE($2, away_score), 
           minute = COALESCE($3, minute),
           status = COALESCE($4, status),
           updated_at = NOW() 
       WHERE id = $5`,
      [home_score, away_score, minute, status, matchId],
    );

    res.json({ success: true, message: "Матч updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/leagues/:id", requireAdmin, async (req, res) => {
  const leagueId = req.params.id;
  try {
    const teamsRes = await pool.query(
      "SELECT id FROM teams WHERE league_id = $1",
      [leagueId],
    );
    const teamIds = teamsRes.rows.map((row) => row.id);

    if (teamIds.length > 0) {
      const matchesRes = await pool.query(
        "SELECT id FROM matches WHERE home_team_id = ANY($1) OR away_team_id = ANY($1)",
        [teamIds],
      );
      const matchIds = matchesRes.rows.map((row) => row.id);

      if (matchIds.length > 0) {
        await pool.query("DELETE FROM events WHERE match_id = ANY($1)", [
          matchIds,
        ]);
        await pool.query("DELETE FROM history WHERE match_id = ANY($1)", [
          matchIds,
        ]);
        await pool.query("DELETE FROM favorites WHERE match_id = ANY($1)", [
          matchIds,
        ]);

        await pool.query("DELETE FROM matches WHERE id = ANY($1)", [matchIds]);
      }

      await pool.query("DELETE FROM standings WHERE team_id = ANY($1)", [
        teamIds,
      ]);

      await pool.query("DELETE FROM teams WHERE league_id = $1", [leagueId]);
    }

    await pool.query("DELETE FROM standings WHERE league_id = $1", [leagueId]);

    const result = await pool.query(
      "DELETE FROM leagues WHERE id = $1 RETURNING *",
      [leagueId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Лига не найдена" });
    }

    return res.json({ message: "Лига успешно удалена через админку" });
  } catch (err) {
    console.error("[ADMIN LEAGUE DELETE ERROR]:", err.message);
    return res.status(500).json({ error: "Ошибка сервера при удалении лиги" });
  }
});

router.delete("/matches/:id", async (req, res) => {
  const matchId = req.params.id;
  try {
    const result = await pool.query("DELETE FROM matches WHERE id = $1", [
      matchId,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Матч не найден или уже удален" });
    }
    res.json({ success: true, message: "Матч успешно удален" });
  } catch (err) {
    console.error("Ошибка при удалении матча:", err.message);
    res.status(500).json({ error: "Ошибка сервера при удалении матча" });
  }
});

router.delete("/teams/:id", requireAdmin, async (req, res) => {
  const teamId = req.params.id;
  try {
    const matchesRes = await pool.query(
      "SELECT id FROM matches WHERE home_team_id = $1 OR away_team_id = $1",
      [teamId],
    );
    const matchIds = matchesRes.rows.map((row) => row.id);

    if (matchIds.length > 0) {
      await pool.query("DELETE FROM events WHERE match_id = ANY($1)", [
        matchIds,
      ]);
      await pool.query("DELETE FROM history WHERE match_id = ANY($1)", [
        matchIds,
      ]);
      await pool.query("DELETE FROM favorites WHERE match_id = ANY($1)", [
        matchIds,
      ]);
    }

    await pool.query(
      "DELETE FROM matches WHERE home_team_id = $1 OR away_team_id = $1",
      [teamId],
    );

    await pool.query("DELETE FROM standings WHERE team_id = $1", [teamId]);

    const result = await pool.query(
      "DELETE FROM teams WHERE id = $1 RETURNING *",
      [teamId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Команда не найдена" });
    }

    return res.json({ message: "Команда успешно удалена через админку" });
  } catch (err) {
    console.error("[ADMIN DELETE ERROR]:", err.message);
    return res.status(500).json({ error: "Ошибка сервера при удалении" });
  }
});

module.exports = router;
