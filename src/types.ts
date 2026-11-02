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