const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { requireAdmin } = require("../middleware/auth");
// Подключаем официальный клиент Google Generative AI
const { GoogleGenAI } = require("@google/generative-ai");

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

// РОУТ ДЛЯ ИИ-ПРОГНОЗА ЧЕРЕЗ ОФИЦИАЛЬНЫЙ SDK GEMINI
router.post("/ai-prediction", async (req, res) => {
  try {
    const sportId = parseInt(req.query.sportId) || 1;
    const currentTeams = req.body.teams;

    if (!currentTeams || currentTeams.length === 0) {
      return res
        .status(400)
        .json({ error: "На бэкенд не переданы данные таблицы лиги" });
    }

    // Подготовка массива для симуляции
    let simulatedTable = currentTeams.map((t) => ({
      id: t.id || t.team_id,
      name: t.name || t.team_name,
      points: parseInt(t.points) || 0,
      rating: parseInt(t.rating) || 50,
    }));

    // Подгоняем массив под Round-Robin (Круговую систему)
    let rotation = [...simulatedTable];
    const hasGhost = rotation.length % 2 !== 0;
    if (hasGhost) {
      rotation.push({ id: null, name: "GHOST", points: 0, rating: 0 });
    }

    const numTeams = rotation.length;
    const rounds = numTeams - 1;
    let firstCircle = [];

    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < numTeams / 2; i++) {
        const home = rotation[i];
        const away = rotation[numTeams - 1 - i];

        if (home.id !== null && away.id !== null) {
          firstCircle.push({ home, away });
        }
      }
      rotation.splice(1, 0, rotation.pop());
    }

    let secondCircle = firstCircle.map((m) => ({ home: m.away, away: m.home }));
    const fullCalendar = [...firstCircle, ...secondCircle];

    // Симуляция оставшейся части сезона в памяти сервера
    fullCalendar.forEach((match) => {
      const home = simulatedTable.find((t) => t.id === match.home.id);
      const away = simulatedTable.find((t) => t.id === match.away.id);

      if (!home || !away) return;

      const homePower =
        home.rating + home.points * 0.2 + Math.random() * 25 + 3;
      const awayPower = away.rating + away.points * 0.2 + Math.random() * 25;

      if (sportId === 1) {
        // ФУТБОЛ
        if (homePower > awayPower + 4) {
          home.points += 3;
        } else if (awayPower > homePower + 4) {
          away.points += 3;
        } else {
          home.points += 1;
          away.points += 1;
        }
      } else if (sportId === 2) {
        // ХОККЕЙ
        const diff = Math.abs(homePower - awayPower);
        if (diff > 5) {
          if (homePower > awayPower) home.points += 3;
          else away.points += 3;
        } else {
          if (Math.random() > 0.5) {
            home.points += 2;
            away.points += 1;
          } else {
            away.points += 2;
            home.points += 1;
          }
        }
      } else if (sportId === 3) {
        // БАСКЕТБОЛ
        if (homePower > awayPower) home.points += 1;
        else away.points += 1;
      }
    });

    // Сортируем по очкам
    simulatedTable.sort((a, b) => b.points - a.points);

    const sportNames = { 1: "Футбольной", 2: "Хоккейной", 3: "Баскетбольной" };
    const currentSportName = sportNames[sportId] || "Спортивной";

    // Наш промпт для ИИ эксперта
    const systemPrompt = `Ты — топовый, харизматичный спортивный аналитик и эксперт. 
    Тебе предоставлена итоговая таблица ${currentSportName} лиги, полученная в результате математической симуляции оставшихся матчей сезона.
    Твоя задача — написать яркий, экспертный разбор итогов. Назови чемпиона, выдели главные сенсации (кто прыгнул выше головы) и главные провалы сезона. 
    Пиши живым языком, как пишут в спортивных медиа. Не используй сухие штампы.
    
    Ты обязан вернуть ответ СТРОГО в формате JSON по следующей структуре:
    {
      "winner": "Точное название команды-чемпиона",
      "analysis": "Твой развернутый аналитический текст на русском языке..."
    }`;

    const userContent = `Таблица после симуляции сезона: ${JSON.stringify(simulatedTable.map((t) => ({ name: t.name, points: t.points })))}`;

    // Инициализируем GoogleGenAI с помощью ключа из .env
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Получаем доступ к генеративной модели gemini-1.5-flash через официальный метод
    const model = ai.models.get("gemini-1.5-flash");

    // Вызываем генерацию контента
    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: `${systemPrompt}\n\nДанные таблицы:\n${userContent}` },
          ],
        },
      ],
      generationConfig: {
        // Официальный параметр SDK для принудительного JSON режима
        responseMimeType: "application/json",
        temperature: 0.6,
      },
    });

    // Извлекаем чистый текст из ответа
    const textResponse = response.text;

    // Парсим в JSON объект и отправляем на фронтенд в StandingsScreen
    const aiData = JSON.parse(textResponse);
    return res.status(200).json(aiData);
  } catch (error) {
    console.error("AI Route Error:", error.message || error);
    return res
      .status(500)
      .json({ error: "Ошибка модуля прогнозирования Gemini ИИ" });
  }
});

module.exports = router;
