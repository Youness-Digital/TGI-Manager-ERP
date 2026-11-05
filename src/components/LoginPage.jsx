import { useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, LockKeyhole, LoaderCircle, Mail, ShieldCheck, Wrench } from "lucide-react";
import { browserLocalPersistence, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import CompanyLogo from "./CompanyLogo";
import InstallPrompt from "./InstallPrompt";

function getLoginError(error) {
  switch (error.code) {
    case "auth/invalid-email":
      return "L’adresse e-mail n’est pas valide.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Adresse e-mail ou mot de passe incorrect.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Patientez avant de réessayer.";
    case "auth/network-request-failed":
      return "Connexion impossible. Vérifiez votre accès à Internet.";
    default:
      return "La connexion a échoué. Vérifiez vos identifiants puis réessayez.";
  }
}

export default function LoginPage({ initialError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (loginError) {
      console.error("La connexion Firebase a échoué.", loginError);
      setError(getLoginError(loginError));
      setLoading(false);
    }
  }

  async function resetPassword() {
    const normalizedEmail = email.trim();
    setError("");
    setResetMessage("");
    if (!normalizedEmail) {
      setError("Saisissez d’abord votre adresse e-mail pour recevoir le lien de réinitialisation.");
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setResetMessage("Si un compte est associé à cette adresse, un e-mail de réinitialisation vient d’être envoyé. Vérifiez aussi vos courriers indésirables.");
    } catch (resetError) {
      console.error("L’envoi du lien de réinitialisation Firebase a échoué.", resetError);
      if (resetError.code === "auth/invalid-email") {
        setError("L’adresse e-mail n’est pas valide.");
      } else if (resetError.code === "auth/too-many-requests") {
        setError("Trop de tentatives. Patientez avant de demander un nouveau lien.");
      } else if (resetError.code === "auth/network-request-failed") {
        setError("Connexion impossible. Vérifiez votre accès à Internet puis réessayez.");
      } else {
        setError("Le lien de réinitialisation n’a pas pu être envoyé. Vérifiez la configuration Firebase ou contactez l’administrateur.");
      }
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="absolute right-4 top-4 z-40 sm:right-6 sm:top-6">
        <InstallPrompt />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-100/70 blur-3xl motion-glow" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 right-[38%] h-96 w-96 rounded-full bg-cyan-100/50 blur-3xl motion-glow" />

      <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1440px] md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 px-8 py-9 text-white md:flex xl:px-16 xl:py-11">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_18%,rgba(79,70,229,0.42),transparent_38%),radial-gradient(ellipse_at_20%_90%,rgba(8,145,178,0.2),transparent_42%)]" />
          <div aria-hidden="true" className="absolute -right-52 top-44 h-[520px] w-[520px] rounded-full border border-white/10 motion-glow" />
          <div aria-hidden="true" className="absolute -right-32 top-64 h-[360px] w-[360px] rounded-full border border-white/10 motion-glow" />
          <div className="relative flex items-center gap-3 motion-rise">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg shadow-black/20">
              <CompanyLogo className="h-full w-full" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">TGI ASCENSEURS</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Manager · ERP</p>
            </div>
          </div>

          <div className="relative z-10 max-w-xl py-10 xl:py-16">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-slate-300 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)] motion-glow" />
              Espace de travail sécurisé
            </div>
            <h1 className="motion-rise text-4xl font-semibold leading-[1.15] tracking-tight xl:text-5xl">
              Gérez votre activité,
              <span className="mt-2 block bg-gradient-to-r from-indigo-300 via-sky-200 to-cyan-200 bg-clip-text text-transparent">en toute maîtrise.</span>
            </h1>
            <p className="motion-rise motion-delay-1 mt-6 max-w-lg text-base leading-7 text-slate-400">
              Clients, contrats, interventions et équipements réunis dans un espace conçu pour les équipes d’ascensoristes.
            </p>

            <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
              {[
                ["Suivi terrain", Wrench],
                ["Données protégées", ShieldCheck],
                ["Gestion centralisée", CheckCircle2],
              ].map(([label, Icon], index) => (
                <div key={label} style={{ animationDelay: `${180 + index * 100}ms` }} className="motion-rise flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-xs font-medium text-slate-300 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300/30 hover:bg-white/[0.08]">
                  <Icon size={16} className="text-indigo-300" /> {label}
                </div>
              ))}
            </div>
          </div>

          <div aria-hidden="true" className="pointer-events-none absolute bottom-[17%] right-[8%] hidden h-[250px] w-[180px] lg:block">
            <div className="absolute inset-x-0 bottom-0 top-0 rounded-t-[5rem] border border-indigo-200/20 bg-gradient-to-b from-indigo-300/[0.08] to-cyan-300/[0.03] shadow-[0_0_80px_rgba(99,102,241,0.16)]" />
            <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-indigo-200/30 to-transparent" />
            <div className="absolute left-1/2 top-[18%] h-[82%] w-[64%] -translate-x-1/2 overflow-hidden rounded-t-[3.5rem] border border-indigo-200/35 bg-slate-900/80 shadow-[0_0_30px_rgba(99,102,241,0.25)]">
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-indigo-500/20 to-transparent" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-indigo-100/20" />
              <div className="absolute bottom-5 left-1/2 flex h-10 w-12 -translate-x-1/2 items-center justify-center rounded-t-lg border border-indigo-100/30 bg-gradient-to-b from-slate-700 to-slate-950 shadow-[0_0_20px_rgba(129,140,248,0.28)] motion-float">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(165,243,252,0.95)]" />
              </div>
            </div>
            <div className="absolute right-0 top-[22%] h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(165,243,252,0.9)] motion-glow" />
            <div className="absolute -left-14 top-[28%] rounded-xl border border-white/10 bg-slate-900/75 px-3 py-2 shadow-xl backdrop-blur motion-float">
              <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">TGI · terrain</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Activité synchronisée</p>
            </div>
            <div className="absolute -bottom-3 -right-9 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 shadow-xl backdrop-blur motion-float-delayed">
              <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">Gestion unifiée</p>
              <p className="mt-1 text-[11px] font-semibold text-white">Clients · contrats · SAV</p>
            </div>
          </div>

          <div className="relative flex items-center justify-between border-t border-white/10 pt-5 text-[11px] text-slate-500 motion-rise motion-delay-3">
            <span>© {new Date().getFullYear()} TGI Ascenseurs</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Connexion chiffrée</span>
          </div>
        </div>

        <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-slate-50 to-indigo-50/60 px-5 py-10 sm:px-10 lg:px-12 xl:px-20">
          <div aria-hidden="true" className="pointer-events-none absolute right-[-8rem] top-[-7rem] h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl motion-glow" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-[-8rem] left-[-6rem] h-72 w-72 rounded-full bg-cyan-100/50 blur-3xl motion-glow" />
          <section className="relative w-full max-w-[460px] motion-rise">
            <div className="mb-10 flex items-center gap-3 md:hidden">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-black shadow-lg shadow-slate-300/50">
                <CompanyLogo className="h-full w-full" />
              </div>
              <div>
                <p className="text-base font-bold tracking-tight text-slate-900">TGI Ascenseurs</p>
                <p className="text-xs text-slate-500">Espace sécurisé · Ascenseurs</p>
              </div>
            </div>

            <div className="mb-8 motion-rise motion-delay-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Bienvenue</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Connexion à votre espace</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Saisissez vos identifiants professionnels pour continuer.</p>
            </div>

            <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.28)] backdrop-blur sm:p-7 motion-rise motion-delay-2">
              <label className="block text-sm font-semibold text-slate-700">
                Adresse e-mail
                <span className="relative mt-2 block">
                  <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm font-normal text-slate-800 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    placeholder="nom@entreprise.ma"
                  />
                </span>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Mot de passe
                <span className="relative mt-2 block">
                  <LockKeyhole size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm font-normal text-slate-800 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    placeholder="Votre mot de passe"
                  />
                </span>
              </label>

              <div className="-mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={resetLoading || loading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {resetLoading ? <LoaderCircle size={13} className="animate-spin" /> : <KeyRound size={13} />}
                  {resetLoading ? "Envoi du lien…" : "Mot de passe oublié ?"}
                </button>
              </div>

              {resetMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">{resetMessage}</p>}
              {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-700">{error}</p>}

              <button type="submit" disabled={loading} className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-300/60 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60">
                <span aria-hidden="true" className="absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[500%]" />
                {loading ? <LoaderCircle size={17} className="animate-spin" /> : null}
                {loading ? "Connexion…" : "Accéder à mon espace"}
                {!loading && <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />}
              </button>
            </form>

            <div className="mt-7 flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm motion-rise motion-delay-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><ShieldCheck size={18} /></span>
              <p className="text-xs leading-5 text-slate-500">Accès réservé aux comptes autorisés. Votre session est sécurisée par Firebase Authentication.</p>
            </div>
            <p className="mt-8 text-center text-[11px] text-slate-400 md:hidden">© {new Date().getFullYear()} TGI Ascenseurs · Tous droits réservés</p>
          </section>
        </div>
      </section>
    </main>
  );
}
