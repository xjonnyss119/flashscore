const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. Получить список команд
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    let query =
      "SELECT t.*, l.name AS league_name FROM public.teams t LEFT JOIN public.leagues l ON t.league_id = l.id";
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

// 2. Обновить команду
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { name, league_id, rating } = req.body;
    const result = await pool.query(
      "UPDATE public.teams SET name=$1, league_id=$2, rating=$3 WHERE id=$4 RETURNING *",
      [name, league_id, rating, req.params.id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 3. ИИ-ПРОГНОЗ (теперь только прокси к Gemini, без тяжелой математики внутри)
router.post("/ai-prediction", async (req, res) => {
  try {
    // Получаем уже готовую таблицу с фронтенда или из состояния базы
    const { standings } = req.body;

    if (!standings || standings.length === 0) {
      return res.status(400).json({ error: "Нет данных для анализа" });
    }

    const systemPrompt = `Ты — топовый спортивный аналитик. 
    Тебе предоставлена текущая турнирная таблица. Проанализируй её и сделай прогноз, кто станет чемпионом и какие команды провалятся.
    Пиши в стиле спортивной журналистики, ярко и профессионально.
    Ответь СТРОГО в формате JSON: {"winner": "Название", "analysis": "Текст"}`;

    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    const response = await model.generateContent(JSON.stringify(standings));
    res.json(JSON.parse(response.response.text()));
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Ошибка ИИ-аналитики" });
  }
});

module.exports = router;
