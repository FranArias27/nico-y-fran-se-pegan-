"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, deleteApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, inMemoryPersistence, setPersistence, signOut, deleteUser } from "firebase/auth";
import { collection, doc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase/client";
import { useAuth, type Empresa } from "@/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function Admin() {
  const { general, salir, seleccionarEmpresa } = useAuth();
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Array<Empresa & { id: string }>>([]);
  const [mensaje, setMensaje] = useState(""); const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!general) return;
    return onSnapshot(collection(firestore, "empresas"), snap => setEmpresas(snap.docs.map(d => ({ id: d.id, ...d.data() as Empresa }))), () => setMensaje("No se pudieron cargar las empresas. Revisá las reglas de Firestore."));
  }, [general]);
  async function crearEmpresa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const datos = new FormData(form);
    const id = String(datos.get("id")).trim(); const nombre = String(datos.get("nombre")).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 60 || ["admin", "login", "venta", "clientes", "articulos", "configuracion", "reportes", "cobranza", "comprobantes", "api"].includes(id)) { setMensaje("Usá una dirección como kiosco-mauro, sin espacios ni acentos."); return; }
    setOcupado(true); setMensaje("");
    try {
      await runTransaction(firestore, async tx => {
        const ref = doc(firestore, "empresas", id);
        if ((await tx.get(ref)).exists()) throw new Error("La dirección ya está en uso.");
        tx.set(ref, { nombre, activa: true }); tx.set(doc(firestore, "accesos", id), { nombre, activa: true });
      });
      form.reset(); setMensaje("Empresa creada. Ya podés crear su primer usuario.");
    } catch { setMensaje("No se pudo crear la empresa. Revisá los permisos o elegí otra dirección."); }
    finally { setOcupado(false); }
  }
  async function crearUsuario(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const datos = new FormData(form);
    setOcupado(true); setMensaje("");
    const secundaria = initializeApp(auth.app.options, `alta-${crypto.randomUUID()}`);
    const secundariaAuth = getAuth(secundaria);
    try {
      await setPersistence(secundariaAuth, inMemoryPersistence);
      const credencial = await createUserWithEmailAndPassword(secundariaAuth, String(datos.get("email")).trim(), String(datos.get("password")));
      try {
        await setDoc(doc(firestore, "usuarios", credencial.user.uid), { nombre: String(datos.get("nombre")).trim(), empresaId: String(datos.get("empresa")), rol: String(datos.get("rol")), activo: true });
      } catch (error) { await deleteUser(credencial.user); throw error; }
      await signOut(secundariaAuth); form.reset(); setMensaje("Usuario creado. Puede ingresar por el acceso de su empresa.");
    } catch { setMensaje("No se pudo crear el usuario. Revisá si el correo ya existe, la política de contraseña y los permisos de Firebase."); }
    finally { await deleteApp(secundaria); setOcupado(false); }
  }
  if (!general) return null;
  return <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-10"><header className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">El Tornillo · Administración general</p><h1 className="text-3xl font-semibold">Tus empresas</h1></div><Button variant="outline" onClick={() => void salir()}>Cerrar sesión</Button></header>
  <div className="grid gap-6 md:grid-cols-2"><form onSubmit={crearEmpresa} className="space-y-4 rounded-xl border p-6"><h2 className="text-xl font-semibold">Nueva empresa</h2><label className="block text-sm">Nombre<Input name="nombre" required maxLength={100} placeholder="Kiosco Mauro" /></label><label className="block text-sm">Dirección de acceso<Input name="id" required maxLength={60} placeholder="kiosco-mauro" /></label><Button disabled={ocupado}>Crear empresa</Button></form>
  <form onSubmit={crearUsuario} className="space-y-4 rounded-xl border p-6"><h2 className="text-xl font-semibold">Nuevo usuario</h2><label className="block text-sm">Nombre<Input name="nombre" required maxLength={100} /></label><label className="block text-sm">Correo<Input name="email" type="email" required /></label><label className="block text-sm">Contraseña inicial<Input name="password" type="password" minLength={12} autoComplete="new-password" required /></label><label className="block text-sm">Empresa<select name="empresa" required className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Seleccionar empresa</option>{empresas.filter(e => e.activa).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label><label className="block text-sm">Rol<select name="rol" className="mt-1 w-full rounded-md border bg-background p-2"><option value="admin">Administrador de empresa</option><option value="vendedor">Vendedor</option></select></label><Button disabled={ocupado || !empresas.length}>Crear usuario</Button></form></div>
  {mensaje && <p role="status" className="rounded-lg border p-4 text-sm">{mensaje}</p>}
  <section className="space-y-3"><h2 className="text-xl font-semibold">Accesos de empresas</h2>{!empresas.length && <p className="text-muted-foreground">Todavía no hay empresas.</p>}{empresas.map(e => <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">{e.nombre}</p><p className="text-sm text-muted-foreground">{e.activa ? "Activa" : "Deshabilitada"}</p></div><div className="flex items-center gap-4"><Button disabled={!e.activa} onClick={() => { seleccionarEmpresa(e.id); router.push("/venta"); }}>Entrar al negocio</Button><a className="text-sm text-primary underline" href={`/${e.id}/login`} target="_blank" rel="noreferrer">/{e.id}/login</a></div></div>)}</section></main>;
}

