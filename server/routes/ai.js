const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const axios = require("axios");

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function callGemini(prompt) {
  const response = await axios.post(
    GEMINI_URL,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
    },
    {
      headers: { "Content-Type": "application/json" },
      validateStatus: (status) => status < 500
    }
  );

  if (response.status >= 400) {
    throw new Error(`Gemini API error: ${response.status} ${JSON.stringify(response.data)}`);
  }

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.trim();
}

// GET /api/ai/prediction/:leagueId
// Возвращает прогноз ИИ. Если кэш свежий (<5 мин) — из БД, иначе запрашивает Gemini
router.get("/prediction/:leagueId", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (isNaN(leagueId)) return res.status(400).json({ error: "Неверный ID лиги" });

  try {
    // Проверяем кэш
    const seasonRes = await pool.query(
      "SELECT ai_prediction, ai_prediction_updated FROM seasons WHERE league_id = $1",
      [leagueId]
    );

    if (seasonRes.rows.length > 0) {
      const { ai_prediction, ai_prediction_updated } = seasonRes.rows[0];
      const cacheAge = ai_prediction_updated
        ? Date.now() - new Date(ai_prediction_updated).getTime()
        : Infinity;

      if (ai_prediction && cacheAge < 60 * 60 * 1000) {
        try {
          return res.json(JSON.parse(ai_prediction));
        } catch {
          return res.json({ prediction: ai_prediction });
        }
      }
    }

    // Собираем данные для Gemini
    const leagueRes = await pool.query(
      "SELECT l.name, l.sport_id, s.name as sport_name FROM leagues l JOIN sports s ON l.sport_id = s.id WHERE l.id = $1",
      [leagueId]
    );
    if (leagueRes.rows.length === 0) return res.status(404).json({ error: "Лига не найдена" });

    const league = leagueRes.rows[0];
    const sportId = Number(league.sport_id);

    let orderClause;
    if (sportId === 3) {
      orderClause = `(CASE WHEN s.played > 0 THEN s.wins::float / s.played ELSE 0 END) DESC, (s.goals_for - s.goals_against) DESC`;
    } else {
      orderClause = `s.points DESC, (s.goals_for - s.goals_against) DESC, s.wins DESC`;
    }

    const standingsRes = await pool.query(`
      SELECT t.name, t.rating, s.played, s.wins, s.draws, s.losses, s.points,
             s.goals_for, s.goals_against, s.wins_ot, s.losses_ot
      FROM standings s
      JOIN teams t ON s.team_id = t.id
      WHERE s.league_id = $1
      ORDER BY ${orderClause}
    `, [leagueId]);

    const standings = standingsRes.rows;
    const totalTeams = standings.length;

    if (totalTeams === 0) {
      return res.json({
        champion: null,
        top3: [],
        reasoning: "Недостаточно данных для прогноза. Сезон только начался.",
        confidence: 0
      });
    }

    // Формируем промпт
    const standingsText = standings.map((t, i) => {
      const gd = (t.goals_for || 0) - (t.goals_against || 0);
      const pct = t.played > 0 ? ((t.wins / t.played) * 100).toFixed(1) : "0.0";
      return `${i+1}. ${t.name} | Рейтинг:${t.rating} | И:${t.played} | В:${t.wins} | Н:${t.draws||0} | П:${t.losses} | ±${gd>0?'+':''}${gd} | Очки:${t.points} | %П:${pct}%`;
    }).join("\n");

    const maxMatchesPerTeam = sportId === 1 ? 2 * (totalTeams - 1) : 4 * (totalTeams - 1);
    const avgPlayed = standings.reduce((s, t) => s + (t.played || 0), 0) / totalTeams;
    const seasonProgress = Math.min(100, Math.round((avgPlayed / maxMatchesPerTeam) * 100));

    const prompt = `Ты аналитик спортивного чемпионата. Проанализируй турнирную таблицу и дай прогноз итогов сезона.

ЛИГА: ${league.name} (${league.sport_name})
ПРОГРЕСС СЕЗОНА: ${seasonProgress}% (сыграно в среднем ${avgPlayed.toFixed(1)} из ${maxMatchesPerTeam} матчей)

ТЕКУЩАЯ ТАБЛИЦА:
${standingsText}

Примечания:
- Рейтинг команды (0-99) отражает её силу
- Симуляция случайная, но рейтинг влияет на вероятность победы
- ${sportId === 1 ? 'Футбол: победа=3 очка, ничья=1, поражение=0' : sportId === 2 ? 'Хоккей: победа=2 очка, победа в ОТ=2 очка (соперник получает 1)' : 'Баскетбол: сортировка по % побед'}

Ответь СТРОГО в формате JSON (без markdown, без лишнего текста):
{
  "champion": "Название команды-победителя",
  "top3": ["1-е место", "2-е место", "3-е место"],
  "reasoning": "Краткое обоснование прогноза (2-3 предложения)",
  "confidence": число от 0 до 100
}`;

    const geminiResponse = await callGemini(prompt);

    let prediction;
    try {
      const jsonMatch = geminiResponse.match(/\{[\s\S]*\}/);
      prediction = JSON.parse(jsonMatch ? jsonMatch[0] : geminiResponse);
    } catch {
      prediction = {
        champion: standings[0]?.name || null,
        top3: standings.slice(0, 3).map(t => t.name),
        reasoning: geminiResponse,
        confidence: 50
      };
    }

    await pool.query(`
      INSERT INTO seasons (league_id, ai_prediction, ai_prediction_updated)
      VALUES ($1, $2, NOW())
      ON CONFLICT (league_id) DO UPDATE SET
        ai_prediction = EXCLUDED.ai_prediction,
        ai_prediction_updated = NOW()
    `, [leagueId, JSON.stringify(prediction)]);

    return res.json(prediction);
  } catch (err) {
    console.error("[AI] Prediction error:", err.message);
    res.status(500).json({ error: "Ошибка получения прогноза ИИ: " + err.message });
  }
});

router.post("/prediction/:leagueId/refresh", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (isNaN(leagueId)) return res.status(400).json({ error: "Неверный ID лиги" });

  try {
    await pool.query(
      "UPDATE seasons SET ai_prediction = NULL, ai_prediction_updated = NULL WHERE league_id = $1",
      [leagueId]
    );
    res.json({ success: true, message: "Кэш прогноза сброшен" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/season/:leagueId
// Данные сезона: действующий чемпион, статус, таймер обратного отсчёта
router.get("/season/:leagueId", async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (isNaN(leagueId)) return res.status(400).json({ error: "Неверный ID лиги" });

  try {
    const seasonRes = await pool.query(`
      SELECT s.*, t.name as champion_name
      FROM seasons s
      LEFT JOIN teams t ON s.champion_team_id = t.id
      WHERE s.league_id = $1
    `, [leagueId]);

    if (seasonRes.rows.length === 0) {
      return res.json({ status: "active", champion_name: null, next_season_at: null });
    }

    const season = seasonRes.rows[0];
    return res.json({
      status: season.status,
      champion_name: season.champion_name,
      next_season_at: season.next_season_at,
      completed_at: season.completed_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
