-- Integrity triggers: these hold even if application code is bypassed or buggy.
--  1. A team is never split: each member's venue equals the team's venue (checked at COMMIT).
--  2. After CONFIRMED, venues can't change and participants/teams can't be deleted.
--  3. A check-in must match the participant's venue, needs a confirmed allocation, and is append-only.
--  4. Recording a check-in marks the participant checked in, in the same transaction.

CREATE FUNCTION guard_member_venue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.team_id IS NOT NULL AND NEW.assigned_venue IS DISTINCT FROM
     (SELECT assigned_venue FROM teams WHERE id = NEW.team_id) THEN
    RAISE EXCEPTION 'team split: participant % venue differs from team venue', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION guard_team_venue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM participants p WHERE p.team_id = NEW.id
             AND p.assigned_venue IS DISTINCT FROM NEW.assigned_venue) THEN
    RAISE EXCEPTION 'team split: team % has members in another venue', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION guard_confirmed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM event_state WHERE allocation_status = 'CONFIRMED') THEN
    IF TG_OP = 'DELETE' OR NEW.assigned_venue IS DISTINCT FROM OLD.assigned_venue THEN
      RAISE EXCEPTION 'allocation is confirmed and final' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION guard_checkin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'check-ins are append-only' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM event_state WHERE allocation_status = 'CONFIRMED') THEN
    RAISE EXCEPTION 'allocation not confirmed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.venue IS DISTINCT FROM (SELECT assigned_venue FROM participants WHERE id = NEW.participant_id) THEN
    RAISE EXCEPTION 'wrong venue for participant' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION mark_checked_in() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE participants SET checked_in = true, checked_in_at = NEW.scanned_at WHERE id = NEW.participant_id;
  RETURN NULL;
END $$;

-- The confirmed state itself can't be undone.
CREATE FUNCTION guard_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD.allocation_status = 'CONFIRMED' AND NEW.allocation_status <> 'CONFIRMED') THEN
    RAISE EXCEPTION 'allocation is confirmed and final' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER trg_member_venue AFTER INSERT OR UPDATE OF assigned_venue, team_id ON participants
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_member_venue();
CREATE CONSTRAINT TRIGGER trg_team_venue AFTER UPDATE OF assigned_venue ON teams
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_team_venue();
CREATE TRIGGER trg_participant_confirmed BEFORE UPDATE OF assigned_venue OR DELETE ON participants
  FOR EACH ROW EXECUTE FUNCTION guard_confirmed();
CREATE TRIGGER trg_team_confirmed BEFORE UPDATE OF assigned_venue OR DELETE ON teams
  FOR EACH ROW EXECUTE FUNCTION guard_confirmed();
CREATE TRIGGER trg_checkin BEFORE INSERT OR UPDATE OR DELETE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION guard_checkin();
CREATE TRIGGER trg_checkin_mark AFTER INSERT ON check_ins
  FOR EACH ROW EXECUTE FUNCTION mark_checked_in();
CREATE TRIGGER trg_state BEFORE UPDATE OR DELETE ON event_state
  FOR EACH ROW EXECUTE FUNCTION guard_state();
