require("dotenv").config();
const axios = require("axios");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const pool = require("./db/pool");
const simulation = require("./simulation/engine");
const { migrate } = require("./db/migrate");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "flashscore_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/matches", require("./routes/matches"));
app.use("/api/leagues", require("./routes/leagues"));
app.use("/api/teams", require("./routes/teams"));
app.use("/api/user", require("./routes/user"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/ai", require("./routes/ai"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    await pool.query("SELECT 1");
    console.log("Database connected");
  } catch (err) {
    console.error("Database connection failed:", err.message);
  }

  await migrate();
  simulation.startSimulation();
});

// Keep-alive: пингуем сами себя каждые 10 минут чтобы Render не засыпал
// и симуляция не останавливалась
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    await axios.get(`${SELF_URL}/api/health`);
    // Если симуляция остановилась (после сна) — перезапускаем
    if (!simulation.isRunning()) {
      console.log("[KEEPALIVE] Simulation was stopped, restarting...");
      simulation.startSimulation();
    }
  } catch (err) {
    console.error("[KEEPALIVE] Self-ping failed:", err.message);
  }
}, 10 * 60 * 1000);
