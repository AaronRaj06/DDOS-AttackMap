// setTimeout fires immediately for delays above 2^31-1 ms
const MAX_DELAY = 2 ** 31 - 1;

// `task` resolves to the number of milliseconds until it should run again.
export function poll(task, { log = console } = {}) {
  let timer;
  let stopped = false;

  async function run() {
    let delay = 60_000;
    try {
      delay = await task();
    } catch (error) {
      log.error(`Background task failed: ${error.message}`);
    }
    if (!stopped) timer = setTimeout(run, Math.min(Math.max(delay, 1000), MAX_DELAY));
  }
  run();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
