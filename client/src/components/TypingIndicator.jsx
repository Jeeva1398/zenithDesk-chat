function TypingIndicator() {
  return (
    <div className="zd-message zd-message--assistant">
      <div className="zd-message__bubble zd-typing">
        <span className="zd-typing__dot" />
        <span className="zd-typing__dot" />
        <span className="zd-typing__dot" />
      </div>
    </div>
  );
}

export default TypingIndicator;
