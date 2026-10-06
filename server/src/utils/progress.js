const { AsyncLocalStorage } = require('async_hooks');

// What the bot is busy with while a reply is being worked out, for a widget
// that streams it: "searching", "writing", "thinking", "filing", "sending" or
// "connecting". The slow calls say so where they happen, and whichever
// request they are running for hears about it - so no flow has to pass a
// callback along. Outside a streaming request this does nothing.
//
// onText, when given, receives the reply itself as it is written: a piece of
// text to append, or null to clear what was sent so far (the model failed
// part way and another one starts over).
const storage = new AsyncLocalStorage();

function withProgress(onProgress, fn, onText = null) {
  let last = null;
  const report = (stage) => {
    if (stage === last) return;
    last = stage;
    onProgress(stage);
  };
  report.text = onText;
  return storage.run(report, fn);
}

function progress(stage) {
  const report = storage.getStore();
  if (report) report(stage);
}

function streamsText() {
  return Boolean(storage.getStore()?.text);
}

function streamText(piece) {
  storage.getStore()?.text?.(piece);
}

module.exports = { withProgress, progress, streamsText, streamText };
