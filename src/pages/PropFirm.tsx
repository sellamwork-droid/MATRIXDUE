import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'

interface PropFirmRule {
  id: string
  name: string
  color: string
  profit_target_fase1: number | null
  profit_target_fase2: number | null
  max_loss_funded: number | null
  daily_loss_limit: number | null
  rischio_max_operazione: number | null
  giorni_minimi: number | null
  periodo_inattivita: number | null
  news_policy_challenge: string | null
  news_policy_funded: string | null
  profit_max_fase1: number | null
  profit_max_fase2: number | null
}

interface RiskConfig {
  id: string
  prop_firm_name: string
  fase_min_risk: number
  fase_max_risk: number
  live_min_risk: number
  live_max_risk: number
  esplosione_fase_risk: number
  esplosione_live_risk: number
  target_fase_min_risk: number
  target_fase_max_risk: number
}

const firmColors = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '7px', color: '#e2e8f0', fontSize: '13px',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>{label}</label>
      {children}
    </div>
  )
}

function AddFirmModal({ structureId, onClose, onSaved }: { structureId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(firmColors[0])
  const [pt1, setPt1] = useState('10')
  const [pt2, setPt2] = useState('5')
  const [maxLoss, setMaxLoss] = useState('10')
  const [daily, setDaily] = useState('5')
  const [riskOp, setRiskOp] = useState('1')
  const [giorni, setGiorni] = useState('4')
  const [inattivita, setInattivita] = useState('30')
  const [newsChallenge, setNewsChallenge] = useState('')
  const [newsFunded, setNewsFunded] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('prop_firm_rules').insert({
      structure_id: structureId,
      name: name.trim(),
      color,
      profit_target_fase1: parseFloat(pt1) || null,
      profit_target_fase2: parseFloat(pt2) || null,
      max_loss_funded: parseFloat(maxLoss) || null,
      daily_loss_limit: parseFloat(daily) || null,
      rischio_max_operazione: parseFloat(riskOp) || null,
      giorni_minimi: parseInt(giorni) || null,
      periodo_inattivita: parseInt(inattivita) || null,
      news_policy_challenge: newsChallenge || null,
      news_policy_funded: newsFunded || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    // Crea anche risk config di default
    await supabase.from('prop_firm_risk_configs').insert({
      structure_id: structureId,
      prop_firm_name: name.trim(),
    })
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '32px', width: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '24px' }}>Nuova Prop Firm</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          <Field label="Nome prop firm">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="FTMO, MFF, E8…" style={inputStyle} />
          </Field>
          <Field label="Colore">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {firmColors.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{ width: '28px', height: '28px', borderRadius: '6px', background: c, border: 'none', cursor: 'pointer', outline: color === c ? '2px solid #fff' : '2px solid transparent', outlineOffset: '2px' }} />
              ))}
            </div>
          </Field>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />
          <p style={{ fontSize: '11px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Regole Challenge</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <Field label="Target F1 (%)"><input value={pt1} onChange={e => setPt1(e.target.value)} type="number" style={inputStyle} /></Field>
            <Field label="Target F2 (%)"><input value={pt2} onChange={e => setPt2(e.target.value)} type="number" style={inputStyle} /></Field>
            <Field label="Max Loss (%)"><input value={maxLoss} onChange={e => setMaxLoss(e.target.value)} type="number" style={inputStyle} /></Field>
            <Field label="Daily Loss (%)"><input value={daily} onChange={e => setDaily(e.target.value)} type="number" style={inputStyle} /></Field>
            <Field label="Rischio max op (%)"><input value={riskOp} onChange={e => setRiskOp(e.target.value)} type="number" style={inputStyle} /></Field>
            <Field label="Giorni minimi"><input value={giorni} onChange={e => setGiorni(e.target.value)} type="number" style={inputStyle} /></Field>
          </div>
          <Field label="Periodo inattività (giorni)">
            <input value={inattivita} onChange={e => setInattivita(e.target.value)} type="number" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="News policy Challenge">
              <input value={newsChallenge} onChange={e => setNewsChallenge(e.target.value)} placeholder="es. No news ±30min" style={inputStyle} />
            </Field>
            <Field label="News policy Funded">
              <input value={newsFunded} onChange={e => setNewsFunded(e.target.value)} placeholder="es. No news ±15min" style={inputStyle} />
            </Field>
          </div>
        </div>
        {error && <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '7px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleSave} disabled={saving || !name} style={{ padding: '9px 18px', borderRadius: '8px', background: saving || !name ? 'rgba(124,58,237,0.4)' : '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: saving || !name ? 'default' : 'pointer' }}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PropFirm() {
  const structureId = useStructureId()
  const [firms, setFirms] = useState<PropFirmRule[]>([])
  const [riskConfigs, setRiskConfigs] = useState<RiskConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedFirm, setExpandedFirm] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'rules' | 'risk'>('rules')

  async function fetchData() {
    setLoading(true)
    const [{ data: f }, { data: r }] = await Promise.all([
      supabase.from('prop_firm_rules').select('*').eq('structure_id', structureId).eq('is_active', true).order('name'),
      supabase.from('prop_firm_risk_configs').select('*').eq('structure_id', structureId).order('prop_firm_name'),
    ])
    setFirms((f as PropFirmRule[]) || [])
    setRiskConfigs((r as RiskConfig[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [structureId])

  async function deleteFirm(id: string) {
    await supabase.from('prop_firm_rules').update({ is_active: false }).eq('id', id)
    fetchData()
  }

  const fmt = (v: number | null) => v != null ? `${v}%` : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Prop Firm</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Regole operative e configurazione rischio engine</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={13} /> Nuova Prop Firm
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        {(['rules', 'risk'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
            background: activeTab === t ? 'rgba(124,58,237,0.12)' : 'transparent',
            border: `1px solid ${activeTab === t ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)'}`,
            color: activeTab === t ? '#a78bfa' : '#4b5563', cursor: 'pointer',
          }}>
            {t === 'rules' ? 'Regole Challenge' : 'Configurazione Rischio Engine'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
      ) : activeTab === 'rules' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {firms.length === 0 ? (
            <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>
              Nessuna prop firm — aggiungine una
            </div>
          ) : firms.map(f => (
            <div key={f.id} style={{ background: '#080808', border: `1px solid ${f.color}20`, borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer' }}
                onClick={() => setExpandedFirm(expandedFirm === f.id ? null : f.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: f.color }} />
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#e2e8f0' }}>{f.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    {[['Target F1', fmt(f.profit_target_fase1)], ['Target F2', fmt(f.profit_target_fase2)], ['Max Loss', fmt(f.max_loss_funded), '#ef4444'], ['Daily', fmt(f.daily_loss_limit), '#f59e0b']].map(([l, v, c]) => (
                      <div key={l as string}>
                        <div style={{ fontSize: '9px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>{l}</div>
                        <div style={{ fontSize: '13px', color: (c as string) || '#9ca3af', fontWeight: 500 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={e => { e.stopPropagation(); deleteFirm(f.id) }} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} /></button>
                  </div>
                  {expandedFirm === f.id ? <ChevronUp size={14} color="#374151" /> : <ChevronDown size={14} color="#374151" />}
                </div>
              </div>
              {expandedFirm === f.id && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  {[['Rischio max op', fmt(f.rischio_max_operazione)], ['Giorni minimi', f.giorni_minimi ? `${f.giorni_minimi} gg` : '—'], ['Inattività max', f.periodo_inattivita ? `${f.periodo_inattivita} gg` : '—'], ['News Challenge', f.news_policy_challenge || '—'], ['News Funded', f.news_policy_funded || '—']].map(([l, v]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: '10px', color: '#374151', marginBottom: '4px' }}>{l}</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af' }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
          {riskConfigs.length === 0 ? (
            <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>
              Le configurazioni rischio vengono create automaticamente con le prop firm
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {['Prop Firm','Fase Min','Fase Max','Live Min','Live Max','Esplosione F','Esplosione L','Target Min','Target Max'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riskConfigs.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < riskConfigs.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#e2e8f0', fontWeight: 500 }}>{r.prop_firm_name}</td>
                    {[r.fase_min_risk, r.fase_max_risk, r.live_min_risk, r.live_max_risk, r.esplosione_fase_risk, r.esplosione_live_risk, r.target_fase_min_risk, r.target_fase_max_risk].map((v, j) => (
                      <td key={j} style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace' }}>{v}%</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAdd && <AddFirmModal structureId={structureId} onClose={() => setShowAdd(false)} onSaved={fetchData} />}
    </div>
  )
}
