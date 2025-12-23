import { useState, useEffect, useRef } from 'react'
import initWasm, { WasmOrderbook } from 'kraken-wasm'

const SYMBOL = 'BTC/USD'
const WS_URL = 'wss://ws.kraken.com/v2'

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
  const [connected, setConnected] = useState(false)
  const [bids, setBids] = useState([])
  const [asks, setAsks] = useState([])
  const [spread, setSpread] = useState(null)
  const [midPrice, setMidPrice] = useState(null)
  const [updateCount, setUpdateCount] = useState(0)
  const wsRef = useRef(null)
  const orderbookRef = useRef(null)

  useEffect(() => {
    let mounted = true

    async function connect() {
      // Initialize WASM
      await initWasm()
      orderbookRef.current = new WasmOrderbook(SYMBOL)

      // Connect to Kraken WebSocket
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) return
        setConnected(true)
        // Subscribe to orderbook
        ws.send(JSON.stringify({
          method: 'subscribe',
          params: {
            channel: 'book',
            symbol: [SYMBOL],
            depth: 25
          }
        }))
      }

      ws.onmessage = (event) => {
        if (!mounted) return

        try {
          const book = orderbookRef.current
          // Apply the raw message directly - the WASM handles parsing
          const msgType = book.apply_message(event.data)

          if (msgType === 'snapshot' || msgType === 'update') {
            // Get prices
            const bestBid = book.get_best_bid()
            const bestAsk = book.get_best_ask()

            if (bestBid > 0 && bestAsk > 0) {
              setMidPrice(book.get_mid_price())
              setSpread(book.get_spread())
            }

            // Get top 10 levels
            const topBids = book.get_top_bids(10)
            const topAsks = book.get_top_asks(10)

            // Convert to array format [price, qty]
            setBids(topBids.map(l => [l.price, l.qty]))
            setAsks(topAsks.map(l => [l.price, l.qty]))
            setUpdateCount(c => c + 1)
          }
        } catch (e) {
          // Ignore non-book messages
        }
      }

      ws.onclose = () => {
        if (!mounted) return
        setConnected(false)
      }
    }

    connect()

    return () => {
      mounted = false
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const maxQty = Math.max(
    ...bids.map(b => b[1]),
    ...asks.map(a => a[1]),
    1
  )

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
          <span style={{ color: colors.text }}>{SYMBOL}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        justifyContent: 'center'
      }}>
        <StatCard label="Mid Price" value={midPrice ? `$${midPrice.toFixed(2)}` : '-'} />
        <StatCard label="Spread" value={spread ? `$${spread.toFixed(2)}` : '-'} accent />
        <StatCard label="Best Bid" value={bids[0] ? `$${bids[0][0].toFixed(2)}` : '-'} color={colors.bid} />
        <StatCard label="Best Ask" value={asks[0] ? `$${asks[0][0].toFixed(2)}` : '-'} color={colors.ask} />
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
            {bids.map(([price, qty], i) => (
              <OrderRow
                key={price}
                price={price}
                qty={qty}
                maxQty={maxQty}
                side="bid"
              />
            ))}
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
            {asks.map(([price, qty], i) => (
              <OrderRow
                key={price}
                price={price}
                qty={qty}
                maxQty={maxQty}
                side="ask"
              />
            ))}
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
        ${price.toFixed(2)}
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
