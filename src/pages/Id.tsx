import { useState, useEffect } from 'react'
import { Plus, Eye, EyeOff, Copy, Edit2, Trash2, Server, Mail, Wallet, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'

interface UserIdentity {
  id: string
  name: string
  identifier: string
  color: string
  ea_api_key: string | null
  vps_ip: string | null
  vps_username: string | null
  outlook_email: string | null
  trust_wallets: string[]
  prop_firms: string[]
  sync_wait_min_minutes: number
  sync_wait_max_minutes: number
}

const identityColors = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316']

function PasswordField({ value }: { value: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: show ? '#e2e8f0' : '#374151' }}>
        {show ? value : '••••••••••'}
      </span>
      <button onClick={() => setShow(!show)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', display: 'flex' }}>
        {show ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  )
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>{value || '—'}</span>
      {value && <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#22c55e' : '#374151', display: 'flex' }}><Copy size={11} /></button>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#e2e8f0', fontSize: '13px', boxSizing: 'border-box',
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  )
}

function AddIdentityModal({ structureId, onClose, onSaved }: { structureId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [color, setColor] = useState(identityColors[0])
  const [vpsIp, setVpsIp] = useState('')
  const [vpsUser, setVpsUser] = useState('')
  const [vpsPass, setVpsPass] = useState('')
  const [outlookEmail, setOutlookEmail] = useState('')
  const [outlookPass, setOutlookPass] = useState('')
  const [syncMin, setSyncMin] = useState('5')
  const [syncMax, setSyncMax] = useState('15')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim() || !identifier.trim()) return
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('user_ids').insert({
      structure_id: structureId,
      name: name.trim(),
      identifier: identifier.trim(),
      color,
      vps_ip: vpsIp || null,
      vps_username: vpsUser || null,
      vps_password_enc: vpsPass || null,   // in produzione: cifrare con pgp
      outlook_email: outlookEmail || null,
      outlook_password_enc: outlookPass || null,
      sync_wait_min_minutes: parseInt(syncMin) || 5,
      sync_wait_max_minutes: parseInt(syncMax) || 15,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '32px', width: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '24px' }}>Nuovo Operatore</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Field label="Nome completo"><input value={name} onChange={e => setName(e.target.value)} placeholder="Mario Rossi" style={inputStyle} /></Field>
            <Field label="Identificatore"><input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="MR001" style={inputStyle} /></Field>
          </div>
          <Field label="Colore">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {identityColors.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{ width: '28px', height: '28px', borderRadius: '6px', background: c, border: 'none', cursor: 'pointer', outline: color === c ? '2px solid #fff' : '2px solid transparent', outlineOffset: '2px' }} />
              ))}
            </div>
          </Field>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={12} color="#4b5563" />
            <span style={{ fontSize: '10px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.8px' }}>VPS</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Field label="IP / Host"><input value={vpsIp} onChange={e => setVpsIp(e.target.value)} placeholder="192.168.1.1" style={inputStyle} /></Field>
            <Field label="Username"><input value={vpsUser} onChange={e => setVpsUser(e.target.value)} placeholder="Administrator" style={inputStyle} /></Field>
            <Field label="Password"><input value={vpsPass} onChange={e => setVpsPass(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} /></Field>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={12} color="#4b5563" />
            <span style={{ fontSize: '10px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Outlook</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Email"><input value={outlookEmail} onChange={e => setOutlookEmail(e.target.value)} placeholder="op@outlook.com" style={inputStyle} /></Field>
            <Field label="Password"><input value={outlookPass} onChange={e => setOutlookPass(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} /></Field>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Sync min (min)"><input value={syncMin} onChange={e => setSyncMin(e.target.value)} type="number" style={inputStyle} /></Field>
            <Field label="Sync max (min)"><input value={syncMax} onChange={e => setSyncMax(e.target.value)} type="number" style={inputStyle} /></Field>
          </div>
        </div>
        {error && <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '7px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleSave} disabled={saving || !name || !identifier} style={{ padding: '9px 18px', borderRadius: '8px', background: saving || !name || !identifier ? 'rgba(124,58,237,0.4)' : '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: saving || !name || !identifier ? 'default' : 'pointer' }}>
            {saving ? 'Salvataggio…' : 'Salva Operatore'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: '#374151' }}>{icon}<span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{title}</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </div>
  )
}
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ fontSize: '11px', color: '#374151', flexShrink: 0 }}>{label}</span>
      {value}
    </div>
  )
}

