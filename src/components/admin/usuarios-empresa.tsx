"use client";

import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { KeyRoundIcon, PencilIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";
import type { Empresa } from "@/auth/auth-provider";
import { ETIQUETA_ROL, type Rol } from "@/auth/permissions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auth, firestore } from "@/lib/firebase/client";

/** Perfil de un usuario de una empresa cliente (colección `usuarios`). */
export interface UsuarioEmpresa {
  id: string;
  nombre: string;
  /** Solo lo tienen los usuarios creados desde este panel. */
  email?: string;
  empresaId: string;
  rol: Rol;
  activo: boolean;
}

type EmpresaConId = Empresa & { id: string };

async function actualizar(id: string, cambios: Partial<Omit<UsuarioEmpresa, "id">>, exito: string) {
  try {
    await updateDoc(doc(firestore, "usuarios", id), cambios);
    toast.success(exito);
  } catch {
    toast.error("No se pudo guardar el cambio. Revisá la conexión y las reglas de Firestore.");
  }
}

export function UsuariosEmpresa({ usuarios, empresas }: { usuarios: UsuarioEmpresa[]; empresas: EmpresaConId[] }) {
  const [editando, setEditando] = useState<UsuarioEmpresa | null>(null);
  const [quitando, setQuitando] = useState<UsuarioEmpresa | null>(null);

  if (usuarios.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta empresa todavía no tiene usuarios.</p>;
  }

  async function restablecer(usuario: UsuarioEmpresa) {
    if (!usuario.email) return;
    try {
      await sendPasswordResetEmail(auth, usuario.email);
      toast.success(`Le enviamos a ${usuario.email} un enlace para elegir una contraseña nueva.`);
    } catch {
      toast.error("No se pudo enviar el correo de recuperación.");
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead className="w-44">Rol</TableHead>
            <TableHead className="w-24">Activo</TableHead>
            <TableHead className="w-32 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id} className={u.activo ? undefined : "text-muted-foreground"}>
              <TableCell>
                <div className="font-medium">{u.nombre}</div>
                <div className="text-xs text-muted-foreground">{u.email ?? "Correo no registrado"}</div>
              </TableCell>
              <TableCell>
                <Select
                  value={u.rol}
                  onValueChange={(rol) => void actualizar(u.id, { rol: rol as Rol }, `${u.nombre} ahora es ${ETIQUETA_ROL[rol as Rol]}.`)}
                >
                  <SelectTrigger className="w-full" aria-label={`Rol de ${u.nombre}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Switch
                  checked={u.activo}
                  aria-label={u.activo ? `Desactivar a ${u.nombre}` : `Activar a ${u.nombre}`}
                  onCheckedChange={(activo) =>
                    void actualizar(u.id, { activo }, activo ? `${u.nombre} puede volver a ingresar.` : `${u.nombre} ya no puede ingresar.`)
                  }
                />
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Editar a ${u.nombre}`} title="Editar" onClick={() => setEditando(u)}>
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Restablecer la contraseña de ${u.nombre}`}
                    title={u.email ? "Enviar correo para restablecer la contraseña" : "Sin correo registrado"}
                    disabled={!u.email}
                    onClick={() => void restablecer(u)}
                  >
                    <KeyRoundIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar el acceso de ${u.nombre}`}
                    title="Quitar acceso"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setQuitando(u)}
                  >
                    <UserXIcon />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editando && (
        <EditarUsuario key={editando.id} usuario={editando} empresas={empresas} onCerrar={() => setEditando(null)} />
      )}
      {quitando && <QuitarAcceso usuario={quitando} onCerrar={() => setQuitando(null)} />}
    </>
  );
}

function EditarUsuario({
  usuario,
  empresas,
  onCerrar,
}: {
  usuario: UsuarioEmpresa;
  empresas: EmpresaConId[];
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [empresaId, setEmpresaId] = useState(usuario.empresaId);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    await actualizar(usuario.id, { nombre: nombre.trim(), empresaId }, "Usuario actualizado.");
    setGuardando(false);
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        <form onSubmit={guardar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>{usuario.email ?? "Correo no registrado"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="usuario-nombre">Nombre</Label>
            <Input id="usuario-nombre" value={nombre} maxLength={100} required onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="usuario-empresa">Empresa</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger id="usuario-empresa" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre}
                    {!e.activa && " (deshabilitada)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {empresaId !== usuario.empresaId && (
              <p className="text-xs text-muted-foreground">
                Va a dejar de ver los datos de la empresa actual y pasa a trabajar en la nueva.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={guardando || !nombre.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuitarAcceso({ usuario, onCerrar }: { usuario: UsuarioEmpresa; onCerrar: () => void }) {
  const [quitando, setQuitando] = useState(false);

  async function quitar() {
    setQuitando(true);
    try {
      await deleteDoc(doc(firestore, "usuarios", usuario.id));
      toast.success(`${usuario.nombre} ya no tiene acceso.`);
      onCerrar();
    } catch {
      toast.error("No se pudo quitar el acceso.");
      setQuitando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Quitar el acceso de {usuario.nombre}?</DialogTitle>
          <DialogDescription>
            Se borra su perfil y no va a poder entrar a ninguna empresa. Su cuenta de correo sigue registrada en
            Firebase, así que no se puede volver a crear un usuario con el mismo correo desde este panel. Si
            puede volver más adelante, mejor desactivalo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => void quitar()} disabled={quitando}>
            {quitando ? "Quitando…" : "Sí, quitar acceso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
