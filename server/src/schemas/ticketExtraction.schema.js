const { z } = require('zod');

const TicketExtractionSchema = z.object({
  category: z.enum(['billing', 'technical', 'account', 'bug', 'feature_request', 'general']).nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable(),
  summary: z.string().min(1).max(120).nullable(),
  description: z.string().min(1).nullable(),
  needs_more_info: z.boolean(),
  missing_fields: z.array(z.enum(['category', 'priority', 'summary', 'description'])).default([]),
});

module.exports = { TicketExtractionSchema };
