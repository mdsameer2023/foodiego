import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  restaurantId: {type: Schema.Types.ObjectId, ref: 'Restaurant', required: true},
}, {timestamps: true, versionKey: false});
schema.index({userId: 1, restaurantId: 1}, {unique: true});
export const Favorite = model('Favorite', schema);
