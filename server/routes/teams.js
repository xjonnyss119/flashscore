const express = require("express");
const axios = require('axios');
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

// ОБНОВЛЕННЫЙ РОУТ ДЛЯ ИИ-ПРОГНОЗА
router.get('/ai-prediction', async (req, res) => {
  try {
    // Получаем параметры из query-строки фронтенда
    const leagueId = parseInt(req.query.leagueId);
    const sportId = parseInt(req.query.sportId) || 1; // 1 - Футбол, 2 - Хоккей, 3 - Баскетбол

    if (!leagueId) {
      return res.status(400).json({ error: "Параметр leagueId обязателен" });
    }

    // 1. Извлекаем команды строго заданной лиги
    const result = await pool.query(
      'SELECT id, name, points, rating FROM teams WHERE league_id = $1 ORDER BY points DESC',
      [leagueId]
    );
    const currentTeams = result.rows;

    if (currentTeams.length === 0) {
      return res.status(404).json({ error: "Команды для данной лиги не найдены в БД" });
    }

    // Подготовка массива для симуляции (копируем текущие очки и рейтинги силы)
    let simulatedTable = currentTeams.map(t => ({
      id: t.id,
      name: t.name,
      points: parseInt(t.points) || 0,
      rating: parseInt(t.rating) || 50 // берем рейтинг силы команды из БД (дефолт 50)
    }));

    // Подгоняем массив под Round-Robin. Если команд нечетное количество — добавляем "виртуального" соперника
    let rotation = [...simulatedTable];
    const hasGhost = rotation.length % 2 !== 0;
    if (hasGhost) {
      rotation.push({ id: null, name: "GHOST", points: 0, rating: 0 });
    }

    const numTeams = rotation.length;
    const rounds = numTeams - 1;
    let firstCircle = [];

    // Генерируем первый круг по круговой системе
    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < numTeams / 2; i++) {
        const home = rotation[i];
        const away = rotation[numTeams - 1 - i];
        
        // Игнорируем матчи со свободным слотом (пропуск тура)
        if (home.id !== null && away.id !== null) {
          firstCircle.push({ home, away });
        }
      }
      rotation.splice(1, 0, rotation.pop()); // Сдвиг по кругу, кроме первого элемента
    }

    // Второй круг (зеркальный со сменой хозяев поля)
    let secondCircle = firstCircle.map(m => ({ home: m.away, away: m.home }));
    const fullCalendar = [...firstCircle, ...secondCircle];

    // 2. Симуляция матчей с учетом специфики спортивных правил
    fullCalendar.forEach(match => {
      const home = simulatedTable.find(t => t.id === match.home.id);
      const away = simulatedTable.find(t => t.id === match.away.id);

      if (!home || !away) return;

      // Сила в матче = базовый рейтинг + текущие очки (форма) + рандом + фактор домашнего поля (+3)
      const homePower = home.rating + (home.points * 0.2) + Math.random() * 25 + 3;
      const awayPower = away.rating + (away.points * 0.2) + Math.random() * 25;

      // --- СИМУЛЯЦИЯ ПО ВИДАМ СПОРТА ---
      
      if (sportId === 1) { 
        // ФУТБОЛ (Победа — 3 очка, Ничья — 1 очко)
        if (homePower > awayPower + 4) {
          home.points += 3;
        } else if (awayPower > homePower + 4) {
          away.points += 3;
        } else {
          home.points += 1;
          away.points += 1;
        }
      } 
      else if (sportId === 2) { 
        // ХОККЕЙ (Чистая победа — 3, победа в ОТ — 2, поражение в ОТ — 1, поражение — 0)
        const diff = Math.abs(homePower - awayPower);
        
        if (diff > 5) {
          // Чистая победа одной из команд в основное время
          if (homePower > awayPower) home.points += 3;
          else away.points += 3;
        } else {
          // Ничья в основное время $\rightarrow$ симулируем овертайм
          if (Math.random() > 0.5) {
            home.points += 2; // Победа хозяев в ОТ
            away.points += 1; // Проигрыш гостей в ОТ
          } else {
            away.points += 2; // Победа гостей в ОТ
            home.points += 1; // Проигрыш хозяев в ОТ
          }
        }
      } 
      else if (sportId === 3) { 
        // БАСКЕТБОЛ (Ничьих нет. 1 очко за победу в таблицу винрейта)
        if (homePower > awayPower) {
          home.points += 1;
        } else {
          away.points += 1;
        }
      }
    });

    // Сортируем итоговую таблицу по убыванию очков
    simulatedTable.sort((a, b) => b.points - a.points);

    // Подготовка промпта под вид спорта
    const sportNames = { 1: "Футбольной", 2: "Хоккейной", 3: "Баскетбольной" };
    const currentSportName = sportNames[sportId] || "Спортивной";

    // 3. Формирование запроса к нейросети DeepSeek
    const systemPrompt = `Ты — топовый, харизматичный спортивный аналитик и эксперт. 
    Тебе предоставлена итоговая таблица ${currentSportName} лиги, полученная в результате математической симуляции оставшихся матчей сезона.
    Твоя задача — написать яркий, экспертный разбор итогов. Назови чемпиона, выдели главные сенсации (кто прыгнул выше головы) и главные провалы сезона. 
    Пиши живым языком, как пишут в спортивных медиа. Не используй сухие штампы.
    
    Ответь СТРОГО в формате JSON (без Markdown-разметки типа \`\`\`json):
    {
      "winner": "Точное название команды-чемпиона",
      "analysis": "Твой развернутый аналитический текст на русском языке..."
    }`;

    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Таблица после симуляции сезона: ${JSON.stringify(simulatedTable.map(t => ({ name: t.name, points: t.points })))}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const aiData = JSON.parse(response.data.choices[0].message.content);
    return res.status(200).json(aiData);

  } catch (error) {
    console.error("AI Route Error:", error);
    return res.status(500).json({ error: "Ошибка модуля прогнозирования ИИ" });
  }
});

module.exports = router;