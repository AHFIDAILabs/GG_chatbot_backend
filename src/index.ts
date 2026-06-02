import express, { Application, Request, Response } from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import http from "http";

dotenv.config();

// ── Guard — crash early if critical env vars are missing ──────────────────────
const requiredEnvVars = [
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "GROQ_API_KEY",
];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
import authRoutes           from "./routes/authRoutes";
import chatRoutes           from "./routes/chatRoutes";
import trackerRoutes        from "./routes/trackerRoutes";
import wellbeingRoutes      from "./routes/wellbeingRoutes";
import goalsRoutes          from "./routes/goalsRoutes";
import facilitatorRoutes    from "./routes/facilitatorRoutes";
import inviteRoutes         from "./routes/inviteRoutes";
import adminRoutes          from "./routes/adminRoutes";
import directMessageRoutes  from "./routes/directMessageRoutes";

// ── Middleware ────────────────────────────────────────────────────────────────
import { errorHandler } from "./middlewares/errorHandler";
import { notFound } from "./middlewares/notFound";

// ── Socket.IO ─────────────────────────────────────────────────────────────────
import { initSocket } from "./config/socket";
import { embeddingsAvailable } from "./utils/embeddings";

// ─────────────────────────────────────────────
const app: Application = express();
const isDevelopment = process.env.NODE_ENV === "development";

// ============================================
// MIDDLEWARE
// ============================================

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://gg-chatbot-frontend.onrender.com",
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(isDevelopment ? morgan("dev") : morgan("combined"));

// ============================================
// DATABASE
// ============================================

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log("✅ MongoDB connected");
    mongoose.connection.on("error", (err) =>
      console.error("❌ MongoDB error:", err),
    );
    mongoose.connection.on("disconnected", () =>
      console.warn("⚠️  MongoDB disconnected"),
    );
    mongoose.connection.on("reconnected", () =>
      console.log("🔄 MongoDB reconnected"),
    );
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
};
connectDB();

// ============================================
// SOCKET.IO
// ============================================

const server = http.createServer(app);
initSocket(server);

// ============================================
// HEALTH CHECK
// ============================================

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Amara API is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV ?? "development",
    embeddings: embeddingsAvailable() ? "vector" : "keyword-fallback",
  });
});

app.get("/api/v1", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Welcome to the Amara API — GGCL Green Girls Academy",
    version: "1.0.0",
    endpoints: {
      auth:        "/api/v1/auth",
      chat:        "/api/v1/chat",
      tracker:     "/api/v1/tracker",
      wellbeing:   "/api/v1/wellbeing",
      goals:       "/api/v1/goals",
      facilitator: "/api/v1/facilitator",
      invite:      "/api/v1/invite",
    },
  });
});

// ============================================
// ROUTES
// ============================================

app.use("/api/v1/auth",        authRoutes);
app.use("/api/v1/chat",        chatRoutes);
app.use("/api/v1/tracker",     trackerRoutes);
app.use("/api/v1/wellbeing",   wellbeingRoutes);
app.use("/api/v1/goals",       goalsRoutes);
app.use("/api/v1/facilitator", facilitatorRoutes);
app.use("/api/v1/invite",      inviteRoutes);
app.use("/api/v1/admin",       adminRoutes);
app.use("/api/v1/messages",    directMessageRoutes);

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFound);
app.use(errorHandler);

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

let isShuttingDown = false;

const gracefulShutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received. Shutting down gracefully...`);
  setTimeout(() => {
    console.error("⚠️  Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  try {
    server.close(() => console.log("✅ HTTP server closed"));
    await mongoose.connection.close();
    console.log("✅ MongoDB connection closed");
    console.log("🎉 Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("uncaughtException", (err: Error) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err.name, err.message, err.stack);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ UNHANDLED REJECTION:", reason);
});

// ============================================
// START
// ============================================

const PORT = process.env.PORT ?? 5000;

server.listen(PORT, () => {
  console.log(
    `\n🚀 Amara running in ${process.env.NODE_ENV ?? "development"} mode on port ${PORT}`,
  );
  console.log(
    `   Embeddings: ${embeddingsAvailable() ? "✅ HuggingFace vector search" : "⚠️  keyword fallback"}`,
  );
  if (isDevelopment) console.log("🔥 Hot reload active");
});

export default app;
