import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget';
import widgetStyles from './widget.css?inline';

const MOUNT_ID = 'zenithdesk-chatbot-widget-root';

function mount() {
  if (document.getElementById(MOUNT_ID)) return;

  const host = document.createElement('div');
  host.id = MOUNT_ID;
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = widgetStyles;
  shadowRoot.appendChild(styleEl);

  const appRoot = document.createElement('div');
  shadowRoot.appendChild(appRoot);

  createRoot(appRoot).render(<ChatWidget />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
