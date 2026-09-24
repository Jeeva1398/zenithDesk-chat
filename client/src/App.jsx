import './widget.css';
import ChatWidget from './components/ChatWidget';

// Copy the key from the main app's Settings -> Chat widget into client/.env.
const WIDGET_KEY = import.meta.env.VITE_WIDGET_KEY || '';

function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h1>ZenithDesk Chatbot — Dev Sandbox</h1>
      <p>This page hosts the widget for local development. The floating chat button is in the bottom-right corner.</p>
      {!WIDGET_KEY && <p style={{ color: '#b91c1c' }}>Set VITE_WIDGET_KEY in client/.env to show the widget.</p>}
      <ChatWidget widgetKey={WIDGET_KEY} />
    </div>
  );
}

export default App;
