"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-provider";
import { useServicios } from "@/components/providers/servicios-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cuitValido } from "@/domain/identificadores";
import {
  ETIQUETA_CONDICION_IVA,
  ETIQUETA_ESTADO_CLIENTE,
  type Cliente,
  type CondicionIva,
  type EstadoCliente,
} from "@/domain/types";
import { formatAmount, parseMoney } from "@/lib/format";
import { ErrorDeNegocio } from "@/services";

function Campo({ id, etiqueta, children, ayuda }: { id?: string; etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function ClienteForm({
  cliente,
  onGuardado,
  onCancelar,
}: {
  cliente?: Cliente;
  onGuardado: (c: Cliente) => void;
  onCancelar: () => void;
}) {
  const servicios = useServicios();
  // El vendedor carga y edita los datos del cliente, pero no le da crédito ni lo desbloquea.
  const credito = useAuth().puede("gestionarCredito");
  const [razonSocial, setRazonSocial] = useState(cliente?.razonSocial ?? "");
  const [nombreFantasia, setNombreFantasia] = useState(cliente?.nombreFantasia ?? "");
  const [condicionIva, setCondicionIva] = useState<CondicionIva>(cliente?.condicionIva ?? "CF");
  const [documento, setDocumento] = useState(cliente?.documento ?? "");
  const [domicilio, setDomicilio] = useState(cliente?.domicilio ?? "");
  const [telefono, setTelefono] = useState(cliente?.telefono ?? "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [cuentaCorriente, setCuentaCorriente] = useState(cliente?.cuentaCorriente ?? false);
  const [limiteTxt, setLimiteTxt] = useState(formatAmount(cliente?.limiteCredito ?? 0));
  const [plazoTxt, setPlazoTxt] = useState(String(cliente?.plazoDias ?? 30));
  const [estado, setEstado] = useState<EstadoCliente>(cliente?.estado ?? "habilitado");
  const [notas, setNotas] = useState(cliente?.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  const digitos = documento.replace(/\D/g, "");
  const errorDocumento =
    digitos.length === 11 && !cuitValido(digitos)
      ? "El CUIT no es válido."
      : condicionIva === "RI" && digitos.length !== 11
        ? "Un responsable inscripto necesita CUIT."
        : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (errorDocumento) return;
    setGuardando(true);
    // Sin permiso se mandan los valores que ya tenía (las reglas de Firestore rechazan cualquier cambio).
    const condiciones = credito
      ? {
          cuentaCorriente,
          limiteCredito: cuentaCorriente ? (parseMoney(limiteTxt) ?? 0) : 0,
          plazoDias: cuentaCorriente ? Number(plazoTxt) || 0 : 0,
          estado,
        }
      : {
          cuentaCorriente: cliente?.cuentaCorriente ?? false,
          limiteCredito: cliente?.limiteCredito ?? 0,
          plazoDias: cliente?.plazoDias ?? 0,
          estado: cliente?.estado ?? "habilitado",
        };
    try {
      const guardado = await servicios.clientes.guardar({
        id: cliente?.id,
        creadoEn: cliente?.creadoEn,
        razonSocial,
        nombreFantasia,
        condicionIva,
        documento,
        domicilio: domicilio || undefined,
        telefono: telefono || undefined,
        email: email || undefined,
        ...condiciones,
        notas: notas || undefined,
      });
      toast.success(cliente ? "Cliente actualizado" : "Cliente creado");
      onGuardado(guardado);
    } catch (err) {
      if (err instanceof ErrorDeNegocio) toast.error(err.message);
      else throw err;
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo id="razon" etiqueta="Razón social o nombre y apellido">
            <Input id="razon" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} required />
          </Campo>
        </div>
        <Campo id="fantasia" etiqueta="Nombre de fantasía" ayuda="Opcional. Para comercios y sociedades.">
          <Input id="fantasia" value={nombreFantasia} onChange={(e) => setNombreFantasia(e.target.value)} />
        </Campo>
        <Campo etiqueta="Condición frente al IVA">
          <Select value={condicionIva} onValueChange={(v) => setCondicionIva(v as CondicionIva)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ETIQUETA_CONDICION_IVA) as CondicionIva[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {ETIQUETA_CONDICION_IVA[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo id="doc" etiqueta="CUIT o DNI">
          <Input id="doc" value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" aria-invalid={!!errorDocumento} />
          {errorDocumento && <p className="text-xs text-destructive">{errorDocumento}</p>}
        </Campo>
        <Campo id="tel" etiqueta="Teléfono (WhatsApp)">
          <Input id="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="11 1234-5678" />
        </Campo>
        <Campo id="dom" etiqueta="Domicilio">
          <Input id="dom" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
        </Campo>
        <Campo id="email" etiqueta="Email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
      </section>

      <Separator />

      <section className="grid gap-4 sm:grid-cols-2">
        {!credito && (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            La cuenta corriente, el límite, el plazo y el estado del cliente los define un administrador.
          </p>
        )}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch id="cc" checked={cuentaCorriente} onCheckedChange={setCuentaCorriente} disabled={!credito} />
          <Label htmlFor="cc">Habilitar cuenta corriente (ventas a cuenta)</Label>
        </div>
        {cuentaCorriente && (
          <>
            <Campo id="limite" etiqueta="Límite de crédito" ayuda="0 = sin límite.">
              <Input id="limite" value={limiteTxt} onChange={(e) => setLimiteTxt(e.target.value)} inputMode="decimal" className="tabular" disabled={!credito} />
            </Campo>
            <Campo id="plazo" etiqueta="Plazo de pago (días)">
              <Input id="plazo" value={plazoTxt} onChange={(e) => setPlazoTxt(e.target.value)} inputMode="numeric" className="tabular" disabled={!credito} />
            </Campo>
          </>
        )}
        <Campo etiqueta="Estado">
          <Select value={estado} onValueChange={(v) => setEstado(v as EstadoCliente)} disabled={!credito}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ETIQUETA_ESTADO_CLIENTE) as EstadoCliente[]).map((e) => (
                <SelectItem key={e} value={e}>
                  {ETIQUETA_ESTADO_CLIENTE[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="notas" etiqueta="Notas">
            <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </Campo>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background px-4 py-3">
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando || !!errorDocumento}>
          {cliente ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
