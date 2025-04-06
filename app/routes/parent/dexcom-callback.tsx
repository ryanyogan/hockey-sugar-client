import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

// Dexcom API endpoints
const DEXCOM_TOKEN_URL = "https://api.dexcom.com/v2/oauth2/token";
const SANDBOX_TOKEN_URL = "https://sandbox-api.dexcom.com/v2/oauth2/token";

// Use sandbox for development
const USE_SANDBOX = true;
const TOKEN_URL = USE_SANDBOX ? SANDBOX_TOKEN_URL : DEXCOM_TOKEN_URL;

// Replace with your actual client ID and secret
const CLIENT_ID = "7hb0UP16z9PSQgr7VAXziGOFhtMOAwVC";
const CLIENT_SECRET = "o5uesNyh9zY2gOGP";
const REDIRECT_URI = "https://hockey-sugar.fly.dev/parent/dexcom-callback";

export default function DexcomCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [athleteId, setAthleteId] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the authorization code from the URL
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");

        // Check for errors
        if (error) {
          setStatus("error");
          setErrorMessage(`Authorization failed: ${error}`);
          return;
        }

        // Verify the state parameter to prevent CSRF attacks
        const storedState = localStorage.getItem("dexcom_auth_state");
        const storedAthleteId = localStorage.getItem("dexcom_auth_athlete_id");

        if (!storedState || !storedAthleteId || storedState !== state) {
          setStatus("error");
          setErrorMessage("Invalid state parameter. Please try again.");
          return;
        }

        setAthleteId(storedAthleteId);

        // Exchange the authorization code for access and refresh tokens
        const response = await fetch(TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code || "",
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

        // Store the tokens in localStorage
        localStorage.setItem(
          `dexcom_tokens_${storedAthleteId}`,
          JSON.stringify({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
          })
        );

        // Clear the state from localStorage
        localStorage.removeItem("dexcom_auth_state");
        localStorage.removeItem("dexcom_auth_athlete_id");

        setStatus("success");
      } catch (error) {
        console.error("Dexcom callback error:", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "An unknown error occurred"
        );
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="container max-w-md mx-auto py-12">
      <Card>
        <CardHeader>
          <CardTitle>Dexcom Connection</CardTitle>
          <CardDescription>
            {status === "loading" && "Connecting to Dexcom..."}
            {status === "success" && "Successfully connected to Dexcom"}
            {status === "error" && "Failed to connect to Dexcom"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
              <p className="text-gray-500">
                Processing your Dexcom authorization...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-gray-700 font-medium mb-2">
                Successfully connected to Dexcom!
              </p>
              <p className="text-gray-500 text-center mb-6">
                Your athlete's glucose readings will now be automatically
                retrieved and displayed on the dashboard.
              </p>
              <Link to={`/parent?athleteId=${athleteId}`}>
                <Button>Return to Dashboard</Button>
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <Link to={`/parent?athleteId=${athleteId}`}>
                <Button variant="outline">Return to Dashboard</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
