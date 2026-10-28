-- Core tables. Every rule that can live in the database does.

CREATE TABLE teams (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  participant_count integer     NOT NULL CHECK (participant_count BETWEEN 1 AND 3),
  assigned_venue    text        CHECK (assigned_venue IN ('DTH', 'ISE')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_team_name_ci ON teams (lower(name));

CREATE TABLE participants (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email          text        NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  phone          text        CHECK (length(phone) <= 40),
  sap_id         text        CHECK (length(sap_id) <= 60),
  year           text        CHECK (length(year) <= 40),
  branch         text        CHECK (length(branch) <= 120),
  team_id        integer     REFERENCES teams (id) ON DELETE RESTRICT,
  qr_token       text        NOT NULL UNIQUE CHECK (qr_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  assigned_venue text        CHECK (assigned_venue IN ('DTH', 'ISE')),
  checked_in     boolean     NOT NULL DEFAULT false,
  checked_in_at  timestamptz,
  email_sent_at  timestamptz,
  email_error    text        CHECK (length(email_error) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- people without a team may never be seated in ISE
  CONSTRAINT ck_noteam_not_ise CHECK (team_id IS NOT NULL OR assigned_venue IS DISTINCT FROM 'ISE'),
  CONSTRAINT ck_checked_in_time CHECK (checked_in = (checked_in_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_participant_email_ci ON participants (lower(email));
CREATE INDEX ix_participant_team ON participants (team_id);
CREATE INDEX ix_participant_venue ON participants (assigned_venue);

CREATE TABLE admins (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      text        NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_.-]{1,64}$'),
  password_hash text        NOT NULL,
  role          text        NOT NULL CHECK (role IN ('SUPER_ADMIN', 'VENUE_OPERATOR')),
  venue         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_admin_venue CHECK (
    -- "venue IS NOT NULL" matters: a CHECK passes when its expression is NULL
    (role = 'SUPER_ADMIN' AND venue IS NULL) OR
    (role = 'VENUE_OPERATOR' AND venue IS NOT NULL AND venue IN ('DTH', 'ISE')))
);

-- Only a SHA-256 of the session token is stored, so a DB leak doesn't hand out live sessions.
CREATE TABLE sessions (
  token_hash text        PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  admin_id   integer     NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_session_admin ON sessions (admin_id);

CREATE TABLE check_ins (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- UNIQUE: at most one successful check-in per participant, whatever the app does
  participant_id integer     NOT NULL UNIQUE REFERENCES participants (id) ON DELETE RESTRICT,
  venue          text        NOT NULL CHECK (venue IN ('DTH', 'ISE')),
  operator_id    integer     REFERENCES admins (id) ON DELETE SET NULL,
  scanned_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_checkin_time ON check_ins (scanned_at DESC);

CREATE TABLE event_state (
  id                integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  allocation_status text        NOT NULL DEFAULT 'NONE' CHECK (allocation_status IN ('NONE', 'DRAFT', 'CONFIRMED')),
  confirmed_at      timestamptz,
  CONSTRAINT ck_confirmed_time CHECK ((allocation_status = 'CONFIRMED') = (confirmed_at IS NOT NULL))
);
INSERT INTO event_state (id) VALUES (1);
