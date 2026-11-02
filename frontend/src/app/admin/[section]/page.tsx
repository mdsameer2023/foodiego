import { DashboardWorkspace } from "@/components/dashboard/workspace";
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;return <DashboardWorkspace role="admin" section={section}/>;}
