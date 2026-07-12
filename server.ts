import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import { BotSettings, BotStatus, CrawlLog, ReplyDraft, XPost } from "./src/types.js";
import { ollamaGenerate, ollamaInfo, ollamaHealthy } from "./src/ollama.js";

// Load environment variables (.env.local holds real secrets; it is gitignored)
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// SAFETY INVARIANT: this bot NEVER auto-posts to X. Replies are always created as drafts and
// only reach X through the explicit human approval endpoint (/api/queue/approve/:id).
const AUTO_POST_DISABLED = true;

// In-Memory Storage. X credentials load from .env.local (never hard-coded, never logged).
let settings: BotSettings = {
  keywords: ["generative AI", "LLM agents", "typescript", "reactjs", "tailwindcss"],
  intervalMinutes: 30,
  jitterMinutes: 5,
  persona: "Helpful Tech Architect",
  customInstructions:
    "Keep it constructive, positive, and technically accurate. Avoid hashtags unless highly relevant. Provide code snippets if it adds clear value, but keep it brief (under 280 chars total).",
  xApiKey: process.env.X_API_KEY || "",
  xApiSecret: process.env.X_API_SECRET || "",
  xAccessToken: process.env.X_ACCESS_TOKEN || "",
  xAccessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || "",
  useLiveMode: false,
  autoApprove: false, // hard-disabled; kept in the type only for UI display
};

// Honest empty start — no fabricated activity.
let status: BotStatus = {
  isRunning: false,
  totalCrawls: 0,
  totalReplies: 0,
  nextCrawlTime: "",
  activeJitter: 0,
};

let queue: ReplyDraft[] = [];
let crawlLogs: CrawlLog[] = [];
let systemConsoleLogs: string[] = [];

// Helper to initialize the X/Twitter client from user-context OAuth 1.0a credentials.
function getTwitterClient(config: BotSettings): TwitterApi {
  if (!config.xApiKey || !config.xApiSecret || !config.xAccessToken || !config.xAccessTokenSecret) {
    throw new Error("X API credentials are missing. Add them to .env.local (X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET).");
  }
  return new TwitterApi({
    appKey: config.xApiKey,
    appSecret: config.xApiSecret,
    accessToken: config.xAccessToken,
    accessSecret: config.xAccessTokenSecret,
  });
}

// Scheduler Timer Reference
let schedulerTimer: NodeJS.Timeout | null = null;

// Add console log helper
function addLog(msg: string) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${msg}`;
  systemConsoleLogs.push(entry);
  if (systemConsoleLogs.length > 200) {
    systemConsoleLogs.shift();
  }
  console.log(entry);
}

// Fast local synthetic posts for Sandbox mode — no LLM round-trip, never touches X. Sandbox
// exists to exercise the draft pipeline without X; these are clearly synthetic sample posts.
// (The real value is Live mode: real X posts -> local Ollama drafts replies.)
function generateSimulatedPosts(keywords: string[]): XPost[] {
  const authors = [
    { name: "Sophie Dev", handle: "soph_codes" },
    { name: "Marco Ruiz", handle: "marcode" },
    { name: "Devon Park", handle: "dev_park" },
    { name: "Cassie Lin", handle: "cassie_js" },
    { name: "Ari Novak", handle: "ari_builds" },
  ];
  const templates: ((k: string) => string)[] = [
    (k) => `Hot take: ${k} is quietly reshaping how we structure services. Boilerplate savings are real, but the cognitive overhead is underrated. Where have you landed?`,
    (k) => `Spent the afternoon migrating to ${k}. Startup is instant and builds are quick — but the mental-model shift took a minute. Worth it in the end?`,
    (k) => `Anyone else feel like ${k} finally made the daily feedback loop frictionless this year? Curious what tooling moved the needle for you.`,
    (k) => `Standardizing review around ${k} output is becoming our main line of defense. Prompt quality means nothing if it breaks in prod.`,
  ];
  const cats = ["Web Development", "AI/ML", "General Tech", "DevOps"];
  const count = Math.floor(Math.random() * 2) + 2; // 2 or 3
  const posts: XPost[] = [];
  for (let i = 0; i < count; i++) {
    const a = authors[Math.floor(Math.random() * authors.length)];
    const k = keywords[Math.floor(Math.random() * keywords.length)] || "modern tooling";
    const id = `sim-${Math.random().toString(36).substring(2, 9)}`;
    posts.push({
      id,
      authorName: a.name,
      authorHandle: a.handle,
      authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
      text: templates[Math.floor(Math.random() * templates.length)](k),
      timestamp: new Date().toISOString(),
      likes: Math.floor(Math.random() * 800) + 20,
      retweets: Math.floor(Math.random() * 120) + 5,
      category: cats[Math.floor(Math.random() * cats.length)],
      url: `https://x.com/${a.handle}/status/${id}`,
    });
  }
  return posts;
}

