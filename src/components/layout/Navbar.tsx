import { NavLink, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

const nav = [
  { to: '/dashboard',  label: 'Dashboard' },
  { to: '/board',      label: 'Board' },
  { to: '/accounts',   label: 'Accounts' },
  { to: '/operations', label: 'Operations' },
  { to: '/trades',     label: 'Trades' },
  { to: '/bilancio',   label: 'Bilancio' },
  { to: '/id',         label: 'ID' },
  { to: '/users',      label: 'Utenti' },
]

const setup = [
  { to: '/propfirm',            label: 'Prop Firm' },
  { to: '/prop-counter',        label: 'Prop Counter' },
  { to: '/tabella-operativita', label: 'Tabella Operatività' },
  { to: '/calendario-payout',   label: 'Calendario Payout' },
  { to: '/outlook',             label: 'Outlook' },
  { to: '/install',             label: 'Install' },
  { to: '/settings',            label: 'Impostazioni' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = user?.email?.charAt(0).toUpperCase() ?? 'U'

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#000',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      height: '52px',
    }}>
      <div style={{
        maxWidth: '1600px', margin: '0 auto',
        padding: '0 48px',
        height: '100%',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '36px', flexShrink: 0 }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '7px',
            background: '#7c3aed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: '#fff',
          }}>M</div>
          <span style={{ color: '#fff', fontWeight: 500, fontSize: '14px', letterSpacing: '-0.1px' }}>Matrix Pro</span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '1px', flex: 1, overflowX: 'auto' }}>
          {nav.map(({ to, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              padding: '5px 11px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: isActive ? 500 : 400,
              color: isActive ? '#a78bfa' : '#4b5563',
              background: isActive ? 'rgba(124,58,237,0.1)' : 'transparent',
              textDecoration: 'none',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            })}>
              {label}
            </NavLink>
          ))}

          <div style={{ position: 'relative' }}>
            <button onClick={() => setOpen(!open)} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '5px 11px', borderRadius: '7px',
              fontSize: '12px', color: '#4b5563',
              background: 'transparent', border: 'none', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
              Setup <ChevronDown size={11} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>
            {open && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px', padding: '4px',
                  minWidth: '210px', zIndex: 100,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
                }}>
                  {setup.map(s => (
                    <button key={s.to} onClick={() => { navigate(s.to); setOpen(false) }} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 13px', borderRadius: '7px',
                      fontSize: '13px', color: '#4b5563',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#e2e8f0'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >{s.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
          <span style={{ color: '#1e293b', fontSize: '12px', fontFamily: 'monospace' }}>
            {new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </span>

          <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.05)' }} />

          <button style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 12px', borderRadius: '7px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
            color: '#4b5563', fontSize: '12px', cursor: 'pointer',
          }}>
            Struttura Principale <ChevronDown size={10} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '7px',
              background: '#7c3aed', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 600,
            }}>{initials}</div>
            <span style={{ color: '#6b7280', fontSize: '13px' }}>{user?.email?.split('@')[0] ?? 'Admin'}</span>
          </div>

          <button onClick={handleLogout} style={{ color: '#1e293b', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
