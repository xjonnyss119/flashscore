const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const EVENT_ICONS = {
  goal: "⚽",
  yellow_card: "🟡",
  red_card: "🔴",
  puck: "🏒",
  "2_pointer": "🏀",
  "3_pointer": "🔥",
  free_throw: "🎯",
  match_start: "🏁",
  match_end: "⏱️",
};

router.get("/favorites", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;

    const result = await pool.query(
      `SELECT 
        f.id,
        f.match_id,
        f.team_id,
        m.status,
        m.home_score,
        m.away_score,
        m.minute,
        m.sport_id,
        ht.name AS home_team,
        at.name AS away_team,
        l.name AS league_name,
        l.country,
        t.name AS team_name
       FROM favorites f
       LEFT JOIN matches m ON f.match_id = m.id
       LEFT JOIN teams ht ON m.home_team_id = ht.id
       LEFT JOIN teams at ON m.away_team_id = at.id
       LEFT JOIN leagues l ON m.league_id = l.id
       LEFT JOIN teams t ON f.team_id = t.id
       WHERE f.user_id = $1
       ORDER BY f.id DESC`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера при получении избранного" });
  }
});

// ДОБАВЛЕНИЕ В ИЗБРАННОЕ С ЗАЩИТОЙ ОТ ЛИМИТОВ NEON
router.post("/favorites", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;
    const { team_id, match_id } = req.body;

    // --- БЛОК КОНТРОЛЯ СТРОК В FAVORITES ---
    const countRes = await pool.query("SELECT COUNT(*) FROM favorites");
    const currentCount = parseInt(countRes.rows[0].count);

    if (currentCount >= 49) {
      console.log(`[NEON GUARD] В избранном ${currentCount} строк. Сносим 20 старых записей...`);
      // Удаляем 20 самых старых записей из избранного
      await pool.query(`
        DELETE FROM favorites 
        WHERE id IN (
          SELECT id FROM favorites 
          ORDER BY id ASC 
          LIMIT 20
        )
      `);
    }
    // ---------------------------------------

    const result = await pool.query(
      "INSERT INTO favorites (user_id, team_id, match_id) VALUES ($1, $2, $3) RETURNING *",
      [userId, team_id || null, match_id || null],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Ошибка сервера при добавлении в избранное" });
  }
});

router.delete("/favorites/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;

    await pool.query("DELETE FROM favorites WHERE id = $1 AND user_id = $2", [
      req.params.id,
      userId,
    ]);
    res.json({ message: "Удалено из избранного" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Ошибка сервера при удалении из избранного" });
  }
});

// ПОЛУЧЕНИЕ УВЕДОМЛЕНИЙ С АВТО-ОЧИСТКОЙ СТАРЫХ НА ЛЕТУ
router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;

    // --- БЛОК КОНТРОЛЯ СТРОК В NOTIFICATIONS ---
    const countRes = await pool.query("SELECT COUNT(*) FROM notifications");
    const currentCount = parseInt(countRes.rows[0].count);

    if (currentCount >= 49) {
      console.log(`[NEON GUARD] В уведомлениях ${currentCount} строк. Удаляем 20 старых пушей...`);
      // Вырезаем 20 самых старых уведомлений по дате создания
      await pool.query(`
        DELETE FROM notifications 
        WHERE id IN (
          SELECT id FROM notifications 
          ORDER BY created_at ASC 
          LIMIT 20
        )
      `);
    }
    // --------------------------------------------

    const result = await pool.query(
      `SELECT 
        n.id, n.message, n.is_read, n.created_at, n.type AS event_type,
        m.id AS match_id, m.home_score, m.away_score, m.minute AS match_minute,
        ht.name AS home_team, at.name AS away_team
       FROM notifications n
       LEFT JOIN matches m ON n.match_id = m.id
       LEFT JOIN teams ht ON m.home_team_id = ht.id
       LEFT JOIN teams at ON m.away_team_id = at.id
       WHERE n.user_id = $1 
       ORDER BY n.created_at DESC 
       LIMIT 50`,
      [userId],
    );

    const formattedNotifications = result.rows.map((row) => {
      const icon = EVENT_ICONS[row.event_type] || "🔔";
      let title = "Обновление матча";

      if (row.home_team && row.away_team) {
        title = `${row.home_team} vs ${row.away_team}`;
      }

      return {
        id: row.id,
        match_id: row.match_id,
        title: title,
        message: row.message,
        icon: icon,
        score: row.home_team ? `${row.home_score}:${row.away_score}` : null,
        minute: row.match_minute,
        is_read: row.is_read,
        created_at: row.created_at,
      };
    });

    res.json(formattedNotifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера при получении уведомлений" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;

    await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2",
      [req.params.id, userId],
    );
    res.json({ message: "Прочитано" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ПОЛУЧЕНИЕ ИСТОРИИ (С ОЧИСТКОЙ СТАРЫХ ЗАПИСЕЙ, ТАК КАК ТУТ ИДЁТ ИНСЕРТ В ДРУГОМ ФАЙЛЕ)
router.get("/history", requireAuth, async (req, res) => {
  try {
    const userId = req.session?.userId || req.user?.id;

    // --- БЛОК КОНТРОЛЯ СТРОК В HISTORY ---
    const countRes = await pool.query("SELECT COUNT(*) FROM history");
    const currentCount = parseInt(countRes.rows[0].count);

    if (currentCount >= 49) {
      console.log(`[NEON GUARD] В истории ${currentCount} строк. Чистим 20 старых просмотров...`);
      // Вычищаем 20 самых старых просмотров матчей из логов
      await pool.query(`
        DELETE FROM history 
        WHERE id IN (
          SELECT id FROM history 
          ORDER BY viewed_at ASC 
          LIMIT 20
        )
      `);
    }
    // -------------------------------------

    const result = await pool.query(
      `SELECT 
        m.id, 
        m.home_score, 
        m.away_score, 
        m.status,
        ht.name AS home_team, 
        at.name AS away_team,
        MAX(h.viewed_at) AS viewed_at
       FROM history h
       JOIN matches m ON h.match_id = m.id
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       WHERE h.user_id = $1
       GROUP BY m.id, m.home_score, m.away_score, m.status, ht.name, at.name
       ORDER BY viewed_at DESC 
       LIMIT 30`,
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;