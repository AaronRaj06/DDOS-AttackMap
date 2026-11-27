import mongoose from 'mongoose';

const RETRY_MS = 30_000;

// Optional persistence: the map keeps working while MongoDB is down.
export function connectDB(uri, { onConnect, log = console } = {}) {
  if (!uri) return { save: null, saveSeries: null, close: async () => {} };
  let Event;
  let SeriesPoint;
  let retry;
  let closed = false;
  let failing = false;

  async function connect() {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      if (closed) return await mongoose.disconnect();
      // Imported after connecting, so index builds never run against a closed connection
      Event = (await import('../models/Event.js')).default;
      SeriesPoint = (await import('../models/SeriesPoint.js')).default;
      log.info('MongoDB connected');
      await onConnect?.({ Event, SeriesPoint });
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
    async saveSeries(layer, points) {
      if (!SeriesPoint || mongoose.connection.readyState !== 1) return;
      try {
        await SeriesPoint.bulkWrite(points.map(({ t, v }) => ({
          updateOne: { filter: { layer, t: new Date(t) }, update: { $set: { v } }, upsert: true },
        })), { ordered: false });
      } catch (error) {
        log.error(`MongoDB series save failed: ${error.name}`);
      }
    },
    async close() {
      closed = true;
      clearTimeout(retry);
      await mongoose.disconnect();
    },
  };
}
