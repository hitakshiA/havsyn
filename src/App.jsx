import { useState, useEffect, useRef, useCallback } from 'react'
import init, { WasmOrderbook } from '../wasm/kraken_wasm.js'

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD']
const WS_URL = 'wss://ws.kraken.com/v2'

// Precision settings for each symbol (price_precision, qty_precision)
// These match Kraken's decimal places for checksum calculation
const SYMBOL_PRECISION = {
  'BTC/USD': [1, 8],
  'ETH/USD': [2, 8],
  'SOL/USD': [2, 8],
  'XRP/USD': [5, 8],
  'ADA/USD': [6, 8],
}

// Color theme
const colors = {
  bg: '#0a0e14',
  card: '#0d1117',
  border: '#21262d',
  accent: '#00d9ff',
  bid: '#00ff88',
  ask: '#ff4444',
  text: '#b3b1ad',
  muted: '#484f58',
}

export default function App() {
  const [symbol, setSymbol] = useState(SYMBOLS[0])
  const [connected, setConnected] = useState(false)
  const [bids, setBids] = useState([])
  const [asks, setAsks] = useState([])
  const [spread, setSpread] = useState(null)
  const [midPrice, setMidPrice] = useState(null)
  const [updateCount, setUpdateCount] = useState(0)
  const [checksumValid, setChecksumValid] = useState(true)
  const [sdkReady, setSdkReady] = useState(false)

  // Refs for stable references
  const wsRef = useRef(null)
  const bookRef = useRef(null)
  const messageQueueRef = useRef([])
  const processingRef = useRef(false)
  const currentSymbolRef = useRef(symbol)
  const wasmInitRef = useRef(false)

  // Update ref when symbol changes
  useEffect(() => {
    currentSymbolRef.current = symbol
  }, [symbol])

  // Process one message from the queue - completely sequential
  const processNextMessage = useCallback(() => {
    if (processingRef.current) return
    if (messageQueueRef.current.length === 0) return
    if (!bookRef.current) return

    processingRef.current = true
    const msg = messageQueueRef.current.shift()

    try {
      const book = bookRef.current
      const result = book.apply_and_get(msg, 10)

      if (result && (result.msg_type === 'update' || result.msg_type === 'snapshot')) {
        setBids(result.bids.map(l => [l.price, l.qty]))
        setAsks(result.asks.map(l => [l.price, l.qty]))
        setSpread(result.spread)
        setMidPrice(result.mid_price)
        setUpdateCount(c => c + 1)
        setChecksumValid(true)
      }
    } catch (e) {
      console.warn('[HAVSYN] SDK error:', e.message || e)
      if (e.message && e.message.includes('Checksum')) {
        setChecksumValid(false)
      }
    } finally {
      processingRef.current = false
      if (messageQueueRef.current.length > 0) {
        setTimeout(processNextMessage, 0)
      }
    }
  }, [])

  // Queue a message for processing
  const queueMessage = useCallback((msg) => {
    messageQueueRef.current.push(msg)
    if (messageQueueRef.current.length > 100) {
      messageQueueRef.current = messageQueueRef.current.slice(-50)
    }
    processNextMessage()
  }, [processNextMessage])

  // Initialize WASM once
  useEffect(() => {
    if (wasmInitRef.current) return
    wasmInitRef.current = true

    console.log('[HAVSYN] Initializing Havklo SDK...')
    init().then(() => {
      console.log('[HAVSYN] SDK initialized')
      setSdkReady(true)
    }).catch(err => {
      console.error('[HAVSYN] Failed to initialize SDK:', err)
    })
  }, [])

  // Connect to WebSocket when SDK is ready and symbol changes
  useEffect(() => {
    if (!sdkReady) return

    let mounted = true

    // Clear previous state
    setBids([])
    setAsks([])
    setSpread(null)
    setMidPrice(null)
    setUpdateCount(0)
    setChecksumValid(true)
    messageQueueRef.current = []
    processingRef.current = false

    // Clean up previous orderbook
    if (bookRef.current) {
      try {
        bookRef.current.free()
      } catch (e) {
        // Ignore
      }
      bookRef.current = null
    }

    // Close previous WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Create new orderbook for this symbol
    console.log('[HAVSYN] Creating orderbook for', symbol)
    bookRef.current = WasmOrderbook.with_depth(symbol, 25)

    // Set precision for checksum calculation
    const [pricePrecision, qtyPrecision] = SYMBOL_PRECISION[symbol] || [2, 8]
    bookRef.current.set_precision(pricePrecision, qtyPrecision)
    console.log('[HAVSYN] Set precision:', pricePrecision, qtyPrecision)

    // Connect to WebSocket
    console.log('[HAVSYN] Connecting to', WS_URL)
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mounted) return
      console.log('[HAVSYN] WebSocket connected')
      setConnected(true)
      ws.send(JSON.stringify({
        method: 'subscribe',
        params: {
          channel: 'book',
          symbol: [symbol],
          depth: 25
        }
      }))
    }

    ws.onerror = (error) => {
      console.error('[HAVSYN] WebSocket error:', error)
    }

    ws.onmessage = (event) => {
      if (!mounted) return
      queueMessage(event.data)
    }

    ws.onclose = (event) => {
      console.log('[HAVSYN] WebSocket closed:', event.code)
      if (!mounted) return
      setConnected(false)
    }

    return () => {
      mounted = false
      if (ws) {
        ws.close()
      }
    }
  }, [sdkReady, symbol, queueMessage])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bookRef.current) {
        try {
          bookRef.current.free()
        } catch (e) {
          // Ignore
        }
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const maxQty = Math.max(
    ...bids.map(b => b[1]),
    ...asks.map(a => a[1]),
    1
  )

  const handleSymbolChange = (newSymbol) => {
    if (newSymbol !== symbol) {
      console.log('[HAVSYN] Switching to', newSymbol)
      setSymbol(newSymbol)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.bg,
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: colors.card,
        borderRadius: '12px',
        border: `1px solid ${colors.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: colors.accent
          }}>
            HAVSYN
          </span>
          <span style={{ color: colors.muted }}>|</span>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            background: sdkReady ? colors.accent : colors.muted,
            color: colors.bg,
            borderRadius: '4px',
            fontWeight: 'bold'
          }}>
            SDK
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{
            color: checksumValid ? colors.bid : colors.ask,
            fontSize: '11px'
          }}>
            {checksumValid ? 'CHECKSUM OK' : 'CHECKSUM ERR'}
          </span>
          <span style={{
            color: connected ? colors.bid : colors.ask,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connected ? colors.bid : colors.ask,
              animation: connected ? 'pulse 2s infinite' : 'none'
            }} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
          <span style={{ color: colors.muted }}>
            {updateCount} updates
          </span>
        </div>
      </header>

      {/* Symbol Selector */}
      <div style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        {SYMBOLS.map(s => (
          <button
            key={s}
            onClick={() => handleSymbolChange(s)}
            style={{
              padding: '8px 16px',
              background: s === symbol ? colors.accent : colors.card,
              color: s === symbol ? colors.bg : colors.text,
              border: `1px solid ${s === symbol ? colors.accent : colors.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: s === symbol ? 'bold' : 'normal',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        justifyContent: 'center'
      }}>
        <StatCard label="Mid Price" value={midPrice ? `$${formatStatPrice(midPrice)}` : '-'} />
        <StatCard label="Spread" value={spread ? `$${formatStatPrice(spread)}` : '-'} accent />
        <StatCard label="Best Bid" value={bids[0] ? `$${formatStatPrice(bids[0][0])}` : '-'} color={colors.bid} />
        <StatCard label="Best Ask" value={asks[0] ? `$${formatStatPrice(asks[0][0])}` : '-'} color={colors.ask} />
      </div>

      {/* Orderbook */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px'
      }}>
        {/* Bids */}
        <div style={{
          background: colors.card,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{
            color: colors.bid,
            marginBottom: '12px',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            BIDS (Buy Orders)
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {bids.length === 0 ? (
              <div style={{ color: colors.muted, textAlign: 'center', padding: '20px' }}>
                Loading...
              </div>
            ) : (
              bids.map(([price, qty]) => (
                <OrderRow
                  key={price}
                  price={price}
                  qty={qty}
                  maxQty={maxQty}
                  side="bid"
                />
              ))
            )}
          </div>
        </div>

        {/* Asks */}
        <div style={{
          background: colors.card,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{
            color: colors.ask,
            marginBottom: '12px',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            ASKS (Sell Orders)
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {asks.length === 0 ? (
              <div style={{ color: colors.muted, textAlign: 'center', padding: '20px' }}>
                Loading...
              </div>
            ) : (
              asks.map(([price, qty]) => (
                <OrderRow
                  key={price}
                  price={price}
                  qty={qty}
                  maxQty={maxQty}
                  side="ask"
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        color: colors.muted,
        fontSize: '12px'
      }}>
        Powered by <span style={{ color: colors.accent }}>Havklo SDK</span> |
        Real-time data from Kraken WebSocket v2
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        button:hover {
          opacity: 0.8;
        }
      `}</style>
    </div>
  )
}

function StatCard({ label, value, accent, color }) {
  return (
    <div style={{
      background: colors.card,
      borderRadius: '8px',
      border: `1px solid ${colors.border}`,
      padding: '12px 20px',
      textAlign: 'center',
      minWidth: '140px'
    }}>
      <div style={{ color: colors.muted, fontSize: '11px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{
        color: color || (accent ? colors.accent : colors.text),
        fontSize: '18px',
        fontWeight: 'bold'
      }}>
        {value}
      </div>
    </div>
  )
}

function formatPrice(price) {
  if (price >= 1000) return price.toFixed(2)
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

function formatStatPrice(price) {
  if (price >= 100) return price.toFixed(2)
  if (price >= 1) return price.toFixed(4)
  if (price >= 0.01) return price.toFixed(5)
  return price.toFixed(6)
}

function OrderRow({ price, qty, maxQty, side }) {
  const pct = (qty / maxQty) * 100
  const barColor = side === 'bid' ? colors.bid : colors.ask

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 12px',
      background: colors.bg,
      borderRadius: '6px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        [side === 'bid' ? 'left' : 'right']: 0,
        width: `${pct}%`,
        height: '100%',
        background: barColor,
        opacity: 0.15
      }} />

      {/* Content */}
      <span style={{
        flex: 1,
        color: barColor,
        fontWeight: '500',
        position: 'relative'
      }}>
        ${formatPrice(price)}
      </span>
      <span style={{
        color: colors.text,
        position: 'relative'
      }}>
        {qty.toFixed(4)}
      </span>
    </div>
  )
}
