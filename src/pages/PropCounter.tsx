import { useState, useEffect } from 'react'
import { TrendingUp, Users, DollarSign, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'

const phaseColors = {
  fase1: '#3b82f6',
  fase2: '#22c55e',
  live:  '#f59e0b',
}

interface PropFirmStats {
  name: string
  color: string
  fase1: number
  fase2: number
  live: number
  total: number
  totalBalance: number
  avgBalance: number
}

export default function PropCounter() {
  const structureId = useStructureId()
  const [stats, setStats] = useState<PropFirmStats[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    setLoading(true)

    const [{ data: accounts }, { data: firms }] = await Promise.all([
      supabase
        .from('mt5_accounts')
        .select('prop_firm_name, phase, current_balance, account_status')
        .eq('structure_id', structureId)
        .eq('is_deleted', false)
        .eq('account_status', 'active'),
      supabase
        .from('prop_firm_rules')
        .select('name, color')
        .eq('structure_id', structureId)
        .eq('is_active', true),
    ])

    const firmColors: Record<string, string> = {}
    for (const f of (firms || [])) firmColors[f.name] = f.color || '#6b7280'

    const grouped: Record<string, { fase1: number; fase2: number; live: number; balances: number[] }> = {}
    for (const acc of (accounts || [])) {
      const firm = acc.prop_firm_name || 'Unknown'
      if (!grouped[firm]) grouped[firm] = { fase1: 0, fase2: 0, live: 0, balances: [] }
      if (acc.phase === 'fase1') grouped[firm].fase1++
      else if (acc.phase === 'fase2') grouped[firm].fase2++
      else if (acc.phase === 'live') grouped[firm].live++
      grouped[firm].balances.push(Number(acc.current_balance) || 0)
    }

    const result: PropFirmStats[] = Object.entries(grouped)
      .map(([name, g]) => {
        const total = g.fase1 + g.fase2 + g.live
        const totalBalance = g.balances.reduce((s, b) => s + b, 0)
        return {
          name,
          color: firmColors[name] || '#6b7280',
          fase1: g.fase1,
          fase2: g.fase2,
          live: g.live,
          total,
          totalBalance,
          avgBalance: total > 0 ? totalBalance / total : 0,
        }
      })
      .sort((a, b) => b.total - a.total)

    setStats(result)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [structureId])

  const totalAccounts = stats.reduce((s, f) => s + f.total, 0)
  const totalBalance  = stats.reduce((s, f) => s + f.totalBalance, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Prop Counter</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Statistiche aggregate per prop firm</p>
        </div>
        <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: '13px', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Aggiorna
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        <StatCard icon={<Users size={13} />}     label="Account Totali"  value={loading ? '—' : totalAccounts.toString()} />
        <StatCard icon={<DollarSign size={13} />} label="Balance Totale"  value={loading ? '—' : `$${totalBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
        <StatCard icon={<TrendingUp size={13} />} label="Prop Firm Attive" value={loading ? '—' : stats.length.toString()} />
      </div>

      <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
        ) : stats.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: '#1f2937' }}>Nessun dato disponibile</div>
            <div style={{ fontSize: '12px', color: '#111827', marginTop: '4px' }}>I contatori si popolano quando ci sono account nel sistema</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['Prop Firm', 'Fase 1', 'Fase 2', 'Live', 'Totale', 'Balance Totale', 'Balance Medio'].map(h => (
                  <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '10px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((f, i) => (
                <tr key={f.name} style={{ borderBottom: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: f.color }} />
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0' }}>{f.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}><PhaseCount count={f.fase1} color={phaseColors.fase1} /></td>
                  <td style={{ padding: '14px 20px' }}><PhaseCount count={f.fase2} color={phaseColors.fase2} /></td>
                  <td style={{ padding: '14px 20px' }}><PhaseCount count={f.live}  color={phaseColors.live} /></td>
                  <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>{f.total}</td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace' }}>
                    ${f.totalBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                    ${f.avgBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#374151' }}>
        {icon}
        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 600, color: '#fff', fontFamily: 'monospace', letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  )
}

function PhaseCount({ count, color }: { count: number; color: string }) {
  return (
    <span style={{ fontSize: '13px', fontWeight: count > 0 ? 600 : 400, color: count > 0 ? color : '#1f2937' }}>
      {count}
    </span>
  )
}
