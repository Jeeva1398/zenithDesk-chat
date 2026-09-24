import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget';
import widgetStyles from './widget.css?inline';

const MOUNT_ID = 'zenithdesk-chatbot-widget-root';

// Read now, while this script is executing: document.currentScript is null
// again by the time DOMContentLoaded fires.
//
//   <script src="https://chat.example.com/widget.js" data-key="zdw_..." defer></script>
//
// The API is whichever host served this file, unless data-api says otherwise.
const scriptTag = document.currentScript;
const widgetKey = scriptTag?.dataset.key || '';
const apiBaseUrl =
  scriptTag?.dataset.api || (scriptTag?.src ? new URL(scriptTag.src).origin : undefined);

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

  createRoot(appRoot).render(<ChatWidget widgetKey={widgetKey} apiBaseUrl={apiBaseUrl} />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
