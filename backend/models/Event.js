import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  ts: { type: Date, required: true },
  source: { type: String, enum: ['radar', 'demo'], required: true },
  layer: { type: String, enum: ['l3', 'l7'], required: true },
  share: Number,
  src_country: String,
  src_name: String,
  src_lat: Number,
  src_lon: Number,
  dst_country: String,
  dst_name: String,
  dst_lat: Number,
  dst_lon: Number,
}, {
  // New collection: the old `events` schema and its 30-day index are incompatible
  collection: 'replay_events',
  bufferCommands: false,
  versionKey: false,
});

// About 90k events a day, so keep three days to fit a free Atlas cluster
eventSchema.index({ ts: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });

export default mongoose.model('Event', eventSchema);
