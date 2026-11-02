import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/admin','/restaurant-dashboard','/delivery-dashboard','/dashboard','/profile','/checkout','/cart','/orders','/favorites','/deliveries','/payment','/login','/signup','/forgot-password','/reset-password']},sitemap:new URL('/sitemap.xml',siteUrl).href};}
