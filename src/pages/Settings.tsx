import { useState } from 'react'
import { Building2, User, Lock, Bell } from 'lucide-react'

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
      {desc && <p style={{ fontSize: '11px', color: '#374151', marginTop: '5px' }}>{desc}</p>}
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
        {desc && <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>{desc}</div>}
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

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('struttura')

  // Struttura state
  const [strutturaName, setStrutturaName] = useState('Struttura Principale')
  const [strutturaSlug, setStrutturaSlug] = useState('struttura-principale')

  // Account state
  const [fullName, setFullName] = useState('Admin')
  const [email] = useState('admin@matrixprohub.com')

  // Sicurezza state
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  // Notifiche state
  const [notifIntegrity, setNotifIntegrity] = useState(true)
  const [notifPromotion, setNotifPromotion] = useState(true)
  const [notifDisconnect, setNotifDisconnect] = useState(true)
  const [notifPayout, setNotifPayout] = useState(false)

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'struttura',  label: 'Struttura',   icon: <Building2 size={13} /> },
    { id: 'account',    label: 'Account',      icon: <User size={13} /> },
    { id: 'sicurezza',  label: 'Sicurezza',    icon: <Lock size={13} /> },
    { id: 'notifiche',  label: 'Notifiche',    icon: <Bell size={13} /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Impostazioni</h1>
        <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Configurazione struttura, account e preferenze</p>
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
                color: activeTab === t.id ? '#a78bfa' : '#4b5563',
                fontSize: '13px',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {activeTab === 'struttura' && (
            <>
              <Section title="Informazioni Struttura">
                <Field label="Nome struttura" desc="Visibile nella navbar e nei report">
                  <input value={strutturaName} onChange={e => setStrutturaName(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Slug (URL-friendly)" desc="Usato internamente per identificare la struttura">
                  <input value={strutturaSlug} onChange={e => setStrutturaSlug(e.target.value)} style={inputStyle} />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={{ padding: '9px 20px', borderRadius: '8px', background: '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    Salva modifiche
                  </button>
                </div>
              </Section>
            </>
          )}

          {activeTab === 'account' && (
            <>
              <Section title="Profilo">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 500, color: '#e2e8f0' }}>{fullName}</div>
                    <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>{email}</div>
                  </div>
                </div>
                <Field label="Nome visualizzato">
                  <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={{ padding: '9px 20px', borderRadius: '8px', background: '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    Salva
                  </button>
                </div>
              </Section>
            </>
          )}

          {activeTab === 'sicurezza' && (
            <>
              <Section title="Cambia Password">
                <Field label="Password attuale">
                  <input value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
                </Field>
                <Field label="Nuova password" desc="Almeno 8 caratteri">
                  <input value={newPwd} onChange={e => setNewPwd(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
                </Field>
                <Field label="Conferma nuova password">
                  <input value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    disabled={!currentPwd || !newPwd || newPwd !== confirmPwd}
                    style={{ padding: '9px 20px', borderRadius: '8px', background: newPwd === confirmPwd && newPwd ? '#7c3aed' : 'rgba(255,255,255,0.05)', border: 'none', color: newPwd === confirmPwd && newPwd ? '#fff' : '#374151', fontSize: '13px', fontWeight: 500, cursor: newPwd === confirmPwd && newPwd ? 'pointer' : 'default' }}>
                    Aggiorna password
                  </button>
                </div>
              </Section>
            </>
          )}

          {activeTab === 'notifiche' && (
            <>
              <Section title="Preferenze Notifiche">
                <ToggleSetting
                  label="Alert Integrità"
                  desc="Avvisi quando un account scompare o ha anomalie"
                  value={notifIntegrity}
                  onChange={setNotifIntegrity}
                />
                <ToggleSetting
                  label="Promozioni account"
                  desc="Notifica quando un account è pronto per la promozione di fase"
                  value={notifPromotion}
                  onChange={setNotifPromotion}
                />
                <ToggleSetting
                  label="Disconnessioni EA"
                  desc="Avviso quando un EA smette di sincronizzare"
                  value={notifDisconnect}
                  onChange={setNotifDisconnect}
                />
                <ToggleSetting
                  label="Promemoria payout"
                  desc="Notifica per i payout in scadenza nei prossimi 3 giorni"
                  value={notifPayout}
                  onChange={setNotifPayout}
                />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
