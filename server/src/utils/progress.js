const { AsyncLocalStorage } = require('async_hooks');

// What the bot is busy with while a reply is being worked out, for a widget
// that streams it: "searching", "writing", "thinking", "filing", "sending" or
// "connecting". The slow calls say so where they happen, and whichever
// request they are running for hears about it - so no flow has to pass a
// callback along. Outside a streaming request this does nothing.
const storage = new AsyncLocalStorage();

function withProgress(onProgress, fn) {
  let last = null;
  return storage.run(
    (stage) => {
      if (stage === last) return;
      last = stage;
      onProgress(stage);
    },
    fn,
  );
}

function progress(stage) {
  const report = storage.getStore();
  if (report) report(stage);
}

module.exports = { withProgress, progress };
