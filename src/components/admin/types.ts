import type { Venue } from '../api'
import type { GroupKey } from '../ui'

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
export interface Allocation { status: Stats['status']; confirmed_at: string | null; venues: Record<Venue, VenueSummary>; validation_errors: string[] }
export interface Member { name: string; checked_in: boolean; checked_in_at: string | null }
export interface TeamRow { id: number; name: string; size: number; venue: Venue | null; present: number; members: Member[] }
export interface SoloRow extends Member { id: number; venue: Venue | null }
export interface ParticipantRow { id: number; name: string; email: string; team: string | null; team_size: number | null; venue: Venue | null; checked_in: boolean; checked_in_at: string | null }
export interface CheckinRow { name: string; email: string; team: string | null; venue: Venue; at: string }
export interface QrRow { id: number; name: string; team: string | null; venue: Venue; file: string; url: string }
export interface EmailItem { id: number; to: string; subject: string; html: string; sent_at: string | null; error: string | null }
export interface Emails { total: number; smtp_configured: boolean; sent: number; failed: number; items: EmailItem[] }
export interface ImportPreview {
  summary: { participants: number; teams: number; no_team: number; teams_3: number; teams_2: number; teams_1: number; teams_over_3: number; empty_rows_skipped: number }
  errors: string[]; warnings: string[]
}
