const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { getWidgetConfig } = require('../services/widgetConfigService');
const { allowsAnySite } = require('../config/env');

const WIDGET_KEY_HEADER = 'x-widget-key';

// Every widget request names its widget: in the URL for the config fetch, and
// in a header for everything after it (a header rather than a body field, so
// it reads the same on JSON and multipart requests).
//
// The Origin check is what stops another site copying the snippet. A widget
// has to name its sites before it works at all - an empty list is refused
// rather than read as "anywhere", unless ALLOW_ANY_SITE says otherwise for
// local development. A request with no Origin at all is not a browser, and a
// script can claim any Origin it likes anyway - this only ever constrains
// pages running in real browsers, which is who copies a snippet.
const resolveWidget = catchAsync(async (req, res, next) => {
  const publicKey = req.params.key || req.get(WIDGET_KEY_HEADER);
  const config = await getWidgetConfig(publicKey, req.ip);

  if (config.allowedDomains.length === 0 && !allowsAnySite()) {
    throw new AppError(
      'This chat widget has no allowed sites yet - add your website in Settings > Chat widget',
      403,
    );
  }

  const origin = req.get('origin');
  if (origin && config.allowedDomains.length > 0 && !config.allowedDomains.includes(origin)) {
    throw new AppError('This site is not allowed to use this chat widget', 403);
  }

  req.widget = { publicKey, ...config };
  next();
});

module.exports = resolveWidget;
