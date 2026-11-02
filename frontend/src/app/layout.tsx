import localFont from "next/font/local";
import type { Metadata } from "next";
import "./globals.css";
import { Header, Footer } from "@/components/layout/shell";
import { Providers } from "@/components/providers";
import { siteUrl } from '@/lib/seo';
const inter = localFont({
  src: [
    {path:'../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',weight:'400'},
    {path:'../../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2',weight:'500'},
    {path:'../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2',weight:'600'},
    {path:'../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',weight:'700'},
    {path:'../../node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2',weight:'800'},
  ],
  variable:'--font-inter', display:'swap', adjustFontFallback:'Arial', preload:true,
});
export const metadata: Metadata = {
  metadataBase:siteUrl,
  alternates:{canonical:'/'},
  openGraph:{title:'FoodieGo — Good food. Great mood.',description:'Explore restaurants, discover dishes and order your favourites with FoodieGo.',url:'/',siteName:'FoodieGo',type:'website',locale:'en_IN',images:[{url:'/images/biryani.jpg',alt:'FoodieGo food discovery'}]},
  twitter:{card:'summary_large_image',title:'FoodieGo — Good food. Great mood.',description:'Discover food and restaurants in your city.',images:['/images/biryani.jpg']},
  title: {
    default: "FoodieGo — Good food. Great mood.",
    template: "%s | FoodieGo",
  },
  description:
    "Discover Kolkata’s favourite flavours. Explore restaurants, build your cart and place food orders with FoodieGo.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Providers>
          <Header />
          <div id="main">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
