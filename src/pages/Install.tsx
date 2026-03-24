import { useState } from 'react'
import { Copy, CheckCircle, Terminal, Server, Download } from 'lucide-react'

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'relative', marginTop: label ? '0' : '8px' }}>
      {label && <div style={{ fontSize: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>{label}</div>}
      <div style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '14px 16px', paddingRight: '44px', position: 'relative' }}>
        <pre style={{ fontFamily: 'monospace', fontSize: '12px', color: '#9ca3af', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
        <button onClick={copy} style={{
          position: 'absolute', top: '10px', right: '10px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: copied ? '#22c55e' : '#374151',
          display: 'flex',
        }}>
          {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#a78bfa' }}>
        {number}
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#e2e8f0', marginBottom: '12px' }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export default function Install() {
  const [activeTab, setActiveTab] = useState<'ea' | 'vps'>('ea')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>Install</h1>
        <p style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>Guida installazione EA MT5 e configurazione VPS</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['ea', 'vps'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '9px 18px', borderRadius: '9px', fontSize: '13px',
            background: activeTab === t ? 'rgba(124,58,237,0.15)' : 'transparent',
            border: `1px solid ${activeTab === t ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)'}`,
            color: activeTab === t ? '#a78bfa' : '#4b5563',
            cursor: 'pointer',
          }}>
            {t === 'ea' ? <Terminal size={13} /> : <Server size={13} />}
            {t === 'ea' ? 'Expert Advisor (EA)' : 'Configurazione VPS'}
          </button>
        ))}
      </div>

      {activeTab === 'ea' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            <Step number="1" title="Scarica il file EA">
              <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px', lineHeight: '1.6' }}>
                Scarica il file <code style={{ color: '#a78bfa', background: 'rgba(124,58,237,0.1)', padding: '1px 6px', borderRadius: '4px' }}>MatrixProHub_EA.ex5</code> e copialo nella cartella degli Expert Advisor di MetaTrader 5.
              </p>
              <button style={{
                display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#9ca3af', fontSize: '13px', cursor: 'pointer',
              }}>
                <Download size={13} /> Download EA (non disponibile — in costruzione)
              </button>
            </Step>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            <Step number="2" title="Percorso cartella EA">
              <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px', lineHeight: '1.6' }}>Copia il file .ex5 in questa cartella su MetaTrader 5:</p>
              <CodeBlock code="C:\Users\[TUO_UTENTE]\AppData\Roaming\MetaQuotes\Terminal\[ID_TERMINALE]\MQL5\Experts\" />
              <p style={{ fontSize: '12px', color: '#374151', marginTop: '8px' }}>Oppure usa il menu MT5: <span style={{ color: '#6b7280' }}>File → Apri cartella dati → MQL5 → Experts</span></p>
            </Step>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            <Step number="3" title="Configura l'EA nel grafico">
              <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '16px', lineHeight: '1.6' }}>
                Trascina l'EA su un grafico di qualsiasi simbolo. Nella finestra di configurazione imposta i seguenti parametri:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ParamRow name="API_URL" value="https://[NUOVO-SUPABASE].supabase.co/functions/v1/receive-mt5-data" desc="Endpoint Supabase (da configurare dopo)" />
                <ParamRow name="API_KEY" value="[generato nella pagina Accounts]" desc="Chiave univoca per questo account" />
                <ParamRow name="SYNC_INTERVAL_MIN" value="5" desc="Minuti minimo tra una sync e l'altra" />
                <ParamRow name="SYNC_INTERVAL_MAX" value="15" desc="Minuti massimo tra una sync e l'altra" />
              </div>
            </Step>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            <Step number="4" title="Abilita operazioni automatiche">
              <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px', lineHeight: '1.6' }}>
                In MetaTrader 5, assicurati che le operazioni automatiche siano abilitate:
              </p>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  'Strumenti → Opzioni → Expert Advisor → Consenti trading automatizzato',
                  'Nella barra strumenti: pulsante "Algo Trading" deve essere attivo (verde)',
                  'Sul grafico con l\'EA: assicurati che il semaforo sia verde',
                ].map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#4b5563' }}>
                    <CheckCircle size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: '1px' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </Step>
          </div>
        </div>
      )}

      {activeTab === 'vps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{ background: '#080808', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            <Step number="1" title="Connessione RDP al VPS">
              <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px', lineHeight: '1.6' }}>
                Usa Remote Desktop Connection (Windows) o Microsoft Remote Desktop (Mac) per connetterti al VPS con le credenziali nella sezione ID.
              </p>
              <CodeBlock label="Mac — comando alternativo" code="open rdp://[VPS_IP]" />
            </Step>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            <Step number="2" title="Script PowerShell — installazione MT5">
              <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px', lineHeight: '1.6' }}>Esegui come amministratore in PowerShell:</p>
              <CodeBlock code={`# Scarica e installa MetaTrader 5
$url = "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"
$output = "$env:TEMP\\mt5setup.exe"
Invoke-WebRequest -Uri $url -OutFile $output
Start-Process $output -ArgumentList "/auto" -Wait

Write-Host "MetaTrader 5 installato con successo" -ForegroundColor Green`} />
            </Step>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            <Step number="3" title="Avvio automatico MT5 al riavvio VPS">
              <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px', lineHeight: '1.6' }}>Per far partire MT5 automaticamente:</p>
              <CodeBlock code={`# Crea task schedulato per avvio automatico
$action = New-ScheduledTaskAction -Execute "C:\\Program Files\\MetaTrader 5\\terminal64.exe"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "MT5_AutoStart" -RunLevel Highest

Write-Host "Task schedulato creato" -ForegroundColor Green`} />
            </Step>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            <Step number="4" title="Note importanti">
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '8px', padding: '14px' }}>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    'Un VPS per operatore — non mischiare account di operatori diversi sullo stesso VPS',
                    'Mantieni il VPS sempre attivo — configura la gestione energetica su "Mai in standby"',
                    'Testa la connessione EA → Supabase prima di attivare il trading reale',
                    'Aggiorna le credenziali VPS nella pagina ID dopo ogni cambio password',
                  ].map((note, i) => (
                    <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#9ca3af' }}>
                      <span style={{ color: '#f59e0b', flexShrink: 0 }}>!</span>
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </Step>
          </div>
        </div>
      )}
    </div>
  )
}

function ParamRow({ name, value, desc }: { name: string; value: string; desc: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '7px', padding: '10px 14px', display: 'grid', gridTemplateColumns: '180px 1fr', gap: '12px', alignItems: 'center' }}>
      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#a78bfa' }}>{name}</span>
      <div>
        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6b7280' }}>{value}</div>
        <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>{desc}</div>
      </div>
    </div>
  )
}
