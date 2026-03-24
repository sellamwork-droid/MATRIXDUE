import { useState, useEffect } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle, Clock, Activity, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'

type LogLevel = 'info' | 'warning' | 'error' | 'success'
type LogCategory = 'rotation' | 'integrity' | 'audit' | 'sync'

interface OperationLog {
  id: string
  level: LogLevel
  category: LogCategory
  message: string
  details: string
  accountLogin?: string
  propFirm?: string
  idIdentifier?: string
  createdAt: string
}

const levelColors: Record<LogLevel, string> = {
  info: '#3b82f6', warning: '#f59e0b', error: '#ef4444', success: '#22c55e',
}
const levelIcons: Record<LogLevel, React.ReactNode> = {
  info: <Activity size={12} />, warning: <AlertTriangle size={12} />,
  error: <AlertTriangle size={12} />, success: <CheckCircle size={12} />,
}
const categoryLabels: Record<LogCategory, string> = {
  rotation: 'Rotazione', integrity: 'Integrità', audit: 'Audit', sync: 'Sync',
}

export default function Operations() {
  const structureId = useStructureId()
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | 'all'>('all')
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    const combined: OperationLog[] = []

    // integrity_alerts → error logs
    const { data: alerts } = await supabase.from('integrity_alerts').select('*')
      .eq('structure_id', structureId)
      .order('created_at', { ascending: false })
      .limit(50)
    for (const a of (alerts || [])) {
      combined.push({
        id: `alert-${a.id}`,
        level: a.is_dismissed ? 'info' : 'error',
        category: 'integrity',
        message: a.alert_type,
        details: a.alert_message || '—',
        accountLogin: a.account_login,
        propFirm: a.prop_firm_name,
        idIdentifier: a.id_identifier,
        createdAt: a.created_at,
      })
    }

    // rotation_logs → info logs
    const { data: rotations } = await supabase.from('rotation_logs').select('*')
      .eq('structure_id', structureId)
      .order('created_at', { ascending: false })
      .limit(50)
    for (const r of (rotations || [])) {
      combined.push({
        id: `rot-${r.id}`,
        level: 'info',
        category: 'rotation',
        message: r.event_type,
        details: r.message || JSON.stringify(r.metadata),
        accountLogin: r.account_login,
        idIdentifier: r.id_identifier,
        createdAt: r.created_at,
      })
    }

    // account_audit_log → success/info logs
    const { data: audits } = await supabase.from('account_audit_log').select('*')
      .eq('structure_id', structureId)
      .order('created_at', { ascending: false })
      .limit(50)
    for (const a of (audits || [])) {
      combined.push({
        id: `audit-${a.id}`,
        level: 'success',
        category: 'audit',
        message: a.action,
        details: JSON.stringify(a.details),
        accountLogin: a.account_login,
        propFirm: a.prop_firm_name,
        idIdentifier: a.id_identifier,
        createdAt: a.created_at,
      })
    }

    // Sort by date desc
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setLogs(combined)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [structureId])

  const filtered = logs.filter(l => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false
    if (categoryFilter !== 'all' && l.category !== categoryFilter) return false
    return true
  })

  const countByLevel = (lv: LogLevel) => logs.filter(l => l.level === lv).length

  function formatDate(ts: string) {
    return new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Operations</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Log operativi — integrità, rotazioni, audit</p>
        </div>
        <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: '13px', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Aggiorna
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {(['error','warning','success','info'] as LogLevel[]).map(lv => (
          <div key={lv} style={{ background: '#080808', border: `1px solid ${levelColors[lv]}18`, borderRadius: '10px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px', color: levelColors[lv] }}>
              {levelIcons[lv]}
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {lv === 'error' ? 'Errori' : lv === 'warning' ? 'Avvisi' : lv === 'success' ? 'Successi' : 'Info'}
              </span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: levelColors[lv], fontFamily: 'monospace' }}>{countByLevel(lv)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['all','error','warning','success','info'] as const).map(lv => (
          <button key={lv} onClick={() => setLevelFilter(lv)} style={{
            padding: '6px 12px', borderRadius: '7px', fontSize: '11px',
            background: levelFilter === lv ? (lv === 'all' ? 'rgba(255,255,255,0.07)' : `${levelColors[lv as LogLevel]}18`) : 'transparent',
            border: `1px solid ${levelFilter === lv ? (lv === 'all' ? 'rgba(255,255,255,0.1)' : `${levelColors[lv as LogLevel]}30`) : 'rgba(255,255,255,0.05)'}`,
            color: levelFilter === lv ? (lv === 'all' ? '#e2e8f0' : levelColors[lv as LogLevel]) : '#374151', cursor: 'pointer',
          }}>
            {lv === 'all' ? 'Tutti' : lv === 'error' ? 'Errori' : lv === 'warning' ? 'Avvisi' : lv === 'success' ? 'Successi' : 'Info'}
          </button>
        ))}
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.05)', margin: '0 4px' }} />
        {(['all','rotation','integrity','audit','sync'] as const).map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(cat)} style={{
            padding: '6px 12px', borderRadius: '7px', fontSize: '11px',
            background: categoryFilter === cat ? 'rgba(124,58,237,0.12)' : 'transparent',
            border: `1px solid ${categoryFilter === cat ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)'}`,
            color: categoryFilter === cat ? '#a78bfa' : '#374151', cursor: 'pointer',
          }}>
            {cat === 'all' ? 'Tutte' : categoryLabels[cat as LogCategory]}
          </button>
        ))}
      </div>

      <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <Clock size={24} color="#1f2937" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '13px', color: '#1f2937' }}>Nessun log operativo</div>
          </div>
        ) : (
          <div>
            {filtered.map((log, i) => (
              <div key={log.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '20px 120px 80px 1fr 160px 32px', alignItems: 'center', padding: '12px 16px', gap: '12px', cursor: 'pointer' }}
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                  <div style={{ color: levelColors[log.level] }}>{levelIcons[log.level]}</div>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: `${levelColors[log.level]}12`, color: levelColors[log.level], textAlign: 'center' }}>{log.level.toUpperCase()}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(124,58,237,0.08)', color: '#6b7280' }}>{categoryLabels[log.category]}</span>
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>{log.message}</span>
                  <span style={{ fontSize: '11px', color: '#1f2937', fontFamily: 'monospace' }}>{formatDate(log.createdAt)}</span>
                  <ChevronDown size={12} color="#374151" style={{ transform: expandedLog === log.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </div>
                {expandedLog === log.id && (
                  <div style={{ padding: '0 16px 16px', paddingLeft: '60px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{log.details}</div>
                    {(log.accountLogin || log.propFirm) && (
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                        {log.accountLogin && <span style={{ fontSize: '11px', color: '#374151' }}>Account: <span style={{ color: '#6b7280' }}>{log.accountLogin}</span></span>}
                        {log.propFirm && <span style={{ fontSize: '11px', color: '#374151' }}>Prop Firm: <span style={{ color: '#6b7280' }}>{log.propFirm}</span></span>}
                        {log.idIdentifier && <span style={{ fontSize: '11px', color: '#374151' }}>Operatore: <span style={{ color: '#6b7280' }}>{log.idIdentifier}</span></span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
