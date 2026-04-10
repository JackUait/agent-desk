export interface Board {
  id: string;
  title: string;
  columns: Column[];
}

export interface Column {
  id: string;
  title: string;
  cardIds: string[];
}

export interface Card {
  id: string;
  title: string;
  description: string;
  status: string;
  agentName: string;
  messages: Message[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
