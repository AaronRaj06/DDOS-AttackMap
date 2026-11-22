import mongoose from 'mongoose';

const RETRY_MS = 30_000;

// Optional persistence: the map keeps working while MongoDB is down.
export function connectDB(uri, { onConnect, log = console } = {}) {
  if (!uri) return { save: null, close: async () => {} };
  let Event;
  let retry;
  let closed = false;
  let failing = false;

  async function connect() {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      if (closed) return await mongoose.disconnect();
      // Imported after connecting, so index builds never run against a closed connection
      Event = (await import('../models/Event.js')).default;
      log.info('MongoDB connected');
      await onConnect?.(Event);
    } catch (error) {
      log.error(`MongoDB unavailable: ${error.name}`);
      if (!closed && mongoose.connection.readyState !== 1) retry = setTimeout(connect, RETRY_MS);
    }
  }
  connect();

  return {
    async save(event) {
      if (!Event || mongoose.connection.readyState !== 1) return;
      try {
        await Event.create(event);
        failing = false;
      } catch (error) {
        if (!failing) log.error(`MongoDB save failed: ${error.name}`);
        failing = true;
      }
    },
    async close() {
      closed = true;
      clearTimeout(retry);
      await mongoose.disconnect();
    },
  };
}