export default function Id() {
  const structureId = useStructureId()
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('user_ids').select('*').eq('structure_id', structureId).eq('is_deleted', false).order('name')
    setIdentities((data as UserIdentity[]) || [])
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [structureId])

  async function deleteId(id: string) {
    await supabase.from('user_ids').update({ is_deleted: true }).eq('id', id)
    fetchData()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>ID Operatori</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Credenziali VPS, Outlook e wallet per ogni operatore</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}><RefreshCw size={13} /></button>
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}><Plus size={13} /> Nuovo Operatore</button>
        </div>
      </div>

      {loading ? (
        <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
      ) : identities.length === 0 ? (
        <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '80px', textAlign: 'center' }}>
          <Server size={24} color="#1f2937" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '13px', color: '#1f2937' }}>Nessun operatore — aggiungine uno</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {identities.map(id => (
            <div key={id.id} style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 1fr auto', alignItems: 'center', padding: '16px 20px', gap: '20px', cursor: 'pointer' }}
                onClick={() => setExpandedId(expandedId === id.id ? null : id.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: id.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0' }}>{id.name}</div>
                    <div style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace' }}>{id.identifier}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#1f2937', marginBottom: '4px' }}>VPS</div>
                  <CopyField value={id.vps_ip || ''} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#1f2937', marginBottom: '4px' }}>Outlook</div>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>{id.outlook_email || '—'}</span>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#1f2937', marginBottom: '4px' }}>Prop Firms</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {(id.prop_firms || []).slice(0, 3).map(f => (
                      <span key={f} style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', color: '#4b5563' }}>{f}</span>
                    ))}
                    {(id.prop_firms || []).length > 3 && <span style={{ fontSize: '10px', color: '#374151' }}>+{id.prop_firms.length - 3}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={e => { e.stopPropagation(); deleteId(id.id) }} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} /></button>
                </div>
              </div>

              {expandedId === id.id && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                  <DetailSection title="VPS" icon={<Server size={12} />}>
                    <DetailRow label="IP" value={<CopyField value={id.vps_ip || ''} />} />
                    <DetailRow label="Username" value={<CopyField value={id.vps_username || ''} />} />
                    <DetailRow label="Password" value={<PasswordField value="••••••" />} />
                  </DetailSection>
                  <DetailSection title="Outlook" icon={<Mail size={12} />}>
                    <DetailRow label="Email" value={<CopyField value={id.outlook_email || ''} />} />
                    <DetailRow label="Password" value={<PasswordField value="••••••" />} />
                  </DetailSection>
                  <DetailSection title="Wallet" icon={<Wallet size={12} />}>
                    {(id.trust_wallets || []).length === 0
                      ? <span style={{ fontSize: '12px', color: '#1f2937' }}>Nessun wallet</span>
                      : (id.trust_wallets || []).map((w, i) => <DetailRow key={i} label={`Wallet ${i + 1}`} value={<CopyField value={w} />} />)
                    }
                  </DetailSection>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <DetailRow label="EA API Key" value={<CopyField value={id.ea_api_key || ''} />} />
                    <DetailRow label="Sync" value={<span style={{ fontSize: '12px', color: '#6b7280' }}>{id.sync_wait_min_minutes}–{id.sync_wait_max_minutes} min</span>} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddIdentityModal structureId={structureId} onClose={() => setShowAdd(false)} onSaved={fetchData} />}
    </div>
  )
}
