import { Suspense } from "react";
import { Auth } from "@/components/auth";
export default function Page() { return <Suspense><Auth mode="reset" /></Suspense>; }
