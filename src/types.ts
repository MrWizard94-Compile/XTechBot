export interface BotSettings {
  keywords: string[];
  intervalMinutes: number;
  jitterMinutes: number;
  persona: string;
  customInstructions: string;
  xApiKey: string;
  xApiSecret: string;
  xAccessToken: string;
  xAccessTokenSecret: string;
  useLiveMode: boolean;
  autoApprove: boolean;
}

export interface XPost {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  text: string;
  timestamp: string;
  likes: number;
  retweets: number;
  category: string;
  url: string;
}

export interface ReplyDraft {
  id: string;
  postId: string;
  originalPost: XPost;
  replyText: string;
  status: 'draft' | 'pending' | 'approved' | 'posted' | 'failed' | 'dismissed';
  createdAt: string;
  postedAt?: string;
  error?: string;
}

export interface CrawlLog {
  id: string;
  timestamp: string;
  durationMs: number;
  status: 'success' | 'error';
  jitterSeconds: number;
  nextRunAt: string;
  postsFound: number;
  repliesGenerated: number;
  message: string;
}

export interface BotStatus {
  isRunning: boolean;
  totalCrawls: number;
  totalReplies: number;
  lastCrawlTime?: string;
  nextCrawlTime: string;
  activeJitter: number;
}
