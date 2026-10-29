// All runtime configuration comes from environment variables; nothing secret lives in code.
const str = (name: string, fallback = ''): string => process.env[name] ?? fallback
const int = (name: string, fallback: number): number => {
  const v = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(v) ? v : fallback
}
const bool = (name: string, fallback: boolean): boolean =>
  ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? String(fallback)).trim().toLowerCase())

export const VENUES = ['DTH', 'ISE'] as const
export type Venue = (typeof VENUES)[number]
export const VENUE_LABEL: Record<Venue, string> = { DTH: 'DTH', ISE: 'ISE SEMINAR HALL' }

// Read lazily so tests and scripts can set env before first use.
export const config = {
  get databaseUrl() { return str('DATABASE_URL', 'postgres://ctf:ctf@localhost:5432/ctf') },
  get publicBaseUrl() { return str('PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/+$/, '') },
  get cookieSecure() { return bool('COOKIE_SECURE', true) },
  get sessionHours() { return int('SESSION_HOURS', 12) },
  get eventTz() { return str('EVENT_TZ', 'Asia/Kolkata') },
  get eventName() { return str('EVENT_NAME', 'Voyage to Ithaca') },
  // Shown in the emails: when teams report, and the window for people without a team.
  get reportTimeTeam() { return str('REPORT_TIME_TEAM', '12:30 PM') },
  // secret that fixes every player's and team's password; changing it changes them all
  get passwordSeed() { return str('PASSWORD_SEED') },
  get ctfUrl() { return str('CTF_URL').replace(/\/+$/, '') },
  get reportTimeSolo() { return str('REPORT_TIME_SOLO', '11:00 AM – 12:20 PM') },
  get capacity(): Record<Venue, number> { return { DTH: int('DTH_CAPACITY', 145), ISE: int('ISE_CAPACITY', 113) } },
  get noTeamMarkers() { return str('NO_TEAM_MARKERS', '(no team),no team,noteam,none,n/a,na,-,null,solo,individual,no') },
  get trustProxy() { return bool('TRUST_PROXY', false) },
  rate: {
    get public() { return int('RATE_PUBLIC_PER_MIN', 600) },
    get publicInvalid() { return int('RATE_PUBLIC_INVALID_PER_MIN', 30) },
    get login() { return int('RATE_LOGIN_PER_MIN', 10) },
    get checkin() { return int('RATE_CHECKIN_PER_MIN', 300) },
  },
  smtp: {
    get host() { return str('SMTP_HOST') },
    get port() { return int('SMTP_PORT', 587) },
    get user() { return str('SMTP_USER') },
    get password() { return str('SMTP_PASSWORD') },
    get from() { return str('SMTP_FROM') },
    get security() { return str('SMTP_SECURITY', 'starttls') as 'starttls' | 'ssl' | 'none' },
  },
}