// Draft a thoughtful reply with the local model. Hard-capped to 280 chars.
async function generateThoughtfulReply(post: XPost, config: BotSettings): Promise<string> {
  try {
    addLog(`Drafting reply to @${post.authorHandle} via local Ollama (persona "${config.persona}")`);
    const prompt = `Draft an engaging, thoughtful, conversational reply to this tweet on X.

Original Tweet Author: ${post.authorName} (@${post.authorHandle})
Original Tweet Content: "${post.text}"
Topic Category: ${post.category}

Your persona:
- Title: ${config.persona}
- Guidelines: ${config.customInstructions}

CRITICAL CONSTRAINTS:
1. Must be under 280 characters.
2. Sound human, witty, insightful, or helpful. Do NOT sound like an AI assistant.
3. Add genuine technical value or a friendly constructive opinion that invites dialogue.
4. Avoid overusing hashtags or buzzwords.
5. Directly address the specific tech details in the original tweet.

Return ONLY the plain text of your reply. No quotes, no metadata.`;

    let reply = (await ollamaGenerate(prompt, { temperature: 0.6, num_predict: 220 })).trim();
    if (reply.startsWith('"') && reply.endsWith('"')) reply = reply.substring(1, reply.length - 1).trim();
    if (reply.startsWith("'") && reply.endsWith("'")) reply = reply.substring(1, reply.length - 1).trim();
    if (reply.length > 280) reply = reply.substring(0, 279).trimEnd();
    return reply;
  } catch (error: any) {
    addLog(`Ollama reply drafting failed: ${error.message}`);
    return `Great points on ${post.category} — lots of interesting exploration happening here. Thanks for sharing!`;
  }
}

