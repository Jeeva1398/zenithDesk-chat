import { Bolt } from './Icons';

// Off only when the org turns it off; a main app from before the setting
// sends nothing, which keeps it on.
function PoweredBy({ theme }) {
  if (theme.showPoweredBy === false) return null;
  return (
    <a className="zd-powered" href="https://zenithdesk.site" target="_blank" rel="noopener noreferrer">
      <Bolt className="zd-powered__icon" /> Powered by <strong>ZenithDesk</strong>
    </a>
  );
}

export default PoweredBy;
