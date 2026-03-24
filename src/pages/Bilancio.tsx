import { useState, useEffect } from 'react'
import { Plus, Trash2, TrendingUp, TrendingDown, DollarSign, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'
import { useAuth } from '../hooks/useAuth'

type EntryType = 'payout' | 'spesa_challenge' | 'spesa_operativa' | 'altro'

interface BilancioEntry {
  id: string
  entry_type: 'entrata' | 'uscita'
  label: string
  secondary_label: string | null
  amount: number
  category: EntryType
  month: number
  year: number
}

const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const categoryColors: Record<EntryType, string> = {
  payout: '#22c55e', spesa_challenge: '#f59e0b', spesa_operativa: '#3b82f6', altro: '#6b7280',
}
const categoryLabels: Record<EntryType, string> = {
  payout: 'Payout', spesa_challenge: 'Spesa Challenge', spesa_operativa: 'Spesa Operativa', altro: 'Altro',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#e2e8f0', fontSize: '13px', boxSizing: 'border-box',
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '11px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  )
}

function AddEntryModal({ structureId, userId, month, year, onClose, onSaved }: { structureId: string; userId: string; month: number; year: number; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'entrata' | 'uscita'>('entrata')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<EntryType>('payout')
  const [secondary, setSecondary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!label.trim() || !amount) return
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('bilancio_entries').insert({
      structure_id: structureId,
      user_id: userId,
      entry_type: type,
      label: label.trim(),
      secondary_label: secondary || null,
      amount: parseFloat(amount),
      category,
      month,
      year,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '32px', width: '440px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '24px' }}>Nuova voce — {months[month - 1]} {year}</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {(['entrata', 'uscita'] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              background: type === t ? (t === 'entrata' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'rgba(255,255,255,0.03)',
              border: `1px solid ${type === t ? (t === 'entrata' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.06)'}`,
              color: type === t ? (t === 'entrata' ? '#22c55e' : '#ef4444') : '#4b5563',
            }}>
              {t === 'entrata' ? '+ Entrata' : '− Uscita'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          <Field label="Descrizione"><input value={label} onChange={e => setLabel(e.target.value)} placeholder="es. Payout FTMO" style={inputStyle} /></Field>
          <Field label="Dettaglio (opzionale)"><input value={secondary} onChange={e => setSecondary(e.target.value)} placeholder="es. Account #12345" style={inputStyle} /></Field>
          <Field label="Importo (USD)"><input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00" style={inputStyle} /></Field>
          <Field label="Categoria">
            <select value={category} onChange={e => setCategory(e.target.value as EntryType)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {(Object.keys(categoryLabels) as EntryType[]).map(c => (
                <option key={c} value={c} style={{ background: '#0a0a0a' }}>{categoryLabels[c]}</option>
              ))}
            </select>
          </Field>
        </div>
        {error && <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '7px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleSave} disabled={saving || !label || !amount} style={{ padding: '9px 18px', borderRadius: '8px', background: saving || !label || !amount ? 'rgba(124,58,237,0.4)' : '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: saving || !label || !amount ? 'default' : 'pointer' }}>
            {saving ? 'Salvataggio…' : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, amount, color }: { icon: React.ReactNode; label: string; amount: number; color: string }) {
  return (
    <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#374151' }}>{icon}<span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</span></div>
      <div style={{ fontSize: '28px', fontWeight: 600, color, fontFamily: 'monospace', letterSpacing: '-0.5px' }}>
        {amount >= 0 ? '' : '-'}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}

export default function Bilancio() {
  const structureId = useStructureId()
  const { user } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [entries, setEntries] = useState<BilancioEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('bilancio_entries').select('*')
      .eq('structure_id', structureId)
      .eq('month', selectedMonth)
      .eq('year', selectedYear)
      .order('created_at', { ascending: false })
    setEntries((data as BilancioEntry[]) || [])
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [structureId, selectedMonth, selectedYear])

  async function deleteEntry(id: string) {
    await supabase.from('bilancio_entries').delete().eq('id', id)
    fetchData()
  }

  const entrate = entries.filter(e => e.entry_type === 'entrata').reduce((s, e) => s + Number(e.amount), 0)
  const uscite  = entries.filter(e => e.entry_type === 'uscita').reduce((s, e) => s + Number(e.amount), 0)
  const netto   = entrate - uscite

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Bilancio</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Entrate e uscite mensili in USD</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}><RefreshCw size={13} /></button>
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}><Plus size={13} /> Nuova Voce</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px', cursor: 'pointer', marginRight: '8px' }}>
          {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y} style={{ background: '#0a0a0a' }}>{y}</option>)}
        </select>
        {months.map((m, i) => (
          <button key={i} onClick={() => setSelectedMonth(i + 1)} style={{
            padding: '6px 12px', borderRadius: '7px', fontSize: '12px',
            background: selectedMonth === i + 1 ? 'rgba(124,58,237,0.15)' : 'transparent',
            border: `1px solid ${selectedMonth === i + 1 ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)'}`,
            color: selectedMonth === i + 1 ? '#a78bfa' : '#374151', cursor: 'pointer',
          }}>{m}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        <SummaryCard icon={<TrendingUp size={14} />} label="Entrate" amount={entrate} color="#22c55e" />
        <SummaryCard icon={<TrendingDown size={14} />} label="Uscite" amount={uscite} color="#ef4444" />
        <SummaryCard icon={<DollarSign size={14} />} label="Netto" amount={netto} color={netto >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

      <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Nessuna voce per {months[selectedMonth - 1]} {selectedYear}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['Tipo','Descrizione','Dettaglio','Categoria','Importo (USD)',''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} style={{ borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', fontWeight: 600, background: e.entry_type === 'entrata' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: e.entry_type === 'entrata' ? '#22c55e' : '#ef4444' }}>
                      {e.entry_type === 'entrata' ? '+ Entrata' : '− Uscita'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#e2e8f0' }}>{e.label}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#4b5563' }}>{e.secondary_label || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: `${categoryColors[e.category]}18`, color: categoryColors[e.category] }}>
                      {categoryLabels[e.category]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, fontFamily: 'monospace', color: e.entry_type === 'entrata' ? '#22c55e' : '#ef4444' }}>
                    {e.entry_type === 'entrata' ? '+' : '-'}${Number(e.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', color: '#1f2937', cursor: 'pointer' }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && user && <AddEntryModal structureId={structureId} userId={user.id} month={selectedMonth} year={selectedYear} onClose={() => setShowAdd(false)} onSaved={fetchData} />}
    </div>
  )
}
