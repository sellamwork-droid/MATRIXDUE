import { useState, useEffect, useCallback } from 'react'
import { Plus, MoreHorizontal, ArrowRight, AlertCircle, Wifi, WifiOff, RefreshCw, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { MT5Account } from '../types/mt5'

// ─── COSTANTI ────────────────────────────────────────────────────────────────

type PhaseFilter = 'all' | 'fase1' | 'fase2' | 'live'

const PHASE_COLORS: Record<string, string> = {
  fase1: '#3b82f6', fase2: '#22c55e', live: '#f59e0b',
}
const PHASE_LABELS: Record<string, string> = {
  fase1: 'Fase 1', fase2: 'Fase 2', live: 'Live',
}
const STAGES = [-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10]
const stageLabel = (s: number) => s === 0 ? 'BE' : s > 0 ? `+${s}` : `${s}`

// ─── COMPONENTI PICCOLI ───────────────────────────────────────────────────────

function MenuBtn({ label, color, onClick }: { label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '7px 11px', borderRadius: '6px', fontSize: '12px',
      color: color || '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = color || '#e2e8f0' }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = color || '#6b7280' }}
    >{label}</button>
  )
}

function PhaseTab({ active, label, count, color, onClick }: {
  active: boolean; label: string; count: number; color: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 9,
      background: active ? `${color}12` : 'transparent',
      border: `1px solid ${active ? `${color}30` : 'rgba(255,255,255,0.05)'}`,
      color: active ? color : '#374151', fontSize: 13, fontWeight: active ? 500 : 400,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
      <span style={{
        fontSize: 11, padding: '1px 7px', borderRadius: 20,
        background: active ? `${color}20` : 'rgba(255,255,255,0.04)',
        color: active ? color : '#374151',
      }}>{count}</span>
    </button>
  )
}

// ─── CARD ACCOUNT ─────────────────────────────────────────────────────────────

function AccountCard({ acc, onAction }: { acc: MT5Account; onAction: (id: string, action: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const color = PHASE_COLORS[acc.phase] ?? '#6b7280'
  const balance = acc.current_balance ?? acc.initial_balance
  const profit = acc.profit_percentage ?? 0
  const isConnected = acc.connection_status === 'connected'
  const hasWarning = acc.connection_status === 'warning' || acc.connection_status === 'critical'

  return (
    <div style={{
      background: '#080808',
      border: `1px solid ${acc.awaiting_promotion ? '#a78bfa44' : acc.is_in_payout ? '#f59e0b44' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10, padding: 14, position: 'relative',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isConnected
            ? <Wifi size={11} color="#22c55e" />
            : hasWarning
              ? <Wifi size={11} color="#f59e0b" />
              : <WifiOff size={11} color="#ef4444" />
          }
          <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{acc.account_login}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {acc.is_in_payout && (
            <span style={{ fontSize: 9, background: '#f59e0b22', color: '#f59e0b', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>PAYOUT</span>
          )}
          {acc.awaiting_promotion && (
            <span style={{ fontSize: 9, background: '#a78bfa22', color: '#a78bfa', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>PROMO</span>
          )}
          {acc.is_excluded_from_trades && (
            <span style={{ fontSize: 9, background: '#ef444422', color: '#ef4444', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>ESCLUSO</span>
          )}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', padding: 2, display: 'flex' }}>
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 80 }} onClick={() => setMenuOpen(false)} />
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 90,
                  background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: 4, minWidth: 180,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                }}>
                  {acc.awaiting_promotion && <MenuBtn label="✓ Conferma Promozione" color="#a78bfa" onClick={() => { onAction(acc.id, 'confirm-promotion'); setMenuOpen(false) }} />}
                  <MenuBtn label="Note operatore"        onClick={() => { onAction(acc.id, 'notes'); setMenuOpen(false) }} />
                  <MenuBtn label="In Payout"             onClick={() => { onAction(acc.id, 'payout'); setMenuOpen(false) }} />
                  <MenuBtn label="Escludi da trades"     onClick={() => { onAction(acc.id, 'exclude'); setMenuOpen(false) }} />
                  <MenuBtn label="Cambia fase"           onClick={() => { onAction(acc.id, 'change-phase'); setMenuOpen(false) }} />
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
                  <MenuBtn label="Disabilita account"   color="#ef4444" onClick={() => { onAction(acc.id, 'disable'); setMenuOpen(false) }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Prop firm */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 1 }}>{acc.prop_firm_name}</div>
        <div style={{ fontSize: 11, color: '#4b5563' }}>{acc.account_name}</div>
      </div>

      {/* Balance / Profit */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Balance</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>
            ${balance.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 9, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Profitto</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: profit >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
            {profit >= 0 ? '+' : ''}{profit.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Stage + fase */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color, background: `${color}18`, padding: '3px 8px', borderRadius: 5, fontWeight: 600 }}>
          Stage {stageLabel(acc.stage ?? 0)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {acc.has_open_trades && (
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e' }} title="Trade aperto" />
          )}
          <span style={{ fontSize: 10, color: '#374151' }}>{PHASE_LABELS[acc.phase] ?? acc.phase}</span>
        </div>
      </div>

      {/* Note preview */}
      {acc.operational_notes && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#4b5563', fontStyle: 'italic', borderTop: '1px solid #0f0f0f', paddingTop: 6 }}>
          {acc.operational_notes.slice(0, 60)}{acc.operational_notes.length > 60 ? '…' : ''}
        </div>
      )}
    </div>
  )
}

// ─── MODAL PROMOZIONE ─────────────────────────────────────────────────────────

function PromotionModal({ account, onConfirm, onClose }: {
  account: MT5Account; onConfirm: () => void; onClose: () => void
}) {
  const nextPhase = account.phase === 'fase1' ? 'Fase 2' : 'Live'
  const balance = account.current_balance ?? account.initial_balance
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 32, width: 420 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Conferma Promozione</h2>
        <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 20 }}>
          <span style={{ color: '#e2e8f0' }}>{account.account_login}</span> ({account.prop_firm_name}) passerà da{' '}
          <span style={{ color: PHASE_COLORS[account.phase] }}>{PHASE_LABELS[account.phase]}</span> a{' '}
          <span style={{ color: '#a78bfa' }}>{nextPhase}</span>.
        </p>
        <div style={{ background: '#f59e0b0d', border: '1px solid #f59e0b33', borderRadius: 8, padding: 12, marginBottom: 22, display: 'flex', gap: 10 }}>
          <AlertCircle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            Il balance iniziale della nuova fase verrà impostato a ${balance.toLocaleString()}.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>
            Annulla
          </button>
          <button onClick={onConfirm} style={{ padding: '9px 18px', borderRadius: 8, background: '#7c3aed', border: 'none', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowRight size={13} /> Promuovi
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL NOTE ───────────────────────────────────────────────────────────────

function NotesModal({ account, onSave, onClose }: {
  account: MT5Account; onSave: (notes: string) => void; onClose: () => void
}) {
  const [notes, setNotes] = useState(account.operational_notes ?? '')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 28, width: 420 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 16 }}>
          Note — {account.account_login} ({account.prop_firm_name})
        </h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Inserisci note operative…"
          rows={5}
          style={{
            width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8,
            color: '#e2e8f0', fontSize: 13, padding: '10px 12px', resize: 'vertical',
            boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          <button onClick={() => onSave(notes)} style={{ padding: '9px 18px', borderRadius: 8, background: '#1a6b3c', border: 'none', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Salva</button>
        </div>
      </div>
    </div>
  )
}

// ─── PAGINA BOARD ─────────────────────────────────────────────────────────────

export default function Board() {
  const [accounts, setAccounts] = useState<MT5Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activePhase, setActivePhase] = useState<PhaseFilter>('all')
  const [selectedStage, setSelectedStage] = useState<number | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [promotionTarget, setPromotionTarget] = useState<MT5Account | null>(null)
  const [notesTarget, setNotesTarget] = useState<MT5Account | null>(null)

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('mt5_accounts').select('*')
        .eq('is_deleted', false)
        .neq('account_status', 'passed')
        .neq('account_status', 'burned')
        .eq('visible_on_board', true)
        .order('id_identifier').order('phase').order('stage')
      setAccounts((data as MT5Account[] | null) ?? [])
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  // Filtra
  const filtered = accounts.filter(a => {
    if (activePhase !== 'all' && a.phase !== activePhase) return false
    if (selectedStage !== null && (a.stage ?? 0) !== selectedStage) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!a.account_login.toLowerCase().includes(q) &&
          !a.prop_firm_name.toLowerCase().includes(q) &&
          !a.id_identifier.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Raggruppa per operatore
  const groupedByOperator = filtered.reduce<Record<string, MT5Account[]>>((acc, acct) => {
    const key = acct.id_identifier || 'N/A'
    if (!acc[key]) acc[key] = []
    acc[key].push(acct)
    return acc
  }, {})

  const countByPhase = (p: string) => accounts.filter(a => a.phase === p).length
  const countByStage = (s: number) => accounts.filter(a => {
    if (activePhase !== 'all' && a.phase !== activePhase) return false
    return (a.stage ?? 0) === s
  }).length

  async function handleAction(id: string, action: string) {
    const acc = accounts.find(a => a.id === id)
    if (!acc) return
    if (action === 'confirm-promotion') { setPromotionTarget(acc); return }
    if (action === 'notes') { setNotesTarget(acc); return }

    // Azioni rapide via Supabase (stub per ora)
    if (action === 'payout') {
      await supabase.from('mt5_accounts').update({ is_in_payout: !acc.is_in_payout }).eq('id', id)
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_in_payout: !a.is_in_payout } : a))
    }
    if (action === 'exclude') {
      await supabase.from('mt5_accounts').update({ is_excluded_from_trades: !acc.is_excluded_from_trades }).eq('id', id)
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_excluded_from_trades: !a.is_excluded_from_trades } : a))
    }
    if (action === 'disable') {
      await supabase.from('mt5_accounts').update({ account_status: 'breached' }).eq('id', id)
      setAccounts(prev => prev.filter(a => a.id !== id))
    }
  }

  async function handleConfirmPromotion() {
    if (!promotionTarget) return
    const nextPhase = promotionTarget.phase === 'fase1' ? 'fase2' : 'live'
    await supabase.from('mt5_accounts').update({
      phase: nextPhase,
      awaiting_promotion: false,
      initial_balance: promotionTarget.current_balance ?? promotionTarget.initial_balance,
      stage: 0,
    }).eq('id', promotionTarget.id)
    setAccounts(prev => prev.map(a => a.id === promotionTarget.id
      ? { ...a, phase: nextPhase as MT5Account['phase'], awaiting_promotion: false, stage: 0 }
      : a))
    setPromotionTarget(null)
  }

  async function handleSaveNotes(notes: string) {
    if (!notesTarget) return
    await supabase.from('mt5_accounts').update({ operational_notes: notes }).eq('id', notesTarget.id)
    setAccounts(prev => prev.map(a => a.id === notesTarget.id ? { ...a, operational_notes: notes } : a))
    setNotesTarget(null)
  }

  return (
    <div style={{ padding: 24, background: '#000', minHeight: '100vh', color: '#fff' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Board</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '3px 0 0' }}>
            {accounts.length} account · Vista per operatore
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Cerca login, prop firm, operatore…"
            style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '8px 14px', color: '#e2e8f0', fontSize: 13, outline: 'none', width: 260 }}
          />
          <button onClick={fetchAccounts} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '8px 12px', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={14} /> Aggiorna
          </button>
        </div>
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <PhaseTab active={activePhase === 'all'} label="Tutti" count={accounts.length} color="#6b7280" onClick={() => setActivePhase('all')} />
        {(['fase1','fase2','live'] as const).map(p => (
          <PhaseTab key={p} active={activePhase === p} label={PHASE_LABELS[p]} count={countByPhase(p)} color={PHASE_COLORS[p]} onClick={() => setActivePhase(p)} />
        ))}
      </div>

      {/* Stage filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 24 }}>
        <button onClick={() => setSelectedStage(null)} style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          background: selectedStage === null ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: '1px solid rgba(255,255,255,0.06)',
          color: selectedStage === null ? '#e2e8f0' : '#4b5563',
        }}>Tutti stage</button>
        {STAGES.map(s => {
          const cnt = countByStage(s)
          return (
            <button key={s} onClick={() => setSelectedStage(selectedStage === s ? null : s)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              background: selectedStage === s ? '#7c3aed22' : 'transparent',
              border: `1px solid ${selectedStage === s ? '#7c3aed55' : 'rgba(255,255,255,0.06)'}`,
              color: selectedStage === s ? '#a78bfa' : cnt > 0 ? '#6b7280' : '#1f2937',
            }}>
              {stageLabel(s)}
              {cnt > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({cnt})</span>}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6b7280' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div>Caricamento account…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: 14, padding: 80, textAlign: 'center' }}>
          <Users size={36} color='#1f2937' style={{ marginBottom: 12 }} />
          <div style={{ color: '#374151', fontSize: 13, marginBottom: 6 }}>Nessun account trovato</div>
          <div style={{ color: '#1f2937', fontSize: 12 }}>
            {accounts.length === 0 ? 'Aggiungi il primo account dalla pagina Accounts' : 'Nessun account corrisponde ai filtri selezionati'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {Object.entries(groupedByOperator).map(([operatorId, opAccounts]) => (
            <div key={operatorId}>
              {/* Operator header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa' }} />
                <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>{operatorId}</span>
                <span style={{ color: '#374151', fontSize: 12 }}>— {opAccounts.length} account</span>
                <div style={{ flex: 1, height: 1, background: '#1a1a1a' }} />
                {/* Phase mini stats */}
                {(['fase1','fase2','live'] as const).map(p => {
                  const c = opAccounts.filter(a => a.phase === p).length
                  if (!c) return null
                  return (
                    <span key={p} style={{ fontSize: 11, color: PHASE_COLORS[p], background: PHASE_COLORS[p] + '15', padding: '2px 8px', borderRadius: 4 }}>
                      {PHASE_LABELS[p]}: {c}
                    </span>
                  )
                })}
              </div>

              {/* Account cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {opAccounts.map(acc => (
                  <AccountCard key={acc.id} acc={acc} onAction={handleAction} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {promotionTarget && (
        <PromotionModal account={promotionTarget} onConfirm={handleConfirmPromotion} onClose={() => setPromotionTarget(null)} />
      )}
      {notesTarget && (
        <NotesModal account={notesTarget} onSave={handleSaveNotes} onClose={() => setNotesTarget(null)} />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
