import { redirect } from "react-router";
import { db } from "~/lib/db.server";
import { requireParentUser } from "~/lib/session.server";
import type { Route } from "./+types/callback";

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

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireParentUser(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect(`/parent?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return redirect(
      `/parent?error=${encodeURIComponent("Missing required parameters")}`
    );
  }

  try {
    // Exchange the authorization code for access and refresh tokens
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Token exchange failed: ${
          errorData.error_description || response.statusText
        }`
      );
    }

    const data = await response.json();

    // Store the tokens in the database
    await db.dexcomToken.upsert({
      where: {
        userId: user.id,
      },
      update: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
      create: {
        userId: user.id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });

    return redirect(`/parent?success=true`);
  } catch (error) {
    console.error("Dexcom callback error:", error);
    return redirect(
      `/parent?error=${encodeURIComponent(
        error instanceof Error ? error.message : "An unknown error occurred"
      )}`
    );
  }
}
