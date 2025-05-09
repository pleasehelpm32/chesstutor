// src/utils/stockfishManager.ts
import path from "path";
import os from "os";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

// --- Configuration ---
function getStockfishExecutableName(): string {
  const platform = os.platform();
  if (platform === "darwin") {
    return "stockfish-mac"; // Ensure this matches your binary name in /bin
  } else if (platform === "linux") {
    return "stockfish-linux";
  } else if (platform === "win32") {
    return "stockfish.exe";
  } else {
    console.warn(
      `Unsupported platform: ${platform}, using default 'stockfish'`
    );
    return "stockfish"; // Fallback
  }
}

const stockfishExecutable = getStockfishExecutableName();
const stockfishPath =
  process.env.STOCKFISH_PATH ||
  path.join(__dirname, "../../bin", stockfishExecutable); // Path from dist/utils to project_root/bin

// --- State ---
let engineProcess: ChildProcessWithoutNullStreams | null = null;
let isEngineReady = false;
let stdoutBuffer = "";
let initializationPromise: Promise<void> | null = null;
let resolveInitialization: (() => void) | null = null;
let rejectInitialization: ((reason?: any) => void) | null = null;

const INITIALIZATION_TIMEOUT_MS = 15000; // 15 seconds for initialization

// --- Core Functions ---

function initializeStockfish(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  if (engineProcess && isEngineReady) return Promise.resolve();

  initializationPromise = new Promise((resolve, reject) => {
    resolveInitialization = resolve;
    rejectInitialization = reject;

    if (engineProcess) {
      console.log(
        "Stockfish process exists but may not be ready. Attempting to kill and restart."
      );
      engineProcess.kill();
      engineProcess = null;
    }

    isEngineReady = false;
    stdoutBuffer = "";

    try {
      console.log(`Attempting to spawn Stockfish from: ${stockfishPath}`);
      engineProcess = spawn(stockfishPath, [], {
        stdio: ["pipe", "pipe", "pipe"], // Important for controlling streams
      });

      // --- Stdin Event Handlers ---
      engineProcess.stdin.on("error", (err) => {
        console.error("Stockfish stdin ERROR:", err);
        if (rejectInitialization) {
          rejectInitialization(
            new Error(`Stockfish stdin error: ${err.message}`)
          );
          resolveInitialization = null; // Prevent multiple calls
          rejectInitialization = null;
        }
        // Consider killing the process if stdin errors out
        if (engineProcess) engineProcess.kill();
        engineProcess = null;
        isEngineReady = false;
        initializationPromise = null;
      });
      engineProcess.stdin.on("close", () => {
        console.warn("Stockfish stdin stream closed.");
        // This might indicate the process is dying or stdin is no longer usable
        if (!isEngineReady && rejectInitialization) {
          rejectInitialization(
            new Error("Stockfish stdin stream closed prematurely.")
          );
          resolveInitialization = null;
          rejectInitialization = null;
        }
      });
      // --- End Stdin Event Handlers ---

      // --- Process Event Handlers ---
      engineProcess.on("error", (err) => {
        console.error(
          "!!! Failed to spawn Stockfish process (on 'error') !!!",
          err
        );
        if (rejectInitialization) {
          rejectInitialization(err);
          resolveInitialization = null;
          rejectInitialization = null;
        }
        engineProcess = null;
        isEngineReady = false;
        initializationPromise = null;
      });

      engineProcess.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        let newlineIndex;
        while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
          const line = stdoutBuffer.substring(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);
          if (line) {
            // console.log(`Stockfish Manager Processing line: "${line}"`); // Verbose
            if (line === "uciok") {
              console.log("Stockfish UCI OK. Sending 'isready'...");
              const sentIsReady = sendCommand("isready");
              console.log(`sendCommand('isready') returned: ${sentIsReady}`);
              if (!sentIsReady && rejectInitialization) {
                const err = new Error(
                  "Failed to send 'isready' command after 'uciok'."
                );
                console.error(err.message);
                rejectInitialization(err);
                resolveInitialization = null;
                rejectInitialization = null;
              }
            } else if (line === "readyok") {
              console.log("Stockfish engine ready.");
              isEngineReady = true;
              if (resolveInitialization) {
                resolveInitialization();
                resolveInitialization = null; // Prevent multiple calls
                rejectInitialization = null;
              }
            }
          }
        }
      });

      engineProcess.stderr.on("data", (data: Buffer) => {
        console.error(`Stockfish stderr: ${data.toString().trim()}`);
        // Consider rejecting initialization if significant errors appear on stderr
      });

      engineProcess.on("close", (code) => {
        console.log(`Stockfish process exited with code ${code}.`);
        if (!isEngineReady && rejectInitialization) {
          // If it closes before ready
          rejectInitialization(
            new Error(`Stockfish process exited prematurely with code ${code}.`)
          );
          resolveInitialization = null;
          rejectInitialization = null;
        }
        engineProcess = null;
        isEngineReady = false;
        initializationPromise = null; // Allow re-initialization
      });
      // --- End Process Event Handlers ---

      if (engineProcess?.stdin?.writable) {
        sendCommand("uci");
        console.log(
          "Stockfish process spawned, sent 'uci', waiting for uciok/readyok..."
        );
      } else {
        console.error("Stockfish spawned but stdin not immediately writable.");
        const spawnError = new Error("Stockfish stdin not writable on spawn.");
        if (rejectInitialization) {
          rejectInitialization(spawnError);
          resolveInitialization = null;
          rejectInitialization = null;
        }
        initializationPromise = null;
        return initializationPromise; // Exit promise constructor
      }
    } catch (error) {
      console.error("!!! Exception during Stockfish spawn setup !!!", error);
      engineProcess = null;
      isEngineReady = false;
      if (rejectInitialization) {
        rejectInitialization(error);
        resolveInitialization = null;
        rejectInitialization = null;
      }
      initializationPromise = null;
    }
  });

  const initTimeout = setTimeout(() => {
    if (!isEngineReady && rejectInitialization) {
      console.error(
        `Stockfish initialization timed out after ${INITIALIZATION_TIMEOUT_MS}ms.`
      );
      rejectInitialization(new Error("Stockfish initialization timed out"));
      if (engineProcess && !engineProcess.killed) engineProcess.kill();
      engineProcess = null;
      isEngineReady = false;
      initializationPromise = null; // Reset promise
      resolveInitialization = null;
      rejectInitialization = null;
    }
  }, INITIALIZATION_TIMEOUT_MS);

  initializationPromise.finally(() => {
    clearTimeout(initTimeout);
    // Do not nullify resolveInitialization/rejectInitialization here
    // as they might be needed if finally runs before promise settles
  });

  return initializationPromise;
}

