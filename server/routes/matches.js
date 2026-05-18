const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const MATCH_SELECT = `
  SELECT
    m.id, m.start_time, m.status, m.home_score, m.away_score, m.minute, m.sport_id, m.is_overtime,
    ht.id AS home_team_id, ht.name AS home_team,
    at.id AS away_team_id, at.name AS away_team,
    l.id AS league_id, l.name AS league_name, l.country
  FROM matches m
  JOIN teams ht ON m.home_team_id = ht.id
  JOIN teams at ON m.away_team_id = at.id
  JOIN leagues l ON m.league_id = l.id
`;

router.get("/", async (req, res) => {
  try {
    const { status, league_id, sport_id, search } = req.query;
    let conditions = [];
    let params = [];
    let i = 1;

    if (status) {
      conditions.push(`m.status = $${i++}`);
      params.push(status);
    }
    if (league_id) {
      conditions.push(`m.league_id = $${i++}`);
      params.push(league_id);
    }
    if (sport_id) {
      conditions.push(`m.sport_id = $${i++}`);
      params.push(parseInt(sport_id));
    }
    if (search) {
      conditions.push(`(ht.name ILIKE $${i} OR at.name ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const result = await pool.query(
      `${MATCH_SELECT} ${where} ORDER BY m.start_time DESC`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const matchRes = await pool.query(`${MATCH_SELECT} WHERE m.id = $1`, [id]);

    if (matchRes.rows.length === 0)
      return res.status(404).json({ error: "Матч не найден" });

    const eventsRes = await pool.query(
      `SELECT e.*, t.name AS team_name
       FROM events e LEFT JOIN teams t ON e.team_id = t.id
       WHERE e.match_id = $1 ORDER BY e.minute ASC`,
      [id],
    );

    if (req.session?.userId) {
      await pool
        .query(
          `INSERT INTO history (user_id, match_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
          [req.session.userId, id],
        )
        .catch(() => {});
    }

    res.json({ ...matchRes.rows[0], events: eventsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { home_team_id, away_team_id, league_id, start_time } = req.body;

    const leagueRes = await pool.query(
      "SELECT sport_id FROM leagues WHERE id = $1",
      [league_id],
    );
    if (leagueRes.rows.length === 0) {
      return res.status(400).json({ error: "Указанная лига не существует" });
    }
    const sportId = leagueRes.rows[0].sport_id;

    const result = await pool.query(
      `INSERT INTO matches (home_team_id, away_team_id, league_id, sport_id, start_time, status, is_overtime)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', false) RETURNING *`,
      [home_team_id, away_team_id, league_id, sportId, start_time],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { status, home_score, away_score, minute, is_overtime } = req.body;

    const result = await pool.query(
      `UPDATE matches SET
        status = COALESCE($1, status),
        home_score = COALESCE($2, home_score),
        away_score = COALESCE($3, away_score),
        minute = COALESCE($4, minute),
        is_overtime = COALESCE($5, is_overtime)
       WHERE id = $6 RETURNING *`,
      [status, home_score, away_score, minute, is_overtime, id],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Матч не найден" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM matches WHERE id = $1", [req.params.id]);
    res.json({ message: "Матч удалён" });
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.post("/:id/events", requireAdmin, async (req, res) => {
  try {
    const { minute, type, team_id, player_name } = req.body;
    const result = await pool.query(
      `INSERT INTO events (match_id, minute, type, team_id, player_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, minute, type, team_id, player_name],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;
