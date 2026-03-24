import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { RefreshCw, ArrowRightLeft, Zap, Target, Activity, Trash2, Play, RotateCcw } from 'lucide-react'
import {
  useTradeCrosses,
  getActiveSession,
  getItalianTime,
  autoGenerateCrosses,
  getUsedAccountIds,
  preloadDirectionsFromCrosses,
  TradeCross,
  CrossablePhase,
  PipRangeConfig,
  PropFirmRiskConfigMap,
} from '../hooks/useCrossTrading'
import { useManualPairStore } from '../stores/manualPairStore'
import { MT5Account } from '../types/mt5'
import { useMT5Accounts } from '../hooks/useMT5Accounts'
import { usePropFirmRiskMap, usePropFirmTargetRules, usePropFirmRiskConfigs, configsToMap } from '../hooks/usePropFirmConfigs'
import { useTradingPairConfigs } from '../hooks/useTradingPairConfigs'
import { usePipValues } from '../hooks/usePipValues'

// =====================================================
// SESSION CLOCK
// =====================================================
function SessionBadge() {
  const [time, setTime] = useState(getItalianTime())
  const [sessionInfo, setSessionInfo] = useState(getActiveSession())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getItalianTime())
      setSessionInfo(getActiveSession())
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  const sessionColors: Record<string, string> = {
    'ASIA':        '#3b82f6',
    'EUROPA':      '#22c55e',
    'PRE-USA':     '#f59e0b',
    'FUORI SESSIONE': '#6b7280',
  }
  const color = sessionColors[sessionInfo.name] ?? '#6b7280'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        background: color + '22',
        border: `1px solid ${color}55`,
        borderRadius: 8,
        padding: '5px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: sessionInfo.name !== 'FUORI SESSIONE' ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{ color, fontWeight: 600, fontSize: 13 }}>{sessionInfo.name}</span>
        {sessionInfo.session && (
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            ({sessionInfo.session.symbols.slice(0, 3).join(', ')}…)
          </span>
        )}
      </div>
      <span style={{ color: '#6b7280', fontSize: 13, fontFamily: 'monospace' }}>
        🕐 {time.formatted} CET
      </span>
    </div>
  )
}

