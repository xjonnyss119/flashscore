const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    let query =
      "SELECT t.*, l.name AS league_name FROM teams t LEFT JOIN leagues l ON t.league_id = l.id";
    const params = [];
    if (search) {
      query += " WHERE t.name ILIKE $1";
      params.push(`%${search}%`);
    }
    query += " ORDER BY t.name";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { name, league_id, rating, logo_url } = req.body;
    const result = await pool.query(
      "UPDATE teams SET name=$1, league_id=$2, rating=$3, logo_url=$4 WHERE id=$5 RETURNING *",
      [name, league_id, rating, logo_url, req.params.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;
