import React, { useEffect, useState, useRef } from "react";
import {
  RefreshCw,
  Play,
  Square,
  Settings,
  Terminal,
  MessageSquare,
  Check,
  X,
  AlertTriangle,
  Cpu,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  ExternalLink,
  Sliders,
  Edit2,
  Sparkles,
  Info
} from "lucide-react";
import { BotSettings, BotStatus, CrawlLog, ReplyDraft } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "logs">("dashboard");
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [queue, setQueue] = useState<ReplyDraft[]>([]);
  const [crawlLogs, setCrawlLogs] = useState<CrawlLog[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  
  // Local loading states
  const [isCrawling, setIsCrawling] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  
  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  
  // Feedback popup state for regeneration
  const [feedbackTargetId, setFeedbackTargetId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  // System notification
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Countdown timer state
  const [countdown, setCountdown] = useState<string>("00:00");
  
  // Terminal scroll ref
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Trigger state fetches
  const [triggerFetch, setTriggerFetch] = useState<number>(0);

  // Notification helper
  const showNotification = (message: string, type: "success" | "error" | "info" = "info") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Fetch all data from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const statusRes = await fetch("/api/status");
        if (statusRes.ok) {
          const data = await statusRes.json();
          setStatus(data.status);
          setSettings(data.settings);
        }

        const queueRes = await fetch("/api/queue");
        if (queueRes.ok) {
          const data = await queueRes.json();
          setQueue(data);
        }

        const logsRes = await fetch("/api/logs");
        if (logsRes.ok) {
          const data = await logsRes.json();
          setCrawlLogs(data.crawlLogs);
          setConsoleLogs(data.consoleLogs);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      }
    };

    fetchData();
    
    // Poll every 10 seconds for updates
    const pollInterval = setInterval(fetchData, 10000);
    return () => clearInterval(pollInterval);
  }, [triggerFetch]);

  // Handle countdown calculation
  useEffect(() => {
    if (!status || !status.isRunning || !status.nextCrawlTime) {
      setCountdown("--:--");
      return;
    }

    const interval = setInterval(() => {
      const nextTime = new Date(status.nextCrawlTime).getTime();
      const diffMs = nextTime - Date.now();

      if (diffMs <= 0) {
        setCountdown("Crawling...");
        // Delay a bit and trigger state fetch
        setTimeout(() => setTriggerFetch(prev => prev + 1), 2000);
        clearInterval(interval);
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      const formattedMin = minutes.toString().padStart(2, "0");
      const formattedSec = seconds.toString().padStart(2, "0");
      
      setCountdown(`${formattedMin}:${formattedSec}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [status?.nextCrawlTime, status?.isRunning]);

  // Scroll to bottom of terminal when logs change
  useEffect(() => {
    if (activeTab === "logs" && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs, activeTab]);

  // Toggle scheduler running status
  const toggleScheduler = async () => {
    try {
      const res = await fetch("/api/status/toggle", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        showNotification(
          data.status.isRunning ? "Scheduler started successfully." : "Scheduler paused successfully.",
          "info"
        );
        setTriggerFetch(prev => prev + 1);
      }
    } catch (err) {
      showNotification("Failed to toggle scheduler.", "error");
    }
  };

  // Trigger manual crawl
  const triggerManualCrawl = async () => {
    setIsCrawling(true);
    showNotification("Triggering manual crawl. Checking tech posts on X...", "info");
    try {
      const res = await fetch("/api/queue/trigger", { method: "POST" });
      if (res.ok) {
        // Wait a few seconds for crawler to generate results
        setTimeout(() => {
          setIsCrawling(false);
          setTriggerFetch(prev => prev + 1);
          showNotification("Crawl completed. Review the drafted replies in the queue!", "success");
        }, 4000);
      } else {
        setIsCrawling(false);
        showNotification("Failed to start manual crawl.", "error");
      }
    } catch (err) {
      setIsCrawling(false);
      showNotification("Error communicating with server crawler.", "error");
    }
  };

  // Edit draft text
  const startEditing = (id: string, text: string) => {
    setEditingId(id);
    setEditingText(text);
  };

  const saveEditedText = async (id: string) => {
    try {
      const res = await fetch(`/api/queue/edit/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: editingText })
      });
      if (res.ok) {
        setEditingId(null);
        setTriggerFetch(prev => prev + 1);
        showNotification("Draft reply updated.", "success");
      }
    } catch (err) {
      showNotification("Failed to update draft.", "error");
    }
  };

  // Approve & Publish Reply
  const approveAndPost = async (id: string) => {
    setPublishingId(id);
    showNotification("Publishing reply to X...", "info");
    try {
      const res = await fetch(`/api/queue/approve/${id}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showNotification("Reply posted successfully to X!", "success");
        setTriggerFetch(prev => prev + 1);
      } else {
        showNotification(`Failed to post: ${data.item?.error || "Error"}`, "error");
      }
    } catch (err) {
      showNotification("Error communicating with post endpoint.", "error");
    } finally {
      setPublishingId(null);
    }
  };

  // Dismiss draft
  const dismissDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/queue/dismiss/${id}`, { method: "POST" });
      if (res.ok) {
        showNotification("Draft reply dismissed.", "info");
        setTriggerFetch(prev => prev + 1);
      }
    } catch (err) {
      showNotification("Failed to dismiss draft.", "error");
    }
  };

  // Trigger regeneration with feedback
  const handleRegenerate = async (id: string) => {
    setRegeneratingId(id);
    setFeedbackTargetId(null); // close modal
    showNotification("Regenerating reply with Ollama API...", "info");
    try {
      const res = await fetch(`/api/queue/regenerate/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedbackText })
      });
      if (res.ok) {
        showNotification("Reply successfully regenerated!", "success");
        setFeedbackText("");
        setTriggerFetch(prev => prev + 1);
      } else {
        showNotification("Failed to regenerate reply.", "error");
      }
    } catch (err) {
      showNotification("Error contacting Ollama server API.", "error");
    } finally {
      setRegeneratingId(null);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!settings) return;

    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        showNotification("Settings and scheduler timing updated successfully.", "success");
        setTriggerFetch(prev => prev + 1);
      } else {
        showNotification("Failed to save settings.", "error");
      }
    } catch (err) {
      showNotification("Error saving settings.", "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Update specific setting values in state
  const updateSetting = (key: keyof BotSettings, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [key]: value
    });
  };

  // Update keyword list tags
  const handleKeywordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.value.split(",").map(k => k.trim()).filter(k => k.length > 0);
    updateSetting("keywords", list);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans flex flex-col antialiased">
      {/* Top Banner / Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl max-w-md animate-bounce ${
            notification.type === "success"
              ? "bg-emerald-950/95 border-emerald-800 text-emerald-200"
              : notification.type === "error"
              ? "bg-red-950/95 border-red-800 text-red-200"
              : "bg-zinc-900/95 border-zinc-800 text-zinc-200"
          }`}
        >
          {notification.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {notification.type === "error" && <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
          {notification.type === "info" && <Info className="w-5 h-5 text-indigo-400 shrink-0" />}
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Control Rail */}
        <aside className="w-72 border-r border-zinc-800 bg-[#09090b] p-6 flex flex-col justify-between shrink-0">
          <div className="space-y-8">
            {/* Logo / Branding */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  X-Agent <span className="text-zinc-500 font-normal text-xs">v1.4.2</span>
                </h1>
                <p className="text-xs text-zinc-500">Active Monitoring</p>
              </div>
            </div>

            {/* Status Panel inside Sidebar */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">Scheduler Status</span>
                <button
                  onClick={toggleScheduler}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                    status?.isRunning
                      ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                  id="scheduler-toggle-btn"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status?.isRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                  {status?.isRunning ? "Active" : "Paused"}
                </button>
              </div>

              <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Next Crawl in:</span>
                  <span className="font-mono text-indigo-400 font-semibold text-sm">
                    {status?.isRunning ? countdown : "Paused"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Jitter Applied:</span>
                  <span className="font-mono text-zinc-300">
                    {status?.activeJitter ? `${status.activeJitter > 0 ? "+" : ""}${status.activeJitter}s` : "0s"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Active Mode:</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider font-semibold ${
                    settings?.useLiveMode 
                      ? "bg-red-500/10 text-red-400 border border-red-500/20" 
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}>
                    {settings?.useLiveMode ? "LIVE (X.com)" : "SANDBOX"}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="space-y-1.5">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "dashboard"
                    ? "bg-zinc-900/50 text-indigo-400 font-semibold border-l-2 border-indigo-500"
                    : "text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200"
                }`}
                id="nav-dashboard"
              >
                <MessageSquare className="w-5 h-5 shrink-0" />
                Draft Queue
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "settings"
                    ? "bg-zinc-900/50 text-indigo-400 font-semibold border-l-2 border-indigo-500"
                    : "text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200"
                }`}
                id="nav-settings"
              >
                <Sliders className="w-5 h-5 shrink-0" />
                Agent Settings
              </button>
              <button
                onClick={() => setActiveTab("logs")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "logs"
                    ? "bg-zinc-900/50 text-indigo-400 font-semibold border-l-2 border-indigo-500"
                    : "text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200"
                }`}
                id="nav-logs"
              >
                <Terminal className="w-5 h-5 shrink-0" />
                System Console
              </button>
            </nav>
          </div>

          {/* Quick Info / Signature */}
          <div className="space-y-4 pt-6 border-t border-zinc-800/60">
            <div className="bg-zinc-900/50 p-3.5 rounded-lg border border-zinc-800 flex items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-semibold">Total Crawled</span>
                <span className="text-sm font-mono font-bold text-zinc-200">{status?.totalCrawls || 0} runs</span>
              </div>
              <div className="h-6 w-px bg-zinc-800" />
              <div className="space-y-0.5 text-right">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-semibold">Replies Posted</span>
                <span className="text-sm font-mono font-bold text-indigo-400">{status?.totalReplies || 0} posts</span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-600 text-center font-mono">
              X Bot Dashboard • v1.1.0
            </p>
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 bg-[#0c0c0e] flex flex-col overflow-y-auto">
          
          {/* Header Action Bar */}
          <header className="border-b border-zinc-800 px-8 py-5 flex items-center justify-between shrink-0 bg-[#0c0c0e]/90 backdrop-blur sticky top-0 z-10">
            <div>
              <h2 className="text-xl font-bold text-white capitalize flex items-center gap-2">
                {activeTab === "dashboard" ? "Live Activity Feed" : activeTab === "settings" ? "Agent Automation Setup" : "Live Event Stream"}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {activeTab === "dashboard" 
                  ? "Approve, edit or regenerate AI-drafted replies to relevant developer and AI posts"
                  : activeTab === "settings"
                  ? "Configure crawl search keywords, scheduled interval timing, and Ollama AI personality guidelines"
                  : "Monitor automated backend crawls and API execution timestamps"
                }
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTriggerFetch(p => p + 1)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded-md border border-zinc-700 transition-colors text-zinc-300"
                title="Refresh Status"
                id="header-refresh-btn"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                onClick={triggerManualCrawl}
                disabled={isCrawling}
                className={`px-4 py-1.5 text-sm font-medium rounded-md shadow-lg transition-all ${
                  isCrawling
                    ? "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                }`}
                id="header-crawl-now-btn"
              >
                {isCrawling ? "Crawling..." : "Crawl & Draft Now"}
              </button>
            </div>
          </header>

          {/* Main Display Body */}
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-8">
            
            {/* TAB 1: DASHBOARD DRAFT QUEUE */}
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                
                {/* Sandbox Info Bar */}
                {!settings?.useLiveMode && (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex gap-4 items-start">
                    <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-md shrink-0">
                      <Sliders className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-zinc-200">Sandbox Simulation Mode Active</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        The agent is currently using a sandbox feed. When crawling, Ollama generates highly realistic dev and AI community posts, drafts thoughtful replies, and simulates posting. To post to actual X.com accounts, fill in your API credentials in <button onClick={() => setActiveTab("settings")} className="text-indigo-400 font-semibold underline hover:text-indigo-300">Settings</button> and enable Live Mode.
                      </p>
                    </div>
                  </div>
                )}

                {/* Queue Items */}
                <div className="space-y-6">
                  {queue.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-zinc-800 rounded-lg space-y-4">
                      <div className="mx-auto w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center text-zinc-500">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-zinc-300">No replies drafted yet</h3>
                        <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                          Click "Crawl & Draft Now" in the header to run the crawler right now or activate the scheduler!
                        </p>
                      </div>
                    </div>
                  ) : (
                    queue.filter(q => q.status !== "dismissed").map((item) => (
                      <div
                        key={item.id}
                        className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700/80 transition-all flex flex-col md:flex-row shadow-sm"
                        id={`queue-card-${item.id}`}
                      >
                        {/* Original X Post Column */}
                        <div className="p-5 md:w-1/2 border-b md:border-b-0 md:border-r border-zinc-800 flex flex-col justify-between bg-[#09090b]/25">
                          <div className="space-y-4">
                            {/* Author Row */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <img
                                  src={item.originalPost.authorAvatar}
                                  alt={item.originalPost.authorName}
                                  className="w-10 h-10 rounded-full border border-zinc-800 object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                    {item.originalPost.authorName}
                                    <span className="text-xs font-mono text-zinc-500 font-normal">
                                      @{item.originalPost.authorHandle}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-zinc-500 font-mono">
                                    {new Date(item.originalPost.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-300">
                                {item.originalPost.category}
                              </span>
                            </div>

                            {/* Tweet Text */}
                            <p className="text-sm text-zinc-400 italic mb-4 leading-relaxed font-sans">
                              "{item.originalPost.text}"
                            </p>
                          </div>

                          {/* Post Stats */}
                          <div className="flex items-center gap-4 mt-6 pt-4 border-t border-zinc-800/50 text-xs text-zinc-500 font-mono">
                            <span>Likes: <strong className="text-zinc-300">{item.originalPost.likes}</strong></span>
                            <span>Retweets: <strong className="text-zinc-300">{item.originalPost.retweets}</strong></span>
                            <a
                              href={item.originalPost.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 ml-auto flex items-center gap-1 hover:underline"
                            >
                              View tweet <ArrowUpRight className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>

                        {/* Automated Reply Column */}
                        <div className="p-5 md:w-1/2 flex flex-col justify-between space-y-4">
                          <div className="space-y-4">
                            {/* Header Status row */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                                <MessageSquare className="w-4 h-4 text-indigo-400" />
                                Thoughtful AI Reply Draft
                              </span>

                              {/* Status Badge */}
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider ${
                                item.status === "posted"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : item.status === "failed"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : item.status === "pending"
                                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse"
                                  : "bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                              }`}>
                                {item.status}
                              </span>
                            </div>

                            {/* Textarea or plain text depending on edit state */}
                            {editingId === item.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                                  rows={4}
                                  maxLength={280}
                                />
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-zinc-500 font-mono">
                                    {editingText.length}/280 characters
                                  </span>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded-md border border-zinc-700 text-zinc-300 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => saveEditedText(item.id)}
                                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium rounded-md text-white shadow-lg shadow-indigo-500/10 transition-colors"
                                    >
                                      Save Draft
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-zinc-950 border-l-2 border-indigo-500 p-4 rounded-r-lg min-h-[90px] relative group">
                                <p className="text-sm text-zinc-200 leading-relaxed font-sans">
                                  {item.replyText}
                                </p>
                                
                                {item.status !== "posted" && (
                                  <button
                                    onClick={() => startEditing(item.id, item.replyText)}
                                    className="absolute bottom-2 right-2 p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Edit Draft text"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Failure details if any */}
                            {item.status === "failed" && (
                              <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-3 rounded-lg text-xs flex gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                <div>
                                  <strong className="font-semibold block">Posting Error:</strong>
                                  {item.error || "Unknown communication issue with developer credentials."}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Action Bar */}
                          <div className="flex items-center gap-2 pt-4 border-t border-zinc-800/50">
                            {item.status !== "posted" ? (
                              <>
                                {/* Approve and Post */}
                                <button
                                  onClick={() => approveAndPost(item.id)}
                                  disabled={publishingId !== null || regeneratingId !== null || editingId === item.id}
                                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-medium py-1.5 px-3 rounded-md text-xs shadow-md shadow-emerald-500/10 transition-colors"
                                  id={`approve-btn-${item.id}`}
                                >
                                  {publishingId === item.id ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      Posting...
                                    </>
                                  ) : (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      Approve & Post
                                    </>
                                  )}
                                </button>

                                {/* Trigger feedback modal for regenerate */}
                                <button
                                  onClick={() => {
                                    setFeedbackTargetId(item.id);
                                    setFeedbackText("");
                                  }}
                                  disabled={publishingId !== null || regeneratingId !== null || editingId === item.id}
                                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-950 disabled:text-zinc-700 text-zinc-300 rounded-md border border-zinc-700 transition-colors text-xs flex items-center gap-1.5 font-medium shrink-0"
                                  title="Instruct Ollama to rewrite"
                                  id={`regen-btn-${item.id}`}
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${regeneratingId === item.id ? "animate-spin" : ""}`} />
                                  Regen
                                </button>

                                {/* Dismiss */}
                                <button
                                  onClick={() => dismissDraft(item.id)}
                                  disabled={publishingId !== null || regeneratingId !== null}
                                  className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                                  title="Dismiss Reply"
                                  id={`dismiss-btn-${item.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <div className="flex-1 bg-zinc-950 border border-zinc-900 text-zinc-500 p-2.5 rounded-lg text-xs flex items-center gap-2 font-mono justify-center">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                Posted successfully on {new Date(item.postedAt || "").toLocaleDateString()} at {new Date(item.postedAt || "").toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Regeneration Instructions Dialog (Absolute Popup overlay) */}
                {feedbackTargetId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 backdrop-blur-sm p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl">
                      <div className="flex items-center justify-between">
                        <h3 className="text-md font-bold text-white flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                          Regenerate Reply Draft
                        </h3>
                        <button
                          onClick={() => setFeedbackTargetId(null)}
                          className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs text-zinc-400">
                        Provide custom instructions or guidelines to help Ollama rewrite the drafted reply (e.g. <em>"Make it shorter"</em>, <em>"Make it witty and mention React Server Actions"</em>, or <em>"Suggest a constructive coding counterexample"</em>).
                      </p>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-300">Prompt / Rewrite Instructions</label>
                        <input
                          type="text"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          placeholder="e.g., sound more sarcastic and developer-focused"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                          id="feedback-input"
                          autoFocus
                        />
                      </div>

                      <div className="flex justify-end gap-2.5 pt-2">
                        <button
                          onClick={() => setFeedbackTargetId(null)}
                          className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded-md border border-zinc-700 transition-colors text-zinc-300 font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRegenerate(feedbackTargetId)}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-sm font-medium rounded-md shadow-lg shadow-indigo-500/20 text-white font-bold"
                          id="submit-feedback-btn"
                        >
                          Regenerate with Ollama
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: AGENT SETTINGS & KEYS */}
            {activeTab === "settings" && settings && (
              <form onSubmit={handleSaveSettings} className="space-y-8">
                
                {/* Search Configuration Section */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 space-y-6">
                  <div>
                    <h3 className="text-md font-bold text-white flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-indigo-400" />
                      Crawl & Automation Scope
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">Configure search query tags and scheduled task parameters</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-800/50">
                    
                    {/* Keywords Tag Inputs */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block">
                        Search Keywords & Hashtags (comma separated)
                      </label>
                      <input
                        type="text"
                        value={settings.keywords.join(", ")}
                        onChange={handleKeywordsChange}
                        placeholder="reactjs, generative ai, nextjs, typescript"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                        id="settings-keywords"
                      />
                      <span className="text-[10px] text-zinc-500 block leading-relaxed font-sans">
                        These keywords form the query string used to search relevant posts on X or feed the sandbox generator.
                      </span>
                    </div>

                    {/* Human-approval-only notice — auto-posting is disabled by design */}
                    <div className="space-y-1 bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-4" id="settings-approval-notice">
                      <label className="text-xs font-bold text-emerald-300 block">✓ Human approval required to post</label>
                      <span className="text-[10px] text-emerald-500/80 block leading-relaxed font-sans">
                        Every reply is drafted and held in the queue. Nothing is ever posted to X automatically — a reply only goes live when you click <strong>Approve &amp; Post</strong> on it. Auto-posting is disabled server-side.
                      </span>
                    </div>
                  </div>

                  {/* Intervals with Jitter Visualizer */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    
                    {/* Interval base */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block">
                        Base Crawl Interval (Minutes)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={settings.intervalMinutes}
                          onChange={(e) => updateSetting("intervalMinutes", Math.max(1, parseInt(e.target.value) || 30))}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 w-32 font-mono"
                          min={1}
                          id="settings-interval"
                        />
                        <span className="text-xs text-zinc-400">minutes</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 block font-sans">
                        The core background schedule frequency. Defaults to every 30 minutes.
                      </span>
                    </div>

                    {/* Jitter minutes */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block">
                        Random Jitter factor (Minutes)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={settings.jitterMinutes}
                          onChange={(e) => updateSetting("jitterMinutes", Math.max(0, parseInt(e.target.value) || 0))}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 w-32 font-mono"
                          min={0}
                          id="settings-jitter"
                        />
                        <span className="text-xs text-zinc-400">minutes +/- variation</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 block font-sans">
                        Adds dynamic variation to scheduler loops. If Base is 30m and Jitter is 5m, the crawl fires randomly every <strong>25 to 35 minutes</strong>.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ollama Personality Guidelines */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 space-y-6">
                  <div>
                    <h3 className="text-md font-bold text-white flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-indigo-400" />
                      Ollama Thoughtful Reply Generation Config
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">Refine the style, tone, and character guidelines of the AI auto-responder</p>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                    {/* Persona Selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block">Agent Persona Tone</label>
                      <select
                        value={settings.persona}
                        onChange={(e) => updateSetting("persona", e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                        id="settings-persona"
                      >
                        <option value="Helpful Tech Architect">Helpful Tech Architect (insightful, supportive, code-focused)</option>
                        <option value="Sassy Developer Influencer">Sassy Developer Influencer (opinionated, witty, playful sarcasm)</option>
                        <option value="Curious Junior Learner">Curious Junior Learner (inquiring, eager, open-minded)</option>
                        <option value="Constructive OSS REVIEWER">Constructive Open Source Reviewer (rigorous, detail-oriented, supportive)</option>
                      </select>
                    </div>

                    {/* Custom Instructions Prompt */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block">Custom System Instructions / Rules</label>
                      <textarea
                        value={settings.customInstructions}
                        onChange={(e) => updateSetting("customInstructions", e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                        rows={4}
                        placeholder="Define constraints, language styles, favorite topics, and strict taboos..."
                        id="settings-instructions"
                      />
                      <span className="text-[10px] text-zinc-500 block leading-relaxed font-sans">
                        These instructions are appended server-side to the Ollama API prompt to configure the generated response structure. Keep replies strictly under 280 characters to comply with X's maximum length.
                      </span>
                    </div>
                  </div>
                </div>

                {/* X API Developer Credentials */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-md font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-indigo-400" />
                        X (Twitter) Developer Credentials
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">Manage connection keys for publishing replies onto real X accounts</p>
                    </div>

                    {/* Enable Live Mode */}
                    <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-2 px-4 rounded-lg">
                      <label className="text-xs font-semibold text-zinc-300">Live API Mode</label>
                      <input
                        type="checkbox"
                        checked={settings.useLiveMode}
                        onChange={(e) => updateSetting("useLiveMode", e.target.checked)}
                        className="w-4.5 h-4.5 rounded border-zinc-800 text-indigo-500 focus:ring-indigo-500 accent-indigo-500"
                        id="settings-livemode"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* API Key */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-300">X API Key (Consumer Key)</label>
                        <input
                          type="password"
                          value={settings.xApiKey}
                          onChange={(e) => updateSetting("xApiKey", e.target.value)}
                          placeholder="Your Developer Consumer API Key"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
                          id="settings-x-key"
                        />
                      </div>

                      {/* API Key Secret */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-300">X API Key Secret (Consumer Secret)</label>
                        <input
                          type="password"
                          value={settings.xApiSecret}
                          onChange={(e) => updateSetting("xApiSecret", e.target.value)}
                          placeholder="Your Developer Consumer API Key Secret"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
                          id="settings-x-secret"
                        />
                      </div>

                      {/* Access Token */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-300">X Access Token</label>
                        <input
                          type="password"
                          value={settings.xAccessToken}
                          onChange={(e) => updateSetting("xAccessToken", e.target.value)}
                          placeholder="User OAuth Access Token"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
                          id="settings-x-token"
                        />
                      </div>

                      {/* Access Token Secret */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-300">X Access Token Secret</label>
                        <input
                          type="password"
                          value={settings.xAccessTokenSecret}
                          onChange={(e) => updateSetting("xAccessTokenSecret", e.target.value)}
                          placeholder="User OAuth Access Token Secret"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
                          id="settings-x-tokensecret"
                        />
                      </div>

                    </div>
                    <span className="text-[10px] text-zinc-500 block leading-relaxed font-sans">
                      To publish tweets via X API, you must configure a Twitter Developer App at <a href="https://developer.twitter.com" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">developer.twitter.com</a> with <strong>OAuth 1.0a User Context</strong> and <strong>Read and Write</strong> access permissions enabled, then copy these secrets.
                    </span>
                  </div>
                </div>

                {/* Form Footer */}
                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-md shadow-lg transition-all"
                    id="save-settings-btn"
                  >
                    {isSavingSettings ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Saving Config...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Save Agent Config
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: SYSTEM CONSOLE & LOGS */}
            {activeTab === "logs" && (
              <div className="space-y-6">
                
                {/* Historical Table */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6 space-y-4">
                  <div>
                    <h3 className="text-md font-bold text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-400" />
                      Crawl Execution History
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">Review past execution durations, jitter applied, and tweet matches found</p>
                  </div>

                  <div className="overflow-x-auto pt-2">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-400 font-mono">
                          <th className="py-3 px-4 font-semibold">Timestamp</th>
                          <th className="py-3 px-4 font-semibold">Status</th>
                          <th className="py-3 px-4 font-semibold">Duration</th>
                          <th className="py-3 px-4 font-semibold">Jitter Applied</th>
                          <th className="py-3 px-4 font-semibold text-center">Matches Found</th>
                          <th className="py-3 px-4 font-semibold text-center">Replies Generated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 text-zinc-300">
                        {crawlLogs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-zinc-500 italic">No crawls logged yet.</td>
                          </tr>
                        ) : (
                          crawlLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-zinc-900/20 font-mono">
                              <td className="py-3 px-4 whitespace-nowrap text-zinc-400">
                                {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`flex items-center gap-1 font-semibold ${log.status === "success" ? "text-emerald-400" : "text-red-400"}`}>
                                  {log.status === "success" ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Success
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="w-3.5 h-3.5" /> Failed
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">{(log.durationMs / 1000).toFixed(2)}s</td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {log.jitterSeconds ? `${log.jitterSeconds > 0 ? "+" : ""}${log.jitterSeconds}s` : "0s"}
                              </td>
                              <td className="py-3 px-4 text-center text-white">{log.postsFound}</td>
                              <td className="py-3 px-4 text-center text-indigo-400 font-bold">{log.repliesGenerated}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Real-time System Console */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <h4 className="text-sm font-bold text-white">Live System Terminal Log</h4>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">Auto-scroll Active</span>
                  </div>

                  <div className="bg-black/95 p-5 rounded-md border border-zinc-900 h-96 overflow-y-auto font-mono text-xs text-zinc-300 space-y-2 leading-relaxed selection:bg-indigo-600 selection:text-white">
                    {consoleLogs.map((logStr, idx) => {
                      // Colorize log levels for aesthetics
                      let colorClass = "text-zinc-400";
                      if (logStr.includes("Scheduler:")) colorClass = "text-amber-400/90";
                      if (logStr.includes("Crawler:")) colorClass = "text-indigo-400";
                      if (logStr.includes("Ollama API:")) colorClass = "text-fuchsia-400";
                      if (logStr.includes("Bot:")) colorClass = "text-emerald-400";
                      if (logStr.includes("Failed") || logStr.includes("Error")) colorClass = "text-red-400 font-semibold";
                      
                      return (
                        <div key={idx} className={colorClass}>
                          {logStr}
                        </div>
                      );
                    })}
                    <div ref={terminalEndRef} />
                  </div>
                </div>

              </div>
            )}

          </div>
        </main>

      </div>
    </div>
  );
}