function sendCommand(command: string): boolean {
  const processExists = !!engineProcess;
  const isStdinWritable = !!engineProcess?.stdin?.writable;
  const isProcessKilled = !!engineProcess?.killed;

  if (processExists && isStdinWritable && !isProcessKilled) {
    // console.log(`Sending command: ${command}`); // Debugging
    engineProcess!.stdin.write(command + "\n");
    return true;
  } else {
    console.error(
      `Cannot send command "${command}": ProcessExists=${processExists}, StdinWritable=${isStdinWritable}, ProcessKilled=${isProcessKilled}`
    );
    return false;
  }
}

function isReady(): boolean {
  return !!engineProcess && isEngineReady;
}

function getEngineProcess(): ChildProcessWithoutNullStreams | null {
  return engineProcess;
}

function shutdownStockfish(): Promise<void> {
  return new Promise((resolve) => {
    if (engineProcess && !engineProcess.killed) {
      console.log("Attempting graceful shutdown of Stockfish...");
      // Remove listeners to prevent issues during shutdown
      engineProcess.stdout.removeAllListeners();
      engineProcess.stderr.removeAllListeners();
      const currentProcess = engineProcess; // Capture current process
      currentProcess.removeAllListeners("close"); // Remove existing close listener

      currentProcess.on("close", (code) => {
        console.log(
          `Stockfish process exited (during shutdown) with code ${code}.`
        );
        if (engineProcess === currentProcess) {
          // Ensure we are acting on the same process
          engineProcess = null;
          isEngineReady = false;
          initializationPromise = null;
        }
        resolve();
      });

      sendCommand("quit");

      const killTimeout = setTimeout(() => {
        if (currentProcess && !currentProcess.killed) {
          console.warn("Stockfish did not quit gracefully, forcing kill.");
          currentProcess.kill("SIGKILL");
          if (engineProcess === currentProcess) {
            engineProcess = null;
            isEngineReady = false;
            initializationPromise = null;
          }
          resolve();
        }
      }, 2000); // 2 second grace period

      currentProcess.on("exit", () => clearTimeout(killTimeout)); // Also listen for 'exit'
    } else {
      console.log("Stockfish process already stopped or never started.");
      resolve();
    }
  });
}

export const stockfishManager = {
  initialize: initializeStockfish,
  sendCommand,
  isReady,
  getProcess: getEngineProcess,
  shutdown: shutdownStockfish,
};
