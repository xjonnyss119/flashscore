const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Инициализируем Gemini API (убедись, что ключ лежит в .env)
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Получить все лиги
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM public.leagues ORDER BY name",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Создать лигу
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, country } = req.body;
    const result = await pool.query(
      "INSERT INTO public.leagues (name, country) VALUES ($1, $2) RETURNING *",
      [name, country],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Редактировать лигу
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { name, country } = req.body;
    const result = await pool.query(
      "UPDATE public.leagues SET name = $1, country = $2 WHERE id = $3 RETURNING *",
      [name, country, req.params.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получить команды лиги
router.get("/:id/teams", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM public.teams WHERE league_id = $1 ORDER BY name",
      [req.params.id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Удалить команду и её статистику
router.delete("/teams/:id", requireAdmin, async (req, res) => {
  try {
    const teamId = req.params.id;

    await pool.query("DELETE FROM public.standings WHERE team_id = $1", [
      teamId,
    ]);

    const result = await pool.query(
      "DELETE FROM public.teams WHERE id = $1 RETURNING *",
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

// -------------------------------------------------------------------------
// МОДЕРНИЗИРОВАННЫЙ РОУТ ТАБЛИЦЫ + СОСТОЯНИЕ СЕЗОНА
// -------------------------------------------------------------------------
router.get("/:id/standings", async (req, res) => {
  try {
    const leagueId = req.params.id;

    // 1. Проверяем существование лиги и берем её спорт
    const leagueRes = await pool.query(
      "SELECT sport_id FROM public.leagues WHERE id = $1",
      [leagueId],
    );
    if (leagueRes.rows.length === 0) {
      return res.status(404).json({ error: "Лига не найдена" });
    }
    const sportId = Number(leagueRes.rows[0].sport_id);

    // 2. Вытягиваем метаданные текущего сезона лиги (тур, перерыв, чемпион)
    const stateRes = await pool.query(
      "SELECT current_round, total_rounds, status, next_season_start, last_champion, ai_predicted_winner FROM public.league_states WHERE league_id = $1",
      [leagueId],
    );
    const seasonState = stateRes.rows[0] || {
      current_round: 0,
      total_rounds: 0,
      status: "active",
      next_season_start: null,
      last_champion: null,
      ai_predicted_winner: null,
    };

    // 3. Формируем запрос турнирной таблицы с твоей логикой сортировки
    let queryText = `
      SELECT s.*, t.name AS team_name, t.logo_url, t.rating
      FROM public.standings s 
      LEFT JOIN public.teams t ON s.team_id = t.id
      WHERE s.league_id = $1
    `;

    if (sportId === 3) {
      queryText += ` ORDER BY (CASE WHEN s.played > 0 THEN s.wins::float / s.played ELSE 0 END) DESC, 
                               (s.goals_for - s.goals_against) DESC, 
                               t.name ASC`;
    } else {
      queryText += ` ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC, s.wins DESC, t.name ASC`;
    }

    const standingsResult = await pool.query(queryText, [leagueId]);

    // 4. Отдаем объединенный объект: и таблицу, и состояние
    res.json({
      seasonState,
      standings: standingsResult.rows,
    });
  } catch (err) {
    console.error("[GET STANDINGS ERROR]:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// -------------------------------------------------------------------------
// ЖИВОЙ ИИ-ПРОГНОЗ ДЛЯ КОНКРЕТНОЙ ЛИГИ НА ОСНОВЕ ЕЁ ТАБЛИЦЫ
// -------------------------------------------------------------------------
router.post("/:id/ai-prediction", async (req, res) => {
  try {
    const leagueId = req.params.id;
    const { currentRound, totalRounds, standings } = req.body;

    if (!standings || standings.length === 0) {
      return res
        .status(400)
        .json({ error: "Данные таблицы пусты или не переданы" });
    }

    const systemPrompt = `Ты — авторитетный спортивный аналитик и эксперт. Тебе предоставлена текущая турнирная таблица лиги.
    Текущий прогресс сезона: сыграно ${currentRound} из ${totalRounds} туров. Симуляция матчей живая, динамичная и учитывает силу команд (rating).
    Проанализируй текущую ситуацию в таблице. Оцени шансы команд на основе набранных очков и их базового рейтинга силы (rating).
    Сделай экспертное заключение и выбери СТРОГО ОДНУ команду, которая имеет наибольшие шансы стать чемпионом по итогам сезона на данный момент.
    Кратко распиши интригу для остальных ключевых участников (лидеров и аутсайдеров).
    
    Ты ОБЯЗАН вернуть ответ СТРОГО в формате JSON (без лишнего текста вокруг):
    {
      "ai_predicted_winner": "Точное название команды-фаворита на данный момент",
      "analysis": "Твой детальный, сочный аналитический разбор ситуации на русском языке в 3-5 предложениях."
    }`;

    // Передаем ИИ только нужные для анализа поля, чтобы не забивать контекст лишними id
    const tableSnapshot = standings.map((s) => ({
      name: s.team_name || s.name,
      played: s.played,
      points: s.points,
      wins: s.wins,
      goals_for: s.goals_for,
      goals_against: s.goals_against,
      rating: s.rating || 50,
    }));

    const userContent = `Текущее состояние таблицы standings: ${JSON.stringify(tableSnapshot)}`;

    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    const aiResponse = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userContent }] }],
    });
    const aiData = JSON.parse(aiResponse.response.text());

    // Сохраняем имя предсказанного победителя в состояние лиги в БД
    await pool.query(
      "UPDATE public.league_states SET ai_predicted_winner = $1 WHERE league_id = $2",
      [aiData.ai_predicted_winner, leagueId],
    );

    res.json(aiData);
  } catch (error) {
    console.error("[AI PREDICTION ERROR]:", error.message);
    res.status(500).json({ error: "Ошибка генерации ИИ-аналитики" });
  }
});

module.exports = router;
