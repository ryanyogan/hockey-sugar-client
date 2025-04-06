import type { Route } from "../../+types/dashboard";

// Dexcom API endpoints
const DEXCOM_TOKEN_URL = "https://api.dexcom.com/v2/oauth2/token";
const SANDBOX_TOKEN_URL = "https://sandbox-api.dexcom.com/v2/oauth2/token";

// Use sandbox for development
const USE_SANDBOX = true;
const TOKEN_URL = USE_SANDBOX ? SANDBOX_TOKEN_URL : DEXCOM_TOKEN_URL;

// Replace with your actual client ID and secret
const CLIENT_ID = "7hb0UP16z9PSQgr7VAXziGOFhtMOAwVC";
const CLIENT_SECRET = "o5uesNyh9zY2gOGP";

// Determine if we're in development mode
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Set redirect URI based on environment
const REDIRECT_URI = IS_DEVELOPMENT
  ? "http://localhost:5173/api/dexcom/callback"
  : "https://hockey-sugar.fly.dev/api/dexcom/callback";

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const formData = await request.formData();
  const code = formData.get("code");
  const redirectUri = formData.get("redirectUri");

  if (!code || !redirectUri) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code.toString(),
        grant_type: "authorization_code",
        redirect_uri: redirectUri.toString(),
      }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Dexcom token error:", error);
    return new Response(JSON.stringify({ error: "Failed to get token" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
};
