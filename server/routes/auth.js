const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const transporter = nodemailer.createTransport({
  host: "64.233.165.108",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(toEmail, code) {
  await transporter.sendMail({
    from: `"Flashscore" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Подтверждение регистрации",
    text: `Ваш код подтверждения: ${code}\n\nКод действителен 24 часа.`,
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Подтвердите ваш email</h2>
        <p>Ваш код подтверждения:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                    padding: 16px; background: #f5f5f5; text-align: center;
                    border-radius: 8px; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #888; font-size: 14px;">Код действителен 24 часа.</p>
      </div>
    `,
  });
}

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email и пароль обязательны" });

    if (password.length < 6)
      return res.status(400).json({ error: "Пароль минимум 6 символов" });

    const normalizedEmail = email.toLowerCase().trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail))
      return res.status(400).json({ error: "Некорректный формат email" });

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if (existingUser.rows.length > 0)
      return res.status(409).json({ error: "Email уже используется" });

    const password_hash = await bcrypt.hash(password, 10);
    const code = generateCode();

    await pool.query(
      `INSERT INTO pending_verifications (email, password_hash, verification_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             verification_code = EXCLUDED.verification_code,
             created_at = NOW()`,
      [normalizedEmail, password_hash, code],
    );

    await sendVerificationEmail(normalizedEmail, code);

    res.status(201).json({
      message: "Код подтверждения отправлен на ваш email.",
    });
  } catch (err) {
    console.error("[AUTH] Register error — code:", err.code);
    console.error("[AUTH] Register error — message:", err.message);

    const isSmtpError =
      [
        "EAUTH",
        "ECONNECTION",
        "ETIMEDOUT",
        "EENVELOPE",
        "EMESSAGE",
        "ESOCKET",
      ].includes(err.code) ||
      (typeof err.responseCode === "number" && err.responseCode >= 400);

    if (isSmtpError) {
      try {
        await pool.query("DELETE FROM pending_verifications WHERE email = $1", [
          req.body.email?.toLowerCase().trim(),
        ]);
      } catch (_) {}
      return res
        .status(502)
        .json({ error: "Не удалось отправить письмо. Попробуйте позже." });
    }

    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.post("/verify", async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, code } = req.body;

    if (!email || !code)
      return res.status(400).json({ error: "Email и код обязательны" });

    const normalizedEmail = email.toLowerCase().trim();

    const result = await pool.query(
      "SELECT * FROM pending_verifications WHERE email = $1",
      [normalizedEmail],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Сначала пройдите регистрацию" });

    const pending = result.rows[0];

    if (pending.verification_code !== code)
      return res.status(400).json({ error: "Неверный код подтверждения" });

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO users (email, password_hash, is_verified)
       VALUES ($1, $2, TRUE)`,
      [normalizedEmail, pending.password_hash],
    );

    await client.query("DELETE FROM pending_verifications WHERE email = $1", [
      normalizedEmail,
    ]);

    await client.query("COMMIT");

    res.json({ message: "Email подтверждён. Теперь вы можете войти." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[AUTH] Verify error:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  } finally {
    client.release();
  }
});

router.post("/resend-code", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email обязателен" });

    const normalizedEmail = email.toLowerCase().trim();

    const result = await pool.query(
      "SELECT id FROM pending_verifications WHERE email = $1",
      [normalizedEmail],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Сначала пройдите регистрацию" });

    const code = generateCode();

    await pool.query(
      "UPDATE pending_verifications SET verification_code = $1, created_at = NOW() WHERE email = $2",
      [code, normalizedEmail],
    );

    await sendVerificationEmail(normalizedEmail, code);

    res.json({ message: "Новый код отправлен на ваш email." });
  } catch (err) {
    console.error("[AUTH] Resend error:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email и пароль обязательны" });

    const normalizedEmail = email.toLowerCase().trim();

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      normalizedEmail,
    ]);

    if (result.rows.length === 0) {
      const pending = await pool.query(
        "SELECT id FROM pending_verifications WHERE email = $1",
        [normalizedEmail],
      );
      if (pending.rows.length > 0) {
        return res.status(403).json({
          error: "Email не подтверждён. Проверьте почту и введите код.",
          code: "EMAIL_NOT_VERIFIED",
        });
      }
      return res.status(401).json({ error: "Неверный email или пароль" });
    }

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ error: "Неверный email или пароль" });

    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
      message: "Вход выполнен",
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("[AUTH] Login error:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Выход выполнен" });
  });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, role, created_at FROM users WHERE id = $1",
      [req.session.userId],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = router;
