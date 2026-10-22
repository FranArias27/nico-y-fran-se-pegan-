"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Eye, EyeOff, LockKeyhole, Store } from "lucide-react";
import { auth, firestore } from "@/lib/firebase/client";
import { useAuth } from "@/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function Login({ empresaId }: { empresaId?: string }) {
  const sesion = useAuth();
  const router = useRouter();
  const [nombre, setNombre] = useState(empresaId ? "" : "El Tornillo");
  const [disponible, setDisponible] = useState(!empresaId);
  const [buscando, setBuscando] = useState(!!empresaId);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  useEffect(() => {
    if (!empresaId) return;
    let vigente = true;
    getDoc(doc(firestore, "accesos", empresaId)).then((snap) => {
      if (!vigente) return;
      const datos = snap.data();
      setNombre(datos?.nombre ?? "Acceso a empresa");
      setDisponible(datos?.activa === true);
    }).catch(() => { if (vigente) setMensaje("No pudimos consultar este acceso. Intentá nuevamente."); }).finally(() => { if (vigente) setBuscando(false); });
    return () => { vigente = false; };
  }, [empresaId]);
  const incorrecta = !!empresaId && !!sesion.cuenta && !sesion.cargando && (sesion.general || sesion.perfil?.empresaId !== empresaId);
  useEffect(() => {
    if (sesion.cargando || sesion.error || !sesion.cuenta || incorrecta || !disponible) return;
    if (sesion.general) router.replace("/admin");
    else if (sesion.empresa?.activa) router.replace("/venta");
  }, [sesion.cargando, sesion.error, sesion.cuenta, sesion.general, sesion.empresa, incorrecta, disponible, router]);
  async function ingresar(e: FormEvent) {
    e.preventDefault(); setOcupado(true); setMensaje("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); setPassword(""); }
    catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "desconocido";
      const mensajes: Record<string, string> = {
        "auth/invalid-credential": "El correo o la contraseña no coinciden. Revisá que el correo esté escrito completo.",
        "auth/invalid-email": "El correo electrónico no tiene un formato válido.",
        "auth/user-not-found": "El correo o la contraseña no coinciden.",
        "auth/wrong-password": "El correo o la contraseña no coinciden.",
        "auth/too-many-requests": "Hubo demasiados intentos. Esperá unos minutos antes de volver a ingresar.",
        "auth/network-request-failed": "No se pudo conectar con Firebase. Revisá la conexión y si alguna extensión está bloqueando la solicitud.",
        "auth/unauthorized-domain": "Esta dirección no está autorizada en Firebase Authentication.",
        "auth/operation-not-allowed": "El ingreso con correo y contraseña no está habilitado en Firebase.",
        "auth/user-disabled": "Esta cuenta está deshabilitada. Contactá al administrador.",
        "auth/web-storage-unsupported": "El navegador está bloqueando el almacenamiento de la sesión. Habilitalo o probá en otra ventana.",
      };
      setMensaje(mensajes[code] ?? `No se pudo iniciar sesión (${code}).`);
    }
    finally { setOcupado(false); }
  }
  async function recuperar() {
    if (!email.trim()) { setMensaje("Ingresá tu correo para recuperar la contraseña."); return; }
    setOcupado(true);
    try { await sendPasswordResetEmail(auth, email.trim()); setMensaje("Si existe una cuenta con ese correo, recibirás un enlace para recuperar tu contraseña."); }
    catch { setMensaje("No pudimos procesar la solicitud. Intentá nuevamente más tarde."); }
    finally { setOcupado(false); }
  }
  return <main className="grid min-h-dvh bg-muted/40 lg:grid-cols-2">
    <section className="hidden flex-col justify-between bg-slate-950 p-14 text-white lg:flex"><div className="flex items-center gap-3 font-semibold"><Store /> El Tornillo</div><div><p className="mb-4 text-sm uppercase tracking-widest text-emerald-300">Tu comercio, en orden</p><h1 className="max-w-lg text-5xl font-semibold leading-tight">Todo lo que necesitás para gestionar tu negocio.</h1><p className="mt-6 max-w-md text-slate-300">Ventas, stock y cobranza en un solo lugar. Un espacio propio para cada empresa.</p></div><p className="text-sm text-slate-400">Mostrador y cobranza</p></section>
    <section className="flex items-center justify-center p-6"><div className="w-full max-w-md rounded-2xl border bg-background p-8 shadow-sm"><div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><LockKeyhole /></div><p className="text-sm text-muted-foreground">{empresaId ? "Acceso a tu empresa" : "Acceso general"}</p><h2 className="mt-1 text-3xl font-semibold">{nombre || "Verificando empresa…"}</h2><p className="mb-7 mt-3 text-sm text-muted-foreground">Ingresá con tu cuenta para continuar.</p>
    {buscando ? <p role="status">Verificando acceso…</p> : !disponible ? <p role="alert">Este acceso no está disponible. Contactá al administrador.</p> : <form onSubmit={ingresar} className="space-y-5"><div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Correo electrónico</label><Input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vos@tuempresa.com" /></div><div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Contraseña</label><div className="relative"><Input id="password" type={mostrarPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="pr-12" /><button type="button" onClick={() => setMostrarPassword(v => !v)} aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={mostrarPassword} aria-controls="password" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{mostrarPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}</button></div></div><Button className="w-full" disabled={ocupado || sesion.cargando}>{ocupado ? "Ingresando…" : "Iniciar sesión"}</Button><Button type="button" variant="ghost" className="w-full" disabled={ocupado} onClick={() => void recuperar()}>Olvidé mi contraseña</Button></form>}
    {(mensaje || sesion.error || incorrecta) && <p role="alert" className="mt-4 text-sm text-destructive">{incorrecta ? "Esta cuenta no tiene acceso a esta empresa." : mensaje || sesion.error}</p>}
    {sesion.cuenta && <Button variant="outline" className="mt-4 w-full" onClick={() => void sesion.salir()}>Usar otra cuenta</Button>}
    </div></section></main>;
}


