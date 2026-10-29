-- Walk-ins and venues taken from the import file.
--  * preset_venue: a venue given in the imported CSV (e.g. a published venue sheet). When present,
--    "Assign venues" applies it instead of computing an allocation.
--  * People without a team report to the DTH desk, where an organiser registers them into a walk-in team
--    (or a team of one) and then emails their check-in QR. qr_sent_at / qr_error track that email.
ALTER TABLE participants
  ADD COLUMN preset_venue text CHECK (preset_venue IN ('DTH', 'ISE')),
  ADD COLUMN qr_sent_at   timestamptz,
  ADD COLUMN qr_error     text CHECK (length(qr_error) <= 300),
  ADD CONSTRAINT ck_noteam_preset_not_ise CHECK (team_id IS NOT NULL OR preset_venue IS DISTINCT FROM 'ISE');

ALTER TABLE teams ADD COLUMN walk_in boolean NOT NULL DEFAULT false;

-- Check-ins made from the desk's manual search (when a QR won't scan), for the audit trail.
ALTER TABLE check_ins ADD COLUMN manual boolean NOT NULL DEFAULT false;
