import { useState, useEffect } from 'react'
import {
  Activity, Users, TrendingUp, AlertTriangle, Wifi, WifiOff,
  Shield, Clock, ArrowUpRight, RefreshCw, CheckCircle, XCircle,
  ArrowRightLeft, Zap, Target, BarChart3
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { MT5Account } from '../types/mt5'

// ─── TIPI ─────────────────────────────────────────────────────────────────────

interface AccountCounts {
  total: number; fase1: number; fase2: number; live: number
  active: number; breached: number; passed: number; manual_review: number
}
interface StageData { label: string; count: number }
interface PhaseData { accounts: number; pairing: number; stageDistribution: StageData[] }
interface IntegrityAlert {
  id: string; account_login: string; prop_firm_name: string
  alert_type: string; alert_message: string; alert_date: string; is_dismissed: boolean
}

// ─── HOOKS LOCALI ─────────────────────────────────────────────────────────────

const getStageLabel = (s: number) => s === 0 ? 'BE' : s > 0 ? `+${s}` : `${s}`

function useAccountCounts() {
  const [counts, setCounts] = useState<AccountCounts>({
    total: 0, fase1: 0, fase2: 0, live: 0, active: 0, breached: 0, passed: 0, manual_review: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('mt5_accounts').select('phase, account_status').eq('is_deleted', false)
        const rows = (data as Pick<MT5Account, 'phase' | 'account_status'>[] | null) ?? []
        const active = rows.filter(r => r.account_status === 'active')
        setCounts({
          total:         active.length,
          fase1:         active.filter(r => r.phase === 'fase1').length,
          fase2:         active.filter(r => r.phase === 'fase2').length,
          live:          active.filter(r => r.phase === 'live').length,
          active:        active.length,
          breached:      rows.filter(r => r.account_status === 'breached').length,
          passed:        rows.filter(r => r.account_status === 'passed').length,
          manual_review: rows.filter(r => r.account_status === 'manual_review').length,
        })
      } finally { setIsLoading(false) }
    }
    load()
  }, [])
  return { counts, isLoading }
}

function usePhaseData() {
  const [data, setData] = useState({ fase1: emptyPhase(), fase2: emptyPhase(), live: emptyPhase(), isLoading: true })

  useEffect(() => {
    const load = async () => {
      try {
        const { data: rows } = await supabase
          .from('mt5_accounts').select('phase, stage, account_status')
          .eq('is_deleted', false).eq('account_status', 'active')
        const accounts = (rows as Pick<MT5Account, 'phase' | 'stage' | 'account_status'>[] | null) ?? []

        const calc = (phase: string): PhaseData => {
          const ph = accounts.filter(a => a.phase === phase)
          const sc: Record<number, number> = {}
          ph.forEach(a => { sc[a.stage ?? 0] = (sc[a.stage ?? 0] || 0) + 1 })
          const dist = Object.keys(sc).map(Number).sort((a, b) => a - b)
            .map(s => ({ label: getStageLabel(s), count: sc[s] }))
          return { accounts: ph.length, pairing: Math.floor(ph.length / 2), stageDistribution: dist }
        }
        setData({ fase1: calc('fase1'), fase2: calc('fase2'), live: calc('live'), isLoading: false })
      } catch { setData(d => ({ ...d, isLoading: false })) }
    }
    load()
  }, [])
  return data
}

function emptyPhase(): PhaseData { return { accounts: 0, pairing: 0, stageDistribution: [] } }

function useIntegrityAlerts() {
  const [alerts, setAlerts] = useState<IntegrityAlert[]>([])
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('integrity_alerts')
        .select('*').eq('is_dismissed', false).order('alert_date', { ascending: false }).limit(5)
      setAlerts((data as IntegrityAlert[] | null) ?? [])
    }
    load()
  }, [])
  return alerts
}

function useConnectionStats() {
  const [stats, setStats] = useState({ connected: 0, warning: 0, disconnected: 0 })
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('mt5_accounts').select('connection_status').eq('is_deleted', false).eq('account_status', 'active')
      const rows = (data as { connection_status: string }[] | null) ?? []
      setStats({
        connected:    rows.filter(r => r.connection_status === 'connected').length,
        warning:      rows.filter(r => ['warning', 'critical'].includes(r.connection_status)).length,
        disconnected: rows.filter(r => ['idle', 'disconnected'].includes(r.connection_status)).length,
      })
    }
    load()
  }, [])
  return stats
}

function useActiveCrossCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('trade_crosses')
        .select('id').in('status', ['approved', 'executed'])
      setCount((data as unknown[] | null)?.length ?? 0)
    }
    load()
  }, [])
  return count
}