// Crawl for posts (real X in Live mode, local sandbox otherwise) and DRAFT replies.
// Drafts are never posted here — posting is a separate, explicit human action.
async function executeCrawlAndReply(manual = false) {
  const startTime = Date.now();
  addLog(`Starting crawl process ${manual ? "(Manual Trigger)" : "(Scheduled Run)"}`);

  try {
    let posts: XPost[] = [];

    if (settings.useLiveMode) {
      addLog(`[Live Mode] Contacting X Search API for: "${settings.keywords.join(" OR ")}"`);
      try {
        const client = getTwitterClient(settings);
        const queryStr = `${settings.keywords.join(" OR ")} lang:en -is:retweet -is:reply`;
        const searchResult = await client.v2.search(queryStr, {
          max_results: 10,
          "tweet.fields": ["created_at", "public_metrics"],
          expansions: ["author_id"],
          "user.fields": ["name", "username", "profile_image_url"],
        });

        const tweets = searchResult.tweets || [];
        const users = searchResult.includes?.users || [];
        const userMap = new Map(users.map((u) => [u.id, u]));
        addLog(`[Live Mode] X API search returned ${tweets.length} tweets.`);

        for (const t of tweets) {
          if (queue.some((q) => q.originalPost.id === t.id)) continue;
          const user = userMap.get(t.author_id || "") as any;
          const metrics = t.public_metrics || { like_count: 0, retweet_count: 0 };
          posts.push({
            id: t.id,
            authorName: user?.name || "X User",
            authorHandle: user?.username || "x_user",
            authorAvatar: user?.profile_image_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
            text: t.text,
            timestamp: t.created_at || new Date().toISOString(),
            likes: metrics.like_count,
            retweets: metrics.retweet_count,
            category: "General Tech",
            url: `https://x.com/${user?.username || "x_user"}/status/${t.id}`,
          });
        }
      } catch (xErr: any) {
        addLog(`[Live Mode] X API query failed: ${xErr.message}. Falling back to sandbox simulation.`);
        posts = generateSimulatedPosts(settings.keywords);
      }
    } else {
      posts = generateSimulatedPosts(settings.keywords);
    }

    addLog(`Processing ${posts.length} new posts...`);
    let repliesCount = 0;

    for (const post of posts) {
      const replyText = await generateThoughtfulReply(post, settings);
      const draftId = `reply-${Math.random().toString(36).substring(2, 9)}`;
      const newDraft: ReplyDraft = {
        id: draftId,
        postId: post.id,
        originalPost: post,
        replyText,
        status: "draft", // ALWAYS a draft — posting requires explicit human approval
        createdAt: new Date().toISOString(),
      };
      queue.unshift(newDraft);
      repliesCount++;
      // No auto-post. AUTO_POST_DISABLED is enforced; drafts wait for /api/queue/approve/:id.
    }

    const duration = Date.now() - startTime;
    status.totalCrawls++;
    status.lastCrawlTime = new Date().toISOString();

    const newLog: CrawlLog = {
      id: `log-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      status: "success",
      jitterSeconds: status.activeJitter,
      nextRunAt: status.nextCrawlTime,
      postsFound: posts.length,
      repliesGenerated: repliesCount,
      message: `Crawl complete. Evaluated ${posts.length} posts and drafted ${repliesCount} replies (awaiting approval).`,
    };
    crawlLogs.unshift(newLog);
    if (crawlLogs.length > 50) crawlLogs.pop();

    addLog(`Crawl finished in ${duration}ms — ${repliesCount} drafts queued for your review.`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    addLog(`Crawl process failed: ${error.message}`);
    crawlLogs.unshift({
      id: `log-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      status: "error",
      jitterSeconds: status.activeJitter,
      nextRunAt: status.nextCrawlTime,
      postsFound: 0,
      repliesGenerated: 0,
      message: `Crawl execution failed: ${error.message}`,
    });
  }
}

