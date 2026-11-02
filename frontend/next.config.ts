import type { NextConfig } from "next";
import {deploymentEnvironmentIssues} from './src/lib/deployment-env';
const deploymentIssues=deploymentEnvironmentIssues(process.env);
if(deploymentIssues.length)throw new Error(deploymentIssues.join('; '));
const config: NextConfig = {
  distDir:process.env.FOODIEGO_BUILD_DIR||'.next',
  async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}]}];},
  turbopack: { root: process.cwd() },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" },{protocol:"https",hostname:"res.cloudinary.com"}],
  },
};
export default config;