// ─── COMPONENTI ───────────────────────────────────────────────────────────────

function StatCard({ title, value, color, icon: Icon, sub }: {
  title: string; value: number | string; color: string
  icon: React.FC<{ size?: number; color?: string }>; sub?: string
}) {
  return (
    <div style={{
      background: '#080808', border: '1px solid #1a1a1a', borderRadius: 12,
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 500 }}>{title}</span>
        <div style={{ background: color + '22', borderRadius: 8, padding: 7 }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function PhaseCard({ phase, data, color }: { phase: string; data: PhaseData; color: string }) {
  const cfg: Record<string, { label: string; sub: string }> = {
    fase1: { label: 'Fase 1', sub: 'Challenge' },
    fase2: { label: 'Fase 2', sub: 'Verification' },
    live:  { label: 'Live',   sub: 'Funded' },
  }
  const { label, sub } = cfg[phase]
  return (
    <div style={{ background: '#080808', border: `1px solid ${color}33`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ color, fontWeight: 700, fontSize: 15 }}>{label}</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>{sub}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>{data.accounts}</div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>{data.pairing} coppie</div>
        </div>
      </div>
      {data.stageDistribution.length > 0 ? (
        <>
          <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em' }}>STAGE</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {data.stageDistribution.map(s => (
              <div key={s.label} style={{
                background: color + '15', border: `1px solid ${color}33`,
                borderRadius: 6, padding: '4px 9px', textAlign: 'center',
              }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{s.count}</div>
                <div style={{ color: '#6b7280', fontSize: 10 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ color: '#374151', fontSize: 12, textAlign: 'center', paddingTop: 4 }}>
          Nessun account attivo
        </div>
      )}
    </div>
  )
}

function ConnectionWidget({ stats }: { stats: { connected: number; warning: number; disconnected: number } }) {
  const total = stats.connected + stats.warning + stats.disconnected || 1
  return (
    <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
      <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>CONNESSIONI EA</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Online',  count: stats.connected,    color: '#22c55e', Icon: Wifi },
          { label: 'Warning', count: stats.warning,      color: '#f59e0b', Icon: AlertTriangle },
          { label: 'Offline', count: stats.disconnected, color: '#ef4444', Icon: WifiOff },
        ].map(({ label, count, color, Icon }) => (
          <div key={label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ background: color + '15', borderRadius: 8, padding: '10px 6px', border: `1px solid ${color}33`, marginBottom: 5 }}>
              <Icon size={18} color={color} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{count}</div>
            <div style={{ color: '#6b7280', fontSize: 10 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', background: '#1a1a1a', display: 'flex' }}>
        {stats.connected    > 0 && <div style={{ width: `${(stats.connected/total)*100}%`,    background: '#22c55e' }} />}
        {stats.warning      > 0 && <div style={{ width: `${(stats.warning/total)*100}%`,      background: '#f59e0b' }} />}
        {stats.disconnected > 0 && <div style={{ width: `${(stats.disconnected/total)*100}%`, background: '#ef4444' }} />}
      </div>
    </div>
  )
}

function IntegrityAlertsWidget({ alerts }: { alerts: IntegrityAlert[] }) {
  if (alerts.length === 0) return null
  return (
    <div style={{ background: '#0d0505', border: '1px solid #ef444433', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Shield size={15} color='#ef4444' />
        <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>
          INTEGRITY ALERTS — {alerts.length} anomali{alerts.length !== 1 ? 'e' : 'a'} rilevat{alerts.length !== 1 ? 'e' : 'a'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map(alert => (
          <div key={alert.id} style={{
            background: '#110505', border: '1px solid #ef444422', borderRadius: 8,
            padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                {alert.prop_firm_name} — {alert.account_login}
              </span>
              <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 10 }}>{alert.alert_message}</span>
            </div>
            <span style={{ color: '#6b7280', fontSize: 11 }}>
              {new Date(alert.alert_date).toLocaleDateString('it-IT')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PAGINA PRINCIPALE ────────────────────────────────────────────────────────

export default function Dashboard() {
  const { counts, isLoading } = useAccountCounts()
  const phaseData             = usePhaseData()
  const alerts                = useIntegrityAlerts()
  const connStats             = useConnectionStats()
  const activeCrosses         = useActiveCrossCount()
  const [tick, setTick]       = useState(0)

  const V = (v: number | string) => isLoading ? '—' : v

  return (
    <div style={{ padding: 24, background: '#000', minHeight: '100vh', color: '#fff' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>MATRIX PRO HUB</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '3px 0 0' }}>
            PropFirm Hedging System — Dashboard
          </p>
        </div>
        <button
          onClick={() => setTick(t => t + 1)}
          style={{
            background: '#111', border: '1px solid #222', borderRadius: 8,
            padding: '8px 14px', color: '#9ca3af', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
          }}
        >
          <RefreshCw size={14} />
          Aggiorna
        </button>
      </div>

      {/* Integrity Alerts CRITICI */}
      <IntegrityAlertsWidget alerts={alerts} />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard title="Account Totali" value={V(counts.total)}   color='#9ca3af' icon={Users}         sub={`${counts.active} attivi`} />
        <StatCard title="Fase 1"         value={V(counts.fase1)}   color='#3b82f6' icon={BarChart3}      sub="Challenge" />
        <StatCard title="Fase 2"         value={V(counts.fase2)}   color='#22c55e' icon={TrendingUp}     sub="Verification" />
        <StatCard title="Live"           value={V(counts.live)}    color='#f59e0b' icon={ArrowUpRight}   sub="Funded" />
        <StatCard title="Incroci Attivi" value={activeCrosses}     color='#a855f7' icon={ArrowRightLeft} sub="Pianificati + Eseguiti" />
        <StatCard title="In Revisione"   value={counts.manual_review} color='#ef4444' icon={AlertTriangle} sub="Manual Review" />
      </div>

      {/* Phase Cards + Connessioni */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 260px', gap: 12, marginBottom: 20 }}>
        <PhaseCard phase="fase1" data={phaseData.fase1} color='#3b82f6' />
        <PhaseCard phase="fase2" data={phaseData.fase2} color='#22c55e' />
        <PhaseCard phase="live"  data={phaseData.live}  color='#f59e0b' />
        <ConnectionWidget stats={connStats} />
      </div>

      {/* Riga inferiore */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        {/* Status conti */}
        <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>STATUS ACCOUNT</div>
          {[
            { label: 'Attivi',        count: counts.active,        color: '#22c55e', Icon: CheckCircle },
            { label: 'Breached',      count: counts.breached,      color: '#ef4444', Icon: XCircle },
            { label: 'Passed',        count: counts.passed,        color: '#3b82f6', Icon: ArrowUpRight },
            { label: 'Manual Review', count: counts.manual_review, color: '#f59e0b', Icon: AlertTriangle },
          ].map(({ label, count, color, Icon }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 0', borderBottom: '1px solid #0f0f0f',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={13} color={color} />
                <span style={{ color: '#9ca3af', fontSize: 13 }}>{label}</span>
              </div>
              <span style={{ color, fontWeight: 700 }}>{count}</span>
            </div>
          ))}
        </div>

        {/* Motore */}
        <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>MOTORE INCROCI</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Target Doppio',  color: '#3b82f6', Icon: Target,   desc: 'Entrambi vicini al target' },
              { label: 'Target Singolo', color: '#22c55e', Icon: Target,   desc: 'Un account va a target' },
              { label: 'Esplosione',     color: '#ef4444', Icon: Zap,      desc: 'Conto sotto baseline −10%' },
              { label: 'Normal',         color: '#6b7280', Icon: Activity, desc: '70% simmetrico 1:1 · 30% asimm.' },
            ].map(({ label, color, Icon, desc }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: color + '22', borderRadius: 6, padding: 6, flexShrink: 0 }}>
                  <Icon size={12} color={color} />
                </div>
                <div>
                  <div style={{ color, fontSize: 12, fontWeight: 600 }}>{label}</div>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>ACCESSO RAPIDO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { href: '/board',               label: 'Board Account',      color: '#3b82f6' },
              { href: '/trades',              label: 'Genera Incroci',     color: '#a855f7' },
              { href: '/bilancio',            label: 'Bilancio Mensile',   color: '#22c55e' },
              { href: '/id',                  label: 'Identità Operatori', color: '#f59e0b' },
              { href: '/propfirm',            label: 'Regole Prop Firm',   color: '#6b7280' },
              { href: '/tabella-operativita', label: 'Tabella Operativa',  color: '#0ea5e9' },
            ].map(({ href, label, color }) => (
              <a key={href} href={href} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8,
                padding: '8px 12px', textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = color + '55')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a1a1a')}
              >
                <span style={{ color: '#d1d5db', fontSize: 13 }}>{label}</span>
                <ArrowUpRight size={12} color={color} />
              </a>
            ))}
          </div>
        </div>

      </div>

      <div style={{ marginTop: 20, textAlign: 'center', color: '#2d3748', fontSize: 11 }}>
        <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
        {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>

    </div>
  )
}
