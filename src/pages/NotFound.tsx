import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: '72px', fontWeight: 700, color: 'rgba(255,255,255,0.04)', lineHeight: 1 }}>404</div>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 500, color: '#e2e8f0', marginBottom: '8px' }}>Pagina non trovata</div>
        <div style={{ fontSize: '13px', color: '#4b5563' }}>La pagina che stai cercando non esiste o è stata spostata.</div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={() => navigate(-1)} style={{
          display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '9px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          color: '#9ca3af', fontSize: '13px', cursor: 'pointer',
        }}>
          <ArrowLeft size={14} /> Torna indietro
        </button>
        <button onClick={() => navigate('/dashboard')} style={{
          display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '9px',
          background: '#7c3aed', border: 'none', color: '#fff', fontSize: '13px', cursor: 'pointer',
        }}>
          <Home size={14} /> Dashboard
        </button>
      </div>
    </div>
  )
}
