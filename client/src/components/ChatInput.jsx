import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Paperclip } from './Icons';

const MAX_HEIGHT = 120;

// A message box that grows with what is typed. Enter sends; Shift+Enter
// starts a new line.
function ChatInput({ onSend, disabled, placeholder, attachments }) {
  const [value, setValue] = useState('');
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function send() {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    send();
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function handleFileChange(event) {
    const [file] = event.target.files;
    // Cleared so picking the same file again (after an error) still fires.
    event.target.value = '';
    if (file) attachments.onUpload(file);
  }

  return (
    <form className="zd-composer" onSubmit={handleSubmit}>
      <div className="zd-composer__box">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Message"
          maxLength={2000}
        />
        <div className="zd-composer__bar">
          {attachments && (
            <>
              <button
                type="button"
                className="zd-icon-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.isUploading}
                aria-label="Attach a file"
                title="Attach a file"
              >
                <Paperclip className="zd-icon" />
              </button>
              <input ref={fileInputRef} type="file" accept={attachments.accept} onChange={handleFileChange} hidden />
            </>
          )}
          <button type="submit" className="zd-send" disabled={disabled || !value.trim()} aria-label="Send">
            <ArrowUp className="zd-icon" />
          </button>
        </div>
      </div>
    </form>
  );
}

export default ChatInput;
