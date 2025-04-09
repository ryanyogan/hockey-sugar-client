import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

// Use sandbox for development
const USE_SANDBOX = true;

// Determine if we're in development mode
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// Set redirect URI based on environment
const REDIRECT_URI = IS_DEVELOPMENT
  ? "http://localhost:5173/api/dexcom/callback"
  : "https://hockey-sugar.fly.dev/api/dexcom/callback";

// Replace with your actual client ID
const CLIENT_ID = "7hb0UP16z9PSQgr7VAXziGOFhtMOAwVC";

interface DexcomAuthProps {
  onAuthSuccess?: (data: { accessToken: string; refreshToken: string }) => void;
}

export function DexcomAuth({ onAuthSuccess }: DexcomAuthProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateAuth = () => {
    setIsLoading(true);
    setError(null);

    try {
      // Generate a random state value for CSRF protection
      const state = Math.random().toString(36).substring(2, 15);

      // Store the state in localStorage for verification
      if (typeof window !== "undefined") {
        localStorage.setItem("dexcom_auth_state", state);
      }

      // The auth URL to use
      const authUrl = USE_SANDBOX
        ? "https://sandbox-api.dexcom.com/v2/oauth2/login"
        : "https://api.dexcom.com/v2/oauth2/login";

      // Construct the authorization URL with the correct parameters
      const url = `${authUrl}?client_id=${encodeURIComponent(
        CLIENT_ID
      )}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
      )}&response_type=code&scope=offline_access&state=${encodeURIComponent(
        state
      )}`;

      // Redirect to Dexcom authorization page
      window.location.href = url;
    } catch (err) {
      setIsLoading(false);
      setError("Failed to initiate Dexcom authentication");
      console.error("Dexcom auth error:", err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect to Dexcom</CardTitle>
        <CardDescription>
          Connect your Dexcom account to automatically sync glucose readings
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button onClick={initiateAuth} disabled={isLoading} className="w-full">
          {isLoading ? "Connecting..." : "Connect to Dexcom"}
        </Button>
      </CardContent>
    </Card>
  );
}
