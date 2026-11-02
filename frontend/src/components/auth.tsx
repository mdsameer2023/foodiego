"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Mail, Eye, EyeOff, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/auth";

export function Auth({ mode }: { mode: "login" | "signup" | "forgot" | "reset" }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const token = params.get("token") || "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      if (mode === "signup") await authService.register(name,email,password);
      if (mode === "login") await authService.login(email,password);
      if (mode === "forgot") await authService.forgot(email);
      if (mode === "reset") await authService.reset(token,password);
      if (mode === "login" || mode === "signup") {
        await queryClient.invalidateQueries({queryKey:["auth"]});
        const next = params.get("next");
        router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/profile");
      } else setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="container auth-layout">
    <div className="auth-story">
      <span className="eyebrow">A LITTLE APPETITE FOR LIFE</span>
      <h1>Good food.<br />Great company.<br /><em>You&apos;re invited.</em></h1>
      <p>Your favourites, your neighbourhood,<br />your next delicious discovery.</p>
      <div className="auth-illustration">🍜<span>✳</span></div>
      <div className="auth-trust"><ShieldCheck size={18} /> Made with care. Shared with joy.</div>
    </div>
    <section className="auth-form">
      <span className="eyebrow red">WELCOME TO FOODIEGO</span>
      <h2>{mode === "signup" ? "A fresh start tastes good." : mode === "forgot" ? "Let's get you back in." : mode === "reset" ? "Choose a new password." : "Hello again, foodie."}</h2>
      <p className="muted mb-6">{mode === "forgot" ? "We'll send reset instructions if the account exists." : mode === "reset" ? "Your reset link is valid for 20 minutes." : "A world of flavours, right at your doorstep."}</p>
      {done ? <div className="notice space-y-4"><CheckCircle2 className="green"/><h3>{mode === "forgot" ? "Request received" : "Password updated"}</h3><p>{mode === "forgot" ? "If that email is registered, reset instructions are available through the configured delivery method. In local console mode, check the backend terminal." : "Please log in with your new password."}</p><Button asChild><Link href="/login">Back to login <ArrowRight size={17}/></Link></Button></div> :
      <form onSubmit={submit} className="space-y-5">
        {mode === "signup" && <label className="field">Full name<input required minLength={2} maxLength={80} placeholder="Your full name" autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
        {mode !== "reset" && <label className="field">Email address<div className="input-with-icon"><Mail size={17}/><input required type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></div></label>}
        {mode !== "forgot" && <label className="field">{mode === "reset" ? "New password" : "Password"}<div className="input-with-icon"><input required type={show ? "text" : "password"} minLength={8} maxLength={128} placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={()=>setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>}
        {mode === "login" && <div className="text-right text-sm"><Link href="/forgot-password" className="red">Forgot password?</Link></div>}
        {mode === "reset" && !token && <p role="alert" className="red">Reset token is missing. Please use the link from your email.</p>}
        {error && <p role="alert" className="notice red">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || (mode === "reset" && !token)}>{busy ? "Please wait..." : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : mode === "reset" ? "Reset password" : "Log in"} <ArrowRight size={17}/></Button>
        <p className="text-sm text-center muted">{mode === "signup" ? "Already part of the table?" : "New around here?"} <Link className="red font-semibold" href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Log in" : "Sign up"}</Link></p>
      </form>}
    </section>
  </main>;
}
