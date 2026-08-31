function TicketConfirmation({ ticketId, summary }) {
  return (
    <div className="zd-message zd-message--assistant">
      <div className="zd-ticket-confirmation">
        <div className="zd-ticket-confirmation__icon">✓</div>
        <div>
          <div className="zd-ticket-confirmation__title">Ticket #{ticketId} created</div>
          <div className="zd-ticket-confirmation__summary">{summary}</div>
        </div>
      </div>
    </div>
  );
}

export default TicketConfirmation;
