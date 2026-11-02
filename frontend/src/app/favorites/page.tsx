import { Suspense } from "react";
import { Discovery } from "@/components/restaurant/discovery";
export default function Page() {
  return (
    <Suspense>
      <Discovery favoritesOnly />
    </Suspense>
  );
}
