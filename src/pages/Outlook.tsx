import { useState } from 'react'
import { Mail, RefreshCw, Link, AlertCircle, Inbox, Star, ChevronRight } from 'lucide-react'

interface OutlookAccount {
  idIdentifier: string
  email: string
  isConnected: boolean
  needsReconnect: boolean
  lastError?: string
}

interface Email {
  id: string
  from: string
  subject: string
  preview: string
  receivedAt: string
  isRead: boolean
  isImportant: boolean
  propFirm?: string
}

const demoAccounts: OutlookAccount[] = []
const demoEmails: Email[] = []

export default function Outlook() {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  const filteredEmails = selectedAccount
    ? demoEmails.filter(e => e.from.includes(selectedAccount))
    : demoEmails

  const disconnectedAccounts = demoAccounts.filter(a => !a.isConnected || a.needsReconnect)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Outlook</h1>
          <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Email prop firm filtrate per notifiche importanti</p>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px',
          background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: '13px', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer',
        }}>
          <RefreshCw size={13} /> Aggiorna email
        </button>
      </div>

      {/* Account connections */}
      {disconnectedAccounts.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={14} color="#f59e0b" />
          <span style={{ fontSize: '13px', color: '#9ca3af' }}>
            {disconnectedAccounts.length} account Outlook {disconnectedAccounts.length === 1 ? 'non connesso' : 'non connessi'} — necessaria riautorizzazione
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 300px)', minHeight: '400px' }}>
        {/* Left sidebar */}
        <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Account list */}
          <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Account ({demoAccounts.length})
            </div>
            {demoAccounts.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <Mail size={20} color="#1f2937" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '12px', color: '#1f2937', marginBottom: '12px' }}>Nessun account connesso</div>
                <button
                  onClick={() => {/* trigger OAuth */}}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#9ca3af', fontSize: '12px', cursor: 'pointer', margin: '0 auto',
                  }}>
                  <Link size={11} /> Collega Outlook
                </button>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => setSelectedAccount(null)}
                  style={{
                    width: '100%', padding: '10px 16px', textAlign: 'left', background: selectedAccount === null ? 'rgba(124,58,237,0.1)' : 'transparent',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}>
                  <Inbox size={13} color={selectedAccount === null ? '#a78bfa' : '#4b5563'} />
                  <span style={{ fontSize: '13px', color: selectedAccount === null ? '#a78bfa' : '#4b5563' }}>Tutti gli account</span>
                </button>
                {demoAccounts.map(acc => (
                  <button
                    key={acc.idIdentifier}
                    onClick={() => setSelectedAccount(acc.idIdentifier)}
                    style={{
                      width: '100%', padding: '10px 16px', textAlign: 'left',
                      background: selectedAccount === acc.idIdentifier ? 'rgba(124,58,237,0.1)' : 'transparent',
                      border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: acc.isConnected && !acc.needsReconnect ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '12px', color: selectedAccount === acc.idIdentifier ? '#a78bfa' : '#9ca3af' }}>{acc.idIdentifier}</div>
                        <div style={{ fontSize: '10px', color: '#374151' }}>{acc.email}</div>
                      </div>
                    </div>
                    {acc.needsReconnect && (
                      <div style={{ marginTop: '4px', fontSize: '10px', color: '#f59e0b', paddingLeft: '15px' }}>Riconnetti</div>
                    )}
                  </button>
                ))}
                <div style={{ padding: '10px 16px' }}>
                  <button style={{
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#374151',
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}>
                    <Link size={10} /> Aggiungi account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Email list */}
        <div style={{ flex: 1, background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Inbox — {filteredEmails.length} messaggi
          </div>
          {filteredEmails.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={32} color="#1f2937" style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '13px', color: '#1f2937' }}>
                {demoAccounts.length === 0 ? 'Collega un account Outlook per vedere le email' : 'Nessuna email'}
              </div>
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredEmails.map((email, i) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer',
                    background: selectedEmail?.id === email.id ? 'rgba(124,58,237,0.08)' : !email.isRead ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderBottom: i < filteredEmails.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                  }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: !email.isRead ? '#3b82f6' : 'transparent', flexShrink: 0, marginTop: '5px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: !email.isRead ? 600 : 400, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.from}</span>
                      <span style={{ fontSize: '10px', color: '#374151', flexShrink: 0 }}>{email.receivedAt}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      {email.isImportant && <Star size={10} fill="#f59e0b" color="#f59e0b" />}
                      {email.propFirm && <span style={{ fontSize: '10px', background: 'rgba(124,58,237,0.1)', color: '#a78bfa', padding: '1px 5px', borderRadius: '3px' }}>{email.propFirm}</span>}
                      <span style={{ fontSize: '12px', color: !email.isRead ? '#e2e8f0' : '#6b7280', fontWeight: !email.isRead ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {email.subject}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.preview}</div>
                  </div>
                  <ChevronRight size={13} color="#1f2937" style={{ flexShrink: 0, marginTop: '3px' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
