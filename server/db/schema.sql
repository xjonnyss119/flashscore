





CREATE TABLE IF NOT EXISTS sports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);


CREATE TABLE IF NOT EXISTS leagues (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    sport_id INTEGER REFERENCES sports(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    league_id INTEGER REFERENCES leagues(id) ON DELETE SET NULL,
    rating INTEGER DEFAULT 50,
    logo_url TEXT
);


CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    home_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    league_id INTEGER REFERENCES leagues(id) ON DELETE SET NULL,
    sport_id INTEGER REFERENCES sports(id) ON DELETE SET NULL, 
    start_time TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished')),
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    minute INTEGER DEFAULT 0
);


CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    minute INTEGER NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'goal', 'yellow_card', 'red_card',        
        'puck', 'penalty',                        
        '2_pointer', '3_pointer', 'free_throw'    
    )),
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    player_name VARCHAR(100)
);


CREATE TABLE IF NOT EXISTS standings (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
    played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    goals_for INTEGER DEFAULT 0,
    goals_against INTEGER DEFAULT 0,
    UNIQUE(team_id, league_id)
);


CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    CHECK (
        (team_id IS NOT NULL AND match_id IS NULL) OR
        (team_id IS NULL AND match_id IS NOT NULL)
    )
);


CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);


CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_verifications (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    verification_code VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);





INSERT INTO sports (id, name) VALUES 
(1, 'Football'), 
(2, 'Hockey'), 
(3, 'Basketball') 
ON CONFLICT (id) DO NOTHING;


INSERT INTO leagues (id, name, country, sport_id) VALUES
(1, 'РПЛ', 'Россия', 1),
(2, 'La Liga', 'Испания', 1),
(3, 'Premier League', 'Англия', 1),
(4, 'NHL', 'USA/Canada', 2),
(5, 'NBA', 'USA', 3)
ON CONFLICT (id) DO NOTHING;


INSERT INTO teams (name, league_id, rating) VALUES
('Зенит', 1, 80), ('ЦСКА', 1, 75),('Локомотив', 1, 74), ('Спартак', 1, 72),
('Реал Мадрид', 2, 92), ('Барселона', 2, 90),('Атлетико Мадрид', 2, 87),
('Манчестер Сити', 3, 94), ('Ливерпуль', 3, 91),('Арсенал', 3, 88)
ON CONFLICT DO NOTHING;


INSERT INTO teams (name, league_id, rating) VALUES
('Washington Capitals', 4, 85),
('Pittsburgh Penguins', 4, 84),
('Tampa Bay Lightning', 4, 88),
('Toronto Maple Leafs', 4, 86)
ON CONFLICT DO NOTHING;


INSERT INTO teams (name, league_id, rating) VALUES
('LA Lakers', 5, 90),
('Golden State Warriors', 5, 92),
('Chicago Bulls', 5, 82),
('Boston Celtics', 5, 89)
ON CONFLICT DO NOTHING;


Users SET role = 'admin' WHERE email = 'ivanzuk68@gmail.com';