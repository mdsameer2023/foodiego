import { Address } from "../models/Address.js";
import { AiUsage } from "../models/AiUsage.js";
import { AuditLog } from "../models/AuditLog.js";
import { Cart } from "../models/Cart.js";
import { Coupon } from "../models/Coupon.js";
import { DeliveryAssignment } from "../models/DeliveryAssignment.js";
import { DeliveryPartner } from "../models/DeliveryPartner.js";
import { Favorite } from "../models/Favorite.js";
import { MenuCategory } from "../models/MenuCategory.js";
import { MenuItem } from "../models/MenuItem.js";
import { Order } from "../models/Order.js";
import { PasswordReset } from "../models/PasswordReset.js";
import { Payment } from "../models/Payment.js";
import { RefreshSession } from "../models/RefreshSession.js";
import { Refund } from "../models/Refund.js";
import { Restaurant } from "../models/Restaurant.js";
import { Review } from "../models/Review.js";
import { User } from "../models/User.js";
import { WebhookEvent } from "../models/WebhookEvent.js";

// Production disables autoIndex; every declared unique/TTL/lookup index is required.
export const indexModels = [Address, AiUsage, AuditLog, Cart, Coupon, DeliveryAssignment, DeliveryPartner, Favorite, MenuCategory, MenuItem, Order, PasswordReset, Payment, RefreshSession, Refund, Restaurant, Review, User, WebhookEvent];
export async function ensureDatabaseIndexes(onComplete?: (name: string) => void) {
  for (const model of indexModels) {
    await model.createIndexes();
    onComplete?.(model.modelName);
  }
}
