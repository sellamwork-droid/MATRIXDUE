import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Shield, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useStructureId } from '../hooks/useStructure'
import { useAuth } from '../hooks/useAuth'

type AppRole = 'admin' | 'full' | 'trader' | 'analyst' | 'viewer'

interface AppUser {
  id: string
  email: string
  fullName: string
  role: AppRole
  isOwner: boolean
  createdAt: string
}

const roleColors: Record<AppRole, string> = {
  admin:   '#ef4444',
  full:    '#a78bfa',
  trader:  '#3b82f6',
  analyst: '#22c55e',
  viewer:  '#4b5563',
}
const roleLabels: Record<AppRole, string> = {
  admin:   'Admin',
  full:    'Full',
  trader:  'Trader',
  analyst: 'Analyst',
  viewer:  'Viewer',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#e2e8f0', fontSize: '13px',
}

function AddUserModal({ structureId, onClose, onSaved }: { structureId: string; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<AppRole>('trader')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!email.trim() || !password.trim()) return
    setSaving(true); setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-subaccount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim(), role, structureId }),
      })
      const json = await res.json().catch(() => ({ error: 'Errore di rete' }))
      if (!res.ok) { setError(json.error || 'Errore nella creazione'); setSaving(false); return }
      onSaved(); onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore di rete')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '32px', width: '440px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '24px' }}>Nuovo Utente</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Nome completo</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Mario Rossi" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="mario@example.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '5px' }}>Password temporanea</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '8px' }}>Ruolo</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {(Object.keys(roleLabels) as AppRole[]).map(r => (
                <button key={r} onClick={() => setRole(r)} style={{
                  padding: '8px 0', borderRadius: '7px', fontSize: '12px', cursor: 'pointer',
                  background: role === r ? `${roleColors[r]}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${role === r ? `${roleColors[r]}40` : 'rgba(255,255,255,0.06)'}`,
                  color: role === r ? roleColors[r] : '#4b5563', fontWeight: role === r ? 600 : 400,
                }}>
                  {roleLabels[r]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '8px', padding: '12px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.5' }}>
            <strong style={{ color: '#e2e8f0' }}>Permessi per ruolo:</strong><br />
            Admin — accesso completo · Full — tutto tranne gestione utenti · Trader — operativo · Analyst — sola lettura · Viewer — lettura base
          </div>
        </div>

        {error && <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '7px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleCreate} disabled={saving || !email || !password} style={{ padding: '9px 18px', borderRadius: '8px', background: saving || !email || !password ? 'rgba(124,58,237,0.4)' : '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: saving || !email || !password ? 'default' : 'pointer' }}>
            {saving ? 'Creazione…' : 'Crea Utente'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditRoleModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState<AppRole>(user.role)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('user_roles').upsert({ user_id: user.id, role })
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '32px', width: '400px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Modifica Ruolo</h2>
        <p style={{ fontSize: '12px', color: '#374151', marginBottom: '24px' }}>{user.email}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '24px' }}>
          {(Object.keys(roleLabels) as AppRole[]).map(r => (
            <button key={r} onClick={() => setRole(r)} style={{
              padding: '8px 0', borderRadius: '7px', fontSize: '12px', cursor: 'pointer',
              background: role === r ? `${roleColors[r]}18` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${role === r ? `${roleColors[r]}40` : 'rgba(255,255,255,0.06)'}`,
              color: role === r ? roleColors[r] : '#4b5563', fontWeight: role === r ? 600 : 400,
            }}>
              {roleLabels[r]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: '8px', background: '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Users() {
  const structureId = useStructureId()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState<AppUser | null>(null)

  async function fetchData() {
    setLoading(true)

    const { data: access } = await supabase
      .from('user_structure_access')
      .select('user_id, is_owner')
      .eq('structure_id', structureId)

    const userIds = (access || []).map(a => a.user_id)
    const ownerMap: Record<string, boolean> = {}
    for (const a of (access || [])) ownerMap[a.user_id] = a.is_owner

    if (userIds.length === 0) { setUsers([]); setLoading(false); return }

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, created_at').in('id', userIds),
      supabase.from('user_roles').select('user_id, role').in('user_id', userIds),
    ])

    const roleMap: Record<string, AppRole> = {}
    for (const r of (roles || [])) roleMap[r.user_id] = r.role as AppRole

    const result: AppUser[] = (profiles || []).map(p => ({
      id: p.id,
      email: p.email || '',
      fullName: p.full_name || p.email || '',
      role: roleMap[p.id] || 'viewer',
      isOwner: ownerMap[p.id] || false,
      createdAt: p.created_at,
    }))

    setUsers(result)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [structureId])

  async function removeUser(userId: string) {
    if (!confirm('Rimuovere questo utente dalla struttura?')) return
    await supabase.from('user_structure_access').delete()
      .eq('user_id', userId).eq('structure_id', structureId)
    fetchData()
  }

  function formatDate(ts: string) {
    return new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Utenti</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Gestione accessi e ruoli del team</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#7c3aed', color: '#fff', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={13} /> Nuovo Utente
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(Object.keys(roleLabels) as AppRole[]).map(r => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '6px', background: `${roleColors[r]}10`, border: `1px solid ${roleColors[r]}20` }}>
            <Shield size={10} color={roleColors[r]} />
            <span style={{ fontSize: '11px', color: roleColors[r] }}>{roleLabels[r]}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center', fontSize: '13px', color: '#1f2937' }}>Caricamento…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <Shield size={24} color="#1f2937" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '13px', color: '#1f2937' }}>Nessun utente</div>
            <div style={{ fontSize: '12px', color: '#111827', marginTop: '4px' }}>Aggiungi i primi utenti del team</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['Utente', 'Email', 'Ruolo', 'Aggiunto', ''].map(h => (
                  <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '10px', color: '#1f2937', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: u.isOwner ? '#7c3aed' : '#1f2937', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}>
                        {(u.fullName || u.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0' }}>{u.fullName || '—'}</div>
                        {u.isOwner && <div style={{ fontSize: '10px', color: '#7c3aed' }}>Proprietario</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#6b7280' }}>{u.email}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: `${roleColors[u.role]}15`, color: roleColors[u.role], fontWeight: 600 }}>
                      {roleLabels[u.role]}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '12px', color: '#374151', fontFamily: 'monospace' }}>{formatDate(u.createdAt)}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setEditUser(u)} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Edit2 size={13} /></button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => removeUser(u.id)} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddUserModal structureId={structureId} onClose={() => setShowAdd(false)} onSaved={fetchData} />}
      {editUser && <EditRoleModal user={editUser} onClose={() => setEditUser(null)} onSaved={fetchData} />}
    </div>
  )
}
