function MessageBubble({ role, content }) {
  const isUser = role === 'user';

  return (
    <div className={`zd-message zd-message--${isUser ? 'user' : 'assistant'}`}>
      <div className="zd-message__bubble">{content}</div>
    </div>
  );
}

export default MessageBubble;
