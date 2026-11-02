import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { Env } from '../config/env.js';
import { User } from '../models/User.js';
import { Address } from '../models/Address.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { addressSchema, addressPatchSchema } from '../validators/address.js';
import { changePasswordSchema, profileSchema } from '../validators/auth.js';
import { ApiError } from '../utils/errors.js';
import { clearAuthCookies, hashPassword, publicUser, verifyPassword } from '../services/auth.js';

export function userController(env: Env) {
  const profile: RequestHandler = (_req,res) => { res.json({data:{user:publicUser(res.locals.user)}}); };
  const updateProfile: RequestHandler = async (req,res) => {
    const input = profileSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(res.locals.user._id,{$set:input},{new:true,runValidators:true});
    res.json({data:{user:publicUser(user!)}});
  };
  const changePassword: RequestHandler = async (req,res) => {
    const input = changePasswordSchema.parse(req.body);
    const user = await User.findById(res.locals.user._id).select('+passwordHash');
    if (!user || !(await verifyPassword(input.currentPassword,user.passwordHash))) throw new ApiError(400,'INVALID_PASSWORD','Current password is incorrect');
    user.passwordHash = await hashPassword(input.newPassword);
    await user.save();
    await RefreshSession.deleteMany({userId:user._id});
    clearAuthCookies(res,env);
    res.json({data:{message:'Password changed. Please log in again'}});
  };
  const listAddresses: RequestHandler = async (_req,res) => {
    const rows = await Address.find({userId:res.locals.user._id}).sort({isDefault:-1,createdAt:-1}).lean();
    res.json({data:rows.map(row=>({...row,id:String(row._id)}))});
  };
  const createAddress: RequestHandler = async (req,res) => {
    const input = addressSchema.parse(req.body);
    const userId = res.locals.user._id;
    const isFirst = !(await Address.exists({userId}));
    if (input.isDefault || isFirst) await Address.updateMany({userId,isDefault:true},{$set:{isDefault:false}});
    const address = await Address.create({...input,isDefault:input.isDefault || isFirst,userId});
    res.status(201).json({data:{...address.toObject(),id:address.id}});
  };
  const updateAddress: RequestHandler = async (req,res) => {
    const {id} = req.params;
    if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new ApiError(404,'NOT_FOUND','Address not found');
    const input = addressPatchSchema.parse(req.body);
    const userId = res.locals.user._id;
    const existing = await Address.findOne({_id:id,userId});
    if (!existing) throw new ApiError(404,'NOT_FOUND','Address not found');
    if (input.isDefault) await Address.updateMany({userId,isDefault:true},{$set:{isDefault:false}});
    const address = await Address.findOneAndUpdate({_id:id,userId},{$set:input},{new:true,runValidators:true});
    res.json({data:{...address!.toObject(),id:address!.id}});
  };
  const deleteAddress: RequestHandler = async (req,res) => {
    const {id} = req.params;
    if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new ApiError(404,'NOT_FOUND','Address not found');
    const deleted = await Address.findOneAndDelete({_id:id,userId:res.locals.user._id});
    if (!deleted) throw new ApiError(404,'NOT_FOUND','Address not found');
    if (deleted.isDefault) {
      const replacement = await Address.findOne({userId:res.locals.user._id}).sort({createdAt:-1});
      if (replacement) await Address.updateOne({_id:replacement._id},{$set:{isDefault:true}});
    }
    res.json({data:{message:'Address removed'}});
  };
  return {profile,updateProfile,changePassword,listAddresses,createAddress,updateAddress,deleteAddress};
}
