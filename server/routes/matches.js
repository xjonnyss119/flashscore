const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const MATCH_SELECT = `
  SELECT
    m.id, m.start_time, m.status, m.home_score, m.away_score, m.minute, m.sport_id, m.is_overtime, m.updated_at,
    ht.id AS home_team_id, ht.name AS home_team,
    at.id AS away_team_id, at.name AS away_team,
    l.id AS league_id, l.name AS league_name, l.country
  FROM public.matches m
  JOIN public.teams ht ON m.home_team_id = ht.id
  JOIN public.teams at ON m.away_team_id = at.id
  JOIN public.leagues l ON m.league_id = l.id
`;

// 1. ПОЛУЧЕНИЕ СПИСКА МАТЧЕЙ С УМНОЙ СОРТИРОВКОЙ
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
      params.push(parseInt(league_id));
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
    
    // Динамическая сортировка в зависимости от вкладки на фронтенде
    let orderBy = "ORDER BY m.start_time DESC"; // Дефолт для завершенных
    if (status === "live") {
      orderBy = "ORDER BY m.updated_at DESC, m.minute DESC"; // Самые активные лайвы — вверху
    } else if (status === "scheduled") {
      orderBy = "ORDER BY m.start_time ASC"; // Ближайшие матчи идут первыми
    }

    const result = await pool.query(
      `${MATCH_SELECT} ${where} ${orderBy} LIMIT 50`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[GET MATCHES ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 2. ПОЛУЧЕНИЕ ОДНОГО МАТЧА + СОБЫТИЯ + ИСТОРИЯ
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const matchRes = await pool.query(`${MATCH_SELECT} WHERE m.id = $1`, [id]);

    if (matchRes.rows.length === 0)
      return res.status(404).json({ error: "Матч не найден" });

    const eventsRes = await pool.query(
      `SELECT e.*, t.name AS team_name
       FROM public.events e LEFT JOIN public.teams t ON e.team_id = t.id
       WHERE e.match_id = $1 ORDER BY e.minute ASC, e.id ASC`,
      [id]
    );

    // Запись в историю просмотров
    const currentUserId = req.session?.userId || req.user?.id;
    if (currentUserId) {
      await pool
        .query(
          `INSERT INTO public.history (user_id, match_id, viewed_at) VALUES ($1, $2, NOW())
           ON CONFLICT (user_id, match_id) DO UPDATE SET viewed_at = NOW()`,
          [currentUserId, id]
        )
        .catch(() => {});
    }

    res.json({ ...matchRes.rows[0], events: eventsRes.rows });
  } catch (err) {
    console.error("[GET MATCH DETAIL ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 3. РУЧНОЕ СОЗДАНИЕ МАТЧА АДМИНОМ
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { home_team_id, away_team_id, league_id, start_time } = req.body;

    const leagueRes = await pool.query(
      "SELECT sport_id FROM public.leagues WHERE id = $1",
      [league_id]
    );
    if (leagueRes.rows.length === 0) {
      return res.status(400).json({ error: "Указанная лига не существует" });
    }
    const sportId = leagueRes.rows[0].sport_id;

    const result = await pool.query(
      `INSERT INTO public.matches (home_team_id, away_team_id, league_id, sport_id, start_time, status, home_score, away_score, minute, is_overtime, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', 0, 0, 0, false, NOW()) RETURNING *`,
      [home_team_id, away_team_id, league_id, sportId, start_time]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[POST MATCH ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 4. ОБНОВЛЕНИЕ МАТЧА АДМИНОМ
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, home_score, away_score, minute, is_overtime } = req.body;

    const result = await pool.query(
      `UPDATE public.matches SET
        status = COALESCE($1, status),
        home_score = COALESCE($2, home_score),
        away_score = COALESCE($3, away_score),
        minute = COALESCE($4, minute),
        is_overtime = COALESCE($5, is_overtime),
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [status, home_score, away_score, minute, is_overtime, id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Матч не найден" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[PATCH MATCH ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 5. УДАЛЕНИЕ МАТЧА АДМИНОМ
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM public.events WHERE match_id = $1", [req.params.id]);
    await pool.query("DELETE FROM public.matches WHERE id = $1", [req.params.id]);
    res.json({ message: "Матч и связанные события успешно удалены" });
  } catch (err) {
    console.error("[DELETE MATCH ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 6. ДОБАВЛЕНИЕ СОБЫТИЯ В МАТЧ
router.post("/:id/events", requireAdmin, async (req, res) => {
  try {
    const { minute, type, team_id, player_name } = req.body;

    const result = await pool.query(
      `INSERT INTO public.events (match_id, minute, type, team_id, player_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, minute, type, team_id, player_name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[POST EVENT ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;