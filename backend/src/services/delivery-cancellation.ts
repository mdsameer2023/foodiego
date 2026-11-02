import { DeliveryAssignment } from '../models/DeliveryAssignment.js';
import { DeliveryPartner } from '../models/DeliveryPartner.js';
import type { Types } from 'mongoose';
export async function stopCancelledDelivery(orderId:string|Types.ObjectId){
  const row=await DeliveryAssignment.findOneAndUpdate({orderId,assignmentStatus:{$in:['OFFERED','ACCEPTED','PICKED_UP','ON_THE_WAY']}},{$set:{assignmentStatus:'CANCELLED',trackingEnabled:false,completionCodeHash:null},$push:{history:{status:'CANCELLED',at:new Date()}}},{returnDocument:'after'});
  if(row)await DeliveryPartner.updateOne({userId:row.deliveryPartnerId,activeDeliveryId:row._id},{$set:{activeDeliveryId:null,isAvailable:true,trackingEnabled:false,lastLocationUpdatedAt:null},$unset:{currentLocation:1}});
}
