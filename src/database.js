const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});


async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT,
        started BOOLEAN DEFAULT FALSE,
        selected_pokemon_id INTEGER,
        balance INTEGER DEFAULT 0,
        last_daily TIMESTAMPTZ,
        next_breed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pokemon (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        pokemon_id INTEGER NOT NULL,
        nickname TEXT,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        shiny BOOLEAN DEFAULT FALSE,
        iv_hp INTEGER NOT NULL,
        iv_atk INTEGER NOT NULL,
        iv_def INTEGER NOT NULL,
        iv_spatk INTEGER NOT NULL,
        iv_spdef INTEGER NOT NULL,
        iv_spd INTEGER NOT NULL,
        nature TEXT,
        favorite BOOLEAN DEFAULT FALSE,
        caught_at TIMESTAMPTZ DEFAULT NOW(),
        original_owner TEXT,
        held_item TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS market_listings (
        id SERIAL PRIMARY KEY,
        seller_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        pokemon_db_id INTEGER REFERENCES pokemon(id) ON DELETE CASCADE,
        price INTEGER NOT NULL,
        listed_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        user1_id TEXT NOT NULL,
        user2_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        user1_confirmed BOOLEAN DEFAULT FALSE,
        user2_confirmed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trade_pokemon (
        id SERIAL PRIMARY KEY,
        trade_id INTEGER REFERENCES trades(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        pokemon_db_id INTEGER REFERENCES pokemon(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS spawns (
        channel_id TEXT PRIMARY KEY,
        pokemon_id INTEGER NOT NULL,
        spawned_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS server_config (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT DEFAULT 'p!',
        spawn_channel_id TEXT
      );

      CREATE TABLE IF NOT EXISTS pokedex (
        user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        pokemon_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, pokemon_id)
      );

      CREATE TABLE IF NOT EXISTS battles (
        id SERIAL PRIMARY KEY,
        challenger_id TEXT NOT NULL,
        opponent_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        turn TEXT,
        challenger_pokemon_id INTEGER,
        opponent_pokemon_id INTEGER,
        challenger_hp INTEGER,
        opponent_hp INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_inventory (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        UNIQUE(user_id, item_id)
      );

      CREATE TABLE IF NOT EXISTS user_boosts (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
        boost_type TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        uses_left INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS move1 TEXT DEFAULT NULL;
      ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS move2 TEXT DEFAULT NULL;
      ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS move3 TEXT DEFAULT NULL;
      ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS move4 TEXT DEFAULT NULL;

      CREATE INDEX IF NOT EXISTS idx_pokemon_user_id ON pokemon(user_id);
      CREATE INDEX IF NOT EXISTS idx_pokemon_pokemon_id ON pokemon(pokemon_id);
      CREATE INDEX IF NOT EXISTS idx_market_listings_price ON market_listings(price);
    `);
    console.log("Database initialized successfully");
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
