import assert from "node:assert/strict";
import crypto from "node:crypto";
import { before, after, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import supertest from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import type { Env } from "../src/config/env.js";
import { User, type roles } from "../src/models/User.js";
import { Restaurant } from "../src/models/Restaurant.js";
import { RefreshSession } from "../src/models/RefreshSession.js";
import { MenuCategory } from "../src/models/MenuCategory.js";
import { MenuItem } from "../src/models/MenuItem.js";
import { Order } from "../src/models/Order.js";
import { Review } from "../src/models/Review.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Payment } from "../src/models/Payment.js";
import { DeliveryAssignment } from "../src/models/DeliveryAssignment.js";
import { DeliveryPartner } from "../src/models/DeliveryPartner.js";

const env: Env = {
  NODE_ENV: "test",
  PORT: 5000,
  MONGODB_URI: "",
  JWT_ACCESS_SECRET: "phase6-test-access-secret-over-thirty-two-characters",
  JWT_REFRESH_SECRET: "phase6-test-refresh-secret-over-thirty-two-characters",
  FRONTEND_URL: "http://localhost:3000",
  BACKEND_URL: "http://localhost:5000",
  EMAIL_MODE: "disabled",
  TRACKING_MIN_INTERVAL_MS: 5000,
  TRACKING_MIN_DISTANCE_METERS: 30,
  TRACKING_STATIONARY_INTERVAL_MS: 30000,
};
const app = createApp(env, { paymentGateway: null });
let mongo: MongoMemoryReplSet;
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60000 }],
  });
  await connectDatabase(mongo.getUri(), "foodiego_phase6_test");
});
after(async () => {
  await disconnectDatabase();
  await mongo?.stop();
});
async function account(role: (typeof roles)[number]) {
  const user = await User.create({
    name: `${role} test`,
    email: `${crypto.randomUUID()}@example.invalid`,
    passwordHash: "test-only",
    role,
  });
  const sid = crypto.randomUUID();
  await RefreshSession.create({
    userId: user._id,
    sessionId: sid,
    tokenHash: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 600000),
  });
  const cookie = `fg_access=${jwt.sign({ sub: String(user._id), sid }, env.JWT_ACCESS_SECRET, { algorithm: "HS256", issuer: "foodiego", expiresIn: "10m" })}; fg_csrf=test-token`;
  const request = supertest(app);
  return {
    user,
    get: (url: string) => request.get(url).set("Cookie", cookie),
    patch: (url: string, body: object) =>
      request
        .patch(url)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", "test-token")
        .send(body),
    post: (url: string, body: object) =>
      request
        .post(url)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", "test-token")
        .send(body),
    delete: (url: string) =>
      request
        .delete(url)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", "test-token"),
  };
}
async function restaurant(ownerId: mongoose.Types.ObjectId, approved = true) {
  return Restaurant.create({
    ownerId,
    name: "Phase Six Kitchen",
    description: "Fresh test food",
    cuisines: ["Indian"],
    address: "Park Street",
    area: "Park Street",
    city: "Kolkata",
    priceForTwo: 500,
    isApproved: approved,
  });
}
test("dashboard endpoints enforce backend roles; public discovery remains public", async () => {
  const customer = await account("CUSTOMER");
  for (const path of [
    "/api/admin/dashboard",
    "/api/admin/users",
    "/api/owner/dashboard",
    "/api/partner/dashboard",
  ])
    await customer.get(path).expect(403);
  await supertest(app).get("/api/admin/dashboard").expect(401);
  await supertest(app).get("/api/restaurants").expect(200);
  const admin = await account("ADMIN");
  const users = (await admin.get("/api/admin/users").expect(200)).body.data;
  assert.ok(users.length);
  assert.ok(
    users.every((r: Record<string, unknown>) => !("passwordHash" in r)),
  );
  await admin
    .patch(`/api/admin/users/${customer.user._id}/status`, {
      isActive: false,
      role: "ADMIN",
      confirmed: true,
      reason: "Not authorized",
    })
    .expect(400);
  await admin
    .patch(`/api/admin/users/${admin.user._id}/status`, {
      isActive: false,
      confirmed: true,
      reason: "Self suspension",
    })
    .expect(409);
});
test("restaurant approval validates transitions and audits; suspended users lose access", async () => {
  const admin = await account("ADMIN"),
    owner = await account("RESTAURANT_OWNER"),
    r = await restaurant(owner.user._id, false);
  await admin
    .patch(`/api/admin/restaurants/${r._id}/status`, {
      status: "APPROVED",
      confirmed: true,
      reason: "Verified application",
    })
    .expect(200);
  await admin
    .patch(`/api/admin/restaurants/${r._id}/status`, {
      status: "REJECTED",
      confirmed: true,
      reason: "Invalid transition",
    })
    .expect(409);
  await admin
    .patch(`/api/admin/restaurants/${r._id}/status`, {
      status: "SUSPENDED",
      confirmed: true,
      reason: "Temporarily suspended",
    })
    .expect(200);
  assert.equal((await Restaurant.findById(r._id))?.isApproved, false);
  assert.equal(await AuditLog.countDocuments({ resourceId: String(r._id) }), 2);
  await admin
    .patch(`/api/admin/users/${owner.user._id}/status`, {
      isActive: false,
      confirmed: true,
      reason: "Account review",
    })
    .expect(200);
  await owner.get("/api/owner/dashboard").expect(401);
});
test("owner menu CRUD and categories cannot cross restaurant ownership", async () => {
  const owner = await account("RESTAURANT_OWNER"),
    other = await account("RESTAURANT_OWNER"),
    r = await restaurant(owner.user._id),
    foreign = await restaurant(other.user._id);
  const category = (
    await owner
      .post("/api/owner/categories", {
        restaurantId: String(r._id),
        name: "Main dishes",
      })
      .expect(201)
  ).body.data;
  const item = (
    await owner
      .post("/api/owner/menu/items", {
        restaurantId: String(r._id),
        categoryId: category.id,
        name: "Test Paneer",
        price: 150,
        isVegetarian: true,
      })
      .expect(201)
  ).body.data;
  await other
    .patch(`/api/owner/menu/items/${item.id}`, { price: 1 })
    .expect(404);
  await owner
    .patch(`/api/owner/menu/items/${item.id}`, {
      restaurantId: String(foreign._id),
    })
    .expect(400);
  await owner.delete(`/api/owner/categories/${category.id}`).expect(409);
  await owner
    .patch(`/api/owner/restaurants/${r._id}/settings`, { isApproved: true })
    .expect(400);
  await owner
    .patch(`/api/owner/menu/items/${item.id}`, {
      price: 175,
      isAvailable: false,
    })
    .expect(200);
  assert.equal((await MenuItem.findById(item.id))?.price, 175);
  const result = (await other.get("/api/owner/menu").expect(200)).body;
  assert.equal(result.meta.total, 0);
  await other.get(`/api/owner/analytics?restaurantId=${r._id}`).expect(404);
  assert.equal(await MenuCategory.countDocuments({ restaurantId: r._id }), 1);
});
test("analytics isolate owner data and distinguish captured payments from failed attempts", async () => {
  const owner = await account("RESTAURANT_OWNER"),
    other = await account("RESTAURANT_OWNER"),
    admin = await account("ADMIN");
  const r = await restaurant(owner.user._id),
    foreign = await restaurant(other.user._id);
  const orders = await Order.create(
    [r, foreign].map((restaurant, index) => ({
      orderNumber: `AN-${crypto.randomUUID()}`,
      userId: owner.user._id,
      restaurantId: restaurant._id,
      restaurantSnapshot: { name: restaurant.name },
      items: [],
      deliveryAddressSnapshot: { city: "Kolkata" },
      pricingBreakdown: { totalPaise: (index + 1) * 10000 },
      paymentMethod: "ONLINE" as const,
      paymentStatus: "PAID" as const,
      orderStatus: "DELIVERED" as const,
      placedAt: new Date(),
      deliveredAt: new Date(),
      idempotencyKey: crypto.randomUUID(),
    })),
  );
  await Payment.create([
    {
      userId: owner.user._id,
      orderId: orders[0]!._id,
      attemptKey: "a",
      amountPaise: 10000,
      status: "CAPTURED",
    },
    {
      userId: owner.user._id,
      orderId: orders[0]!._id,
      attemptKey: "b",
      amountPaise: 999999,
      status: "FAILED",
    },
  ]);
  const a = (await owner.get("/api/owner/analytics").expect(200)).body.data;
  assert.equal(a.stats.totalOrders, 1);
  assert.equal(a.stats.completedSalesPaise, 10000);
  const b = (await admin.get("/api/admin/analytics").expect(200)).body.data;
  assert.equal(b.stats.capturedOnlinePaise, 10000);
  assert.ok(
    b.definitions.grossOrderValuePaise.includes("not platform revenue"),
  );
  await owner
    .patch(`/api/owner/orders/${orders[1]!._id}/status`, {
      status: "PREPARING",
    })
    .expect(403);
  await owner
    .patch(`/api/owner/orders/${orders[0]!._id}/status`, {
      status: "DELIVERED",
    })
    .expect(400);
});
test("moderation recalculates visible ratings; coupons enforce owner restrictions", async () => {
  const admin = await account("ADMIN"),
    owner = await account("RESTAURANT_OWNER"),
    customer = await account("CUSTOMER"),
    r = await restaurant(owner.user._id);
  const review = await Review.create({
    restaurantId: r._id,
    userId: customer.user._id,
    rating: 1,
    comment: "Policy violating sample",
  });
  await admin
    .patch(`/api/admin/reviews/${review._id}/visibility`, {
      isHidden: true,
      reason: "Policy review",
      confirmed: true,
    })
    .expect(200);
  assert.equal((await Restaurant.findById(r._id))?.reviewCount, 0);
  const publicReviews = (
    await supertest(app).get(`/api/restaurants/${r._id}/reviews`).expect(200)
  ).body;
  assert.equal(publicReviews.meta.total, 0);
  await admin
    .patch(`/api/admin/reviews/${review._id}/visibility`, {
      isHidden: false,
      reason: "Review restored",
      confirmed: true,
    })
    .expect(200);
  assert.equal((await Restaurant.findById(r._id))?.rating, 1);
  const coupon = {
    code: "PHASE6",
    discountType: "PERCENT",
    discountValue: 10,
    validFrom: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  await owner.post("/api/owner/coupons", coupon).expect(403);
  await owner
    .post("/api/owner/coupons", {
      ...coupon,
      applicableRestaurantIds: [String(r._id)],
    })
    .expect(201);
  await customer.post("/api/admin/coupons", coupon).expect(403);
  await admin
    .post("/api/admin/coupons", {
      ...coupon,
      code: "INVALID",
      discountValue: 101,
    })
    .expect(400);
});
test("partner earnings and history are isolated; no amount is marked paid", async () => {
  const partner = await account("DELIVERY_PARTNER"),
    other = await account("DELIVERY_PARTNER"),
    owner = await account("RESTAURANT_OWNER"),
    r = await restaurant(owner.user._id);
  await DeliveryAssignment.create({
    orderId: new mongoose.Types.ObjectId(),
    deliveryPartnerId: partner.user._id,
    restaurantId: r._id,
    assignmentStatus: "DELIVERED",
    deliveredAt: new Date(),
  });
  const mine = (await partner.get("/api/partner/earnings").expect(200)).body
    .data;
  assert.equal(mine.stats.completedDeliveries, 1);
  assert.equal(mine.deliveryTrends.reduce((sum:number,row:{completed:number})=>sum+row.completed,0),1);
  assert.equal(mine.stats.payoutsVerified, false);
  const theirs = (await other.get("/api/partner/history").expect(200)).body;
  assert.equal(theirs.meta.total, 0);
  await other
    .post("/api/partner/assignments/000000000000000000000001/accept", {})
    .expect(409);
});
test("reassignment releases the old partner and refuses collected deliveries", async () => {
  const admin = await account("ADMIN"),
    owner = await account("RESTAURANT_OWNER"),
    first = await account("DELIVERY_PARTNER"),
    second = await account("DELIVERY_PARTNER"),
    r = await restaurant(owner.user._id);
  const order = await Order.create({
    orderNumber: `RE-${crypto.randomUUID()}`,
    userId: owner.user._id,
    restaurantId: r._id,
    items: [],
    deliveryAddressSnapshot: { city: "Kolkata" },
    pricingBreakdown: { totalPaise: 10000 },
    paymentMethod: "COD",
    orderStatus: "READY_FOR_PICKUP",
    placedAt: new Date(),
    idempotencyKey: crypto.randomUUID(),
    assignedDeliveryPartnerId: first.user._id,
  });
  const assignment = await DeliveryAssignment.create({
    orderId: order._id,
    deliveryPartnerId: first.user._id,
    restaurantId: r._id,
    assignmentStatus: "ACCEPTED",
  });
  await DeliveryPartner.create([
    {
      userId: first.user._id,
      phone: "9999999999",
      vehicleType: "BIKE",
      vehicleNumber: "TEST-1",
      isVerified: true,
      isAvailable: false,
      activeDeliveryId: assignment._id,
      trackingEnabled: true,
    },
    {
      userId: second.user._id,
      phone: "9999999998",
      vehicleType: "BIKE",
      vehicleNumber: "TEST-2",
      isVerified: true,
      isAvailable: true,
    },
  ]);
  await first
    .post(`/api/admin/deliveries/${assignment._id}/reassign`, {
      partnerId: String(second.user._id),
      confirmed: true,
      reason: "Wrong role",
    })
    .expect(403);
  await admin
    .post(`/api/admin/deliveries/${assignment._id}/reassign`, {
      partnerId: String(second.user._id),
      confirmed: true,
      reason: "Partner replacement",
    })
    .expect(200);
  const old = await DeliveryPartner.findOne({ userId: first.user._id });
  assert.equal(old?.activeDeliveryId, null);
  assert.equal(old?.trackingEnabled, false);
  const row = await DeliveryAssignment.findById(assignment._id);
  assert.equal(String(row?.deliveryPartnerId), String(second.user._id));
  assert.equal(row?.assignmentStatus, "OFFERED");
  await DeliveryAssignment.updateOne(
    { _id: assignment._id },
    { $set: { assignmentStatus: "PICKED_UP" } },
  );
  await admin
    .post(`/api/admin/deliveries/${assignment._id}/reassign`, {
      partnerId: String(first.user._id),
      confirmed: true,
      reason: "Too late",
    })
    .expect(409);
  await admin
    .post("/api/deliveries/partners", {
      userId: String(admin.user._id),
      phone: "9999999999",
      vehicleType: "BIKE",
      vehicleNumber: "TEST",
      isVerified: true,
    })
    .expect(409);
});
test("image upload checks owner and real image bytes before contacting a provider", async () => {
  const owner = await account("RESTAURANT_OWNER"),
    other = await account("RESTAURANT_OWNER"),
    r = await restaurant(owner.user._id);
  await other
    .post("/api/owner/images", {
      restaurantId: String(r._id),
      image: "data:image/png;base64,AAAA",
    })
    .expect(404);
  await owner
    .post("/api/owner/images", {
      restaurantId: String(r._id),
      image: "data:image/png;base64,AAAA",
    })
    .expect(400);
  await owner
    .post("/api/owner/images", {
      restaurantId: String(r._id),
      image: "data:image/svg+xml;base64,AAAA",
    })
    .expect(400);
});
test('cancelling an assigned order stops tracking and releases the partner',async()=>{
  const customer=await account('CUSTOMER'),partner=await account('DELIVERY_PARTNER'),r=await restaurant(customer.user._id);
  const order=await Order.create({orderNumber:`CAN-${crypto.randomUUID()}`,userId:customer.user._id,restaurantId:r._id,items:[],deliveryAddressSnapshot:{city:'Kolkata'},pricingBreakdown:{totalPaise:10000},paymentMethod:'COD',orderStatus:'CONFIRMED',placedAt:new Date(),idempotencyKey:crypto.randomUUID(),assignedDeliveryPartnerId:partner.user._id});
  const assignment=await DeliveryAssignment.create({orderId:order._id,deliveryPartnerId:partner.user._id,restaurantId:r._id,assignmentStatus:'ACCEPTED',trackingEnabled:true});
  await DeliveryPartner.create({userId:partner.user._id,phone:'9999999999',vehicleType:'BIKE',vehicleNumber:'TEST-CANCEL',isVerified:true,activeDeliveryId:assignment._id,trackingEnabled:true,currentLocation:{type:'Point',coordinates:[88.36,22.57]},lastLocationUpdatedAt:new Date()});
  await customer.post(`/api/orders/${order._id}/cancel`,{reason:'Customer cancelled'}).expect(200);
  const profile=await DeliveryPartner.findOne({userId:partner.user._id});assert.equal(profile?.trackingEnabled,false);assert.equal(profile?.activeDeliveryId,null);assert.equal(profile?.currentLocation,undefined);
  assert.equal((await DeliveryAssignment.findById(assignment._id))?.assignmentStatus,'CANCELLED');
  assert.equal((await customer.get(`/api/deliveries/order/${order._id}`).expect(200)).body.data.location,null);
});
