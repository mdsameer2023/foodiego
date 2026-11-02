export function deploymentEnvironmentIssues(env:Record<string,string|undefined>) {
 if(env.VERCEL!=='1')return [];
 const issues:string[]=[];
 for(const name of ['NEXT_PUBLIC_API_URL','NEXT_PUBLIC_SITE_URL']){
  try{
   const url=new URL(env[name]||'');
   if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)))throw new Error('invalid');
   if(name==='NEXT_PUBLIC_API_URL'&&url.pathname!=='/api')throw new Error('invalid');
   if(name==='NEXT_PUBLIC_SITE_URL'&&url.pathname!=='/')throw new Error('invalid');
  }catch{issues.push(`${name} must be an explicit public HTTPS ${name==='NEXT_PUBLIC_API_URL'?'URL ending in /api':'origin'}`);}
 }
 for(const [name,value] of Object.entries(env))if(value&&name.startsWith('NEXT_PUBLIC_')&&/SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN|GEMINI|MONGODB|JWT|CLOUDINARY_API_KEY/.test(name))issues.push(`${name} must not be exposed in a frontend build`);
 if(env.NEXT_PUBLIC_RAZORPAY_KEY_ID&&!env.NEXT_PUBLIC_RAZORPAY_KEY_ID.startsWith('rzp_test_'))issues.push('Only a Razorpay test public key ID is allowed');
 return issues;
}
