import { useState, useEffect } from 'react'
import { Plus, ChevronLeft, ChevronRight, DollarSign, Trash2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'
import { useAuth } from '../hooks/useAuth'

interface PayoutEvent {
  id: string
  date: string
  id_identifier: string
  prop_firm: string
  account_login: string | null
  amount: number | null
  notes: string | null
}

const monthNames = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const dayNames = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfMonth(y: number, m: number) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1 }

function AddEventModal({ structureId, userId, date, onClose, onSaved }: { structureId: string; userId: string; date: string; onClose: () => void; onSaved: () => void }) {
  const [identifier, setIdentifier] = useState('')
  const [propFirm, setPropFirm] = useState('')
  const [accountLogin, setAccountLogin] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', color: '#e2e8f0', fontSize: '13px',
  }

  async function handleSave() {
    if (!identifier.trim() || !propFirm.trim()) return
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('payout_events').insert({
      structure_id: structureId,
      user_id: userId,
      id_identifier: identifier.trim(),
      date,
      prop_firm: propFirm.trim(),
      account_login: accountLogin || null,
      amount: amount ? parseFloat(amount) : null,
      notes: notes || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '32px', width: '440px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>Nuovo Payout</h2>
        <p style={{ fontSize: '12px', color: '#374151', marginBottom: '24px' }}>{date}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Operatore (ID)</label>
            <input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="MR001" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Prop Firm</label>
            <input value={propFirm} onChange={e => setPropFirm(e.target.value)} placeholder="FTMO, MFF…" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Login Account</label>
              <input value={accountLogin} onChange={e => setAccountLogin(e.target.value)} placeholder="12345678" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Importo ($)</label>
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Note</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opzionale" style={inputStyle} />
          </div>
        </div>
        {error && <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '7px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleSave} disabled={saving || !identifier || !propFirm} style={{ padding: '9px 18px', borderRadius: '8px', background: saving || !identifier || !propFirm ? 'rgba(124,58,237,0.4)' : '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: saving || !identifier || !propFirm ? 'default' : 'pointer' }}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CalendarioPayout() {
  const structureId = useStructureId()
  const { user } = useAuth()
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [addDate, setAddDate] = useState<string | null>(null)
  const [events, setEvents] = useState<PayoutEvent[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    setLoading(true)
    const startDate = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-01`
    const endDate = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${getDaysInMonth(viewYear, viewMonth)}`
    const { data } = await supabase.from('payout_events').select('*')
      .eq('structure_id', structureId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
    setEvents((data as PayoutEvent[]) || [])
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [structureId, viewYear, viewMonth])

  function eventsOnDay(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return events.filter(e => e.date === dateStr)
  }

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  async function deleteEvent(id: string) {
    await supabase.from('payout_events').delete().eq('id', id)
    fetchData()
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const totalAmount = events.reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Calendario Payout</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Pianificazione prelievi mensili</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {events.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e', fontSize: '13px' }}>
              <DollarSign size={13} />${totalAmount.toLocaleString('en-US')}
            </div>
          )}
          <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}><RefreshCw size={13} /></button>
          <button onClick={() => setAddDate(`${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-01`)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={13} /> Nuovo Payout
          </button>
        </div>
      </div>

      <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={18} /></button>
          <h2 style={{ fontSize: '15px', fontWeight: 500, color: '#e2e8f0' }}>{monthNames[viewMonth]} {viewYear}</h2>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', display: 'flex' }}><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {dayNames.map(d => <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '11px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e${i}`} style={{ padding: '12px', minHeight: '80px', borderRight: '1px solid rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.02)' }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dayEvents = eventsOnDay(day)
            const isToday = viewYear === now.getFullYear() && viewMonth === now.getMonth() && day === now.getDate()
            const col = (firstDay + i) % 7
            const isLastRow = Math.floor((firstDay + i) / 7) === Math.floor((firstDay + daysInMonth - 1) / 7)
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            return (
              <div key={day} onClick={() => setAddDate(dateStr)} style={{
                padding: '10px', minHeight: '80px', cursor: 'pointer',
                borderRight: col < 6 ? '1px solid rgba(255,255,255,0.02)' : 'none',
                borderBottom: !isLastRow ? '1px solid rgba(255,255,255,0.02)' : 'none',
                background: dayEvents.length > 0 ? 'rgba(124,58,237,0.04)' : 'transparent',
              }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? '#7c3aed' : 'transparent', fontSize: '12px', color: isToday ? '#fff' : '#4b5563', fontWeight: isToday ? 600 : 400 }}>
                  {day}
                </div>
                {dayEvents.map(ev => (
                  <div key={ev.id} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.id_identifier} — {ev.prop_firm}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {events.length > 0 && (
        <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px', color: '#374151' }}>
            {events.length} payout in {monthNames[viewMonth]}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['Data','Operatore','Prop Firm','Account','Importo',''].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '10px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={ev.id} style={{ borderBottom: i < events.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                  <td style={{ padding: '11px 20px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>{ev.date}</td>
                  <td style={{ padding: '11px 20px', fontSize: '13px', color: '#e2e8f0' }}>{ev.id_identifier}</td>
                  <td style={{ padding: '11px 20px', fontSize: '13px', color: '#9ca3af' }}>{ev.prop_firm}</td>
                  <td style={{ padding: '11px 20px', fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{ev.account_login || '—'}</td>
                  <td style={{ padding: '11px 20px', fontSize: '13px', color: '#22c55e', fontFamily: 'monospace' }}>
                    {ev.amount ? `$${Number(ev.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td style={{ padding: '11px 20px' }}>
                    <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addDate && user && <AddEventModal structureId={structureId} userId={user.id} date={addDate} onClose={() => setAddDate(null)} onSaved={fetchData} />}
    </div>
  )
}
