const pool = require("./pool");

async function migrate() {
  try {
    // Create seasons table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.seasons (
        id SERIAL PRIMARY KEY,
        league_id integer REFERENCES public.leagues(id) ON DELETE CASCADE,
        champion_team_id integer REFERENCES public.teams(id) ON DELETE SET NULL,
        status character varying(20) DEFAULT 'active',
        next_season_at timestamp without time zone,
        completed_at timestamp without time zone,
        ai_prediction text,
        ai_prediction_updated timestamp without time zone,
        CONSTRAINT seasons_league_id_key UNIQUE (league_id)
      )
    `);

    // Initialize seasons for all existing leagues
    await pool.query(`
      INSERT INTO public.seasons (league_id, status)
      SELECT id, 'active' FROM public.leagues
      ON CONFLICT (league_id) DO NOTHING
    `);

    console.log("[DB] Migration: seasons table ready");
  } catch (err) {
    console.error("[DB] Migration error:", err.message);
  }
}

module.exports = { migrate };
