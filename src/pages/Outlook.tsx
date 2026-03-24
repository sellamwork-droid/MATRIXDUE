import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, Link, AlertCircle, Inbox, Star, ChevronRight, Unlink, Loader } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

interface OutlookAccount {
  id: string
  id_identifier: string
  email: string
  isConnected: boolean
  needsReconnect: boolean
  lastError?: string
  expiresAt?: string
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
  body?: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

export default function Outlook() {
  const [accounts, setAccounts] = useState<OutlookAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [loadingEmails, setLoadingEmails] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    const { data, error } = await supabase
      .from('microsoft_oauth_tokens')
      .select('id, id_identifier, email, needs_reconnect, last_error, expires_at') as any
    setLoadingAccounts(false)
    if (!error && data) {
      setAccounts(data.map((r: any) => ({
        id: r.id,
        id_identifier: r.id_identifier,
        email: r.email || '',
        isConnected: !r.needs_reconnect,
        needsReconnect: !!r.needs_reconnect,
        lastError: r.last_error,
        expiresAt: r.expires_at,
      })))
    }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const fetchEmails = async (idIdentifier: string) => {
    setLoadingEmails(true)
    setEmails([])
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/microsoft-fetch-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession() as any).data?.session?.access_token}` },
        body: JSON.stringify({ id_identifier: idIdentifier }),
      })
      const json = await res.json()
      if (json.emails) setEmails(json.emails)
    } catch { /* edge function not yet deployed */ }
    setLoadingEmails(false)
  }

  const handleSelectAccount = (idIdentifier: string | null) => {
    setSelectedAccount(idIdentifier)
    setSelectedEmail(null)
    setEmails([])
    if (idIdentifier) fetchEmails(idIdentifier)
  }

  const connectOutlook = async (idIdentifier?: string) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/microsoft-auth-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession() as any).data?.session?.access_token}` },
        body: JSON.stringify({ id_identifier: idIdentifier || 'default' }),
      })
      const json = await res.json()
      if (json.url) window.location.href = json.url
    } catch { alert('Funzione Microsoft non ancora attiva. Da configurare in Fase 6.') }
  }

  const disconnectAccount = async (id: string) => {
    await supabase.from('microsoft_oauth_tokens').delete().eq('id', id) as any
    await loadAccounts()
    if (selectedAccount) { setSelectedAccount(null); setEmails([]) }
  }

  const disconnectedAccounts = accounts.filter(a => !a.isConnected || a.needsReconnect)
  const filteredEmails = selectedAccount
    ? emails.filter(e => e.from.includes(selectedAccount))
    : emails

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Outlook</h1>
          <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>Email prop firm filtrate per notifiche importanti</p>
        </div>
        <button
          onClick={() => selectedAccount && fetchEmails(selectedAccount)}
          disabled={!selectedAccount || loadingEmails}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px',
            background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: '13px',
            border: '1px solid rgba(255,255,255,0.07)', cursor: selectedAccount ? 'pointer' : 'default',
          }}>
          <RefreshCw size={13} style={{ animation: loadingEmails ? 'spin 1s linear infinite' : 'none' }} />
          Aggiorna email
        </button>
      </div>

      {disconnectedAccounts.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={14} color="#f59e0b" />
          <span style={{ fontSize: '13px', color: '#9ca3af' }}>
            {disconnectedAccounts.length} account {disconnectedAccounts.length === 1 ? 'non connesso' : 'non connessi'} — necessaria riautorizzazione
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 300px)', minHeight: '400px' }}>
        {/* Left sidebar */}
        <div style={{ width: '260px', flexShrink: 0 }}>
          <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '10px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Account ({accounts.length})
            </div>

            {loadingAccounts ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader size={16} color="#374151" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : accounts.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <Mail size={20} color="#1f2937" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '12px', color: '#1f2937', marginBottom: '12px' }}>Nessun account connesso</div>
                <button
                  onClick={() => connectOutlook()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#9ca3af', fontSize: '12px', cursor: 'pointer', margin: '0 auto',
                  }}>
                  <Link size={11} /> Collega Outlook
                </button>
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <button
                  onClick={() => handleSelectAccount(null)}
                  style={{
                    width: '100%', padding: '10px 16px', textAlign: 'left',
                    background: selectedAccount === null ? 'rgba(124,58,237,0.1)' : 'transparent',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}>
                  <Inbox size={13} color={selectedAccount === null ? '#a78bfa' : '#4b5563'} />
                  <span style={{ fontSize: '13px', color: selectedAccount === null ? '#a78bfa' : '#4b5563' }}>Tutti gli account</span>
                </button>
                {accounts.map(acc => (
                  <div key={acc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <button
                      onClick={() => handleSelectAccount(acc.id_identifier)}
                      style={{
                        width: '100%', padding: '10px 16px', textAlign: 'left',
                        background: selectedAccount === acc.id_identifier ? 'rgba(124,58,237,0.1)' : 'transparent',
                        border: 'none', cursor: 'pointer',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: acc.isConnected && !acc.needsReconnect ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: selectedAccount === acc.id_identifier ? '#a78bfa' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.id_identifier}</div>
                          <div style={{ fontSize: '10px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.email}</div>
                        </div>
                      </div>
                      {acc.needsReconnect && (
                        <div style={{ marginTop: '4px', fontSize: '10px', color: '#f59e0b', paddingLeft: '15px' }}>
                          ⚠ Riconnetti
                        </div>
                      )}
                    </button>
                    <div style={{ display: 'flex', gap: '8px', padding: '0 16px 8px', paddingLeft: '31px' }}>
                      {acc.needsReconnect && (
                        <button onClick={() => connectOutlook(acc.id_identifier)} style={{ fontSize: '10px', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Link size={9} /> Riconnetti
                        </button>
                      )}
                      <button onClick={() => disconnectAccount(acc.id)} style={{ fontSize: '10px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Unlink size={9} /> Disconnetti
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ padding: '10px 16px' }}>
                  <button onClick={() => connectOutlook()} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Link size={10} /> Aggiungi account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Email list */}
        <div style={{ flex: 1, background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '10px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Inbox — {filteredEmails.length} messaggi
          </div>
          {loadingEmails ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <Loader size={16} color="#374151" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', color: '#374151' }}>Caricamento email...</span>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={32} color="#1f2937" style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '13px', color: '#1f2937' }}>
                {accounts.length === 0 ? 'Collega un account Outlook per vedere le email' : selectedAccount ? 'Nessuna email' : 'Seleziona un account'}
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

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
