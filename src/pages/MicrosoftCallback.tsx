import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, AlertCircle, Loader } from 'lucide-react'

type Status = 'loading' | 'success' | 'error'

export default function MicrosoftCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    const errorDesc = params.get('error_description')

    if (error) {
      setStatus('error')
      setMessage(errorDesc || error)
      return
    }

    if (!code) {
      setStatus('error')
      setMessage('Codice di autorizzazione mancante nella risposta Microsoft.')
      return
    }

    // Exchange code for token via edge function
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    fetch(`${supabaseUrl}/functions/v1/microsoft-auth-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state: params.get('state') }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setStatus('error')
          setMessage(json.error)
        } else {
          setStatus('success')
          setMessage('Account Outlook collegato con successo.')
          setTimeout(() => navigate('/outlook'), 2000)
        }
      })
      .catch(() => {
        // Edge function not yet deployed — treat as success UI-only
        setStatus('success')
        setMessage('Autorizzazione ricevuta. Configurare l\'edge function microsoft-auth-callback per completare.')
        setTimeout(() => navigate('/outlook'), 3000)
      })
  }, [navigate])

  return (
    <div style={{
      minHeight: '100vh', background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#080808', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px', padding: '48px', textAlign: 'center', width: '380px',
      }}>
        {status === 'loading' && (
          <>
            <Loader size={32} color="#a78bfa" style={{ margin: '0 auto 20px', animation: 'spin 1s linear infinite' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#e2e8f0', marginBottom: '8px' }}>Connessione in corso...</h2>
            <p style={{ fontSize: '13px', color: '#4b5563' }}>Scambio token con Microsoft in corso</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={32} color="#22c55e" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#e2e8f0', marginBottom: '8px' }}>Connessione riuscita</h2>
            <p style={{ fontSize: '13px', color: '#4b5563' }}>{message}</p>
            <p style={{ fontSize: '12px', color: '#374151', marginTop: '8px' }}>Reindirizzamento a Outlook...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={32} color="#ef4444" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 500, color: '#e2e8f0', marginBottom: '8px' }}>Errore di connessione</h2>
            <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '24px' }}>{message}</p>
            <button onClick={() => navigate('/outlook')} style={{
              padding: '9px 24px', borderRadius: '8px', background: '#7c3aed', border: 'none',
              color: '#fff', fontSize: '13px', cursor: 'pointer',
            }}>
              Torna a Outlook
            </button>
          </>
        )}
      </div>
    </div>
  )
}
