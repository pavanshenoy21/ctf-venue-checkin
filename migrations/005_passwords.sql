-- Player passwords: a simple word + 4 digits (e.g. mango4821) per participant, derived from their email and a
-- secret seed so it never changes (it can be loaded into CTFd before the event). Shown to the super admin in
-- plain text and emailed to each player once they have checked in.
ALTER TABLE participants
  ADD COLUMN password         text CHECK (password ~ '^[a-z]{3,12}[0-9]{4}$'),
  ADD COLUMN password_sent_at timestamptz,
  ADD COLUMN password_error   text CHECK (length(password_error) <= 300);
