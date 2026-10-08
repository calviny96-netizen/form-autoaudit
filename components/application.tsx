"use client";
import { useEffect, useState } from "react";
import { Button, Field, api, Notice, Footer, MotionIcon } from "./ui";
import { Dashboard } from "./dashboard";
import { PublicBooking, SuccessPage } from "./public";
import { ShineBorder } from "./shine-border";
import { CalendarDays, ShieldCheck, Users, Clock3 } from "lucide-react";
export function Application({ path }: { path: string[] }) {
  if (path[0] === "b")
    return <PublicBooking company={path[1]} campaign={path[2]} />;
  if (path[0] === "success") return <SuccessPage token={path[1]} />;
  if (path[0] === "activate") return <Login activate />;
  return <Authenticated />;
}
function Authenticated() {
  const [session, setSession] = useState<any>();
  useEffect(() => {
    api("auth/me")
      .then(setSession)
      .catch(() => setSession({ user: null }));
  }, []);
  if (!session) return <main className="loading">Memuat ruang kerja…</main>;
  return session.user ? <Dashboard session={session} /> : <Login />;
}
function Login({ activate = false }: { activate?: boolean }) {
  const [brand, setBrand] = useState({name: "Auto Audit", support_email: ""});
  useEffect(() => { api("platform-brand").then(setBrand).catch(() => {}); }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="login-layout">
      <section className="login-story">
        <img src="/logo-auto-audit.png" alt="Auto Audit" width="170" />
        <div>
          <span className="eyebrow">INTERVIEW SCHEDULER</span>
          <h1>
            Jadwal tertata.
            <br />
            Kesempatan terbuka.
          </h1>
          <p>
            Satu tempat untuk mengatur gelombang interview, menyambut peserta,
            dan menjaga setiap kursi tetap terhitung.
          </p>
          <div className="story-card">
            <ShineBorder shineColor={["#7dd3fc", "#0369a1"]} />
            <div className="row">
              <CalendarDays />
              <strong>Interview yang lebih terorganisir</strong>
            </div>
            <div className="story-feature">
              <Clock3 /> Jadwal fleksibel, kuota per sesi
            </div>
            <div className="story-feature">
              <Users /> Ruang kerja untuk setiap company
            </div>
            <div className="story-feature">
              <ShieldCheck /> Akses sesuai tanggung jawab
            </div>
          </div>
        </div>
        <span className="muted">
          {brand.name} · Dibuat untuk proses yang lebih rapi
        </span>
      </section>
      <main className="login-main">
        <div className="login-form">
          <span className="eyebrow">SELAMAT DATANG</span>
          <h2>{activate ? "Aktifkan akses Anda" : "Masuk ke ruang kerja"}</h2>
          <p className="muted">
            {activate
              ? "Buat password pribadi untuk mengamankan akun Anda."
              : "Kelola jadwal dan peserta interview Anda."}
          </p>
          <Notice text={error} />
          {done ? (
            <>
              <MotionIcon success />
              <p>Password berhasil disimpan.</p>
              <Button color="primary" onPress={() => (location.href = "/")}>
                Masuk sekarang
              </Button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  if (activate) {
                    await api("auth/activate", "POST", {
                      token: location.hash.slice(1),
                      password,
                    });
                    history.replaceState(null, "", "/activate");
                    setDone(true);
                  } else {
                    await api("auth/login", "POST", { email, password });
                    location.href = "/";
                  }
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {!activate && (
                <Field
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  required
                  autoComplete="username"
                />
              )}
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                required
                minLength={activate ? 12 : 1}
                autoComplete={activate ? "new-password" : "current-password"}
                description={
                  activate
                    ? "Minimal 12 karakter."
                    : "Gunakan akses yang diberikan pengelola."
                }
              />
              <Button
                className="w-full"
                color="primary"
                type="submit"
                isLoading={busy}
              >
                {activate ? "Simpan password" : "Masuk"}
              </Button>
            </form>
          )}
          <p className="login-help">
            Belum memiliki akses atau lupa password?
            <br />
            Hubungi pengelola platform untuk tautan aktivasi.
            {brand.support_email && <><br/><a href={`mailto:${brand.support_email}`}>{brand.support_email}</a></>}
          </p>
        </div>
        <Footer />
      </main>
    </div>
  );
}
