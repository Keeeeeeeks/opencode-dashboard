export interface Message {
  id: number;
  type: 'task_complete' | 'error' | 'state_change' | 'custom' | 'worklog';
  content: string;
  todo_id?: string | null;
  session_id?: string | null;
  read: boolean | number;
  created_at: number;
}

export interface MessageFeedProps {
  messages: Message[];
  onMarkAsRead: (ids: number[]) => void;
  isLoading?: boolean;
}

export interface MessageCardProps {
  message: Message;
  onMarkAsRead: (id: number) => void;
}
