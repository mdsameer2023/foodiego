import { api } from "./api";

export type User = { id: string; name: string; email: string; phone: string | null; avatar: string | null; role: "CUSTOMER" | "ADMIN" | "RESTAURANT_OWNER" | "DELIVERY_PARTNER"; isEmailVerified: boolean };
export type Address = { id: string; fullName: string; phone: string; addressLine1: string; addressLine2: string; landmark: string; city: string; state: string; postalCode: string; addressType: "HOME" | "WORK" | "OTHER"; isDefault: boolean };
export type AddressInput = Omit<Address, "id">;
const json = (value: unknown) => JSON.stringify(value);

export const authService = {
  me: async () => (await api<{user: User}>("/auth/me")).user,
  login: async (email: string, password: string) => (await api<{user: User}>("/auth/login", {method:"POST", body:json({email,password})})).user,
  register: async (name: string, email: string, password: string) => (await api<{user: User}>("/auth/register", {method:"POST", body:json({name,email,password})})).user,
  logout: () => api("/auth/logout", {method:"POST"}),
  forgot: (email: string) => api("/auth/forgot-password", {method:"POST", body:json({email})}),
  reset: (token: string, password: string) => api("/auth/reset-password", {method:"POST", body:json({token,password})}),
  updateProfile: async (input: {name?: string; phone?: string | null}) => (await api<{user: User}>("/users/profile", {method:"PATCH", body:json(input)})).user,
  changePassword: (currentPassword: string, newPassword: string) => api("/users/change-password", {method:"PATCH", body:json({currentPassword,newPassword})}),
  addresses: () => api<Address[]>("/users/addresses"),
  createAddress: (input: AddressInput) => api<Address>("/users/addresses", {method:"POST", body:json(input)}),
  updateAddress: (id: string, input: Partial<AddressInput>) => api<Address>(`/users/addresses/${id}`, {method:"PATCH", body:json(input)}),
  deleteAddress: (id: string) => api(`/users/addresses/${id}`, {method:"DELETE"}),
};
