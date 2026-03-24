import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Save, X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'
import { useAuth } from '../hooks/useAuth'

interface PairConfig {
  id: string
  symbol: string
  min_pips: number
  max_pips: number
  spread: number
  is_active: boolean
  config_type: 'challenge' | 'live'
}

const cellInput: React.CSSProperties = {
  width: '80px', padding: '6px 8px', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(124,58,237,0.3)', borderRadius: '6px',
  color: '#e2e8f0', fontSize: '13px', fontFamily: 'monospace',
}

function EditableRow({ cfg, onSave, onCancel }: { cfg: PairConfig; onSave: (c: PairConfig) => void; onCancel: () => void }) {
  const [minPips, setMinPips] = useState(cfg.min_pips.toString())
  const [maxPips, setMaxPips] = useState(cfg.max_pips.toString())
  const [spread, setSpread]   = useState(cfg.spread.toString())

  return (
    <tr style={{ background: 'rgba(124,58,237,0.05)' }}>
      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#a78bfa', fontFamily: 'monospace' }}>{cfg.symbol}</td>
      <td style={{ padding: '10px 16px' }}><input value={minPips} onChange={e => setMinPips(e.target.value)} style={cellInput} /></td>
      <td style={{ padding: '10px 16px' }}><input value={maxPips} onChange={e => setMaxPips(e.target.value)} style={cellInput} /></td>
      <td style={{ padding: '10px 16px' }}><input value={spread}  onChange={e => setSpread(e.target.value)}  style={cellInput} /></td>
      <td style={{ padding: '10px 16px', fontSize: '11px', color: cfg.config_type === 'live' ? '#f59e0b' : '#3b82f6' }}>
        {cfg.config_type === 'live' ? 'Live' : 'Challenge'}
      </td>
      <td style={{ padding: '10px 16px' }} />
      <td style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => onSave({ ...cfg, min_pips: +minPips, max_pips: +maxPips, spread: +spread })}
            style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', display: 'flex' }}>
            <Save size={14} />
          </button>
          <button onClick={onCancel}
            style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function TabellaOperativita() {
  const structureId = useStructureId()
  const { user } = useAuth()
  const [configs, setConfigs] = useState<PairConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddSymbol, setShowAddSymbol] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [newConfigType, setNewConfigType] = useState<'challenge' | 'live'>('challenge')
  const [typeFilter, setTypeFilter] = useState<'all' | 'challenge' | 'live'>('all')

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('trading_pair_configs')
      .select('*')
      .eq('structure_id', structureId)
      .order('symbol')
    setConfigs((data as PairConfig[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [structureId])

  async function handleSave(updated: PairConfig) {
    await supabase.from('trading_pair_configs').update({
      min_pips: updated.min_pips,
      max_pips: updated.max_pips,
      spread:   updated.spread,
    }).eq('id', updated.id)
    setEditingId(null)
    fetchData()
  }

  async function toggleActive(id: string) {
    const cfg = configs.find(c => c.id === id)
    if (!cfg) return
    await supabase.from('trading_pair_configs').update({ is_active: !cfg.is_active }).eq('id', id)
    fetchData()
  }

  async function addSymbol() {
    if (!newSymbol.trim() || !user) return
    const sym = newSymbol.trim().toUpperCase()
    if (configs.find(c => c.symbol === sym && c.config_type === newConfigType)) return

    await supabase.from('trading_pair_configs').insert({
      structure_id: structureId,
      user_id:      user.id,
      symbol:       sym,
      min_pips:     3,
      max_pips:     10,
      spread:       1,
      is_active:    true,
      config_type:  newConfigType,
    })
    setNewSymbol('')
    setShowAddSymbol(false)
    fetchData()
  }

  async function deleteConfig(id: string) {
    await supabase.from('trading_pair_configs').delete().eq('id', id)
    fetchData()
  }

  const filtered = configs.filter(c => typeFilter === 'all' || c.config_type === typeFilter)
  const activeCount = filtered.filter(c => c.is_active).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Tabella Operatività</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Range pips per simbolo — input diretto degli engine di trading</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#374151' }}>{activeCount}/{filtered.length} attivi</span>
          <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', cursor: 'pointer' }}><RefreshCw size={13} /></button>
          <button onClick={() => setShowAddSymbol(true)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={13} /> Aggiungi Simbolo
          </button>
        </div>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {(['all', 'challenge', 'live'] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            padding: '6px 12px', borderRadius: '7px', fontSize: '11px', cursor: 'pointer',
            background: typeFilter === t ? (t === 'live' ? 'rgba(245,158,11,0.12)' : t === 'challenge' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.07)') : 'transparent',
            border: `1px solid ${typeFilter === t ? (t === 'live' ? 'rgba(245,158,11,0.3)' : t === 'challenge' ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.05)'}`,
            color: typeFilter === t ? (t === 'live' ? '#f59e0b' : t === 'challenge' ? '#3b82f6' : '#e2e8f0') : '#374151',
          }}>
            {t === 'all' ? 'Tutti' : t === 'challenge' ? 'Challenge' : 'Live'}
          </button>
        ))}
      </div>

      {showAddSymbol && (
        <div style={{ background: '#080808', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '12px', padding: '20px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '6px' }}>Simbolo</label>
            <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)} placeholder="es. EURCAD"
              onKeyDown={e => e.key === 'Enter' && addSymbol()}
              style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#e2e8f0', fontSize: '13px', width: '150px', fontFamily: 'monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '6px' }}>Tipo</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['challenge', 'live'] as const).map(t => (
                <button key={t} onClick={() => setNewConfigType(t)} style={{
                  padding: '9px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                  background: newConfigType === t ? (t === 'live' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)') : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${newConfigType === t ? (t === 'live' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)') : 'rgba(255,255,255,0.06)'}`,
                  color: newConfigType === t ? (t === 'live' ? '#f59e0b' : '#3b82f6') : '#4b5563',
                }}>
                  {t === 'challenge' ? 'Challenge' : 'Live'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={addSymbol} style={{ padding: '9px 18px', borderRadius: '8px', background: '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>Aggiungi</button>
          <button onClick={() => setShowAddSymbol(false)} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
        </div>
      )}

      <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['Simbolo', 'Min Pips', 'Max Pips', 'Spread', 'Tipo', 'Attivo', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((cfg, i) => {
                if (editingId === cfg.id) {
                  return <EditableRow key={cfg.id} cfg={cfg} onSave={handleSave} onCancel={() => setEditingId(null)} />
                }
                return (
                  <tr key={cfg.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', opacity: cfg.is_active ? 1 : 0.4 }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>{cfg.symbol}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace' }}>{cfg.min_pips}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace' }}>{cfg.max_pips}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>{cfg.spread}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: cfg.config_type === 'live' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)', color: cfg.config_type === 'live' ? '#f59e0b' : '#3b82f6' }}>
                        {cfg.config_type === 'live' ? 'Live' : 'Challenge'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => toggleActive(cfg.id)} style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: cfg.is_active ? '#22c55e' : 'rgba(255,255,255,0.08)', position: 'relative', transition: 'background 0.2s' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: cfg.is_active ? '19px' : '3px', transition: 'left 0.2s' }} />
                      </button>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setEditingId(cfg.id)} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Edit2 size={13} /></button>
                        <button onClick={() => deleteConfig(cfg.id)} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
