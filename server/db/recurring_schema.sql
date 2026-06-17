CREATE TABLE IF NOT EXISTS recurring_expenses (
  id           SERIAL PRIMARY KEY,
  group_id     INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by      INT NOT NULL REFERENCES users(id),
  title        VARCHAR(255) NOT NULL,
  amount       NUMERIC(10, 2) NOT NULL,
  split_type   VARCHAR(20) NOT NULL DEFAULT 'equal',
  category     VARCHAR(50) NOT NULL DEFAULT 'general',
  frequency    VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly'
  next_due     DATE NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW()
);