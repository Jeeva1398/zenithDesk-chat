function QuickReplies({ chips, onSelect }) {
  return (
    <div className="zd-quick-replies" role="group" aria-label="Suggested replies">
      {chips.map((chip) => (
        <button key={chip} type="button" className="zd-quick-replies__chip" onClick={() => onSelect(chip)}>
          {chip}
        </button>
      ))}
    </div>
  );
}

export default QuickReplies;
