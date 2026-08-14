-- Pending invites for group members who haven't signed up yet
CREATE TABLE IF NOT EXISTS pending_invites (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, email)
);

CREATE INDEX idx_pending_invites_email ON pending_invites(email);
CREATE INDEX idx_pending_invites_group_id ON pending_invites(group_id);
