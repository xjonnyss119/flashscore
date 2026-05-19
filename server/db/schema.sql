CREATE TABLE public.sports (
    id SERIAL PRIMARY KEY,
    name character varying(50) NOT NULL CONSTRAINT sports_name_key UNIQUE
);

CREATE TABLE public.leagues (
    id SERIAL PRIMARY KEY,
    name character varying(100) NOT NULL,
    country character varying(100) NOT NULL,
    sport_id integer REFERENCES public.sports(id) ON DELETE CASCADE
);

CREATE TABLE public.teams (
    id SERIAL PRIMARY KEY,
    name character varying(100) NOT NULL,
    league_id integer REFERENCES public.leagues(id) ON DELETE SET NULL,
    rating integer DEFAULT 50,
    logo_url text,
    sport_id integer
);

CREATE TABLE public.matches (
    id SERIAL PRIMARY KEY,
    home_team_id integer REFERENCES public.teams(id) ON DELETE CASCADE,
    away_team_id integer REFERENCES public.teams(id) ON DELETE CASCADE,
    league_id integer REFERENCES public.leagues(id) ON DELETE SET NULL,
    sport_id integer REFERENCES public.sports(id) ON DELETE SET NULL,
    start_time timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    home_score integer DEFAULT 0,
    away_score integer DEFAULT 0,
    minute integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now(),
    is_overtime boolean DEFAULT false,
    CONSTRAINT matches_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'live'::character varying, 'finished'::character varying])::text[])))
);

CREATE TABLE public.users (
    id SERIAL PRIMARY KEY,
    email character varying(255) NOT NULL CONSTRAINT users_email_key UNIQUE,
    password_hash text NOT NULL,
    role character varying(10) DEFAULT 'user'::character varying,
    is_verified boolean DEFAULT false,
    verification_code character varying(10),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying])::text[])))
);

CREATE TABLE public.events (
    id SERIAL PRIMARY KEY,
    match_id integer REFERENCES public.matches(id) ON DELETE CASCADE,
    minute integer NOT NULL,
    type character varying(30) NOT NULL,
    team_id integer REFERENCES public.teams(id) ON DELETE SET NULL,
    player_name character varying(100)
);

CREATE TABLE public.favorites (
    id SERIAL PRIMARY KEY,
    user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
    team_id integer REFERENCES public.teams(id) ON DELETE CASCADE,
    match_id integer REFERENCES public.matches(id) ON DELETE CASCADE,
    CONSTRAINT favorites_check CHECK ((((team_id IS NOT NULL) AND (match_id IS NULL)) OR ((team_id IS NULL) AND (match_id IS NOT NULL))))
);

CREATE TABLE public.history (
    id SERIAL PRIMARY KEY,
    user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
    match_id integer REFERENCES public.matches(id) ON DELETE CASCADE,
    viewed_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.notifications (
    id SERIAL PRIMARY KEY,
    user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
    match_id integer REFERENCES public.matches(id) ON DELETE CASCADE,
    message text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    is_read boolean DEFAULT false,
    type character varying(50)
);

CREATE TABLE public.pending_verifications (
    id SERIAL PRIMARY KEY,
    email character varying(255) NOT NULL CONSTRAINT pending_verifications_email_key UNIQUE,
    password_hash text NOT NULL,
    verification_code character varying(10) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.standings (
    id SERIAL PRIMARY KEY,
    team_id integer REFERENCES public.teams(id) ON DELETE CASCADE,
    league_id integer REFERENCES public.leagues(id) ON DELETE CASCADE,
    played integer DEFAULT 0,
    wins integer DEFAULT 0,
    draws integer DEFAULT 0,
    losses integer DEFAULT 0,
    points integer DEFAULT 0,
    goals_for integer DEFAULT 0,
    goals_against integer DEFAULT 0,
    wins_ot integer DEFAULT 0,
    losses_ot integer DEFAULT 0,
    CONSTRAINT standings_team_id_league_id_key UNIQUE (team_id, league_id)
);

INSERT INTO public.sports (id, name) 
VALUES 
  (1, 'Футбол'),
  (2, 'Хоккей'),
  (3, 'Баскетбол')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

SELECT setval('sports_id_seq', (SELECT MAX(id) FROM public.sports));

INSERT INTO public.leagues (id, name, country, sport_id)
VALUES 
  (1, 'Premier League', 'Англия', 1), 
  (2, 'NHL', 'США/Канада', 2),        
  (3, 'NBA', 'США', 3)                
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, sport_id = EXCLUDED.sport_id;

SELECT setval('leagues_id_seq', (SELECT MAX(id) FROM public.leagues));

INSERT INTO public.teams (name, league_id, rating, sport_id)
VALUES
  ('Manchester City', 1, 92, 1),
  ('Arsenal',         1, 88, 1),
  ('Liverpool',       1, 89, 1),

  ('Tampa Bay Lightning', 2, 85, 2),
  ('Colorado Avalanche',  2, 88, 2),
  ('Edmonton Oilers',     2, 86, 2),
  ('Boston Bruins',       2, 84, 2),
  ('New York Rangers',    2, 85, 2),

  ('Boston Celtics',      3, 90, 3),
  ('Los Angeles Lakers',  3, 86, 3),
  ('Golden State Warriors', 3, 85, 3),
  ('Milwaukee Bucks',     3, 88, 3),
  ('Denver Nuggets',      3, 89, 3);

INSERT INTO public.teams (name, league_id, rating, sport_id)
VALUES
('Manchester United', 1, 84, 1),
('Chelsea',           1, 83, 1),
('Tottenham Hotspur', 1, 82, 1),
('Aston Villa',       1, 81, 1),
('Newcastle United',  1, 82, 1),
('Brighton',          1, 79, 1),
('West Ham United',   1, 78, 1),

('Florida Panthers',  2, 89, 2),
('Carolina Hurricanes', 2, 87, 2),
('Dallas Stars',      2, 86, 2),
('Vegas Golden Knights', 2, 85, 2),
('Toronto Maple Leafs', 2, 84, 2),

('Oklahoma City Thunder', 3, 88, 3),
('Minnesota Timberwolves', 3, 87, 3),
('Dallas Mavericks',   3, 86, 3),
('Philadelphia 76ers', 3, 85, 3),
('Miami Heat',         3, 83, 3);

-- MIGRATION: Seasons table for champion tracking and AI predictions
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
);

-- Initialize seasons for existing leagues
INSERT INTO public.seasons (league_id, status)
SELECT id, 'active' FROM public.leagues
ON CONFLICT (league_id) DO NOTHING;