// Post a reply. Only ever called by the explicit human approval endpoint. In sandbox mode it
// simulates; in Live mode it really replies via the X API — the one outward action, human-gated.
async function postReply(draft: ReplyDraft): Promise<boolean> {
  addLog(`Approving + posting reply ${draft.id} to @${draft.originalPost.authorHandle}...`);
  draft.status = "pending";
  try {
    if (settings.useLiveMode) {
      const client = getTwitterClient(settings);
      const safeText = draft.replyText.slice(0, 280); // hard guarantee: never exceed X's 280 limit
      addLog(`[Live Mode] Sending reply via X API v2 (replying to tweet ${draft.originalPost.id})...`);
      const response = await client.v2.reply(safeText, draft.originalPost.id);
      addLog(`[Live Mode] Reply published. Tweet ID: ${response.data.id}`);
      draft.status = "posted";
      draft.postedAt = new Date().toISOString();
      status.totalReplies++;
      return true;
    } else {
      addLog(`[Sandbox Mode] Simulating reply (nothing sent to X): "${draft.replyText}"`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      draft.status = "posted";
      draft.postedAt = new Date().toISOString();
      status.totalReplies++;
      addLog(`[Sandbox Mode] Simulated post complete.`);
      return true;
    }
  } catch (err: any) {
    addLog(`Failed to post reply ${draft.id}: ${err.message}`);
    draft.status = "failed";
    draft.error = err.message;
    return false;
  }
}

// Scheduler Engine Loop
function runScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  if (!status.isRunning) {
    addLog("Scheduler is stopped/paused.");
    return;
  }

  const baseMs = settings.intervalMinutes * 60 * 1000;
  const maxJitterMs = settings.jitterMinutes * 60 * 1000;
  const activeJitterMs = Math.floor((Math.random() * 2 - 1) * maxJitterMs);
  const totalDelayMs = Math.max(10 * 1000, baseMs + activeJitterMs);

  status.activeJitter = Math.floor(activeJitterMs / 1000);
  const nextRun = new Date(Date.now() + totalDelayMs);
  status.nextCrawlTime = nextRun.toISOString();

  addLog(`Next crawl scheduled at ${nextRun.toLocaleTimeString()} (base ${settings.intervalMinutes}m + jitter ${status.activeJitter}s)`);

  schedulerTimer = setTimeout(async () => {
    await executeCrawlAndReply();
    runScheduler();
  }, totalDelayMs);
}

// API Endpoints

// Get bot status (+ local engine info). Secrets are masked, never returned.
app.get("/api/status", (req, res) => {
  res.json({
    status,
    engine: { ...ollamaInfo(), autoPostDisabled: AUTO_POST_DISABLED },
    settings: {
      ...settings,
      xApiKey: settings.xApiKey ? "••••••••" : "",
      xApiSecret: settings.xApiSecret ? "••••••••" : "",
      xAccessToken: settings.xAccessToken ? "••••••••" : "",
      xAccessTokenSecret: settings.xAccessTokenSecret ? "••••••••" : "",
    },
  });
});

// Local engine + config health for the UI (no secret values).
app.get("/api/health", async (req, res) => {
  const ollamaUp = await ollamaHealthy();
  const xConfigured = !!(settings.xApiKey && settings.xApiSecret && settings.xAccessToken && settings.xAccessTokenSecret);
  res.json({ ollama: { ...ollamaInfo(), up: ollamaUp }, xConfigured, liveMode: settings.useLiveMode, autoPostDisabled: AUTO_POST_DISABLED });
});

// Toggle Bot isRunning status
app.post("/api/status/toggle", (req, res) => {
  status.isRunning = !status.isRunning;
  addLog(`Bot scheduler toggled. Active: ${status.isRunning}`);
  if (status.isRunning) {
    runScheduler();
  } else {
    if (schedulerTimer) {
      clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }
    status.nextCrawlTime = "";
    status.activeJitter = 0;
  }
  res.json({ status });
});

// Get Bot Settings (secrets masked)
app.get("/api/settings", (req, res) => {
  res.json({
    ...settings,
    xApiKey: settings.xApiKey ? "••••••••" : "",
    xApiSecret: settings.xApiSecret ? "••••••••" : "",
    xAccessToken: settings.xAccessToken ? "••••••••" : "",
    xAccessTokenSecret: settings.xAccessTokenSecret ? "••••••••" : "",
  });
});

// Update Settings. Masked secrets are preserved; auto-post can never be enabled.
app.post("/api/settings", (req, res) => {
  const newSettings: BotSettings = req.body;
  const update: BotSettings = { ...newSettings };
  if (update.xApiKey === "••••••••") update.xApiKey = settings.xApiKey;
  if (update.xApiSecret === "••••••••") update.xApiSecret = settings.xApiSecret;
  if (update.xAccessToken === "••••••••") update.xAccessToken = settings.xAccessToken;
  if (update.xAccessTokenSecret === "••••••••") update.xAccessTokenSecret = settings.xAccessTokenSecret;

  if (newSettings.autoApprove) addLog("Auto-approve is disabled by design; ignoring the request to enable it.");
  update.autoApprove = false; // safety: posting is always human-gated

  settings = update;
  addLog("Settings updated.");
  if (status.isRunning) {
    addLog("Re-initializing scheduler with new settings...");
    runScheduler();
  }
  res.json({ success: true });
});

