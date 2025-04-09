import { eventEmitter } from "~/lib/event-emitter.server";
import { requireParentUser } from "~/lib/session.server";

export async function loader({ request }: { request: Request }) {
  // Ensure the user is authenticated
  await requireParentUser(request);

  // Set up SSE headers
  const headers = new Headers();
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache");
  headers.set("Connection", "keep-alive");

  // Create a new ReadableStream for the SSE
  const stream = new ReadableStream({
    start(controller) {
      // Function to send data to the client
      const sendData = (data: any) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Listen for Dexcom data updates
      const handleDexcomUpdate = (data: any) => {
        sendData(data);
      };

      // Add event listener
      eventEmitter.on("dexcom-data-updated", handleDexcomUpdate);

      // Send an initial message to establish the connection
      sendData({ type: "connected" });

      // Clean up when the client disconnects
      request.signal.addEventListener("abort", () => {
        eventEmitter.off("dexcom-data-updated", handleDexcomUpdate);
        controller.close();
      });
    },
  });

  return new Response(stream, { headers });
}
