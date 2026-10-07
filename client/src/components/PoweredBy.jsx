import { Bolt } from './Icons';

// Leads to the Chat landing page, marked as coming from a widget so visits it
// brings in can be told apart.
const CHAT_LANDING_URL = 'https://chat.zenithdesk.site/?ref=widget';

// Off only when the org turns it off; a main app from before the setting
// sends nothing, which keeps it on.
function PoweredBy({ theme }) {
  if (theme.showPoweredBy === false) return null;
  return (
    <a className="zd-powered" href={CHAT_LANDING_URL} target="_blank" rel="noopener noreferrer">
      <Bolt className="zd-powered__icon" /> Powered by <strong>ZenithDesk</strong>
    </a>
  );
}

export default PoweredBy;
