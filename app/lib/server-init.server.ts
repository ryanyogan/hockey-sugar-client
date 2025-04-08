import {
  initializeWebSocketServer,
  startDexcomScheduler,
} from "~/lib/dexcom-scheduler.server";

// Initialize WebSocket server and Dexcom scheduler
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;
const NODE_ENV = process.env.NODE_ENV || "development";

// This function should be called when the server starts
export function initializeServer() {
  console.log(`Initializing server in ${NODE_ENV} mode...`);

  // Initialize WebSocket server
  initializeWebSocketServer(WS_PORT);

  // Start Dexcom scheduler
  startDexcomScheduler();

  // Handle process termination
  process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down gracefully...");
    // Clean up WebSocket connections and scheduler
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received. Shutting down gracefully...");
    // Clean up WebSocket connections and scheduler
    process.exit(0);
  });

  console.log(
    `Server initialization complete. WebSocket server running on port ${WS_PORT}`
  );
}
