# Havsyn - Real-Time Orderbook Visualizer

A sleek, real-time cryptocurrency orderbook visualizer powered by the [Havklo SDK](https://github.com/hitakshiA/Havklo_sdk). Built to demonstrate how the SDK simplifies working with Kraken's WebSocket API.

## What This Demonstrates

I built this app to showcase the **Havklo SDK** - my Rust SDK for Kraken's trading APIs. Instead of manually parsing WebSocket messages and managing orderbook state, Havsyn uses the SDK's WASM bindings to:

- **Automatically manage orderbook state** - insertions, updates, deletions handled for you
- **Validate data integrity** - CRC32 checksum verification ensures your book matches Kraken's
- **Handle precision correctly** - different symbols have different decimal precision for checksums
- **Provide clean APIs** - `apply_and_get()` processes a message and returns current state in one call

## Features

- Real-time orderbook visualization for 5 trading pairs (BTC, ETH, SOL, XRP, ADA)
- Live spread and mid-price calculations
- Checksum validation status indicator
- Smooth symbol switching with fresh WebSocket sessions
- Dark theme optimized for trading

## Quick Start

```bash
# Clone the repository
git clone https://github.com/hitakshiA/havsyn.git
cd havsyn

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

## How It Works

The app uses **3 lines of SDK code** to manage the entire orderbook:

```javascript
import init, { WasmOrderbook } from './wasm/kraken_wasm.js'

// Initialize
await init()
const book = WasmOrderbook.with_depth('BTC/USD', 25)
book.set_precision(1, 8)  // Price precision, qty precision

// Process messages - SDK handles everything
const result = book.apply_and_get(websocketMessage, 10)
// result = { bids: [...], asks: [...], spread, mid_price, msg_type }
```

**Without the SDK**, you'd need to:
- Parse JSON messages and handle different message types
- Maintain sorted bid/ask maps
- Handle price level insertions, updates, and deletions
- Implement CRC32 checksum calculation with correct precision
- Track state across snapshots and updates

That's 200+ lines of error-prone code replaced by a few SDK calls.

## Tech Stack

- **React** - UI framework
- **Vite** - Build tool with WASM support
- **Havklo SDK (WASM)** - Kraken orderbook engine compiled to WebAssembly
- **Kraken WebSocket v2** - Real-time market data

## Project Structure

```
havsyn/
├── src/
│   ├── App.jsx      # Main application component
│   └── main.jsx     # React entry point
├── wasm/            # Havklo SDK WASM bindings
│   ├── kraken_wasm.js
│   ├── kraken_wasm.d.ts
│   └── kraken_wasm_bg.wasm
├── index.html
├── package.json
└── vite.config.js
```

## About

Built by **Hitakshi Arora** for the Kraken Forge Hackathon.

This is one of several example applications demonstrating the Havklo SDK. Check out the main SDK repository for more examples and documentation.

## License

MIT
