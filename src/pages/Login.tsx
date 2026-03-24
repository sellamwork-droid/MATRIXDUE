import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message || 'Credenziali non valide')
      setLoading(false)
      return
    }

    navigate('/dashboard')
  }

  const inputStyle: React.CSSProperties = {
    background: '#161625',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    padding: '12px 16px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07070d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0f0f1a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '40px', width: '380px' }}>
        <h1 style={{ color: '#fff', fontSize: '20px', fontWeight: 600, marginBottom: '6px', letterSpacing: '-0.3px' }}>
          Matrix Pro Hub
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '28px' }}>Accedi al tuo account</p>

        {!supabaseConfigured && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '12px', color: '#f59e0b' }}>
            Supabase non ancora configurato — configura .env con URL e chiave del tuo progetto
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />

          {error && (
            <div style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              background: loading || !email || !password ? 'rgba(124,58,237,0.4)' : '#7c3aed',
              color: '#fff', border: 'none', borderRadius: '10px',
              padding: '13px', fontSize: '14px', fontWeight: 500,
              cursor: loading || !email || !password ? 'default' : 'pointer',
              marginTop: '4px', transition: 'background 0.2s',
            }}
          >
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
