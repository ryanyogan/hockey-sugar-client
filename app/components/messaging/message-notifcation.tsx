import { useEffect, useState } from "react";

interface Message {
  id: string;
  content: string;
  isUrgent: boolean;
  read: boolean;
  createdAt: string;
  sender: {
    id: string;
    name: string;
  };
}

interface MessageNotificationProps {
  messages: Message[];
  onMessageRead: (messageId: string) => void;
}

export function MessageNotification({
  messages,
  onMessageRead,
}: MessageNotificationProps) {
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter to only show unread messages
  useEffect(() => {
    const unreadMessages = messages.filter((m) => !m.read);
    setVisibleMessages(unreadMessages);
    setCurrentIndex(0);
  }, [messages]);

  // Auto-cycle through messages if there are multiple
  useEffect(() => {
    if (visibleMessages.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % visibleMessages.length);
    }, 5000); // Show each message for 5 seconds

    return () => clearInterval(interval);
  }, [visibleMessages]);

  // Auto-dismiss non-urgent messages after 10 seconds
  useEffect(() => {
    if (visibleMessages.length === 0) return;

    const currentMessage = visibleMessages[currentIndex];
    if (!currentMessage || currentMessage.isUrgent) return;

    const timer = setTimeout(() => {
      onMessageRead(currentMessage.id);
    }, 10000);

    return () => clearTimeout(timer);
  }, [visibleMessages, currentIndex, onMessageRead]);

  if (visibleMessages.length === 0) {
    return null;
  }

  const currentMessage = visibleMessages[currentIndex];
  const isUrgent = currentMessage.isUrgent;

  return (
    <div
      className={`fixed top-0 inset-x-0 z-50 p-4 transition-all ${
        isUrgent ? "bg-red-600 text-white" : "bg-blue-600 text-white"
      }`}
    >
      <div className="mx-auto max-w-screen-xl flex items-center justify-between">
        <div className="flex items-center">
          {isUrgent && (
            <svg
              className="h-6 w-6 mr-2 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          )}
          <div>
            <p className={`font-medium ${isUrgent ? "text-lg" : "text-base"}`}>
              {currentMessage.content}
            </p>
            <p className="text-sm opacity-80">
              From: {currentMessage.sender.name} •{" "}
              {new Date(currentMessage.createdAt).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {visibleMessages.length > 1 && (
            <div className="text-xs">
              {currentIndex + 1} / {visibleMessages.length}
            </div>
          )}

          <button
            onClick={() => onMessageRead(currentMessage.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              isUrgent
                ? "bg-white text-red-600 hover:bg-red-100"
                : "bg-white text-blue-600 hover:bg-blue-100"
            }`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
