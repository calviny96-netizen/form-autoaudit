"use client";
import { useEffect, useState } from "react";
import { Button, Field, api, Notice, Footer, MotionIcon, PasswordField, Loading } from "./ui";
import { Dashboard } from "./dashboard";
import { PublicBooking, SuccessPage } from "./public";
import { PublicForm } from "./form-runner";
import { ArrowLeft, Clock3 } from "lucide-react";

export function Application({ path }: { path: string[] }) {
  if (path[0] === "b") return <PublicBooking company={path[1]} campaign={path[2]} />;
  if (path[0] === "f") return <PublicForm company={path[1]} form={path[2]} />;
  if (path[0] === "success") return <SuccessPage token={path[1]} />;
  if (path[0] === "activate") return <AccountForm mode="activate" />;
  if (path[0] === "register") return <AccountForm mode="register" />;
  return <Authenticated />;
}
function Authenticated() {
  const [session, setSession] = useState<any>();
  useEffect(() => { api("auth/me").then(setSession).catch(() => setSession({ user: null })); }, []);
  if (!session) return <main className="loading"><Loading label="Loading your workspace" /></main>;
  return session.user ? <Dashboard session={session} /> : <AccountForm mode="login" />;
}
function AccountForm({ mode }: { mode: "login" | "register" | "activate" }) {
  const register = mode === "register", activate = mode === "activate";
  const [brand, setBrand] = useState({ name: "Auto Audit", support_email: "" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { api("platform-brand").then(setBrand).catch(() => {}); }, []);
  return <div className="auth-page">
    <main className="auth-card">
      <a className="auth-logo" href="/"><img src="/logo-auto-audit.png" alt="Auto Audit" width="150" height="61" /></a>
      {done ? <div className="auth-done">
        {register ? <div className="pending-icon"><Clock3 size={30} /></div> : <MotionIcon success />}
        <h1>{register ? "You're on the list" : "Your password is ready"}</h1>
        <p className="muted">{register ? "Your company registration has been submitted. Super Admin will review your account before you can sign in." : "Your new password has been saved. You can now sign in."}</p>
        {register && <div className="approval-note"><strong>{name}</strong><span>{email}</span><span>Awaiting approval</span></div>}
        <Button as="a" href="/" color="primary" className="w-full">Back to sign in</Button>
      </div> : <>
        <h1>{register ? "Create your account" : activate ? "Set your password" : "Welcome back"}</h1>
        <p className="muted auth-intro">{register ? "A shared calendar for your company or brand." : activate ? "Choose a password to activate your account." : "Sign in to your calendar and bookings."}</p>
        <Notice text={error} />
        <form className="auth-fields" onSubmit={async e => {
          e.preventDefault(); setError("");
          if ((register || activate) && password !== confirm) { setError("Passwords do not match."); return; }
          setBusy(true);
          try {
            if (register) { await api("auth/register", "POST", { name, email, phone, password, confirm_password: confirm }); setDone(true); }
            else if (activate) { await api("auth/activate", "POST", { token: location.hash.slice(1), password }); history.replaceState(null, "", "/activate"); setDone(true); }
            else { await api("auth/login", "POST", { email, password }); location.href = "/"; }
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>
          {register && <Field label="Company or brand name" value={name} onChange={setName} autoComplete="organization" minLength={2} maxLength={150} required />}
          {!activate && <Field label="Email address" type="email" value={email} onChange={setEmail} autoComplete={register ? "email" : "username"} maxLength={254} required />}
          {register && <Field label="Contact person's phone number" type="tel" value={phone} onChange={setPhone} autoComplete="tel" placeholder="e.g. +62 812 3456 7890" description="Use a phone number that is not already registered." required />}
          <PasswordField label="Password" value={password} onChange={setPassword} minLength={register || activate ? 8 : 1} autoComplete={register || activate ? "new-password" : "current-password"} description={register || activate ? "At least 8 characters. Simple passwords are allowed." : undefined} required />
          {(register || activate) && <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" required isInvalid={!!confirm && confirm !== password} errorMessage={confirm && confirm !== password ? "Passwords do not match." : undefined} description={confirm && confirm === password ? "Passwords match." : undefined} />}
          <Button color="primary" type="submit" className="w-full auth-submit" isLoading={busy}>{register ? "Create account" : activate ? "Save password" : "Sign in"}</Button>
        </form>
        {register ? <><p className="auth-note">Your account will be available after Super Admin approval.</p><a className="auth-link" href="/"><ArrowLeft size={15} /> Back to sign in</a></> : !activate && <>
          <p className="auth-note">New here? <a href="/register">Create a company account</a></p>
          <p className="auth-help">Forgot your password? {brand.support_email ? <a href={`mailto:${brand.support_email}`}>Contact your administrator</a> : "Contact your administrator to reset it."}</p>
        </>}
      </>}
    </main>
    <Footer />
  </div>;
}
