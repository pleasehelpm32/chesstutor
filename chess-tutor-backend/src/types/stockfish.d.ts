declare module "stockfish" {
  interface StockfishEngine {
    onmessage: ((message: string) => void) | null;
    postMessage(message: string): void;
    removeListener(event: string, handler: (message: string) => void): void;
  }

  function stockfish(path?: string): StockfishEngine;
  export = stockfish;
}
