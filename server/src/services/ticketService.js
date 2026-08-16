const logger = require('../utils/logger');

let fakeTicketCounter = 0;

async function createTicket(payload) {
  fakeTicketCounter += 1;
  const ticket = {
    id: `fake-${fakeTicketCounter}`,
    status: 'open',
    ...payload,
  };

  logger.info(`[fake ticketService] created ticket: ${JSON.stringify(ticket)}`);
  return ticket;
}

module.exports = { createTicket };
