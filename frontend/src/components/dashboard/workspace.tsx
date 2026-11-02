"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
const AdminMonitoring=dynamic(()=>import("./monitoring"),{ssr:false});
import { io } from "socket.io-client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Menu,
  LayoutDashboard,
  Store,
  Users,
  Receipt,
  Wallet,
  Truck,
  Tag,
  Star,
  ChartNoAxesCombined,
  Settings,
  History,
  Search,
  ArrowUpRight,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/services/api";
import { authService } from "@/services/auth";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PartnerDeliveries } from "@/components/deliveries/partner-deliveries";

type Role = "admin" | "owner" | "partner";
type Row = Record<string, unknown> & { id: string };
type Result = {
  data: Row[];
  meta: { page: number; pages: number; total: number };
};
type Analytics = {
  stats: Record<string, unknown>;
  series: Record<string, unknown>[];
  statuses: Record<string, unknown>[];
  methods: Record<string, unknown>[];
  topItems: Record<string, unknown>[];
  performance: Record<string, unknown>[];
  deliveryStats: Record<string, unknown>[];
  deliveryTrends?: Record<string,unknown>[];
  recentOrders: Row[];
  operations?: Record<string, Record<string, unknown>[]>;
  definitions: Record<string, string>;
};
const links = {
  admin: [
    "overview",
    "restaurants",
    "users",
    "orders",
    "payments",
    "refunds",
    "deliveries",
    "coupons",
    "reviews",
    "analytics",
    "settings",
    "audit-logs",
    "monitoring",
  ],
  owner: [
    "overview",
    "orders",
    "menu",
    "categories",
    "analytics",
    "reviews",
    "offers",
    "settings",
  ],
  partner: [
    "overview",
    "assignments",
    "active-delivery",
    "earnings",
    "history",
    "profile",
  ],
};
const roots = {
  admin: "/admin",
  owner: "/restaurant-dashboard",
  partner: "/delivery-dashboard",
};
const roles = {
  admin: "ADMIN",
  owner: "RESTAURANT_OWNER",
  partner: "DELIVERY_PARTNER",
};
const icons = [
  LayoutDashboard,
  Store,
  Users,
  Receipt,
  Wallet,
  Truck,
  Tag,
  Star,
  ChartNoAxesCombined,
  Settings,
  History,
];
const title = (s: string) =>
  s.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const rupees = (v: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(v || 0) / 100);
const text = (v: unknown): string =>
  v === null || v === undefined
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "Yes"
        : "No"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
const nested = (r: Record<string, unknown>, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      r,
    );
