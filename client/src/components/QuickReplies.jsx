// variant "questions" is a list of full questions to ask next, drawn as
// stacked rows under a label rather than as short chips.
function QuickReplies({ chips, onSelect, label = null, variant = 'chips' }) {
  return (
    <div
      className={`zd-quick-replies${variant === 'questions' ? ' zd-quick-replies--questions' : ''}`}
      role="group"
      aria-label={label || 'Suggested replies'}
    >
      {label && <p className="zd-quick-replies__label">{label}</p>}
      {chips.map((chip) => (
        <button key={chip} type="button" className="zd-quick-replies__chip" onClick={() => onSelect(chip)}>
          {chip}
        </button>
      ))}
    </div>
  );
}

export default QuickReplies;
