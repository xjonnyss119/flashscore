const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM leagues ORDER BY name");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, country } = req.body;
    const result = await pool.query(
      "INSERT INTO leagues (name, country) VALUES ($1, $2) RETURNING *",
      [name, country],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { name, country } = req.body;
    const result = await pool.query(
      "UPDATE leagues SET name = $1, country = $2 WHERE id = $3 RETURNING *",
      [name, country, req.params.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.get("/:id/teams", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM teams WHERE league_id = $1 ORDER BY name",
      [req.params.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.delete("/teams/:id", requireAdmin, async (req, res) => {
  try {
    const teamId = req.params.id;

    await pool.query("DELETE FROM standings WHERE team_id = $1", [teamId]);

    const result = await pool.query(
      "DELETE FROM teams WHERE id = $1 RETURNING *",
      [teamId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Команда не найдена" });
    }

    res.json({ message: "Команда и её статистика успешно удалены" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера при удалении команды" });
  }
});

router.get("/:id/standings", async (req, res) => {
  try {
    const leagueRes = await pool.query(
      "SELECT sport_id FROM leagues WHERE id = $1",
      [req.params.id],
    );
    if (leagueRes.rows.length === 0) {
      return res.status(404).json({ error: "Лига не найдена" });
    }
    const sportId = Number(leagueRes.rows[0].sport_id);

    let queryText = `
      SELECT s.*, t.name AS team_name, t.logo_url
      FROM standings s 
      LEFT JOIN teams t ON s.team_id = t.id
      WHERE s.league_id = $1
    `;

    if (sportId === 3) {
      queryText += ` ORDER BY (CASE WHEN s.played > 0 THEN s.wins::float / s.played ELSE 0 END) DESC, 
                             (s.goals_for - s.goals_against) DESC, 
                             t.name ASC`;
    } else {
      queryText += ` ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC, s.wins DESC, t.name ASC`;
    }

    const result = await pool.query(queryText, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error("[GET STANDINGS ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;