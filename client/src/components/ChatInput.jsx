import { useRef, useState } from 'react';

function ChatInput({ onSend, disabled, placeholder, attachments }) {
  const [value, setValue] = useState('');
  const fileInputRef = useRef(null);

  function handleSubmit(event) {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
  }

  function handleFileChange(event) {
    const [file] = event.target.files;
    // Cleared so picking the same file again (after an error) still fires.
    event.target.value = '';
    if (file) attachments.onUpload(file);
  }

  return (
    <form className="zd-chat-input" onSubmit={handleSubmit}>
      {attachments && (
        <>
          <button
            type="button"
            className="zd-chat-input__attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.isUploading}
            aria-label="Attach a file"
            title="Attach a file"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={attachments.accept}
            onChange={handleFileChange}
            hidden
          />
        </>
      )}
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
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