// =====================================================
// ENGINE TYPE BADGE
// =====================================================
function EngineBadge({ engineType }: { engineType?: string | null }) {
  if (!engineType) return (
    <span style={{ color: '#6b7280', fontSize: 11 }}>Normal</span>
  )
  if (engineType === 'target') return (
    <span style={{
      background: '#3b82f622', border: '1px solid #3b82f655',
      color: '#3b82f6', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <Target size={11} /> Target
    </span>
  )
  if (engineType === 'explosion') return (
    <span style={{
      background: '#ef444422', border: '1px solid #ef444455',
      color: '#ef4444', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <Zap size={11} /> Esplosione
    </span>
  )
  return <span style={{ color: '#6b7280', fontSize: 11 }}>{engineType}</span>
}

// =====================================================
// STATUS BADGE
// =====================================================
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  suggested:  { label: 'Suggerito',  color: '#6b7280', bg: '#6b728022' },
  approved:   { label: 'Approvato',  color: '#f59e0b', bg: '#f59e0b22' },
  executed:   { label: 'Attivo',     color: '#22c55e', bg: '#22c55e22' },
  closed:     { label: 'Chiuso',     color: '#374151', bg: '#37415122' },
  cancelled:  { label: 'Annullato',  color: '#ef4444', bg: '#ef444422' },
}
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#6b728022' }
  return (
    <span style={{
      background: cfg.bg, border: `1px solid ${cfg.color}55`,
      color: cfg.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>
      {cfg.label}
    </span>
  )
}

// =====================================================
// PHASE TAB
// =====================================================
const PHASE_CONFIG: Record<CrossablePhase, { label: string; color: string }> = {
  fase1: { label: 'Fase 1', color: '#3b82f6' },
  fase2: { label: 'Fase 2', color: '#22c55e' },
  live:  { label: 'Live',   color: '#f59e0b' },
}

type CrossablePhaseTab = CrossablePhase | 'all'

// =====================================================
// DIRECTION BADGE
// =====================================================
function DirectionBadge({ dir }: { dir: string }) {
  const isBuy = dir === 'BUY'
  return (
    <span style={{
      background: isBuy ? '#22c55e22' : '#ef444422',
      border: `1px solid ${isBuy ? '#22c55e55' : '#ef444455'}`,
      color: isBuy ? '#22c55e' : '#ef4444',
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700,
    }}>
      {dir}
    </span>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function Trades() {
  // Data hooks
  const { accounts } = useMT5Accounts()
  const { crosses, isLoading, createMultipleCrosses, updateCrossStatus, activateCross, deleteCross, deleteAllCrosses, refetch } = useTradeCrosses()
  const { riskMap } = usePropFirmRiskMap()
  const { targetRulesMap } = usePropFirmTargetRules()
  const { values: pipValues } = usePipValues()
  const { challengeConfigs, liveConfigs } = useTradingPairConfigs()
  const { configs: riskConfigs } = usePropFirmRiskConfigs()
  const { forcedPairs, resetAfterGeneration } = useManualPairStore()

  // UI state
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [phaseFilter, setPhaseFilter] = useState<CrossablePhaseTab>('all')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingPhase, setGeneratingPhase] = useState<CrossablePhase | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const generateLockRef = useRef(false)

  // Used account IDs (each account max 1 active cross)
  const usedAccountIds = useMemo(() => getUsedAccountIds(crosses), [crosses])

  // Count available accounts per phase
  const phaseAccountCounts = useMemo(() => {
    const counts: Record<CrossablePhase, number> = { fase1: 0, fase2: 0, live: 0 }
    for (const a of accounts) {
      if (a.account_status === 'active' && !a.is_excluded_from_trades && !a.has_open_trades) {
        counts[a.phase as CrossablePhase]++
      }
    }
    return counts
  }, [accounts])

  const getPipConfigs = useCallback((phase: CrossablePhase): PipRangeConfig[] => {
    return (phase === 'live' ? liveConfigs : challengeConfigs)
  }, [challengeConfigs, liveConfigs])

  // Generate crosses for a phase
  const handleGenerate = useCallback(async (phase: CrossablePhase) => {
    if (generateLockRef.current) return
    generateLockRef.current = true
    setIsGenerating(true)
    setGeneratingPhase(phase)
    try {
      // Filter accounts to the selected phase only — autoGenerateCrosses groups by phase internally
      const phaseAccounts = accounts.filter(a =>
        a.phase === phase &&
        a.account_status === 'active' &&
        !a.is_excluded_from_trades &&
        !a.has_open_trades
      )
      const sharedTracker = preloadDirectionsFromCrosses(crosses, accounts)
      const riskConfigMap: PropFirmRiskConfigMap = configsToMap(riskConfigs)
      const pipConfigs = getPipConfigs(phase)

      const { suggestions } = autoGenerateCrosses(
        phaseAccounts,
        riskMap,
        usedAccountIds,
        crosses,
        sharedTracker,
        null,   // operatorName (deprecated, always null)
        pipConfigs,
        pipValues,
        riskConfigMap,
        undefined,
        targetRulesMap as unknown as Record<string, { fase1: number; fase2: number }>
      )

      if (suggestions.length === 0) {
        console.log(`[TRADES] Nessun incrocio generato per ${phase}`)
      } else {
        await createMultipleCrosses(suggestions)
        resetAfterGeneration()
        console.log(`[TRADES] ${suggestions.length} incroci creati per ${phase}`)
      }
    } catch (err) {
      console.error('[TRADES] Errore generazione:', err)
    } finally {
      setIsGenerating(false)
      setGeneratingPhase(null)
      generateLockRef.current = false
    }
  }, [accounts, crosses, riskMap, usedAccountIds, targetRulesMap, getPipConfigs, pipValues, riskConfigs, createMultipleCrosses, forcedPairs, resetAfterGeneration])

  const handleClearAll = useCallback(async () => {
    if (!window.confirm('Eliminare tutti gli incroci pianificati?')) return
    setIsClearing(true)
    try {
      await deleteAllCrosses()
    } finally {
      setIsClearing(false)
    }
  }, [deleteAllCrosses])

  // Build account lookup from crosses
  const accountMap = useMemo(() => {
    const m: Record<string, MT5Account> = {}
    for (const a of accounts) m[a.id] = a
    return m
  }, [accounts])

  // Filter crosses
  const filtered = useMemo(() => {
    return crosses.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (phaseFilter !== 'all') {
        const acctA = accountMap[c.account_a_id]
        const acctB = accountMap[c.account_b_id]
        if (acctA?.phase !== phaseFilter && acctB?.phase !== phaseFilter) return false
      }
      return true
    })
  }, [crosses, statusFilter, phaseFilter, accountMap])

  // Summary counts
  const counts = useMemo(() => {
    const r = { all: crosses.length, approved: 0, executed: 0, closed: 0, cancelled: 0, suggested: 0 }
    for (const c of crosses) {
      if (c.status === 'approved') r.approved++
      else if (c.status === 'executed') r.executed++
      else if (c.status === 'closed') r.closed++
      else if (c.status === 'cancelled') r.cancelled++
      else if (c.status === 'suggested') r.suggested++
    }
    return r
  }, [crosses])

  return (
    <div style={{ padding: '24px', background: '#000', minHeight: '100vh', color: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ArrowRightLeft size={22} color='#3b82f6' />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Incroci</h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '2px 0 0' }}>
              Genera e gestisci gli incroci automatici tra account
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SessionBadge />
          <button
            onClick={() => refetch()}
            style={{
              background: '#111', border: '1px solid #222', borderRadius: 8,
              padding: '8px 14px', color: '#9ca3af', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <RefreshCw size={14} />
            Aggiorna
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Totale', value: counts.all,      color: '#6b7280' },
          { label: 'Approvati', value: counts.approved,  color: '#f59e0b' },
          { label: 'Attivi',    value: counts.executed,  color: '#22c55e' },
          { label: 'Chiusi',    value: counts.closed,    color: '#374151' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#080808', border: '1px solid #1a1a1a', borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Phase generator buttons */}
      <div style={{
        background: '#080808', border: '1px solid #1a1a1a', borderRadius: 10,
        padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
              Genera Incroci
            </div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>
              Il sistema sceglie automaticamente engine, simboli e rischio per fase
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {(['fase1', 'fase2', 'live'] as CrossablePhase[]).map(phase => {
              const cfg = PHASE_CONFIG[phase]
              const count = phaseAccountCounts[phase]
              const busy = isGenerating && generatingPhase === phase
              return (
                <button
                  key={phase}
                  onClick={() => handleGenerate(phase)}
                  disabled={isGenerating}
                  style={{
                    background: busy ? cfg.color + '22' : '#111',
                    border: `1px solid ${cfg.color}55`,
                    borderRadius: 8, padding: '8px 16px', color: cfg.color,
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, fontWeight: 600, opacity: isGenerating && !busy ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {busy
                    ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Activity size={14} />
                  }
                  {cfg.label}
                  <span style={{
                    background: cfg.color + '33', borderRadius: 4,
                    padding: '1px 6px', fontSize: 11,
                  }}>
                    {count} acc
                  </span>
                </button>
              )
            })}
            {crosses.filter(c => c.status === 'approved' || c.status === 'suggested').length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={isClearing}
                style={{
                  background: '#111', border: '1px solid #ef444455', borderRadius: 8,
                  padding: '8px 14px', color: '#ef4444',
                  cursor: isClearing ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                }}
              >
                <Trash2 size={14} />
                Elimina tutti
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Status filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'approved', 'executed', 'closed', 'cancelled'] as const).map(s => {
            const labels: Record<string, string> = {
              all: `Tutti (${counts.all})`,
              approved: `Approvati (${counts.approved})`,
              executed: `Attivi (${counts.executed})`,
              closed: `Chiusi (${counts.closed})`,
              cancelled: `Annullati (${counts.cancelled})`,
            }
            const active = statusFilter === s
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  background: active ? '#3b82f622' : 'transparent',
                  border: `1px solid ${active ? '#3b82f6' : '#222'}`,
                  borderRadius: 6, padding: '5px 12px',
                  color: active ? '#3b82f6' : '#6b7280',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                {labels[s]}
              </button>
            )
          })}
        </div>
        <div style={{ width: 1, height: 24, background: '#222', margin: '0 4px' }} />
        {/* Phase filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'fase1', 'fase2', 'live'] as CrossablePhaseTab[]).map(p => {
            const labels: Record<string, string> = {
              all: 'Tutti', fase1: 'Fase 1', fase2: 'Fase 2', live: 'Live',
            }
            const colors: Record<string, string> = {
              all: '#6b7280', fase1: '#3b82f6', fase2: '#22c55e', live: '#f59e0b',
            }
            const active = phaseFilter === p
            const c = colors[p]
            return (
              <button
                key={p}
                onClick={() => setPhaseFilter(p)}
                style={{
                  background: active ? c + '22' : 'transparent',
                  border: `1px solid ${active ? c : '#222'}`,
                  borderRadius: 6, padding: '5px 12px',
                  color: active ? c : '#6b7280',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                {labels[p]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Crosses table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div>Caricamento incroci…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: '#080808', border: '1px solid #1a1a1a', borderRadius: 10,
          padding: 60, textAlign: 'center',
        }}>
          <ArrowRightLeft size={36} color='#333' style={{ marginBottom: 12 }} />
          <div style={{ color: '#6b7280', marginBottom: 4 }}>Nessun incrocio trovato</div>
          <div style={{ color: '#4b5563', fontSize: 13 }}>
            Premi "Genera Incroci" per avviare il motore automatico
          </div>
        </div>
      ) : (
        <div style={{
          background: '#080808', border: '1px solid #1a1a1a', borderRadius: 10,
          overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 100px 1fr 1fr 90px 90px 90px 80px 110px',
            padding: '10px 16px',
            borderBottom: '1px solid #1a1a1a',
            color: '#6b7280', fontSize: 11, fontWeight: 600,
          }}>
            <span>ENGINE</span>
            <span>SIMBOLO</span>
            <span>ACCOUNT A</span>
            <span>ACCOUNT B</span>
            <span>LOTS A/B</span>
            <span>RISCHIO</span>
            <span>RR</span>
            <span>STATO</span>
            <span style={{ textAlign: 'right' }}>AZIONI</span>
          </div>

          {filtered.map(cross => {
            const acctA = accountMap[cross.account_a_id]
            const acctB = accountMap[cross.account_b_id]
            const engineType = cross.weighted_type
            const isExpanded = expandedId === cross.id
            return (
              <div key={cross.id} style={{ borderBottom: '1px solid #111' }}>
                {/* Main row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : cross.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 100px 1fr 1fr 90px 90px 90px 80px 110px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    alignItems: 'center',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#0f0f0f')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <EngineBadge engineType={engineType} />
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>
                    {cross.symbol}
                  </span>
                  {/* Account A */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DirectionBadge dir={cross.account_a_direction} />
                    <span style={{ fontSize: 12, color: '#d1d5db' }}>
                      {acctA ? `${acctA.prop_firm_name} #${acctA.account_login}` : cross.account_a_id.slice(0, 8)}
                    </span>
                  </div>
                  {/* Account B */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DirectionBadge dir={cross.account_b_direction} />
                    <span style={{ fontSize: 12, color: '#d1d5db' }}>
                      {acctB ? `${acctB.prop_firm_name} #${acctB.account_login}` : cross.account_b_id.slice(0, 8)}
                    </span>
                  </div>
                  {/* Lots */}
                  <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
                    <div>{cross.account_a_lots.toFixed(2)}</div>
                    <div style={{ color: '#6b7280' }}>{cross.account_b_lots.toFixed(2)}</div>
                  </div>
                  {/* Risk */}
                  <div style={{ fontSize: 12 }}>
                    <div style={{ color: '#f59e0b' }}>{cross.risk_percentage_a.toFixed(1)}%</div>
                    <div style={{ color: '#f59e0b' }}>{cross.risk_percentage_b.toFixed(1)}%</div>
                  </div>
                  {/* RR */}
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{cross.risk_reward}</span>
                  {/* Status */}
                  <StatusBadge status={cross.status} />
                  {/* Actions */}
                  <div
                    style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {(cross.status === 'approved' || cross.status === 'suggested') && (
                      <button
                        onClick={() => activateCross(cross.id)}
                        title="Attiva (segna come eseguito)"
                        style={{
                          background: '#22c55e22', border: '1px solid #22c55e55',
                          borderRadius: 6, padding: '5px 7px', color: '#22c55e',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Play size={12} />
                      </button>
                    )}
                    {cross.status === 'executed' && (
                      <button
                        onClick={() => updateCrossStatus(cross.id, 'closed')}
                        title="Chiudi"
                        style={{
                          background: '#37415122', border: '1px solid #37415155',
                          borderRadius: 6, padding: '5px 7px', color: '#9ca3af',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                        }}
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                    {cross.status !== 'executed' && (
                      <button
                        onClick={() => deleteCross(cross.id)}
                        title="Elimina"
                        style={{
                          background: '#ef444422', border: '1px solid #ef444455',
                          borderRadius: 6, padding: '5px 7px', color: '#ef4444',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{
                    background: '#050505', borderTop: '1px solid #1a1a1a',
                    padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
                  }}>
                    <div>
                      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>ACCOUNT A</div>
                      {acctA ? (
                        <>
                          <div style={{ fontSize: 13 }}>{acctA.account_name}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>{acctA.prop_firm_name}</div>
                          <div style={{ color: '#9ca3af', fontSize: 12 }}>
                            Stage {acctA.stage} · ${acctA.current_balance?.toLocaleString() ?? acctA.account_size.toLocaleString()}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: '#6b7280', fontSize: 12 }}>{cross.account_a_id}</div>
                      )}
                    </div>
                    <div>
                      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>ACCOUNT B</div>
                      {acctB ? (
                        <>
                          <div style={{ fontSize: 13 }}>{acctB.account_name}</div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>{acctB.prop_firm_name}</div>
                          <div style={{ color: '#9ca3af', fontSize: 12 }}>
                            Stage {acctB.stage} · ${acctB.current_balance?.toLocaleString() ?? acctB.account_size.toLocaleString()}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: '#6b7280', fontSize: 12 }}>{cross.account_b_id}</div>
                      )}
                    </div>
                    <div>
                      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>DETTAGLI</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        <div>Stage diff: {cross.stage_difference}</div>
                        <div>Balance diff: ${cross.balance_difference?.toFixed(0)}</div>
                        {cross.notes && (
                          <div style={{ marginTop: 6, color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>
                            {cross.notes.length > 100 ? cross.notes.slice(0, 100) + '…' : cross.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.4 }
        }
      `}</style>
    </div>
  )
}
