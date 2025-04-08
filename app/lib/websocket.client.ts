/**
 * WebSocket client for real-time updates
 */

// WebSocket connection
let ws: WebSocket | null = null;

// Event listeners
const eventListeners: { [key: string]: ((data: any) => void)[] } = {};

// Connection status
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds

// Get the WebSocket URL based on the environment
const getWebSocketUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const port =
    process.env.NODE_ENV === "development" ? "8080" : window.location.port;
  return `${protocol}//${host}:${port}`;
};

/**
 * Initialize the WebSocket connection
 */
export function initializeWebSocket() {
  if (ws) {
    console.log("WebSocket already initialized");
    return;
  }

  console.log("Initializing WebSocket connection...");
  const wsUrl = getWebSocketUrl();
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
    isConnected = true;
    reconnectAttempts = 0;
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected. Attempting to reconnect...");
    isConnected = false;
    ws = null;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(initializeWebSocket, RECONNECT_DELAY);
    } else {
      console.error("Max reconnection attempts reached");
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log("Received WebSocket message:", message);

      // Handle the message directly - no need to extract type and payload
      if (message.type && eventListeners[message.type]) {
        eventListeners[message.type].forEach((listener) => listener(message));
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  };
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(message: any) {
  const { type, ...data } = message;

  // Call all listeners for this message type
  if (eventListeners[type]) {
    eventListeners[type].forEach((listener) => listener(data));
  }
}

/**
 * Add an event listener for a specific message type
 */
export function addEventListener(
  type: string,
  callback: (data: any) => void
): () => void {
  if (!eventListeners[type]) {
    eventListeners[type] = [];
  }
  eventListeners[type].push(callback);

  // Return cleanup function
  return () => {
    eventListeners[type] = eventListeners[type].filter((cb) => cb !== callback);
  };
}

/**
 * Remove all event listeners
 */
export function removeAllEventListeners() {
  Object.keys(eventListeners).forEach((type) => {
    eventListeners[type] = [];
  });
}

/**
 * Close the WebSocket connection
 */
export function closeWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

/**
 * Check if the WebSocket is connected
 */
export function isWebSocketConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}
