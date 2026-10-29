-- Temporary exits: an organiser lets a checked-in participant step out, with a reason, and emails them a
-- one-time re-entry QR. Their original QR does not let them back in while they are out.
CREATE TABLE exits (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  participant_id  integer     NOT NULL REFERENCES participants (id) ON DELETE RESTRICT,
  reason          text        NOT NULL CHECK (length(reason) BETWEEN 1 AND 300),
  token           text        NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_by      integer     REFERENCES admins (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  returned_at     timestamptz,
  returned_venue  text        CHECK (returned_venue IN ('DTH', 'ISE')),
  returned_by     integer     REFERENCES admins (id) ON DELETE SET NULL,
  returned_manual boolean,
  cancelled_at    timestamptz,
  email_sent_at   timestamptz,
  email_error     text        CHECK (length(email_error) <= 300),
  CONSTRAINT ck_exit_return CHECK ((returned_at IS NULL) = (returned_venue IS NULL) AND (returned_at IS NULL) = (returned_manual IS NULL)),
  CONSTRAINT ck_exit_closed_once CHECK (returned_at IS NULL OR cancelled_at IS NULL)
);
-- at most one open exit per person
CREATE UNIQUE INDEX uq_exit_open ON exits (participant_id) WHERE returned_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX ix_exit_created ON exits (created_at DESC);

-- Only someone who has checked in can step out, and a return must be at their own venue.
CREATE FUNCTION guard_exit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM check_ins WHERE participant_id = NEW.participant_id) THEN
    RAISE EXCEPTION 'participant % has not checked in', NEW.participant_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.returned_venue IS NOT NULL AND NEW.returned_venue IS DISTINCT FROM
     (SELECT assigned_venue FROM participants WHERE id = NEW.participant_id) THEN
    RAISE EXCEPTION 'wrong venue for re-entry' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.returned_at IS NOT NULL OR OLD.cancelled_at IS NOT NULL)
     AND (NEW.returned_at IS DISTINCT FROM OLD.returned_at OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'exit % is already closed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_exit BEFORE INSERT OR UPDATE ON exits FOR EACH ROW EXECUTE FUNCTION guard_exit();
