import { useState } from 'react';

function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
  }

  return (
    <form className="zd-chat-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Describe your issue..."
        disabled={disabled}
        aria-label="Message"
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}

export default ChatInput;
