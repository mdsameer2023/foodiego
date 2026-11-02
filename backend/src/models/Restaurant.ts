import { Schema, model } from 'mongoose';
const pointSchema = new Schema({type:{type:String,enum:['Point'],default:'Point'},coordinates:{type:[Number],required:true}}, {_id:false});
const schema = new Schema({
  demoId: {type:String,index:true,sparse:true,unique:true},
  name: {type:String,required:true,trim:true,maxlength:120},
  description: {type:String,required:true,maxlength:1000},
  cuisines: {type:[String],required:true},
  address: {type:String,required:true},
  city: {type:String,required:true,index:true},
  area: {type:String,required:true},
  location: {type:pointSchema,default:undefined},
  images: {type:[String],default:[]},
  offer: {type:String,default:''},
  rating: {type:Number,min:0,max:5,default:0},
  reviewCount: {type:Number,min:0,default:0},
  averageDeliveryTime: {type:Number,min:1,default:30},
  priceForTwo: {type:Number,min:0,required:true},
  openingHours: {type:String,default:'11:00–23:00'},
  isOpen: {type:Boolean,default:true},
  isApproved: {type:Boolean,default:false},
  managementStatus: {type:String,enum:['PENDING','APPROVED','REJECTED','SUSPENDED'],default:undefined},
  statusReason: {type:String,default:''},
  contactPhone: {type:String,default:''},
  hasVegetarianOptions: {type:Boolean,default:false},
  isPureVegetarian: {type:Boolean,default:false},
  isSample: {type:Boolean,default:false},
  ownerId: {type:Schema.Types.ObjectId,ref:'User',default:null},
  deliveryFeePaise: {type:Number,min:0,default:0},
  packagingFeePaise: {type:Number,min:0,default:0},
  taxRateBasisPoints: {type:Number,min:0,max:10000,default:0},
  codEnabled: {type:Boolean,default:true},
}, {timestamps:true,versionKey:false});
schema.index({name:'text',cuisines:'text',description:'text'});
schema.index({isApproved:1,city:1,rating:-1});
schema.index({isApproved:1,isOpen:1,city:1,rating:-1,_id:1});
schema.index({isApproved:1,name:1});
schema.index({isApproved:1,reviewCount:-1});
schema.index({isApproved:1,averageDeliveryTime:1});
schema.index({location:'2dsphere'});
export const Restaurant = model('Restaurant',schema);
