import './widget.css';
import ChatWidget from './components/ChatWidget';

function App() {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h1>ZenithDesk Chatbot — Dev Sandbox</h1>
      <p>This page hosts the widget for local development. The floating chat button is in the bottom-right corner.</p>
      <ChatWidget />
    </div>
  );
}

export default App;
