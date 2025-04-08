# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development Mode

The application runs in development mode with both the WebSocket server and the development server running concurrently:

1. The WebSocket server runs on port 8080
2. The development server runs on port 5173
3. The WebSocket client automatically connects to the correct port based on the environment
4. Dexcom data is polled every 10 seconds in development mode for faster feedback

To start the development servers:

```bash
npm run dev
```

This will start:
- WebSocket server on port 8080 (using tsx to run TypeScript directly)
- Development server on port 5173

The WebSocket server will handle Dexcom polling and real-time updates, while the development server provides hot module replacement and other development features.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

## Dexcom Polling Implementation

The application includes a background polling mechanism for Dexcom data that:

1. Polls the Dexcom API every minute for new glucose readings
2. Updates the database with new readings
3. Notifies connected clients via WebSockets when new data is available

### Components

- **dexcom-scheduler.server.ts**: Server-side scheduler that polls Dexcom API and broadcasts updates
- **websocket.client.ts**: Client-side WebSocket connection for real-time updates
- **server-init.server.ts**: Server initialization that starts the WebSocket server and Dexcom scheduler

### How It Works

1. When the server starts, it initializes the WebSocket server and starts the Dexcom scheduler
2. The scheduler polls the Dexcom API every minute for all athletes with Dexcom tokens
3. When new data is available, it updates the database and broadcasts the update to all connected clients
4. The client-side WebSocket connection receives the updates and updates the UI in real-time

### Authentication Errors

If a Dexcom token expires, the scheduler will detect the authentication error and broadcast a message to all connected clients. The UI will then prompt the user to reconnect to Dexcom.

---

Built with ❤️ using React Router.
