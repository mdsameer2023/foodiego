"use client";
import { Button } from "@/components/ui/button";
export default function Error({retry}:{error:Error;retry:()=>void}) {
  return <main className="container page-space empty-state"><h1>Couldn’t load this restaurant.</h1><p>Please check your connection and try again.</p><Button onClick={retry}>Try again</Button></main>;
}
