import { Router, type Request, type Response } from "express";
import mongoose, { type Model } from "mongoose";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Restaurant } from "../models/Restaurant.js";
import { User } from "../models/User.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Refund } from "../models/Refund.js";
import { Coupon } from "../models/Coupon.js";
import { Review } from "../models/Review.js";
import { MenuItem } from "../models/MenuItem.js";
import { MenuCategory } from "../models/MenuCategory.js";
import { DeliveryPartner } from "../models/DeliveryPartner.js";
import { DeliveryAssignment } from "../models/DeliveryAssignment.js";
import { AuditLog } from "../models/AuditLog.js";
import { ApiError } from "../utils/errors.js";
import { refreshRating } from "../controllers/reviews.js";
import { updateOrderStatus } from "../controllers/orders.js";
import * as delivery from "../controllers/deliveries.js";
import { uploadFoodImage } from "../controllers/dashboard-upload.js";
import { publishOrderEvent, disconnectAccount } from "../services/realtime.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID");
const oid = (v: unknown) => new mongoose.Types.ObjectId(objectId.parse(v));
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.string().max(40).optional(),
  role: z
    .enum(["CUSTOMER", "ADMIN", "RESTAURANT_OWNER", "DELIVERY_PARTNER"])
    .optional(),
  restaurantId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  paymentMethod: z.enum(["COD", "ONLINE"]).optional(),
  paymentStatus: z.string().max(30).optional(),
});
const pattern = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
type Filter = Record<string, unknown>;
type DataModel = Model<Record<string, unknown>>;
const asModel = (m: unknown) => m as DataModel;
const record = (r: Record<string, unknown>) => ({ ...r, id: String(r._id) });
async function audit(
  res: Response,
  action: string,
  resource: string,
  resourceId: unknown,
  changes: unknown,
  reason = "",
) {
  await AuditLog.create({
    actorId: res.locals.user._id,
    action,
    resource,
    resourceId: String(resourceId),
    changes,
    reason,
  });
}
async function owned(res: Response, restaurantId: unknown) {
  const row = await Restaurant.findOne({
    _id: oid(restaurantId),
    ownerId: res.locals.user._id,
  });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Owned restaurant not found");
  return row;
}
async function ownerIds(req: Request, res: Response) {
  if (req.query.restaurantId)
    return [(await owned(res, req.query.restaurantId))._id];
  return (
    await Restaurant.find({ ownerId: res.locals.user._id }).select("_id")
  ).map((r) => r._id);
}
function dateFilter(
  input: z.infer<typeof pageSchema>,
  field = "createdAt",
): Filter {
  if (input.from && input.to && input.from > input.to)
    throw new ApiError(
      400,
      "INVALID_RANGE",
      "Start date must precede end date",
    );
  return input.from || input.to
    ? {
        [field]: {
          ...(input.from ? { $gte: input.from } : {}),
          ...(input.to ? { $lte: input.to } : {}),
        },
      }
    : {};
}
async function list(
  req: Request,
  res: Response,
  model: unknown,
  scope: Filter = {},
  search: string[] = [],
  statusField = "status",
  select = "",
) {
  const input = pageSchema.parse(req.query),
    filter: Filter = { ...dateFilter(input), ...scope };
  if (input.q && search.length)
    filter.$or = search.map((field) => ({
      [field]: { $regex: pattern(input.q!), $options: "i" },
    }));
  if (input.status) {
    if (
      ["isActive", "isHidden", "isVerified", "isAvailable"].includes(
        statusField,
      ) &&
      !["true", "false"].includes(input.status)
    )
      throw new ApiError(
        400,
        "INVALID_STATUS",
        "Use true or false for this status filter",
      );
    if (statusField === "managementStatus")
      filter.$and = [
        {
          $or:
            input.status === "APPROVED"
              ? [
                  { managementStatus: "APPROVED" },
                  { managementStatus: { $exists: false }, isApproved: true },
                ]
              : input.status === "PENDING"
                ? [
                    { managementStatus: "PENDING" },
                    { managementStatus: { $exists: false }, isApproved: false },
                  ]
                : [{ managementStatus: input.status }],
        },
      ];
    else filter[statusField] = input.status;
  }
  if (input.role) filter.role = input.role;
  if (input.rating) filter.rating = input.rating;
  if (input.paymentMethod) filter.paymentMethod = input.paymentMethod;
  if (input.paymentStatus) filter.paymentStatus = input.paymentStatus;
  const m = asModel(model);
  const query = m
    .find(filter)
    .select(select)
    .sort({ createdAt: -1, _id: -1 })
    .skip((input.page - 1) * input.limit)
    .limit(input.limit);
  if (model === Order)
    query
      .populate("userId", "name email")
      .populate("assignedDeliveryPartnerId", "name phone");
  if (model === Payment)
    query
      .populate("userId", "name email")
      .populate("orderId", "orderNumber orderStatus");
  if (model === Refund)
    query
      .populate("orderId", "orderNumber")
      .populate("paymentId", "razorpayPaymentId");
  if (model === Restaurant) query.populate("ownerId", "name email");
  if (model === DeliveryAssignment)
    query
      .populate("orderId", "orderNumber")
      .populate("restaurantId", "name")
      .populate("deliveryPartnerId", "name phone");
  if (model === DeliveryPartner) query.populate("userId", "name email");
  const [rows, total] = await Promise.all([
    query.lean(),
    m.countDocuments(filter),
  ]);
  const rate = z.coerce
    .number()
    .int()
    .min(0)
    .max(1000000)
    .parse(process.env.DELIVERY_ESTIMATE_PAISE || 5000);
  res.json({
    data: rows.map((row) => ({
      ...record(row),
      ...(model === DeliveryAssignment
        ? {
            estimatedEarningsPaise:
              row.assignmentStatus === "DELIVERED" ? rate : 0,
          }
        : {}),
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit),
    },
  });
}

async function analytics(
  req: Request,
  res: Response,
  mode: "admin" | "owner" | "partner",
) {
  const input = pageSchema.parse(req.query),
    user = res.locals.user;
  const ids = mode === "owner" ? await ownerIds(req, res) : [];
  const scope: Filter =
    mode === "owner"
      ? { restaurantId: { $in: ids } }
      : mode === "partner"
        ? { assignedDeliveryPartnerId: user._id }
        : {};
  const filter = {
    ...scope,
    ...dateFilter(input),
    checkoutState: { $nin: ["PENDING_PAYMENT", "FAILED"] as const },
  };
  const period = z
    .enum(["day", "week", "month"])
    .parse(req.query.period || "day");
  const format =
    period === "month" ? "%Y-%m" : period === "week" ? "%G-W%V" : "%Y-%m-%d";
  const [
    summary,
    series,
    statuses,
    methods,
    topItems,
    performance,
    deliveryStats,
  ] = await Promise.all([
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "DELIVERED"] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "CANCELLED"] }, 1, 0] },
          },
          pendingOrders: {
            $sum: {
              $cond: [{ $in: ["$orderStatus", ["PLACED", "CONFIRMED"]] }, 1, 0],
            },
          },
          preparingOrders: {
            $sum: { $cond: [{ $eq: ["$orderStatus", "PREPARING"] }, 1, 0] },
          },
          grossOrderValuePaise: { $sum: "$pricingBreakdown.totalPaise" },
          completedSalesPaise: {
            $sum: {
              $cond: [
                { $eq: ["$orderStatus", "DELIVERED"] },
                "$pricingBreakdown.totalPaise",
                0,
              ],
            },
          },
          codOrders: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "COD"] }, 1, 0] },
          },
        },
      },
    ]),
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: {
              format,
              date: "$createdAt",
              timezone: "Asia/Kolkata",
            },
          },
          orders: { $sum: 1 },
          grossOrderValuePaise: { $sum: "$pricingBreakdown.totalPaise" },
          completedSalesPaise: {
            $sum: {
              $cond: [
                { $eq: ["$orderStatus", "DELIVERED"] },
                "$pricingBreakdown.totalPaise",
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: filter },
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: filter },
      { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...filter, orderStatus: "DELIVERED" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          quantity: { $sum: "$items.quantity" },
          salesPaise: { $sum: "$items.totalPaise" },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 8 },
    ]),
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$restaurantSnapshot.name",
          orders: { $sum: 1 },
          grossOrderValuePaise: { $sum: "$pricingBreakdown.totalPaise" },
        },
      },
      { $sort: { orders: -1 } },
      { $limit: 8 },
    ]),
    DeliveryAssignment.aggregate([
      {
        $match: {
          ...dateFilter(input),
          ...(mode === "partner"
            ? { deliveryPartnerId: user._id }
            : mode === "owner"
              ? { restaurantId: { $in: ids } }
              : {}),
        },
      },
      { $group: { _id: "$assignmentStatus", count: { $sum: 1 } } },
    ]),
  ]);
  const stats: Record<string, unknown> = {
    ...(summary[0] || {
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      pendingOrders: 0,
      preparingOrders: 0,
      grossOrderValuePaise: 0,
      completedSalesPaise: 0,
      codOrders: 0,
    }),
  };
  delete stats._id;
  let operations: Record<string, unknown> = {};
  stats.averageOrderValuePaise = Number(stats.totalOrders)
    ? Math.round(Number(stats.grossOrderValuePaise) / Number(stats.totalOrders))
    : 0;
  const today = new Date(Date.now() + 330 * 60000);
  today.setUTCHours(0, 0, 0, 0);
  today.setTime(today.getTime() - 330 * 60000);
  stats.todayOrders = await Order.countDocuments({
    ...scope,
    createdAt: { $gte: today },
    checkoutState: { $nin: ["PENDING_PAYMENT", "FAILED"] },
  });
  if (mode === "admin") {
    const [
      users,
      activeRestaurants,
      pendingApprovals,
      partners,
      captured,
      refunds,
    ] = await Promise.all([
      User.countDocuments(),
      Restaurant.countDocuments({ isApproved: true }),
      Restaurant.countDocuments({
        isApproved: false,
        managementStatus: { $nin: ["REJECTED", "SUSPENDED"] },
      }),
      DeliveryPartner.countDocuments({ isVerified: true, isAvailable: true }),
      Payment.aggregate([
        {
          $match: {
            ...dateFilter(input),
            status: { $in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$amountPaise" } } },
      ]),
      Refund.aggregate([
        { $match: dateFilter(input) },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amountPaise: { $sum: "$amountPaise" },
          },
        },
      ]),
    ]);
    Object.assign(stats, {
      totalUsers: users,
      activeRestaurants,
      pendingApprovals,
      activeDeliveryPartners: partners,
      capturedOnlinePaise: captured[0]?.total || 0,
      pendingRefunds: refunds.find((r) => r._id === "PENDING")?.count || 0,
      processedRefundPaise:
        refunds.find((r) => r._id === "PROCESSED")?.amountPaise || 0,
    });
    const [approvals, pendingRefundRecords, issues, activity] =
      await Promise.all([
        Restaurant.find({
          isApproved: false,
          managementStatus: { $nin: ["REJECTED", "SUSPENDED"] },
        })
          .select("name city createdAt")
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        Refund.find({ status: "PENDING" })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        DeliveryAssignment.find({
          assignmentStatus: { $in: ["REJECTED", "CANCELLED"] },
        })
          .select("orderId assignmentStatus updatedAt")
          .sort({ updatedAt: -1 })
          .limit(5)
          .lean(),
        AuditLog.find().sort({ createdAt: -1 }).limit(6).lean(),
      ]);
    operations = { approvals, pendingRefundRecords, issues, activity };
  }
  if (mode === "owner")
    stats.averageRating =
      (
        await Restaurant.aggregate([
          { $match: { _id: { $in: ids } } },
          { $group: { _id: null, rating: { $avg: "$rating" } } },
        ])
      )[0]?.rating || 0;
  if (mode === "partner") {
    const profile = await DeliveryPartner.findOne({ userId: user._id }).select(
      "-currentLocation",
    );

    const rate = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(process.env.DELIVERY_ESTIMATE_PAISE || 5000);
    const [todayDeliveries, earningsSeries] = await Promise.all([
      DeliveryAssignment.countDocuments({
        deliveryPartnerId: user._id,
        assignmentStatus: "DELIVERED",
        deliveredAt: { $gte: today },
      }),
      DeliveryAssignment.aggregate([
        {
          $match: {
            deliveryPartnerId: user._id,
            assignmentStatus: "DELIVERED",
            ...dateFilter(input, "deliveredAt"),
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format,
                date: "$deliveredAt",
                timezone: "Asia/Kolkata",
              },
            },
            orders: { $sum: 1 },
            estimatedEarningsPaise: { $sum: rate },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const completed = earningsSeries.reduce(
      (total, row) => total + Number(row.orders || 0),
      0,
    );
    series.splice(0, series.length, ...earningsSeries);
    Object.assign(stats, {
      todayDeliveries,
      activeDelivery: profile?.activeDeliveryId ? 1 : 0,
      completedDeliveries: completed,
      pendingAssignments:
        deliveryStats.find((r) => r._id === "OFFERED")?.count || 0,
      estimatedEarningsPaise: completed * rate,
      estimatedRatePaise: rate,
      payoutsVerified: false,
      profile,
    });
  }
  const deliveryTrends=await DeliveryAssignment.aggregate([
    {$match:{assignmentStatus:'DELIVERED',...dateFilter(input,'deliveredAt'),...(mode==='partner'?{deliveryPartnerId:user._id}:mode==='owner'?{restaurantId:{$in:ids}}:{})}},
    {$group:{_id:{$dateToString:{format,date:'$deliveredAt',timezone:'Asia/Kolkata'}},completed:{$sum:1}}},{$sort:{_id:1}},
  ]);
  const recentOrders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(8)
    .select(
      "orderNumber restaurantSnapshot orderStatus paymentMethod paymentStatus pricingBreakdown createdAt",
    )
    .lean();
  res.json({
    data: {
      stats,
      series,
      statuses,
      methods,
      topItems,
      performance,
      deliveryStats,
      deliveryTrends,
      operations,
      recentOrders: recentOrders.map(record),
      definitions: {
        grossOrderValuePaise:
          "All confirmed checkout order totals, including cancelled orders; not platform revenue.",
        completedSalesPaise: "Delivered order totals before online refunds.",
        capturedOnlinePaise:
          "Provider-confirmed captured principal, including subsequently refunded payments.",
        processedRefundPaise: "Provider-confirmed processed refunds only.",
        estimatedEarningsPaise:
          "Configured estimate per completed delivery. No payout is claimed.",
      },
    },
  });
}

const itemSchema = z
  .object({
    restaurantId: objectId,
    categoryId: objectId,
    name: z.string().trim().min(2).max(120),
    description: z.string().max(1000).default(""),
    price: z.number().min(0).max(100000),
    image: z
      .string()
      .max(1000)
      .refine(
        (v) => v === "" || v.startsWith("/images/") || /^https:\/\//.test(v),
        "Use a local food image or HTTPS image URL",
      )
      .default(""),
    isVegetarian: z.boolean(),
    isAvailable: z.boolean().default(true),
    isPopular: z.boolean().default(false),
    customizationOptions: z
      .array(
        z
          .object({
            name: z.string().min(1).max(80),
            required: z.boolean(),
            minSelections: z.number().int().min(0),
            maxSelections: z.number().int().min(1).max(20),
            options: z
              .array(
                z.object({
                  name: z.string().min(1).max(80),
                  price: z.number().min(0),
                }),
              )
              .min(1)
              .max(30),
          })
          .refine(
            (v) =>
              v.minSelections <= v.maxSelections &&
              v.maxSelections <= v.options.length,
          ),
      )
      .max(10)
      .default([]),
  })
  .strict();
const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9_-]+$/i)
      .transform((s) => s.toUpperCase()),
    description: z.string().max(300).default(""),
    discountType: z.enum(["PERCENT", "FIXED"]),
    discountValue: z.number().positive(),
    maxDiscountPaise: z.number().int().min(0).default(0),
    minimumOrderPaise: z.number().int().min(0).default(0),
    usageLimit: z.number().int().min(0).default(0),
    perUserLimit: z.number().int().min(0).default(0),
    validFrom: z.coerce.date(),
    expiresAt: z.coerce.date(),
    applicableRestaurantIds: z.array(objectId).max(100).default([]),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.expiresAt > v.validFrom, "Expiry must follow start date")
  .refine(
    (v) => v.discountType !== "PERCENT" || v.discountValue <= 100,
    "Percentage cannot exceed 100",
  );

export function dashboardRoutes(env: Env) {
  const router = Router();
  router.use(["/admin", "/owner", "/partner"], requireAuth(env));
  router.use(
    ["/admin", "/owner", "/partner"],
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  router.use("/admin", requireRole("ADMIN"));
  router.use("/owner", requireRole("RESTAURANT_OWNER"));
  router.use("/partner", requireRole("DELIVERY_PARTNER"));
  for (const mode of ["admin", "owner", "partner"] as const) {
    router.get(`/${mode}/dashboard`, (req, res) => analytics(req, res, mode));
    router.get(`/${mode}/analytics`, (req, res) => analytics(req, res, mode));
  }
  router.get("/admin/restaurants", (req, res) =>
    list(
      req,
      res,
      Restaurant,
      {},
      ["name", "city", "area"],
      "managementStatus",
    ),
  );
  router.get("/admin/users", (req, res) =>
    list(req, res, User, {}, ["name", "email"], "isActive", "-passwordHash"),
  );
  router.get("/admin/orders", (req, res) =>
    list(
      req,
      res,
      Order,
      {},
      ["orderNumber", "restaurantSnapshot.name"],
      "orderStatus",
    ),
  );
  router.get("/admin/payments", (req, res) =>
    list(req, res, Payment, {}, ["razorpayOrderId", "razorpayPaymentId"]),
  );
  router.get("/admin/refunds", (req, res) =>
    list(req, res, Refund, {}, ["razorpayRefundId", "reason"]),
  );
  router.get("/admin/deliveries", (req, res) =>
    list(
      req,
      res,
      DeliveryAssignment,
      {},
      [],
      "assignmentStatus",
      "-pickupLocation -deliveryLocation",
    ),
  );
  router.get("/admin/partners", (req, res) =>
    list(
      req,
      res,
      DeliveryPartner,
      {},
      ["phone", "vehicleNumber"],
      "isVerified",
      "-currentLocation",
    ),
  );
  router.get("/admin/coupons", (req, res) =>
    list(req, res, Coupon, {}, ["code", "description"], "isActive"),
  );
  router.get("/admin/reviews", (req, res) =>
    list(
      req,
      res,
      Review,
      req.query.restaurantId
        ? { restaurantId: oid(req.query.restaurantId) }
        : {},
      ["comment"],
      "isHidden",
    ),
  );
  router.get("/admin/audit-logs", (req, res) =>
    list(req, res, AuditLog, {}, ["action", "resource", "reason"]),
  );
  router.get("/admin/settings", (_req, res) =>
    res.json({
      data: {
        currency: "INR",
        timezone: "Asia/Kolkata",
        paymentMode: "TEST",
        estimatedDeliveryRatePaise: 5000,
        financialMetrics:
          "Gross order value is not platform revenue. Earnings are estimates, not paid payouts.",
      },
    }),
  );
  router.get("/admin/users/:id", async (req, res) => {
    const user = await User.findById(oid(req.params.id)).lean();
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
    const [orders, restaurants, partner] = await Promise.all([
      Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
      Restaurant.find({ ownerId: user._id }).lean(),
      DeliveryPartner.findOne({ userId: user._id })
        .select("-currentLocation")
        .lean(),
    ]);
    res.json({ data: { ...record(user), orders, restaurants, partner } });
  });
  router.get("/admin/restaurants/:id", async (req, res) => {
    const row = await Restaurant.findById(oid(req.params.id)).lean();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Restaurant not found");
    const [owner, menu, stats] = await Promise.all([
      row.ownerId
        ? User.findById(row.ownerId).select("name email phone").lean()
        : null,
      MenuItem.find({ restaurantId: row._id }).limit(100).lean(),
      Order.aggregate([
        { $match: { restaurantId: row._id } },
        {
          $group: {
            _id: "$orderStatus",
            count: { $sum: 1 },
            totalPaise: { $sum: "$pricingBreakdown.totalPaise" },
          },
        },
      ]),
    ]);
    res.json({ data: { ...record(row), owner, menu, orderStatistics: stats } });
  });
  router.post("/admin/deliveries/:id/reassign", async (req, res) => {
    const input = z
        .object({
          partnerId: objectId,
          reason: z.string().min(3).max(300),
          confirmed: z.literal(true),
        })
        .strict()
        .parse(req.body),
      id = oid(req.params.id);
    const session = await mongoose.startSession();
    let orderId: mongoose.Types.ObjectId | undefined;
    try {
      await session.withTransaction(async () => {
        const assignment = await DeliveryAssignment.findOne({
          _id: id,
          assignmentStatus: { $in: ["OFFERED", "ACCEPTED"] },
        }).session(session);
        if (!assignment)
          throw new ApiError(
            409,
            "REASSIGNMENT_CLOSED",
            "Only uncollected assignments can be reassigned",
          );
        const next = await DeliveryPartner.findOne({
          userId: input.partnerId,
          isVerified: true,
          isAvailable: true,
          activeDeliveryId: null,
        }).session(session);
        if (!next)
          throw new ApiError(
            409,
            "PARTNER_UNAVAILABLE",
            "New partner is unavailable",
          );
        const order = await Order.findOne({
          _id: assignment.orderId,
          orderStatus: { $in: ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"] },
        }).session(session);
        if (!order)
          throw new ApiError(
            409,
            "REASSIGNMENT_CLOSED",
            "Order cannot be reassigned",
          );
        await DeliveryPartner.updateOne(
          {
            userId: assignment.deliveryPartnerId,
            activeDeliveryId: assignment._id,
          },
          {
            $set: {
              activeDeliveryId: null,
              isAvailable: true,
              trackingEnabled: false,
              lastLocationUpdatedAt: null,
            },
            $unset: { currentLocation: 1 },
          },
          { session },
        );
        assignment.deliveryPartnerId = next.userId;
        assignment.assignmentStatus = "OFFERED";
        assignment.trackingEnabled = false;
        assignment.assignedAt = new Date();
        assignment.history.push({
          status: "REASSIGNED",
          at: new Date(),
          by: res.locals.user._id,
        });
        await assignment.save({ session });
        order.assignedDeliveryPartnerId = null;
        order.assignmentHistory.push({
          partnerId: next.userId,
          at: new Date(),
          by: res.locals.user._id,
        });
        await order.save({ session });
        orderId = order._id;
        await AuditLog.create(
          [
            {
              actorId: res.locals.user._id,
              action: "delivery.reassign",
              resource: "DeliveryAssignment",
              resourceId: String(id),
              reason: input.reason,
              changes: { partnerId: input.partnerId },
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    publishOrderEvent(orderId, "delivery:assigned", { reassigned: true });
    res.json({ data: { id: String(id), reassigned: true } });
  });
  router.patch("/admin/restaurants/:id/status", async (req, res) => {
    const input = z
      .object({
        status: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "PENDING"]),
        reason: z.string().trim().min(3).max(300),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const row = await Restaurant.findById(oid(req.params.id));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Restaurant not found");
    const current =
      row.managementStatus || (row.isApproved ? "APPROVED" : "PENDING");
    const transitions: Record<string, string[]> = {
      PENDING: ["APPROVED", "REJECTED"],
      APPROVED: ["SUSPENDED"],
      REJECTED: ["PENDING", "APPROVED"],
      SUSPENDED: ["APPROVED"],
    };
    if (!transitions[current]?.includes(input.status))
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        "Invalid restaurant status transition",
      );
    const updated = await Restaurant.findOneAndUpdate(
      {
        _id: row._id,
        isApproved: row.isApproved,
          managementStatus: row.managementStatus||{$exists:false},
      },
      {
        $set: {
          managementStatus: input.status,
          isApproved: input.status === "APPROVED",
          statusReason: input.reason,
        },
      },
      { returnDocument: "after" },
    );
    if (!updated)
      throw new ApiError(409, "CONFLICT", "Restaurant changed; refresh");
    await audit(
      res,
      "restaurant.status",
      "Restaurant",
      row._id,
      { from: current, to: input.status },
      input.reason,
    );
    res.json({ data: record(updated.toObject()) });
  });
  router.patch("/admin/users/:id/status", async (req, res) => {
    const input = z
      .object({
        isActive: z.boolean(),
        reason: z.string().trim().min(3).max(300),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const row = await User.findById(oid(req.params.id));
    if (!row) throw new ApiError(404, "NOT_FOUND", "User not found");
    if (
      !input.isActive &&
      (row.role === "ADMIN" || String(row._id) === String(res.locals.user._id))
    )
      throw new ApiError(
        409,
        "ADMIN_PROTECTED",
        "Administrator accounts cannot be suspended through this operation",
      );
    row.isActive = input.isActive;
    await row.save();
    if (!input.isActive) disconnectAccount(row._id);
    await audit(
      res,
      "user.status",
      "User",
      row._id,
      { isActive: input.isActive },
      input.reason,
    );
    res.json({ data: record(row.toObject()) });
  });
  router.patch("/admin/users/:id/role", async (req, res) => {
    const input = z
      .object({
        role: z.enum(["CUSTOMER", "RESTAURANT_OWNER", "DELIVERY_PARTNER"]),
        reason: z.string().min(3).max(300),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const user = await User.findById(oid(req.params.id));
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
    if (
      user.role === "ADMIN" ||
      String(user._id) === String(res.locals.user._id)
    )
      throw new ApiError(
        403,
        "ROLE_PROTECTED",
        "Administrator role changes require a separate administrator provisioning process",
      );
    if (
      (await Restaurant.exists({ ownerId: user._id })) ||
      (await DeliveryPartner.exists({
        userId: user._id,
        activeDeliveryId: { $ne: null },
      }))
    )
      throw new ApiError(
        409,
        "ROLE_IN_USE",
        "Transfer restaurant ownership or finish active deliveries before changing this role",
      );
    if (
      input.role === "DELIVERY_PARTNER" &&
      !(await DeliveryPartner.exists({ userId: user._id }))
    )
      throw new ApiError(
        409,
        "PROFILE_REQUIRED",
        "Create a delivery partner profile using partner verification first",
      );
    const before = user.role;
    user.role = input.role;
    await user.save();
    disconnectAccount(user._id);
    await audit(
      res,
      "user.role",
      "User",
      user._id,
      { from: before, to: input.role },
      input.reason,
    );
    res.json({ data: record(user.toObject()) });
  });
  router.patch("/admin/restaurants/:id/owner", async (req, res) => {
    const input = z
      .object({
        ownerId: objectId,
        reason: z.string().min(3).max(300),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    if (
      !(await User.exists({
        _id: input.ownerId,
        role: "RESTAURANT_OWNER",
        isActive: true,
      }))
    )
      throw new ApiError(
        400,
        "INVALID_OWNER",
        "Select an active restaurant owner",
      );
    const row = await Restaurant.findByIdAndUpdate(
      oid(req.params.id),
      { $set: { ownerId: input.ownerId } },
      { returnDocument: "after" },
    );
    if (!row) throw new ApiError(404, "NOT_FOUND", "Restaurant not found");
    await audit(
      res,
      "restaurant.owner",
      "Restaurant",
      row._id,
      { ownerId: input.ownerId },
      input.reason,
    );
    res.json({ data: record(row.toObject()) });
  });
  router.patch("/admin/partners/:id", async (req, res) => {
    const input = z
      .object({
        isVerified: z.boolean(),
        confirmed: z.literal(true),
        reason: z.string().min(3).max(300),
      })
      .strict()
      .parse(req.body);
    const row = await DeliveryPartner.findOneAndUpdate(
      { _id: oid(req.params.id), activeDeliveryId: null },
      {
        $set: {
          isVerified: input.isVerified,
          ...(!input.isVerified ? { isAvailable: false } : {}),
        },
      },
      { returnDocument: "after" },
    );
    if (!row)
      throw new ApiError(
        409,
        "PARTNER_BUSY",
        "Partner missing or has an active delivery",
      );
    await audit(
      res,
      "partner.verification",
      "DeliveryPartner",
      row._id,
      { isVerified: input.isVerified },
      input.reason,
    );
    res.json({ data: record(row.toObject()) });
  });
  for (const role of ["admin", "owner"]) {
    router.post(`/${role}/coupons`, async (req, res) => {
      const input = couponSchema.parse(req.body);
      if (role === "owner") {
        if (!input.applicableRestaurantIds.length)
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Offer must be restricted to owned restaurants",
          );
        for (const id of input.applicableRestaurantIds) await owned(res, id);
      }
      const row = await Coupon.create(input);
      await audit(res, "coupon.create", "Coupon", row._id, input);
      res.status(201).json({ data: record(row.toObject()) });
    });
    router.patch(`/${role}/coupons/:id`, async (req, res) => {
      const input = couponSchema.parse(req.body),
        row = await Coupon.findById(oid(req.params.id));
      if (!row) throw new ApiError(404, "NOT_FOUND", "Coupon not found");
      if (role === "owner") {
        if (
          !row.applicableRestaurantIds.length ||
          !input.applicableRestaurantIds.length
        )
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Platform coupon cannot be edited",
          );
        for (const id of [
          ...row.applicableRestaurantIds.map(String),
          ...input.applicableRestaurantIds,
        ])
          await owned(res, id);
      }
      row.set(input);
      await row.save();
      await audit(res, "coupon.update", "Coupon", row._id, input);
      res.json({ data: record(row.toObject()) });
    });
  }
  router.patch("/admin/reviews/:id/visibility", async (req, res) => {
    const input = z
      .object({
        isHidden: z.boolean(),
        reason: z.string().trim().min(3).max(300),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const row = await Review.findByIdAndUpdate(
      oid(req.params.id),
      { $set: { isHidden: input.isHidden, moderationReason: input.reason } },
      { returnDocument: "after" },
    );
    if (!row) throw new ApiError(404, "NOT_FOUND", "Review not found");
    await refreshRating(row.restaurantId);
    await audit(
      res,
      "review.visibility",
      "Review",
      row._id,
      input,
      input.reason,
    );
    res.json({ data: record(row.toObject()) });
  });
  router.get("/owner/restaurants", async (_req, res) =>
    res.json({
      data: (
        await Restaurant.find({ ownerId: res.locals.user._id }).lean()
      ).map(record),
    }),
  );
  router.post(
    "/owner/images",
    rateLimit({
      windowMs: 60000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    uploadFoodImage,
  );
  router.post("/owner/orders/:id/reject", async (req, res) => {
    const input = z
      .object({
        reason: z.string().trim().min(3).max(300),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const order = await Order.findById(oid(req.params.id));
    if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found");
    await owned(res, String(order.restaurantId));
    const row = await Order.findOneAndUpdate(
      { _id: order._id, orderStatus: "PLACED", checkoutState: "CONFIRMED" },
      {
        $set: {
          orderStatus: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: input.reason,
        },
        $push: {
          statusHistory: {
            status: "CANCELLED",
            at: new Date(),
            by: res.locals.user._id,
          },
        },
      },
      { returnDocument: "after" },
    );
    if (!row)
      throw new ApiError(
        409,
        "REJECTION_CLOSED",
        "Only new orders may be rejected",
      );
    await audit(
      res,
      "order.reject",
      "Order",
      row._id,
      { status: "CANCELLED" },
      input.reason,
    );
    publishOrderEvent(row._id, "order:cancelled", { orderStatus: "CANCELLED" });
    res.json({ data: record(row.toObject()) });
  });
  router.get("/owner/orders", async (req, res) =>
    list(
      req,
      res,
      Order,
      {
        restaurantId: { $in: await ownerIds(req, res) },
        checkoutState: { $nin: ["PENDING_PAYMENT", "FAILED"] },
      },
      ["orderNumber"],
      "orderStatus",
    ),
  );
  router.patch("/owner/orders/:id/status", updateOrderStatus);
  router.get("/owner/reviews", async (req, res) =>
    list(
      req,
      res,
      Review,
      { restaurantId: { $in: await ownerIds(req, res) } },
      ["comment"],
    ),
  );
  router.get("/owner/offers", async (req, res) =>
    list(
      req,
      res,
      Coupon,
      { applicableRestaurantIds: { $in: await ownerIds(req, res) } },
      ["code"],
    ),
  );
  router.get("/owner/menu", async (req, res) =>
    list(
      req,
      res,
      MenuItem,
      { restaurantId: { $in: await ownerIds(req, res) } },
      ["name", "description"],
      "isAvailable",
    ),
  );
  router.get("/owner/categories", async (req, res) =>
    list(
      req,
      res,
      MenuCategory,
      { restaurantId: { $in: await ownerIds(req, res) } },
      ["name"],
    ),
  );
  router.post("/owner/menu/items", async (req, res) => {
    const input = itemSchema.parse(req.body);
    await owned(res, input.restaurantId);
    if (
      !(await MenuCategory.exists({
        _id: input.categoryId,
        restaurantId: input.restaurantId,
      }))
    )
      throw new ApiError(
        400,
        "INVALID_CATEGORY",
        "Category does not belong to this restaurant",
      );
    const row = await MenuItem.create(input);
    await audit(res, "menu.create", "MenuItem", row._id, input);
    res.status(201).json({ data: record(row.toObject()) });
  });
  router.patch("/owner/menu/items/:id", async (req, res) => {
    const parsed = itemSchema
        .omit({ restaurantId: true })
        .partial()
        .parse(req.body),
      input = Object.fromEntries(
        Object.entries(parsed).filter(([key]) => Object.hasOwn(req.body, key)),
      ) as typeof parsed,
      row = await MenuItem.findById(oid(req.params.id));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Menu item not found");
    await owned(res, String(row.restaurantId));
    if (
      input.categoryId &&
      !(await MenuCategory.exists({
        _id: input.categoryId,
        restaurantId: row.restaurantId,
      }))
    )
      throw new ApiError(400, "INVALID_CATEGORY", "Invalid category");
    row.set(input);
    await row.save();
    await audit(res, "menu.update", "MenuItem", row._id, input);
    res.json({ data: record(row.toObject()) });
  });
  router.delete("/owner/menu/items/:id", async (req, res) => {
    const row = await MenuItem.findById(oid(req.params.id));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Menu item not found");
    await owned(res, String(row.restaurantId));
    row.isAvailable = false;
    await row.save();
    await audit(res, "menu.archive", "MenuItem", row._id, {
      isAvailable: false,
    });
    res.json({ data: { id: String(row._id), archived: true } });
  });
  router.post("/owner/categories", async (req, res) => {
    const input = z
      .object({
        restaurantId: objectId,
        name: z.string().trim().min(1).max(80),
        sortOrder: z.number().int().min(0).max(1000).default(0),
      })
      .strict()
      .parse(req.body);
    await owned(res, input.restaurantId);
    const row = await MenuCategory.create(input);
    res.status(201).json({ data: record(row.toObject()) });
  });
  router.patch("/owner/categories/:id", async (req, res) => {
    const input = z
        .object({
          name: z.string().trim().min(1).max(80).optional(),
          sortOrder: z.number().int().min(0).max(1000).optional(),
        })
        .strict()
        .parse(req.body),
      row = await MenuCategory.findById(oid(req.params.id));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Category not found");
    await owned(res, String(row.restaurantId));
    row.set(input);
    await row.save();
    res.json({ data: record(row.toObject()) });
  });
  router.delete("/owner/categories/:id", async (req, res) => {
    const row = await MenuCategory.findById(oid(req.params.id));
    if (!row) throw new ApiError(404, "NOT_FOUND", "Category not found");
    await owned(res, String(row.restaurantId));
    if (await MenuItem.exists({ categoryId: row._id }))
      throw new ApiError(
        409,
        "CATEGORY_USED",
        "Move items before deleting this category",
      );
    await row.deleteOne();
    res.json({ data: { deleted: true } });
  });
  router.patch("/owner/restaurants/:id/settings", async (req, res) => {
    const input = z
      .object({
        description: z.string().min(3).max(1000).optional(),
        contactPhone: z.string().max(20).optional(),
        openingHours: z.string().max(120).optional(),
        cuisines: z.array(z.string().min(1).max(50)).min(1).max(15).optional(),
        images: z
          .array(
            z
              .string()
              .refine((s) => s.startsWith("/images/") || /^https:\/\//.test(s)),
          )
          .max(10)
          .optional(),
        isOpen: z.boolean().optional(),
        offer: z.string().max(200).optional(),
      })
      .strict()
      .parse(req.body);
    const row = await owned(res, req.params.id);
    row.set(input);
    await row.save();
    await audit(res, "restaurant.settings", "Restaurant", row._id, input);
    res.json({ data: record(row.toObject()) });
  });
  router.get("/partner/assignments", delivery.mine);
  router.post("/partner/assignments/:id/accept", delivery.accept);
  router.post("/partner/assignments/:id/reject", delivery.reject);
  router.get("/partner/deliveries", (req, res) =>
    list(
      req,
      res,
      DeliveryAssignment,
      { deliveryPartnerId: res.locals.user._id },
      [],
      "assignmentStatus",
      "-pickupLocation -deliveryLocation",
    ),
  );
  router.get("/partner/history", (req, res) =>
    list(
      req,
      res,
      DeliveryAssignment,
      {
        deliveryPartnerId: res.locals.user._id,
        assignmentStatus: { $in: ["DELIVERED", "REJECTED", "CANCELLED"] },
      },
      [],
      "assignmentStatus",
      "-pickupLocation -deliveryLocation",
    ),
  );
  router.get("/partner/earnings", (req, res) => analytics(req, res, "partner"));
  router.get("/partner/profile", async (_req, res) =>
    res.json({
      data: await DeliveryPartner.findOne({ userId: res.locals.user._id })
        .select("-currentLocation")
        .lean(),
    }),
  );
  router.patch("/partner/profile", async (req, res) => {
    const input = z
      .object({
        isAvailable: z.boolean().optional(),
        phone: z
          .string()
          .regex(/^\+?[\d\s-]{10,16}$/)
          .optional(),
      })
      .strict()
      .parse(req.body);
    const row = await DeliveryPartner.findOne({ userId: res.locals.user._id });
    if (!row) throw new ApiError(404, "NOT_FOUND", "Partner profile missing");
    if (input.isAvailable && !row.isVerified)
      throw new ApiError(403, "NOT_VERIFIED", "Partner is not verified");
    row.set(input);
    await row.save();
    res.json({
      data: {
        isAvailable: row.isAvailable,
        phone: row.phone,
        isVerified: row.isVerified,
      },
    });
  });
  return router;
}
