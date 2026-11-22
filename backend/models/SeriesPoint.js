import mongoose from 'mongoose';

const seriesSchema = new mongoose.Schema({
  layer: { type: String, enum: ['l3', 'l7'], required: true },
  t: { type: Date, required: true },
  v: { type: Number, required: true },
}, { collection: 'radar_series', bufferCommands: false, versionKey: false });

seriesSchema.index({ layer: 1, t: 1 }, { unique: true });
// A week is more than the 3 days kept in memory
seriesSchema.index({ t: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model('SeriesPoint', seriesSchema);
