import type { Venue } from '../api'
import type { GroupKey } from '../kit'

export interface VenueSummary { label: string; capacity: number; participants: number; remaining: number; teams_3: number; teams_2: number; teams_1: number; no_team: number }
export interface VenueStats { venue: Venue; label: string; capacity: number; assigned: number; checked_in: number; remaining: number; percent: number }
export interface BreakdownRow {
  key: GroupKey; label: string; teams: number | null; participants: number; present: number
  venues: Record<Venue, { participants: number; present: number }>
  teams_full?: number; teams_partial?: number; teams_absent?: number
}
export interface Stats {
  status: 'NONE' | 'DRAFT' | 'CONFIRMED'; total_participants: number; total_teams: number; venues: Record<Venue, VenueSummary>
  checked_in: number; not_checked_in: number; percent: number; per_venue: Record<Venue, VenueStats>
  breakdown: BreakdownRow[]; recent: { at: string; name: string; team: string | null; venue: Venue }[]
}
export interface Allocation { status: Stats['status']; confirmed_at: string | null; from_csv: boolean; venues: Record<Venue, VenueSummary>; validation_errors: string[] }
export interface Member { name: string; checked_in: boolean; checked_in_at: string | null }
export interface TeamRow { id: number; name: string; size: number; venue: Venue | null; present: number; members: Member[] }
export interface SoloRow extends Member { id: number; venue: Venue | null }
export interface ParticipantRow { id: number; name: string; email: string; team: string | null; team_size: number | null; venue: Venue | null; checked_in: boolean; checked_in_at: string | null }
export interface CheckinRow { name: string; email: string; team: string | null; venue: Venue; at: string }
export interface QrRow { id: number; name: string; team: string | null; venue: Venue; file: string; url: string }
export interface EmailItem { id: number; to: string; subject: string; html: string; sent_at: string | null; error: string | null }
export interface Emails { total: number; smtp_configured: boolean; smtp_backups: number; sent: number; failed: number; items: EmailItem[] }
export interface WalkIn {
  id: number; name: string; email: string; phone: string | null; sap_id: string | null; year: string | null; branch: string | null
  team_id: number | null; team: string | null; qr_sent_at: string | null; qr_error: string | null; checked_in: boolean
}
export interface WalkIns { smtp_configured: boolean; people: WalkIn[] }
export interface NewMember { name: string; email: string; phone: string; sap_id: string; year: string; branch: string }
export interface Registered { team: { id: number; name: string }; members: { id: number; name: string; email: string; qr: 'sent' | 'failed' | 'not_sent'; error?: string }[] }
export interface ImportPreview {
  summary: { participants: number; teams: number; no_team: number; teams_3: number; teams_2: number; teams_1: number; teams_over_3: number; empty_rows_skipped: number }
  errors: string[]; warnings: string[]; venues: Record<Venue, number> | null
}
export interface ExitRow {
  id: number; participant_id: number; name: string; email: string; team: string | null; venue: Venue; sap_id: string | null
  reason: string; created_at: string; created_by: string | null
  returned_at: string | null; returned_manual: boolean | null; cancelled_at: string | null
  email_sent_at: string | null; email_error: string | null
}
export interface Exits { smtp_configured: boolean; out: ExitRow[]; history: ExitRow[] }
export interface PasswordRow {
  id: number; name: string; email: string; team: string | null; venue: Venue | null; checked_in: boolean
  password: string | null; password_sent_at: string | null; password_error: string | null; team_password: string | null
}
export interface Passwords { smtp_configured: boolean; seed_set: boolean; sending: boolean; people: PasswordRow[]; assigned: number; checked_in: number; sent: number; to_send: number }
