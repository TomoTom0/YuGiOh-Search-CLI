-- Migration number: 0001 	 2026-02-14T23:29:04.078Z

-- API Keys table
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  scopes TEXT, -- JSON array: ["cards:read", "faqs:read"]
  rate_limit INTEGER DEFAULT 1000, -- Requests per hour
  is_active BOOLEAN DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  expires_at DATETIME
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- API Logs table
CREATE TABLE api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE INDEX idx_api_logs_api_key_id ON api_logs(api_key_id);
CREATE INDEX idx_api_logs_created_at ON api_logs(created_at);