// Get Drafts / Queue
app.get("/api/queue", (req, res) => {
  res.json(queue);
});

// Trigger crawl now manually
app.post("/api/queue/trigger", async (req, res) => {
  addLog("Manual crawl requested via dashboard.");
  executeCrawlAndReply(true);
  res.json({ success: true, message: "Crawl triggered." });
});

// Edit a reply text
app.post("/api/queue/edit/:id", (req, res) => {
  const { id } = req.params;
  const { replyText } = req.body;
  const item = queue.find((q) => q.id === id);
  if (item) {
    item.replyText = String(replyText || "").substring(0, 280);
    item.status = "draft";
    addLog(`Reply draft ${id} edited.`);
    res.json({ success: true, item });
  } else {
    res.status(404).json({ success: false, message: "Draft not found" });
  }
});

// Dismiss / delete a reply
app.post("/api/queue/dismiss/:id", (req, res) => {
  const { id } = req.params;
  const index = queue.findIndex((q) => q.id === id);
  if (index !== -1) {
    queue[index].status = "dismissed";
    addLog(`Reply draft ${id} dismissed.`);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: "Draft not found" });
  }
});

// Approve & Post a Reply — the ONLY path that posts to X, and it requires this explicit action.
app.post("/api/queue/approve/:id", async (req, res) => {
  const { id } = req.params;
  const item = queue.find((q) => q.id === id);
  if (item) {
    const success = await postReply(item);
    res.json({ success, item });
  } else {
    res.status(404).json({ success: false, message: "Draft not found" });
  }
});

// Regenerate a reply (local Ollama)
app.post("/api/queue/regenerate/:id", async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body;
  const item = queue.find((q) => q.id === id);
  if (!item) {
    res.status(404).json({ success: false, message: "Draft not found" });
    return;
  }
  addLog(`Regenerating reply draft ${id} (feedback: "${feedback || "none"}")`);
  try {
    const prompt = `You previously drafted a reply to this tweet:
Author: ${item.originalPost.authorName} (@${item.originalPost.authorHandle})
Tweet: "${item.originalPost.text}"

Previous draft: "${item.replyText}"

Rewrite/regenerate this reply.
${feedback ? `USER FEEDBACK FOR THE REWRITE: "${feedback}"` : "Make it more natural, engaging, and in line with the persona."}

Persona:
- Title: ${settings.persona}
- Guidelines: ${settings.customInstructions}

CONSTRAINTS:
1. Under 280 characters.
2. Conversational, human, technically accurate, constructive.
3. Return ONLY the revised reply text. No quotes, no extra text.`;

    let updatedReply = (await ollamaGenerate(prompt, { temperature: 0.7, num_predict: 220 })).trim();
    if (updatedReply.startsWith('"') && updatedReply.endsWith('"')) updatedReply = updatedReply.substring(1, updatedReply.length - 1).trim();
    if (updatedReply.length > 280) updatedReply = updatedReply.substring(0, 279).trimEnd();

    item.replyText = updatedReply;
    item.status = "draft";
    addLog(`Regenerated reply draft ${id}.`);
    res.json({ success: true, item });
  } catch (err: any) {
    addLog(`Failed to regenerate reply draft ${id}: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get crawl and scheduler logs
app.get("/api/logs", (req, res) => {
  res.json({ crawlLogs, consoleLogs: systemConsoleLogs });
});

// Vite Middleware for development, static serve for production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    addLog(`XTechBot server running on http://localhost:${PORT} — engine: local Ollama (${ollamaInfo().model}), auto-post: DISABLED.`);
  });
}

startServer();
