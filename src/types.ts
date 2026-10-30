export interface UserInfo {
    email:string;
    password:string; 
    pollEvLink: any; 
    discordURL: any; 
}

export interface ParsedPoll {
  question: string;
  answers: string[];
}
