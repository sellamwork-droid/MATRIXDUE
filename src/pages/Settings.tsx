import { useState, useEffect } from 'react'
import { Building2, User, Lock, Bell, Check, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useStructureId } from '../hooks/useStructure'

type SettingsTab = 'struttura' | 'account' | 'sicurezza' | 'notifiche'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#e2e8f0', fontSize: '13px',
}

function Field({ label, children, desc }: { label: string; children: React.ReactNode; desc?: string }) {
  return (
    <div>
      <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>{label}</label>
      {children}
      {desc && <p style={{ fontSize: '11px', color: '#4b5563', marginTop: '5px' }}>{desc}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>{title}</h3>
      {children}
    </div>
  )
}

function ToggleSetting({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#e2e8f0' }}>{label}</div>
        {desc && <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>{desc}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
        background: value ? '#7c3aed' : 'rgba(255,255,255,0.08)', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
      }}>
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
          position: 'absolute', top: '3px', left: value ? '21px' : '3px', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

function Feedback({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
      background: type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
      color: type === 'success' ? '#86efac' : '#fca5a5' }}>
      {type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
      {msg}
    </div>
  )
}

const NOTIF_KEY = 'matrix_notif_prefs'

export default function Settings() {
  const { user } = useAuth()
  const structureId = useStructureId()
  const [activeTab, setActiveTab] = useState<SettingsTab>('struttura')

  // Struttura state
  const [strutturaName, setStrutturaName] = useState('')
  const [strutturaSlug, setStrutturaSlug] = useState('')
  const [strutturaSaving, setStrutturaSaving] = useState(false)
  const [strutturaFeedback, setStrutturaFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Account state
  const [fullName, setFullName] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountFeedback, setAccountFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Sicurezza state
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdFeedback, setPwdFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Notifiche state (persisted in localStorage)
  const [notifIntegrity, setNotifIntegrity] = useState(true)
  const [notifPromotion, setNotifPromotion] = useState(true)
  const [notifDisconnect, setNotifDisconnect] = useState(true)
  const [notifPayout, setNotifPayout] = useState(false)
  const [notifFeedback, setNotifFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Load initial data
  useEffect(() => {
    // Load structure
    supabase.from('structures').select('name, slug').eq('id', structureId).single()
      .then(({ data }: any) => {
        if (data) { setStrutturaName(data.name || ''); setStrutturaSlug(data.slug || '') }
      })

    // Load profile
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }: any) => { if (data) setFullName(data.full_name || '') })
    }

    // Load notif prefs from localStorage
    try {
      const saved = localStorage.getItem(NOTIF_KEY)
      if (saved) {
        const p = JSON.parse(saved)
        setNotifIntegrity(p.integrity ?? true)
        setNotifPromotion(p.promotion ?? true)
        setNotifDisconnect(p.disconnect ?? true)
        setNotifPayout(p.payout ?? false)
      }
    } catch { /* ignore */ }
  }, [user?.id, structureId])

  const showFeedback = (
    setter: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; msg: string } | null>>,
    type: 'success' | 'error', msg: string
  ) => {
    setter({ type, msg })
    setTimeout(() => setter(null), 3500)
  }

  const saveStruttura = async () => {
    setStrutturaSaving(true)
    const { error } = await supabase.from('structures')
      .update({ name: strutturaName, slug: strutturaSlug })
      .eq('id', structureId) as any
    setStrutturaSaving(false)
    if (error) showFeedback(setStrutturaFeedback, 'error', 'Errore nel salvataggio: ' + error.message)
    else showFeedback(setStrutturaFeedback, 'success', 'Struttura aggiornata')
  }

  const saveAccount = async () => {
    if (!user) return
    setAccountSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id) as any
    setAccountSaving(false)
    if (error) showFeedback(setAccountFeedback, 'error', 'Errore nel salvataggio: ' + error.message)
    else showFeedback(setAccountFeedback, 'success', 'Profilo aggiornato')
  }

  const savePassword = async () => {
    if (newPwd !== confirmPwd) return
    if (newPwd.length < 8) { showFeedback(setPwdFeedback, 'error', 'La password deve essere di almeno 8 caratteri'); return }
    setPwdSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd }) as any
    setPwdSaving(false)
    if (error) showFeedback(setPwdFeedback, 'error', 'Errore: ' + error.message)
    else {
      setNewPwd(''); setConfirmPwd('')
      showFeedback(setPwdFeedback, 'success', 'Password aggiornata')
    }
  }

  const saveNotifiche = () => {
    localStorage.setItem(NOTIF_KEY, JSON.stringify({
      integrity: notifIntegrity, promotion: notifPromotion,
      disconnect: notifDisconnect, payout: notifPayout,
    }))
    showFeedback(setNotifFeedback, 'success', 'Preferenze salvate')
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'struttura', label: 'Struttura', icon: <Building2 size={13} /> },
    { id: 'account', label: 'Account', icon: <User size={13} /> },
    { id: 'sicurezza', label: 'Sicurezza', icon: <Lock size={13} /> },
    { id: 'notifiche', label: 'Notifiche', icon: <Bell size={13} /> },
  ]

  const btnStyle = (disabled = false): React.CSSProperties => ({
    padding: '9px 20px', borderRadius: '8px',
    background: disabled ? 'rgba(255,255,255,0.05)' : '#7c3aed',
    border: 'none', color: disabled ? '#374151' : '#fff',
    fontSize: '13px', fontWeight: 500, cursor: disabled ? 'default' : 'pointer',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Impostazioni</h1>
        <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>Configurazione struttura, account e preferenze</p>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Sidebar tabs */}
        <div style={{ width: '180px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: '9px',
                padding: '9px 14px', borderRadius: '8px', textAlign: 'left',
                background: activeTab === t.id ? 'rgba(124,58,237,0.12)' : 'transparent',
                border: 'none', cursor: 'pointer', width: '100%',
                color: activeTab === t.id ? '#a78bfa' : '#4b5563', fontSize: '13px',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {activeTab === 'struttura' && (
            <Section title="Informazioni Struttura">
              <Field label="Nome struttura" desc="Visibile nella navbar e nei report">
                <input value={strutturaName} onChange={e => setStrutturaName(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Slug (URL-friendly)" desc="Usato internamente per identificare la struttura">
                <input value={strutturaSlug} onChange={e => setStrutturaSlug(e.target.value)} style={inputStyle} />
              </Field>
              {strutturaFeedback && <Feedback {...strutturaFeedback} />}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={saveStruttura} disabled={strutturaSaving} style={btnStyle(strutturaSaving)}>
                  {strutturaSaving ? 'Salvataggio...' : 'Salva modifiche'}
                </button>
              </div>
            </Section>
          )}

          {activeTab === 'account' && (
            <Section title="Profilo">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {(fullName || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 500, color: '#e2e8f0' }}>{fullName || '—'}</div>
                  <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>{user?.email}</div>
                </div>
              </div>
              <Field label="Nome visualizzato">
                <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
              </Field>
              {accountFeedback && <Feedback {...accountFeedback} />}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={saveAccount} disabled={accountSaving} style={btnStyle(accountSaving)}>
                  {accountSaving ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>
            </Section>
          )}

          {activeTab === 'sicurezza' && (
            <Section title="Cambia Password">
              <Field label="Nuova password" desc="Almeno 8 caratteri">
                <input value={newPwd} onChange={e => setNewPwd(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
              </Field>
              <Field label="Conferma nuova password">
                <input value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
              </Field>
              {confirmPwd && newPwd !== confirmPwd && (
                <Feedback type="error" msg="Le password non coincidono" />
              )}
              {pwdFeedback && <Feedback {...pwdFeedback} />}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={savePassword}
                  disabled={pwdSaving || !newPwd || newPwd !== confirmPwd}
                  style={btnStyle(pwdSaving || !newPwd || newPwd !== confirmPwd)}>
                  {pwdSaving ? 'Aggiornamento...' : 'Aggiorna password'}
                </button>
              </div>
            </Section>
          )}

          {activeTab === 'notifiche' && (
            <Section title="Preferenze Notifiche">
              <ToggleSetting label="Alert Integrità" desc="Avvisi quando un account scompare o ha anomalie" value={notifIntegrity} onChange={setNotifIntegrity} />
              <ToggleSetting label="Promozioni account" desc="Notifica quando un account è pronto per la promozione di fase" value={notifPromotion} onChange={setNotifPromotion} />
              <ToggleSetting label="Disconnessioni EA" desc="Avviso quando un EA smette di sincronizzare" value={notifDisconnect} onChange={setNotifDisconnect} />
              <ToggleSetting label="Promemoria payout" desc="Notifica per i payout in scadenza nei prossimi 3 giorni" value={notifPayout} onChange={setNotifPayout} />
              {notifFeedback && <Feedback {...notifFeedback} />}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={saveNotifiche} style={btnStyle()}>Salva preferenze</button>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}
