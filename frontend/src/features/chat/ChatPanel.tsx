export function ChatPanel() {
  return (
    <div data-testid="chat-panel">
      <div data-testid="message-list"></div>
      <input type="text" placeholder="Type a message..." />
    </div>
  );
}
