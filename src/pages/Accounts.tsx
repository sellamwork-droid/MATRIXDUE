import { useState, useEffect } from 'react'
import { Plus, Search, Filter, Wifi, WifiOff, Edit2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'

type Phase = 'fase1' | 'fase2' | 'live'
type AccountStatus = 'active' | 'blown' | 'passed' | 'disabled'

interface Account {
  id: string
  account_login: string
  account_name: string
  prop_firm_name: string
  phase: Phase
  account_size: number
  current_balance: number
  account_status: AccountStatus
  id_identifier: string
  connection_status: string
  last_sync_at: string
}

const phaseColors: Record<Phase, string> = {
  fase1: '#3b82f6',
  fase2: '#22c55e',
  live:  '#f59e0b',
}
const statusColors: Record<AccountStatus, string> = {
  active:   '#22c55e',
  blown:    '#ef4444',
  passed:   '#a78bfa',
  disabled: '#374151',
}
const statusLabels: Record<AccountStatus, string> = {
  active:   'Attivo',
  blown:    'Blown',
  passed:   'Passato',
  disabled: 'Disabilitato',
}
const phaseLabels: Record<Phase, string> = {
  fase1: 'Fase 1', fase2: 'Fase 2', live: 'Live',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#e2e8f0', fontSize: '13px',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  )
}

function AddAccountModal({ structureId, onClose, onSaved }: { structureId: string; onClose: () => void; onSaved: () => void }) {
  const [login, setLogin] = useState('')
  const [name, setName] = useState('')
  const [propFirm, setPropFirm] = useState('')
  const [size, setSize] = useState('')
  const [phase, setPhase] = useState<Phase>('fase1')
  const [identifier, setIdentifier] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [brokerServer, setBrokerServer] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function genApiKey() {
    const key = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('')
    setApiKey(key)
  }

  async function handleSave() {
    if (!login.trim()) return
    setSaving(true)
    setError(null)
    const accountSize = parseFloat(size) || 0
    const { error: err } = await supabase.from('mt5_accounts').insert({
      structure_id: structureId,
      account_login: login.trim(),
      account_name: name.trim() || null,
      prop_firm_name: propFirm.trim() || null,
      phase,
      account_size: accountSize,
      initial_balance: accountSize,
      current_balance: accountSize,
      id_identifier: identifier.trim() || null,
      broker_server: brokerServer.trim() || null,
      api_key: apiKey || null,
      account_status: 'active',
      visible_on_board: true,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '32px', width: '500px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '24px' }}>Nuovo Account MT5</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Login MT5">
              <input value={login} onChange={e => setLogin(e.target.value)} placeholder="12345678" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </Field>
            <Field label="Nome account">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="FTMO #1" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Prop Firm">
              <input value={propFirm} onChange={e => setPropFirm(e.target.value)} placeholder="FTMO, MFF, E8..." style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </Field>
            <Field label="Dimensione ($)">
              <input value={size} onChange={e => setSize(e.target.value)} type="number" placeholder="10000" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Fase">
              <select value={phase} onChange={e => setPhase(e.target.value as Phase)} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                <option value="fase1" style={{ background: '#0a0a0a' }}>Fase 1</option>
                <option value="fase2" style={{ background: '#0a0a0a' }}>Fase 2</option>
                <option value="live" style={{ background: '#0a0a0a' }}>Live</option>
              </select>
            </Field>
            <Field label="Operatore (ID)">
              <input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="MR001" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </Field>
          </div>
          <Field label="Broker Server">
            <input value={brokerServer} onChange={e => setBrokerServer(e.target.value)} placeholder="ICMarkets-Live" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </Field>
          <Field label="API Key EA">
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Generata automaticamente" style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: '11px' }} />
              <button onClick={genApiKey} style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Genera</button>
            </div>
          </Field>
        </div>

        {error && <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '7px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleSave} disabled={saving || !login} style={{ padding: '9px 18px', borderRadius: '8px', background: saving || !login ? 'rgba(124,58,237,0.4)' : '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: saving || !login ? 'default' : 'pointer' }}>
            {saving ? 'Salvataggio…' : 'Salva Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Accounts() {
  const structureId = useStructureId()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)

  async function fetchAccounts() {
    setLoading(true)
    const { data } = await supabase
      .from('mt5_accounts')
      .select('id,account_login,account_name,prop_firm_name,phase,account_size,current_balance,account_status,id_identifier,connection_status,last_sync_at')
      .eq('structure_id', structureId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
    setAccounts((data as Account[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchAccounts() }, [structureId])

  const filtered = accounts.filter(a => {
    if (phaseFilter !== 'all' && a.phase !== phaseFilter) return false
    if (statusFilter !== 'all' && a.account_status !== statusFilter) return false
    if (search && !a.account_login?.includes(search) && !a.prop_firm_name?.toLowerCase().includes(search.toLowerCase()) && !a.id_identifier?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function formatSync(ts: string | null) {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Accounts</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>{loading ? 'Caricamento…' : `${accounts.length} account MT5 registrati`}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchAccounts} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={13} /> Nuovo Account
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 240px' }}>
          <Search size={13} color="#374151" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Login, prop firm, operatore…" style={{ ...inputStyle, width: '100%', paddingLeft: '32px', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Filter size={12} color="#374151" style={{ alignSelf: 'center', marginRight: '4px' }} />
          {(['all', 'fase1', 'fase2', 'live'] as const).map(p => (
            <button key={p} onClick={() => setPhaseFilter(p)} style={{
              padding: '6px 12px', borderRadius: '7px', fontSize: '11px',
              background: phaseFilter === p ? (p === 'all' ? 'rgba(255,255,255,0.06)' : `${phaseColors[p as Phase]}18`) : 'transparent',
              border: `1px solid ${phaseFilter === p ? (p === 'all' ? 'rgba(255,255,255,0.1)' : `${phaseColors[p as Phase]}30`) : 'rgba(255,255,255,0.05)'}`,
              color: phaseFilter === p ? (p === 'all' ? '#e2e8f0' : phaseColors[p as Phase]) : '#374151', cursor: 'pointer',
            }}>
              {p === 'all' ? 'Tutte fasi' : phaseLabels[p as Phase]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'active', 'blown', 'disabled'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '6px 12px', borderRadius: '7px', fontSize: '11px',
              background: statusFilter === s ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: `1px solid ${statusFilter === s ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
              color: statusFilter === s ? '#e2e8f0' : '#374151', cursor: 'pointer',
            }}>
              {s === 'all' ? 'Tutti stati' : statusLabels[s as AccountStatus]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', color: '#1f2937' }}>
              {accounts.length === 0 ? 'Nessun account registrato — aggiungi il primo' : 'Nessun risultato per i filtri applicati'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['', 'Login', 'Prop Firm', 'Fase', 'Dimensione', 'Balance', 'Operatore', 'Stato', 'Sync', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={a.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                  <td style={{ padding: '12px 16px' }}>
                    {a.connection_status === 'connected'
                      ? <Wifi size={12} color="#22c55e" />
                      : <WifiOff size={12} color={a.connection_status === 'warning' ? '#f59e0b' : '#374151'} />}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#e2e8f0', fontFamily: 'monospace' }}>{a.account_login}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>{a.prop_firm_name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: `${phaseColors[a.phase]}18`, color: phaseColors[a.phase] }}>
                      {phaseLabels[a.phase]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>${(a.account_size || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#e2e8f0', fontFamily: 'monospace' }}>${(a.current_balance || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280' }}>{a.id_identifier || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: `${statusColors[a.account_status]}18`, color: statusColors[a.account_status] }}>
                      {statusLabels[a.account_status]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}>{formatSync(a.last_sync_at)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Edit2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddAccountModal structureId={structureId} onClose={() => setShowAdd(false)} onSaved={fetchAccounts} />}
    </div>
  )
}
