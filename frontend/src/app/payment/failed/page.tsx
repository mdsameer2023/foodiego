import { Suspense } from 'react';
import { PaymentResult } from '@/components/payments/payment-result';
export default function Page(){return <Suspense fallback={<main className="container page-space">Checking payment…</main>}><PaymentResult view="failed"/></Suspense>;}
