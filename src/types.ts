export interface UserInfo {
    email:string;
    firstName: string;
    lastName: string;
    password:string; 
    pollEvLink: string; 
    presenterName: string;
    discordURL: string; 
}

export interface ParsedPoll {
  question: string;
  answers: string[];
}

export interface BotInfo{
  BOT_TOKEN: string;
  CHANNEL_ID: string; 
  USER_ID: string; 
}

export interface PollIdentity {
  instanceId: string;
  poll: ParsedPoll;
}

export interface PollSuggestion {
  choice: number;
  explanation: string;
}

export interface DiscordReply {
  id: string;
  content: string;
  replyToId: string | null;
}

export interface SubmissionResult {
  status: 'confirmed' | 'failed' | 'uncertain';
  detail: string;
}
