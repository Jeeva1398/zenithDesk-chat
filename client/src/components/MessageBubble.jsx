function MessageBubble({ role, content, sources }) {
  const isUser = role === 'user';

  return (
    <div className={`zd-message zd-message--${isUser ? 'user' : 'assistant'}`}>
      <div className="zd-message__bubble">
        {content}
        {sources?.length > 0 && <div className="zd-message__sources">From: {sources.join(', ')}</div>}
      </div>
    </div>
  );
}

export default MessageBubble;
