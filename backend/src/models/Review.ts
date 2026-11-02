import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true},
  restaurantId: {type: Schema.Types.ObjectId, ref: 'Restaurant', required: true},
  rating: {type: Number, min: 1, max: 5, required: true},
  comment: {type: String, trim: true, minlength: 3, maxlength: 1000, required: true},
  isHidden: {type:Boolean,default:false},
  moderationReason: {type:String,default:''},
}, {timestamps: true, versionKey: false});
schema.index({userId: 1, restaurantId: 1}, {unique: true});
schema.index({restaurantId: 1, createdAt: -1});
schema.index({restaurantId: 1, rating: -1, createdAt: -1});
export const Review = model('Review', schema);
