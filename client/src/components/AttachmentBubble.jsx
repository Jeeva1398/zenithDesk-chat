function AttachmentBubble({ filename, addedToTicket }) {
  return (
    <div className="zd-message zd-message--user">
      <div className="zd-message__bubble zd-attachment">
        <span aria-hidden="true">📎</span>
        <span className="zd-attachment__name">{filename}</span>
        <span className="zd-attachment__note">
          {addedToTicket ? `Added to ticket #${addedToTicket}` : "We'll add this to your ticket"}
        </span>
      </div>
    </div>
  );
}

export default AttachmentBubble;
