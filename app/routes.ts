// app/routes.ts
import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  // Public routes
  index("./routes/index.tsx"),
  route("login", "./routes/auth/login.tsx"),
  route("register", "./routes/auth/register.tsx"),
  route("logout", "./routes/auth/logout.tsx"),
  route("dashboard", "./routes/dashboard.tsx"),

  // Parent routes
  ...prefix("/parent", [
    layout("./routes/parent/layout.tsx", [
      index("./routes/parent/index.tsx"),
      route("add-athlete", "./routes/parent/add-child.tsx"),
      route("add-parent", "./routes/parent/add-parent.tsx"),
      route("messages", "./routes/parent/messages.tsx"),
      route("glucose-history", "./routes/parent/glucose-history.tsx"),
      route("manage-athletes", "./routes/parent/manage-athletes.tsx"),
      route("manage-parents", "./routes/parent/manage-parents.tsx"),
    ]),
  ]),

  route("api/auth/login", "./routes/api/auth/login.ts"),
  route("api/auth/register", "./routes/api/auth/register.ts"),
  route("api/auth/verify", "./routes/api/auth/verify.ts"),
  route("api/status", "./routes/api/status.ts"),
  route("api/alerts/acknowledge", "./routes/api/status/acknowledge.ts"),
  route("api/messages", "./routes/api/messages.ts"),
  route("api/messages/:messageId/read", "./routes/api/messages/read.ts"),
  route("api/glucose/history", "./routes/api/glucose/history.ts"),
  route("api/dexcom/token", "./routes/api/dexcom/token.ts"),
  route("api/dexcom/callback", "./routes/api/dexcom/callback.ts"),
] satisfies RouteConfig;
