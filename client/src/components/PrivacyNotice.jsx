import { useState } from 'react';
import { Close, Info } from './Icons';

function storageKey(widgetKey) {
  return `zenithdesk-chatbot-privacy-dismissed:${widgetKey}`;
}

function isDismissed(widgetKey) {
  try {
    return window.localStorage.getItem(storageKey(widgetKey)) === '1';
  } catch {
    return false;
  }
}

// The org's reminder not to share sensitive details, until the visitor
// closes it. Empty text (the org turned it off) shows nothing.
function PrivacyNotice({ text, widgetKey }) {
  const [dismissed, setDismissed] = useState(() => isDismissed(widgetKey));
  if (!text || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey(widgetKey), '1');
    } catch {
      // Not remembered; it comes back on the next page.
    }
  };

  return (
    <div className="zd-privacy" role="note">
      <Info className="zd-icon zd-privacy__icon" />
      <span className="zd-privacy__text">{text}</span>
      <button type="button" className="zd-icon-button zd-icon-button--small" onClick={dismiss} aria-label="Dismiss notice">
        <Close className="zd-icon" />
      </button>
    </div>
  );
}

export default PrivacyNotice;