const palette = [
  "#E23744",
  "#267E3E",
  "#F5A623",
  "#6657B8",
  "#42A5B3",
  "#CB202D",
];
type Customization = {
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: { name: string; price: number }[];
};
function CustomizationFields({
  value,
  onChange,
}: {
  value: Customization[];
  onChange: (v: Customization[]) => void;
}) {
  const update = (index: number, patch: Partial<Customization>) =>
    onChange(
      value.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    );
  return (
    <div className="grid gap-3">
      {value.map((group, index) => (
        <fieldset className="border rounded-xl p-3 grid gap-2" key={index}>
          <legend>Group {index + 1}</legend>
          <input
            aria-label="Customization group name"
            placeholder="Size, toppings…"
            value={group.name}
            onChange={(e) => update(index, { name: e.target.value })}
            required
          />
          <label>
            Required
            <input
              type="checkbox"
              checked={group.required}
              onChange={(e) =>
                update(index, {
                  required: e.target.checked,
                  minSelections: e.target.checked
                    ? Math.max(1, group.minSelections)
                    : group.minSelections,
                })
              }
            />
          </label>
          <label>
            Minimum selections
            <input
              type="number"
              min="0"
              value={group.minSelections}
              onChange={(e) =>
                update(index, { minSelections: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Maximum selections
            <input
              type="number"
              min="1"
              value={group.maxSelections}
              onChange={(e) =>
                update(index, { maxSelections: Number(e.target.value) })
              }
            />
          </label>
          {group.options.map((option, i) => (
            <div className="flex gap-2" key={i}>
              <input
                aria-label="Option name"
                placeholder="Option"
                value={option.name}
                onChange={(e) =>
                  update(index, {
                    options: group.options.map((o, n) =>
                      n === i ? { ...o, name: e.target.value } : o,
                    ),
                  })
                }
                required
              />
              <input
                aria-label="Option price in rupees"
                type="number"
                min="0"
                value={option.price}
                onChange={(e) =>
                  update(index, {
                    options: group.options.map((o, n) =>
                      n === i ? { ...o, price: Number(e.target.value) } : o,
                    ),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  update(index, {
                    options: group.options.filter((_, n) => n !== i),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="chip"
            onClick={() =>
              update(index, {
                options: [...group.options, { name: "", price: 0 }],
              })
            }
          >
            Add option
          </button>
          <button
            type="button"
            className="red"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove group
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="chip"
        onClick={() =>
          onChange([
            ...value,
            {
              name: "",
              required: false,
              minSelections: 0,
              maxSelections: 1,
              options: [{ name: "", price: 0 }],
            },
          ])
        }
      >
        Add customization group
      </button>
    </div>
  );
}
const columns: Record<string, [string, string][]> = {
  restaurants: [
    ["name", "Restaurant"],
    ["city", "City"],
    ["ownerId.name", "Owner"],
    ["isApproved", "Approved"],
    ["managementStatus", "Status"],
  ],
  users: [
    ["name", "Name"],
    ["email", "Email"],
    ["role", "Role"],
    ["isActive", "Active"],
  ],
  orders: [
    ["orderNumber", "Order"],
    ["userId.name", "Customer"],
    ["assignedDeliveryPartnerId.name", "Partner"],
    ["restaurantSnapshot.name", "Restaurant"],
    ["createdAt", "Date"],
    ["pricingBreakdown.totalPaise", "Total"],
    ["paymentMethod", "Payment"],
    ["paymentStatus", "Payment status"],
    ["orderStatus", "Status"],
  ],
  payments: [
    ["razorpayPaymentId", "Payment"],
    ["orderId.orderNumber", "Order"],
    ["userId.name", "Customer"],
    ["amountPaise", "Amount"],
    ["method", "Method"],
    ["status", "Status"],
    ["createdAt", "Date"],
  ],
  refunds: [
    ["razorpayRefundId", "Refund"],
    ["paymentId.razorpayPaymentId", "Payment"],
    ["orderId.orderNumber", "Order"],
    ["amountPaise", "Amount"],
    ["reason", "Reason"],
    ["status", "Status"],
  ],
  deliveries: [
    ["orderId.orderNumber", "Order"],
    ["deliveryPartnerId.name", "Partner"],
    ["assignmentStatus", "Status"],
    ["assignedAt", "Assigned"],
  ],
  partners: [
    ["userId.name", "Partner"],
    ["phone", "Phone"],
    ["vehicleType", "Vehicle"],
    ["isVerified", "Verified"],
    ["isAvailable", "Available"],
  ],
  coupons: [
    ["code", "Code"],
    ["discountType", "Type"],
    ["discountValue", "Discount"],
    ["usageCount", "Used"],
    ["usageLimit", "Limit"],
    ["isActive", "Active"],
    ["expiresAt", "Expires"],
  ],
  reviews: [
    ["rating", "Rating"],
    ["comment", "Review"],
    ["restaurantId", "Restaurant"],
    ["isHidden", "Hidden"],
    ["moderationReason", "Reason"],
  ],
  menu: [
    ["name", "Dish"],
    ["price", "Price (₹)"],
    ["isVegetarian", "Vegetarian"],
    ["isAvailable", "Available"],
    ["isPopular", "Popular"],
  ],
  categories: [
    ["name", "Category"],
    ["sortOrder", "Position"],
  ],
  history: [
    ["orderId.orderNumber", "Order"],
    ["assignmentStatus", "Status"],
    ["assignedAt", "Assigned"],
    ["deliveredAt", "Delivered"],
    ["estimatedEarningsPaise", "Estimated earnings"],
  ],
  "audit-logs": [
    ["createdAt", "Date"],
    ["actorId", "Actor"],
    ["action", "Action"],
    ["resource", "Resource"],
    ["resourceId", "Reference"],
    ["reason", "Reason"],
  ],
};
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
};
type Editor = {
  title: string;
  path: string;
  method: string;
  fields: Field[];
  initial: Record<string, unknown>;
  restaurantId?: string;
  transform?: (v: Record<string, unknown>) => Record<string, unknown>;
};
export function DashboardWorkspace({
  role,
  section = "overview",
}: {
  role: Role;
  section?: string;
}) {
  const auth = useAuth(),
    user = auth.data,
    router = useRouter(),
    client = useQueryClient();
  const [collapsed, setCollapsed] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [restaurant, setRestaurant] = useState(""),
    [period, setPeriod] = useState("day"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [details, setDetails] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [deliveryTab, setDeliveryTab] = useState("deliveries"),
    [roleFilter, setRoleFilter] = useState("");
  const [paymentFilter,setPaymentFilter]=useState(''),[paymentState,setPaymentState]=useState(''),[reviewRating,setReviewRating]=useState('');
  const authorized = user?.role === roles[role];
  const owned = useQuery({
    queryKey: ["workspace", "owner", "restaurants"],
    queryFn: () => api<Row[]>("/owner/restaurants"),
    enabled: authorized && role === "owner",
  });
  const filters = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(search ? { q: search } : {}),
    ...(status ? { status } : {}),
    ...(roleFilter && section === "users" ? { role: roleFilter } : {}),
    ...(restaurant ? { restaurantId: restaurant } : {}),
    ...(paymentFilter&&section==='orders'?{paymentMethod:paymentFilter}:{}),
    ...(paymentState&&section==='orders'?{paymentStatus:paymentState}:{}),
    ...(reviewRating&&section==='reviews'?{rating:reviewRating}:{}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
    period,
  });
  const overview = ["overview", "analytics", "earnings"].includes(section);
  const endpoint =
    section === "offers"
      ? "offers"
      : section === "deliveries"
        ? deliveryTab
        : section;
  const rows = useQuery({
    queryKey: ["workspace", role, endpoint, filters.toString()],
    queryFn: async (): Promise<Result> => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/${role}/${endpoint}?${filters}`,
        { credentials: "include", cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Could not load records");
      return body;
    },
    enabled:
      authorized &&
      !overview &&
      !["settings", "profile", "assignments", "active-delivery", "monitoring"].includes(
        section,
      ),
    refetchInterval: 30000,
  });
  const analytics = useQuery({
    queryKey: ["workspace", role, "analytics", restaurant, period, from, to],
    queryFn: () => api<Analytics>(`/${role}/analytics?${filters}`),
    enabled: authorized && overview,
    refetchInterval: 30000,
  });
  const menuCategories = useQuery({
    queryKey: ["workspace", "owner", "category-options"],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/owner/categories?limit=100`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error("Could not load categories");
      return body.data as Row[];
    },
    enabled: authorized && role === "owner",
  });
  const restaurantOptions=useQuery({queryKey:['workspace','admin','restaurant-options'],queryFn:async()=>{const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:5000/api'}/admin/restaurants?limit=100`,{credentials:'include'});const body=await response.json();if(!response.ok)throw new Error('Could not load restaurants');return body.data as Row[];},enabled:authorized&&role==='admin'});
  const userOptions = useQuery({
    queryKey: ["workspace", "admin", "user-options"],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/admin/users?limit=100`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error("Could not load users");
      return body.data as Row[];
    },
    enabled: authorized && role === "admin",
  });
  const partnerOptions = useQuery({
    queryKey: ["workspace", "admin", "partner-options"],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/admin/partners?limit=100`,
        { credentials: "include" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error("Could not load partners");
      return body.data as Row[];
    },
    enabled: authorized && role === "admin",
  });
  const profile = useQuery({
    queryKey: ["workspace", role, "profile"],
    queryFn: () => api<Record<string, unknown> | null>("/partner/profile"),
    enabled:
      authorized &&
      role === "partner" &&
      ["overview", "profile"].includes(section),
  });
  const settings = useQuery({
    queryKey: ["workspace", "admin", "settings"],
    queryFn: () => api<Record<string, unknown>>("/admin/settings"),
    enabled: authorized && role === "admin" && section === "settings",
  });
  useEffect(() => {
    if (!authorized) return;
    const socket = io(
      new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")
        .origin,
      { path: "/api/socket.io", withCredentials: true },
    );
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["workspace"] });
      void client.invalidateQueries({ queryKey: ["my-deliveries"] });
    };
    socket.on("connect", refresh);
    socket.on("workspace:update", () => {
      refresh();
      setToast("Your workspace has a new update");
    });
    return () => {
      socket.disconnect();
    };
  }, [authorized, client]);
  useEffect(() => {
    if (!auth.isPending && !user)
      router.replace(`/login?next=${encodeURIComponent(roots[role])}`);
  }, [auth.isPending, user, router, role]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function save(
    path: string,
    method: string,
    input: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: JSON.stringify(input) });
      setEditor(null);
      setToast("Changes saved");
      await client.invalidateQueries({ queryKey: ["workspace"] });
      await client.invalidateQueries({ queryKey: ["my-deliveries"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save changes",
      );
    } finally {
      setBusy(false);
    }
  }
  const confirmation = (
    name: string,
    path: string,
    initial: Record<string, unknown>,
    extra: Field[] = [],
  ) =>
    setEditor({
      title: name,
      path,
      method: "PATCH",
      fields: [...extra, { key: "reason", label: "Reason", required: true }],
      initial: { ...initial, confirmed: true },
    });
  function menuEditor(row?: Row) {
    setEditor({
      title: row ? "Edit menu item" : "Add menu item",
      path: `/owner/menu/items${row ? `/${row.id}` : ""}`,
      method: row ? "PATCH" : "POST",
      restaurantId: row
        ? text(row.restaurantId)
        : restaurant || owned.data?.[0]?.id,
      fields: [
        ...(!row
          ? [
              {
                key: "restaurantId",
                label: "Restaurant",
                required: true,
                options: (owned.data || []).map((r) => ({
                  value: r.id,
                  label: text(r.name),
                })),
              },
            ]
          : []),
        {
          key: "categoryId",
          label: "Menu category",
          required: true,
          options: (menuCategories.data || [])
            .filter((c) => !row || c.restaurantId === row.restaurantId)
            .map((c) => ({ value: c.id, label: text(c.name) })),
        },
        { key: "name", label: "Dish name", required: true },
        { key: "description", label: "Description" },
        { key: "price", label: "Price (₹)", type: "number", required: true },
        { key: "image", label: "Food image", type: "image" },
        {
          key: "customizationOptions",
          label: "Dish customizations",
          type: "customizations",
        },
        { key: "isVegetarian", label: "Vegetarian", type: "checkbox" },
        { key: "isAvailable", label: "Available", type: "checkbox" },
        { key: "isPopular", label: "Popular dish", type: "checkbox" },
      ],
      initial: row
        ? {
            categoryId: text(row.categoryId),
            name: row.name,
            description: row.description,
            price: row.price,
            image: row.image,
            isVegetarian: row.isVegetarian,
            isAvailable: row.isAvailable,
            isPopular: row.isPopular,
            customizationOptions: row.customizationOptions || [],
          }
        : {
            restaurantId: restaurant || owned.data?.[0]?.id,
            isVegetarian: true,
            isAvailable: true,
            isPopular: false,
            price: 0,
            customizationOptions: [],
          },
    });
  }
  function couponEditor(row?: Row) {
    setEditor({
      title: row ? "Edit coupon" : "Create coupon",
      path: `/${role}/coupons${row ? `/${row.id}` : ""}`,
      method: row ? "PATCH" : "POST",
      fields: [
        { key: "code", label: "Coupon code", required: true },
        { key: "description", label: "Description" },
        {
          key: "discountType",
          label: "Discount type",
          options: [
            { value: "PERCENT", label: "Percentage" },
            { value: "FIXED", label: "Fixed amount (paise)" },
          ],
        },
        {
          key: "discountValue",
          label: "Discount value",
          type: "number",
          required: true,
        },
        {
          key: "minimumOrderPaise",
          label: "Minimum order (paise)",
          type: "number",
        },
        {
          key: "maxDiscountPaise",
          label: "Maximum discount (paise)",
          type: "number",
        },
        {
          key: "usageLimit",
          label: "Total usage limit (0 = unlimited)",
          type: "number",
        },
        {
          key: "perUserLimit",
          label: "Per customer limit (0 = unlimited)",
          type: "number",
        },
        {
          key: "validFrom",
          label: "Valid from",
          type: "datetime-local",
          required: true,
        },
        {
          key: "expiresAt",
          label: "Expires at",
          type: "datetime-local",
          required: true,
        },
        {
          key: "restaurants",
          label: "Applicable restaurants (leave empty for all, administrators only)",
          type: "multiple",
          options: (role==='admin'?restaurantOptions.data||[]:owned.data||[]).map(r=>({value:r.id,label:text(r.name)})),
        },
        { key: "isActive", label: "Active", type: "checkbox" },
      ],
      initial: {
        code: row?.code || "",
        description: row?.description || "",
        discountType: row?.discountType || "PERCENT",
        discountValue: row?.discountValue || 10,
        minimumOrderPaise: row?.minimumOrderPaise || 0,
        maxDiscountPaise: row?.maxDiscountPaise || 0,
        usageLimit: row?.usageLimit || 0,
        perUserLimit: row?.perUserLimit || 0,
        validFrom: row?.validFrom
          ? String(row.validFrom).slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        expiresAt: row?.expiresAt ? String(row.expiresAt).slice(0, 16) : "",
        restaurants: Array.isArray(row?.applicableRestaurantIds)
          ? row.applicableRestaurantIds.join(",")
          : restaurant,
        isActive: row?.isActive ?? true,
      },
      transform: ({ restaurants, ...v }) => ({
        ...v,
        applicableRestaurantIds: String(restaurants || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    });
  }
  function actions(row: Row) {
    return (
      <div className="dash-actions">
        <button
          onClick={async () => {
            if (
              role === "admin" &&
              ["users", "restaurants"].includes(section)
            ) {
              try {
                setDetails(await api<Row>(`/admin/${section}/${row.id}`));
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not load details",
                );
              }
            } else setDetails(row);
          }}
        >
          Details
        </button>
        {role === "admin" && section === "restaurants" && (
          <>
            {(row.managementStatus ||
              (row.isApproved ? "APPROVED" : "PENDING")) !== "APPROVED" && (
              <button
                onClick={() =>
                  confirmation(
                    "Approve restaurant",
                    `/admin/restaurants/${row.id}/status`,
                    { status: "APPROVED" },
                  )
                }
              >
                Approve
              </button>
            )}
            {row.isApproved ? (
              <button
                onClick={() =>
                  confirmation(
                    "Suspend restaurant",
                    `/admin/restaurants/${row.id}/status`,
                    { status: "SUSPENDED" },
                  )
                }
              >
                Suspend
              </button>
            ) : (
              !["REJECTED", "SUSPENDED"].includes(
                text(row.managementStatus),
              ) && (
                <button
                  onClick={() =>
                    confirmation(
                      "Reject restaurant",
                      `/admin/restaurants/${row.id}/status`,
                      { status: "REJECTED" },
                    )
                  }
                >
                  Reject
                </button>
              )
            )}
          </>
        )}
        {role === "admin" && section === "users" && row.role !== "ADMIN" && (
          <button
            onClick={() =>
              confirmation(
                row.isActive ? "Suspend user" : "Reactivate user",
                `/admin/users/${row.id}/status`,
                { isActive: !row.isActive },
              )
            }
          >
            {row.isActive ? "Suspend" : "Reactivate"}
          </button>
        )}
        {role === "admin" && section === "users" && row.role !== "ADMIN" && (
          <button
            onClick={() =>
              confirmation(
                "Change user role",
                `/admin/users/${row.id}/role`,
                { role: row.role },
                [
                  {
                    key: "role",
                    label: "New role",
                    options: [
                      { value: "CUSTOMER", label: "Customer" },
                      { value: "RESTAURANT_OWNER", label: "Restaurant owner" },
                      { value: "DELIVERY_PARTNER", label: "Delivery partner" },
                    ],
                  },
                ],
              )
            }
          >
            Change role
          </button>
        )}
        {role === "admin" && section === "restaurants" && (
          <button
            onClick={() =>
              confirmation(
                "Assign restaurant owner",
                `/admin/restaurants/${row.id}/owner`,
                {},
                [
                  {
                    key: "ownerId",
                    label: "Restaurant owner",
                    required: true,
                    options: (userOptions.data || [])
                      .filter(
                        (u) => u.role === "RESTAURANT_OWNER" && u.isActive,
                      )
                      .map((u) => ({ value: u.id, label: text(u.name) })),
                  },
                ],
              )
            }
          >
            Assign owner
          </button>
        )}
        {section === "orders" &&
          role === "owner" &&
          row.orderStatus === "PLACED" && (
            <button
              onClick={() =>
                setEditor({
                  title: "Reject new order",
                  path: `/owner/orders/${row.id}/reject`,
                  method: "POST",
                  initial: { confirmed: true },
                  fields: [{ key: "reason", label: "Reason", required: true }],
                })
              }
            >
              Reject
            </button>
          )}
        {section === "orders" &&
          role === "owner" &&
          (
            {
              PLACED: "CONFIRMED",
              CONFIRMED: "PREPARING",
              PREPARING: "READY_FOR_PICKUP",
            } as Record<string, string>
          )[text(row.orderStatus)] && (
            <button
              onClick={() =>
                void save(`/owner/orders/${row.id}/status`, "PATCH", {
                  status: (
                    {
                      PLACED: "CONFIRMED",
                      CONFIRMED: "PREPARING",
                      PREPARING: "READY_FOR_PICKUP",
                    } as Record<string, string>
                  )[text(row.orderStatus)],
                })
              }
            >
              {
                (
                  {
                    PLACED: "Accept",
                    CONFIRMED: "Start preparing",
                    PREPARING: "Ready for pickup",
                  } as Record<string, string>
                )[text(row.orderStatus)]
              }
            </button>
          )}
        {role === "admin" &&
          section === "orders" &&
          ["PLACED", "CONFIRMED"].includes(text(row.orderStatus)) && (
            <button
              onClick={() =>
                setEditor({
                  title: "Cancel order",
                  path: `/orders/${row.id}/cancel`,
                  method: "POST",
                  initial: {},
                  fields: [
                    {
                      key: "reason",
                      label: "Cancellation reason",
                      required: true,
                    },
                  ],
                })
              }
            >
              Cancel
            </button>
          )}
        {role === "admin" &&
          section === "orders" &&
          ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP"].includes(
            text(row.orderStatus),
          ) && (
            <button
              onClick={() =>
                setEditor({
                  title: "Assign delivery partner",
                  path: "/deliveries/assign",
                  method: "POST",
                  initial: { orderId: row.id },
                  fields: [
                    {
                      key: "partnerId",
                      label: "Available delivery partner",
                      required: true,
                      options: (partnerOptions.data || [])
                        .filter(
                          (p) =>
                            p.isVerified &&
                            p.isAvailable &&
                            !p.activeDeliveryId,
                        )
                        .map((p) => ({
                          value: text(nested(p, "userId._id") || p.userId),
                          label: `${text(p.phone)} · ${text(p.vehicleNumber)}`,
                        })),
                    },
                  ],
                })
              }
            >
              Assign partner
            </button>
          )}
        {role === "admin" &&
          section === "deliveries" &&
          deliveryTab === "deliveries" &&
          ["OFFERED", "ACCEPTED"].includes(text(row.assignmentStatus)) && (
            <button
              onClick={() =>
                setEditor({
                  title: "Reassign uncollected delivery",
                  path: `/admin/deliveries/${row.id}/reassign`,
                  method: "POST",
                  fields: [
                    {
                      key: "partnerId",
                      label: "New available partner",
                      required: true,
                      options: (partnerOptions.data || [])
                        .filter(
                          (p) =>
                            p.isVerified &&
                            p.isAvailable &&
                            !p.activeDeliveryId,
                        )
                        .map((p) => ({
                          value: text(nested(p, "userId._id") || p.userId),
                          label: `${text(p.phone)} · ${text(p.vehicleNumber)}`,
                        })),
                    },
                    { key: "reason", label: "Reason", required: true },
                  ],
                  initial: { confirmed: true },
                })
              }
            >
              Reassign
            </button>
          )}
        {role === "admin" &&
          section === "deliveries" &&
          deliveryTab === "partners" && (
            <button
              onClick={() =>
                confirmation(
                  row.isVerified ? "Revoke verification" : "Verify partner",
                  `/admin/partners/${row.id}`,
                  { isVerified: !row.isVerified },
                )
              }
            >
              {row.isVerified ? "Revoke" : "Verify"}
            </button>
          )}
        {role === "admin" &&
          section === "payments" &&
          ["CAPTURED", "PARTIALLY_REFUNDED"].includes(text(row.status)) && (
            <button
              onClick={() =>
                setEditor({
                  title: "Request refund for cancelled order",
                  path: `/payments/${row.id}/refund`,
                  method: "POST",
                  initial: { idempotencyKey: crypto.randomUUID() },
                  fields: [
                    {
                      key: "amountPaise",
                      label: "Refund amount (paise)",
                      type: "number",
                      required: true,
                    },
                    { key: "reason", label: "Reason", required: true },
                  ],
                })
              }
            >
              Refund
            </button>
          )}
        {role === "admin" && section === "reviews" && (
          <button
            onClick={() =>
              confirmation(
                row.isHidden ? "Restore review" : "Hide review",
                `/admin/reviews/${row.id}/visibility`,
                { isHidden: !row.isHidden },
              )
            }
          >
            {row.isHidden ? "Restore" : "Hide"}
          </button>
        )}
        {["coupons", "offers"].includes(section) && (
          <button onClick={() => couponEditor(row)}>Edit</button>
        )}
        {section === "menu" && (
          <>
            <button onClick={() => menuEditor(row)}>Edit</button>
            <button
              onClick={() =>
                void save(`/owner/menu/items/${row.id}`, "PATCH", {
                  isAvailable: !row.isAvailable,
                })
              }
            >
              {row.isAvailable ? "Unavailable" : "Available"}
            </button>
            <button
              onClick={() =>
                setEditor({
                  title: "Archive dish",
                  path: `/owner/menu/items/${row.id}`,
                  method: "DELETE",
                  fields: [],
                  initial: {},
                })
              }
            >
              Archive
            </button>
          </>
        )}
        {section === "categories" && (
          <>
            <button
              onClick={() =>
                setEditor({
                  title: "Edit category",
                  path: `/owner/categories/${row.id}`,
                  method: "PATCH",
                  fields: [
                    { key: "name", label: "Name", required: true },
                    { key: "sortOrder", label: "Position", type: "number" },
                  ],
                  initial: { name: row.name, sortOrder: row.sortOrder },
                })
              }
            >
              Edit
            </button>
            <button
              onClick={() =>
                setEditor({
                  title: "Delete unused category",
                  path: `/owner/categories/${row.id}`,
                  method: "DELETE",
                  fields: [],
                  initial: {},
                })
              }
            >
              Delete
            </button>
          </>
        )}
      </div>
    );
  }
  if (auth.isPending) return <div className="dash-loading skeleton" />;
  if (!authorized)
    return (
      <main className="container empty-state">
        <h1>
          {user
            ? "You do not have access to this dashboard."
            : "Opening sign in…"}
        </h1>
        <Link href="/">Back to FoodieGo</Link>
      </main>
    );
  if (!links[role].includes(section))
    return (
      <main className="container empty-state">
        <h1>Page not found</h1>
        <Link href={roots[role]}>Dashboard home</Link>
      </main>
    );
  const data = analytics.data;
  const metrics =
    role === "admin"
      ? [
          "totalUsers",
          "activeRestaurants",
          "pendingApprovals",
          "totalOrders",
          "completedOrders",
          "cancelledOrders",
          "grossOrderValuePaise",
          "capturedOnlinePaise",
          "codOrders",
          "pendingRefunds",
          "activeDeliveryPartners",
        ]
      : role === "owner"
        ? [
            "todayOrders",
            "pendingOrders",
            "preparingOrders",
            "completedOrders",
            "completedSalesPaise",
            "averageOrderValuePaise",
            "averageRating",
          ]
        : [
            "todayDeliveries",
            "activeDelivery",
            "pendingAssignments",
            "completedDeliveries",
            "estimatedEarningsPaise",
          ];
  const currentColumns =
    columns[
      section === "offers"
        ? "coupons"
        : section === "deliveries"
          ? deliveryTab
          : section
    ] || [];
  return (
    <div className={`dash-workspace ${collapsed ? "dash-collapsed" : ""}`}>
      <aside className="dash-sidebar">
        <Link href={roots[role]} className="dash-brand">
          foodie<span>go.</span>
        </Link>
        <small className="dash-role">{title(role)} workspace</small>
        <nav aria-label="Dashboard navigation">
          {links[role].map((item, i) => {
            const Icon = icons[i % icons.length];
            return (
              <Link
                className={section === item ? "active" : ""}
                href={`${roots[role]}${item === "overview" ? "" : `/${item}`}`}
                key={item}
              >
                <Icon size={19} />
                <span>{title(item)}</span>
              </Link>
            );
          })}
        </nav>
        <Link className="dash-back" href="/">
          ← Customer website
        </Link>
      </aside>
      <div className="dash-body">
        <header className="dash-topbar">
          <button
            className="dash-icon"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            <Menu size={22} />
          </button>
          <div>
            <small>FOODIEGO / {title(role)}</small>
            <h1>{title(section)}</h1>
          </div>
          <div className="dash-user">
            <span>
              {user?.name}
              <small>{title(role)}</small>
            </span>
            <button
              className="dash-icon"
              aria-label="Log out"
              onClick={async () => {
                await authService.logout();
                client.clear();
                router.push("/login");
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="dash-content">
          <div className="dash-heading">
            <div>
              <span className="eyebrow red">YOUR OPERATIONS, AT A GLANCE</span>
              <h2>
                {section === "overview"
                  ? `Welcome back, ${user?.name.split(" ")[0]}.`
                  : title(section)}
              </h2>
              <p className="muted">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              className="dash-refresh"
              onClick={() =>
                void client.invalidateQueries({ queryKey: ["workspace"] })
              }
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          {toast && (
            <div role="status" className="dash-toast">
              {toast}
            </div>
          )}
          {error && !editor && (
            <p role="alert" className="notice red">
              {error}
            </p>
          )}
          <div className="dash-filters">
            {role === "owner" && (
              <select
                aria-label="Select restaurant"
                value={restaurant}
                onChange={(e) => {
                  setRestaurant(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All my restaurants</option>
                {owned.data?.map((r) => (
                  <option value={r.id} key={r.id}>
                    {text(r.name)}
                  </option>
                ))}
              </select>
            )}
            {overview ? (
              <>
                <select
                  aria-label="Chart period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
                <label>
                  From
                  <input
                    aria-label="From date"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    aria-label="To date"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            ) : (
              ![
                "settings",
                "profile",
                "assignments",
                "active-delivery",
        "monitoring",
              ].includes(section) && (
                <>
                  <label className="dash-search">
                    <Search size={17} />
                    <input
                      aria-label="Search records"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Search records…"
                    />
                  </label>
                  <input
                    aria-label="Filter status"
                    placeholder="Status filter"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  />
                </>
              )
            )}
            {section==='orders'&&<><select aria-label="Payment method filter" value={paymentFilter} onChange={e=>{setPaymentFilter(e.target.value);setPage(1);}}><option value="">All payment methods</option><option value="COD">Cash on delivery</option><option value="ONLINE">Online payment</option></select><select aria-label="Payment status filter" value={paymentState} onChange={e=>{setPaymentState(e.target.value);setPage(1);}}><option value="">All payment statuses</option>{['PENDING','AUTHORIZED','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED'].map(s=><option key={s}>{s}</option>)}</select></>}
            {section==='reviews'&&<><select aria-label="Review rating filter" value={reviewRating} onChange={e=>{setReviewRating(e.target.value);setPage(1);}}><option value="">All ratings</option>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} stars</option>)}</select>{role==='admin'&&<select aria-label="Review restaurant filter" value={restaurant} onChange={e=>{setRestaurant(e.target.value);setPage(1);}}><option value="">All restaurants</option>{restaurantOptions.data?.map(r=><option key={r.id} value={r.id}>{text(r.name)}</option>)}</select>}</>}
            {!overview &&
              ![
                "settings",
                "profile",
                "assignments",
                "active-delivery",
        "monitoring",
              ].includes(section) && (
                <>
                  <label>
                    From
                    <input
                      aria-label="From date"
                      type="date"
                      value={from}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <label>
                    To
                    <input
                      aria-label="To date"
                      type="date"
                      value={to}
                      onChange={(e) => {
                        setTo(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                </>
              )}
            {section === "users" && (
              <select
                aria-label="Filter user role"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All roles</option>
                {[
                  "CUSTOMER",
                  "RESTAURANT_OWNER",
                  "DELIVERY_PARTNER",
                  "ADMIN",
                ].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            )}
            {role === "admin" && section === "deliveries" && (
              <Button
                onClick={() =>
                  setEditor({
                    title: "Create or verify partner profile",
                    path: "/deliveries/partners",
                    method: "POST",
                    fields: [
                      {
                        key: "userId",
                        label: "Partner account",
                        required: true,
                        options: (userOptions.data || [])
                          .filter((u) => u.role !== "ADMIN" && u.isActive)
                          .map((u) => ({
                            value: u.id,
                            label: `${text(u.name)} · ${text(u.email)}`,
                          })),
                      },
                      { key: "phone", label: "Phone", required: true },
                      {
                        key: "vehicleType",
                        label: "Vehicle",
                        options: ["BIKE", "SCOOTER", "CYCLE", "CAR"].map(
                          (value) => ({
                            value,
                            label: title(value.toLowerCase()),
                          }),
                        ),
                      },
                      {
                        key: "vehicleNumber",
                        label: "Vehicle number",
                        required: true,
                      },
                      {
                        key: "isVerified",
                        label: "Verified partner",
                        type: "checkbox",
                      },
                    ],
                    initial: { vehicleType: "BIKE", isVerified: false },
                  })
                }
              >
                Add partner
              </Button>
            )}
            {section === "menu" && (
              <Button disabled={owned.isPending||menuCategories.isPending||!owned.data?.length} onClick={() => menuEditor()}>
                <Plus size={16} /> Add dish
              </Button>
            )}
            {["coupons", "offers"].includes(section) && (
              <Button onClick={() => couponEditor()}>
                <Plus size={16} /> Create coupon
              </Button>
            )}
            {section === "categories" && (
              <Button
                onClick={() =>
                  setEditor({
                    title: "Add category",
                    path: "/owner/categories",
                    method: "POST",
                    fields: [
                      {
                        key: "restaurantId",
                        label: "Restaurant",
                        required: true,
                        options: (owned.data || []).map((r) => ({
                          value: r.id,
                          label: text(r.name),
                        })),
                      },
                      { key: "name", label: "Category name", required: true },
                      { key: "sortOrder", label: "Position", type: "number" },
                    ],
                    initial: {
                      restaurantId: restaurant || owned.data?.[0]?.id,
                      sortOrder: 0,
                    },
                  })
                }
              >
                <Plus size={16} /> Add category
              </Button>
            )}
            {role === "admin" && section === "deliveries" && (
              <select
                aria-label="Delivery view"
                value={deliveryTab}
                onChange={(e) => {
                  setDeliveryTab(e.target.value);
                  setStatus("");
                  setPage(1);
                }}
              >
                <option value="deliveries">Assignments</option>
                <option value="partners">Partners</option>
              </select>
            )}
          </div>
            {role==='admin'&&section==='monitoring'&&<AdminMonitoring/>}
          {overview && (
            <>
              {analytics.isPending ? (
                <div className="dash-stats">
                  {[1, 2, 3, 4].map((n) => (
                    <div className="skeleton h-32 rounded-2xl" key={n} />
                  ))}
                </div>
              ) : analytics.isError ? (
                <p role="alert" className="notice">
                  {analytics.error.message}
                </p>
              ) : (
                data && (
                  <>
                    <div className="dash-stats">
                      {metrics.map((key, i) => (
                        <motion.article
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.025 }}
                          key={key}
                          className={`dash-stat ${i === 0 ? "primary" : ""}`}
                        >
                          <span>
                            {title(
                              key
                                .replace(/Paise$/, "")
                                .replace(/([A-Z])/g, " $1"),
                            )}
                          </span>
                          <strong>
                            {key.endsWith("Paise")
                              ? rupees(data.stats[key])
                              : text(data.stats[key] ?? 0)}
                          </strong>
                          <small>
                            {key.includes("Earnings")
                              ? "Estimated · no verified payout"
                              : "From your database"}
                            <ArrowUpRight size={16} />
                          </small>
                        </motion.article>
                      ))}
                    </div>
                    <div className="dash-charts">
                      <section className="dash-panel dash-wide">
                        <h3>
                          {role === "partner"
                            ? "Estimated delivery earnings"
                            : role === "owner" ? "Completed sales trends" : "Order value trends"}
                        </h3>
                        <p className="muted">
                          {role === "partner"
                            ? "Estimates for completed deliveries · not verified payouts"
                            : role === "owner" ? "Delivered order totals before refunds" : "Gross order value · not platform revenue"}
                        </p>
                        <div className="dash-chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={data.series.map((r) => ({
                                ...r,
                                value:
                                  Number(
                                    (role === "partner"
                                      ? r.estimatedEarningsPaise
                                      : role === "owner" ? r.completedSalesPaise : r.grossOrderValuePaise) || 0,
                                  ) / 100,
                              }))}
                            >
                              <defs>
                                <linearGradient
                                  id="sales-fill"
                                  x1="0"
                                  x2="0"
                                  y1="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#E23744"
                                    stopOpacity={0.25}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#E23744"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 3"
                              />
                              <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Area
                        isAnimationActive={false}
                                dataKey="value"
                                name={
                                  role === "partner"
                                    ? "Estimated earnings (₹)"
                                    : role === "owner" ? "Completed sales (₹)" : "Gross order value (₹)"
                                }
                                stroke="#E23744"
                                fill="url(#sales-fill)"
                                strokeWidth={3}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                      <section className="dash-panel">
                        <h3>Order status</h3>
                        <div className="dash-chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                        isAnimationActive={false}
                                data={data.statuses}
                                dataKey="count"
                                nameKey="_id"
                                innerRadius="55%"
                                outerRadius="80%"
                              >
                                {data.statuses.map((_, i) => (
                                  <Cell
                                    key={i}
                                    fill={palette[i % palette.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="dash-legend">
                          {data.statuses.map((r, i) => (
                            <span key={text(r._id)}>
                              <i
                                style={{
                                  background: palette[i % palette.length],
                                }}
                              />
                              {title(
                                text(r._id).toLowerCase().replaceAll("_", " "),
                              )}{" "}
                              · {text(r.count)}
                            </span>
                          ))}
                        </div>
                      </section>
                      <section className="dash-panel">
                        <h3>Order volume</h3>
                        <div className="dash-chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.series}>
                              <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 3"
                              />
                              <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Bar
                        isAnimationActive={false}
                                dataKey="orders"
                                fill="#E23744"
                                radius={[5, 5, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                      <section className="dash-panel">
                        <h3>Best selling dishes</h3>
                        {data.topItems.length ? (
                          data.topItems.map((r, i) => (
                            <div className="dash-rank" key={text(r._id)}>
                              <span>{i + 1}</span>
                              <div>
                                <strong>{text(r._id)}</strong>
                                <small>
                                  {text(r.quantity)} items delivered
                                </small>
                              </div>
                              <b>{rupees(r.salesPaise)}</b>
                            </div>
                          ))
                        ) : (
                          <p className="dash-empty">
                            Delivered dishes will appear here.
                          </p>
                        )}
                      </section>
                      <section className="dash-panel">
                        <h3>Payment methods</h3>
                        {data.methods.length>0?<div className="dash-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.methods} dataKey="count" nameKey="_id" innerRadius="55%" outerRadius="80%" isAnimationActive={false}>{data.methods.map((_,i)=><Cell key={i} fill={palette[i%palette.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></div>:<p className="dash-empty">No payment activity in this period.</p>}
                        {data.methods.map((r) => (
                          <div className="dash-rank" key={text(r._id)}>
                            <Wallet size={18} />
                            <strong>{text(r._id)}</strong>
                            <b>{text(r.count)} orders</b>
                          </div>
                        ))}
                        <h3 className="mt-6">Delivery status</h3>
                        {data.deliveryStats.map((r) => (
                          <div className="dash-rank" key={text(r._id)}>
                            <strong>{title(text(r._id).toLowerCase())}</strong>
                            <b>{text(r.count)}</b>
                          </div>
                        ))}
                      </section>
                      <section className="dash-panel"><h3>Delivery completion trends</h3>{data.deliveryTrends?.length?<div className="dash-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.deliveryTrends}><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="_id" tick={{fontSize:10}}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="completed" name="Completed deliveries" fill="#267E3E" radius={[5,5,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>:<p className="dash-empty">Completed deliveries will appear here.</p>}</section>
                    </div>
                    {role === "partner" && (
                      <div className="dash-panel">
                        <h3>Estimated delivery earnings</h3>
                        <p>
                          {rupees(data.stats.estimatedRatePaise ?? 5000)} per
                          completed delivery. Pending and paid payouts are
                          unavailable because no verified payout ledger is
                          configured.
                        </p>
                        <Button
                          className="mt-4"
                          onClick={() =>
                            void save("/partner/profile", "PATCH", {
                              isAvailable: !profile.data?.isAvailable,
                            })
                          }
                        >
                          {profile.data?.isAvailable
                            ? "Go unavailable"
                            : "Go available"}
                        </Button>
                        <Link
                          className="chip ml-3"
                          href="/delivery-dashboard/active-delivery"
                        >
                          View active delivery
                        </Link>
                      </div>
                    )}
                    <section className="dash-panel">
                      <h3>Recent orders</h3>
                      {data.recentOrders.length ? (
                        <div className="dash-table-wrap">
                          <table className="dash-table">
                            <thead>
                              <tr>
                                <th>Order</th>
                                <th>Restaurant</th>
                                <th>Status</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.recentOrders.map((r) => (
                                <tr key={r.id}>
                                  <td>{text(r.orderNumber)}</td>
                                  <td>
                                    {text(nested(r, "restaurantSnapshot.name"))}
                                  </td>
                                  <td>
                                    <span className="dash-badge">
                                      {text(r.orderStatus)}
                                    </span>
                                  </td>
                                  <td>
                                    {rupees(
                                      nested(r, "pricingBreakdown.totalPaise"),
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="dash-empty">No orders yet.</p>
                      )}
                    </section>
                    {role === "admin" && data.operations && (
                      <div className="dash-charts">
                        {Object.entries(data.operations).map(
                          ([key, records]) => (
                            <section className="dash-panel" key={key}>
                              <h3>
                                {
                                  (
                                    {
                                      approvals: "Pending approvals",
                                      pendingRefundRecords: "Pending refunds",
                                      issues: "Delivery issues",
                                      activity: "Administrative activity",
                                    } as Record<string, string>
                                  )[key]
                                }
                              </h3>
                              {records.length ? (
                                records.map((r, i) => (
                                  <div className="dash-rank" key={i}>
                                    <div>
                                      <strong>
                                        {text(
                                          r.name ||
                                            r.action ||
                                            r.assignmentStatus ||
                                            r.reason,
                                        )}
                                      </strong>
                                      <small>
                                        {r.createdAt
                                          ? new Date(
                                              String(r.createdAt),
                                            ).toLocaleString("en-IN")
                                          : text(r.orderId)}
                                      </small>
                                    </div>
                                    {r.amountPaise !== undefined && (
                                      <b>{rupees(r.amountPaise)}</b>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <p className="dash-empty">
                                  Nothing needs attention here.
                                </p>
                              )}
                            </section>
                          ),
                        )}
                      </div>
                    )}
                    {data.performance.length > 0 && (
                      <section className="dash-panel">
                        <h3>Restaurant performance</h3>
                        <div className="dash-chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.performance}>
                              <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 3"
                              />
                              <XAxis dataKey="_id" tick={{ fontSize: 10 }} />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Bar
                        isAnimationActive={false}
                                dataKey="orders"
                                fill="#267E3E"
                                radius={[5, 5, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                    )}
                    <details className="dash-panel">
                      <summary>How these figures are calculated</summary>
                      {Object.entries(data.definitions).map(([key, value]) => (
                        <p key={key} className="muted mt-2">
                          {value}
                        </p>
                      ))}
                    </details>
                  </>
                )
              )}
            </>
          )}
          {!overview &&
            !["settings", "profile", "assignments", "active-delivery", "monitoring"].includes(
              section,
            ) && (
              <section className="dash-panel">
                <div className="dash-panel-heading">
                  <h3>{title(endpoint)}</h3>
                  <span className="muted">
                    {rows.data?.meta.total || 0} records
                  </span>
                </div>
                {rows.isPending ? (
                  <div className="skeleton h-64 rounded-xl" />
                ) : rows.isError ? (
                  <p role="alert" className="notice">
                    {rows.error.message}
                  </p>
                ) : rows.data?.data.length ? (
                  <>
                    <div className="dash-table-wrap">
                      <table className="dash-table">
                        <thead>
                          <tr>
                            {currentColumns.map(([key, label]) => (
                              <th key={key}>{label}</th>
                            ))}
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.data.data.map((row) => (
                            <tr key={row.id}>
                              {currentColumns.map(([key]) => {
                                const value = nested(row, key);
                                return (
                                  <td key={key}>
                                    {key.endsWith("Paise") ? (
                                      rupees(value)
                                    ) : key.endsWith("At") ? (
                                      value ? (
                                        new Date(
                                          String(value),
                                        ).toLocaleDateString("en-IN")
                                      ) : (
                                        "—"
                                      )
                                    ) : key.toLowerCase().includes("status") ||
                                      key === "role" ? (
                                      <span className="dash-badge">
                                        {text(value)}
                                      </span>
                                    ) : (
                                      text(value)
                                    )}
                                  </td>
                                );
                              })}
                              <td>{actions(row)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="dash-pagination">
                      <span>
                        Page {page} of {Math.max(1, rows.data.meta.pages)}
                      </span>
                      <Button
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={17} />
                      </Button>
                      <Button
                        variant="outline"
                        disabled={page >= rows.data.meta.pages}
                        onClick={() => setPage(page + 1)}
                        aria-label="Next page"
                      >
                        <ChevronRight size={17} />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="dash-empty">
                    <Receipt size={30} />
                    <h3>No records found</h3>
                    <p>Try another search or filter.</p>
                  </div>
                )}
              </section>
            )}
          {role === "partner" &&
            ["assignments", "active-delivery"].includes(section) && (
              <div className="dash-partner">
                <PartnerDeliveries />
              </div>
            )}
          {section === "profile" && role === "partner" && (
            <section className="dash-panel">
              <h3>Delivery profile</h3>
              {profile.isPending ? (
                <div className="skeleton h-48" />
              ) : profile.data ? (
                <>
                  <dl className="dash-details">
                    {Object.entries(profile.data)
                      .filter(
                        ([k]) => !["_id", "__v", "currentLocation"].includes(k),
                      )
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{title(k.replace(/([A-Z])/g, " $1"))}</dt>
                          <dd>{text(v)}</dd>
                        </div>
                      ))}
                  </dl>
                  <Button
                    onClick={() =>
                      setEditor({
                        title: "Update delivery profile",
                        path: "/partner/profile",
                        method: "PATCH",
                        fields: [
                          { key: "phone", label: "Phone", required: true },
                          {
                            key: "isAvailable",
                            label: "Available for deliveries",
                            type: "checkbox",
                          },
                        ],
                        initial: {
                          phone: profile.data?.phone,
                          isAvailable: profile.data?.isAvailable,
                        },
                      })
                    }
                  >
                    Edit profile
                  </Button>
                </>
              ) : (
                <p>
                  Ask an administrator to create your delivery partner profile.
                </p>
              )}
            </section>
          )}
          {section === "settings" && (
            <section className="dash-panel">
              <h3>
                {role === "owner" ? "Restaurant settings" : "Platform settings"}
              </h3>
              {role === "admin" ? (
                <dl className="dash-details">
                  {Object.entries(settings.data || {}).map(([k, v]) => (
                    <div key={k}>
                      <dt>{title(k)}</dt>
                      <dd>{text(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                owned.data?.map((r) => (
                  <div className="dash-rank" key={r.id}>
                    <div>
                      <strong>{text(r.name)}</strong>
                      <small>
                        {r.isOpen ? "Open for orders" : "Temporarily closed"}
                      </small>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditor({
                          title: `Settings · ${text(r.name)}`,
                          path: `/owner/restaurants/${r.id}/settings`,
                          method: "PATCH",
                          fields: [
                            {
                              key: "description",
                              label: "Description",
                              required: true,
                            },
                            { key: "contactPhone", label: "Contact phone" },
                            { key: "openingHours", label: "Opening hours" },
                            {
                              key: "cuisineList",
                              label: "Cuisines (comma separated)",
                            },
                            {
                              key: "imageList",
                              label: "Restaurant image URLs (comma separated)",
                            },
                            { key: "offer", label: "Offer display text" },
                            {
                              key: "isOpen",
                              label: "Open for orders",
                              type: "checkbox",
                            },
                          ],
                          initial: {
                            description: r.description,
                            contactPhone: r.contactPhone || "",
                            openingHours: r.openingHours,
                            cuisineList: Array.isArray(r.cuisines)
                              ? r.cuisines.join(", ")
                              : "",
                            imageList: Array.isArray(r.images)
                              ? r.images.join(", ")
                              : "",
                            offer: r.offer,
                            isOpen: r.isOpen,
                          },
                          transform: ({ cuisineList, imageList, ...v }) => ({
                            ...v,
                            cuisines: String(cuisineList || "")
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                            images: String(imageList || "")
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          }),
                        })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                ))
              )}
            </section>
          )}
        </main>
      </div>
      <Modal
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
            setError("");
          }
        }}
        title={editor?.title || "Edit"}
      >
        {editor && (
          <form
            className="dash-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                values = { ...editor.initial };
              for (const field of editor.fields) {
                if (field.type === "customizations") continue;
                if(field.type==='multiple'){values[field.key]=form.getAll(field.key);continue;}
                values[field.key] =
                  field.type === "checkbox"
                    ? form.has(field.key)
                    : field.type === "number"
                      ? Number(form.get(field.key) || 0)
                      : String(form.get(field.key) || "");
              }
              void save(
                editor.path,
                editor.method,
                editor.transform ? editor.transform(values) : values,
              );
            }}
          >
            {editor.fields.map((field) => (
              <div className="field" key={field.key}>
                <label htmlFor={`dash-field-${field.key}`}>{field.label}</label>
                {field.type === "customizations" ? (
                  <CustomizationFields
                    value={
                      (editor.initial.customizationOptions ||
                        []) as Customization[]
                    }
                    onChange={(value) =>
                      setEditor({
                        ...editor,
                        initial: {
                          ...editor.initial,
                          customizationOptions: value,
                        },
                      })
                    }
                  />
                ) : field.type === "image" ? (
                  <>
                    <input
                      id={`dash-field-${field.key}`}
                      name={field.key}
                      defaultValue={String(editor.initial[field.key] || "")}
                      placeholder="Existing food image URL"
                    />
                    <input
                      aria-label="Upload food image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (event) => {
                        const file = event.target.files?.[0],
                          form = event.target.form;
                        if (!file || !form) return;
                        if (file.size > 4 * 1024 * 1024) {
                          setError("Maximum image size is 4 MB");
                          return;
                        }
                        setBusy(true);
                        try {
                          const image = await new Promise<string>(
                            (resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () =>
                                resolve(String(reader.result));
                              reader.onerror = reject;
                              reader.readAsDataURL(file);
                            },
                          );
                          const result = await api<{ url: string }>(
                            "/owner/images",
                            {
                              method: "POST",
                              body: JSON.stringify({
                                restaurantId:
                                  new FormData(form).get("restaurantId") ||
                                  editor.restaurantId,
                                image,
                              }),
                            },
                          );
                          const input =
                            form.querySelector<HTMLInputElement>(
                              "input[name=image]",
                            );
                          if (input) input.value = result.url;
                          setError("");
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Upload failed",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </>
                ) : field.options ? (
                  <select
                    id={`dash-field-${field.key}`}
                    name={field.key}
                    multiple={field.type==='multiple'}
                    defaultValue={field.type==='multiple'?String(editor.initial[field.key]||'').split(',').filter(Boolean):text(editor.initial[field.key])}
                    required={field.required}
                  >
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "checkbox" ? (
                  <input
                    id={`dash-field-${field.key}`}
                    name={field.key}
                    type="checkbox"
                    defaultChecked={Boolean(editor.initial[field.key])}
                  />
                ) : (
                  <input
                    id={`dash-field-${field.key}`}
                    name={field.key}
                    type={field.type || "text"}
                    defaultValue={
                      editor.initial[field.key] === undefined
                        ? ""
                        : String(editor.initial[field.key])
                    }
                    required={field.required}
                    min={field.type === "number" ? 0 : undefined}
                    step={field.type === "number" ? "any" : undefined}
                  />
                )}
              </div>
            ))}
            {editor.initial.confirmed === true && (
              <p className="notice">
                This action will be recorded in the audit log. Review the
                details before confirming.
              </p>
            )}
            {error && (
              <p role="alert" className="red">
                {error}
              </p>
            )}
            <Button disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!details}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
        title="Record details"
      >
        <dl className="dash-details">
          {details &&
            Object.entries(details)
              .filter(
                ([key]) =>
                  !["passwordHash", "checkoutFingerprint"].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{title(key.replace(/([A-Z])/g, " $1"))}</dt>
                  <dd>{text(value)}</dd>
                </div>
              ))}
        </dl>
      </Modal>
    </div>
  );
}
