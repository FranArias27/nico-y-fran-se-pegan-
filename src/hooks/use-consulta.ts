"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useServicios } from "@/components/providers/servicios-provider";
import type { Servicios } from "@/services";

interface Estado<T> {
  datos: T | undefined;
  error: Error | undefined;
  cargando: boolean;
}

/**
 * Lee datos a través de los servicios y vuelve a leerlos cuando cambia
 * cualquier dato o cuando cambia `clave`. Mientras recarga, conserva los datos
 * anteriores para que la pantalla no parpadee.
 */
export function useConsulta<T>(cargar: (s: Servicios) => Promise<T>, clave: unknown[] = []): Estado<T> {
  const servicios = useServicios();
  const [version, refrescar] = useReducer((n: number) => n + 1, 0);
  const [estado, setEstado] = useState<Estado<T>>({ datos: undefined, error: undefined, cargando: true });
  const cargarRef = useRef(cargar);

  useEffect(() => {
    cargarRef.current = cargar;
  });

  useEffect(() => servicios.alCambiar(refrescar), [servicios]);

  const claveTexto = JSON.stringify(clave);
  useEffect(() => {
    let vigente = true;
    cargarRef
      .current(servicios)
      .then((datos) => {
        if (vigente) setEstado({ datos, error: undefined, cargando: false });
      })
      .catch((error: unknown) => {
        if (vigente) {
          setEstado((e) => ({ ...e, error: error instanceof Error ? error : new Error(String(error)), cargando: false }));
        }
      });
    return () => {
      vigente = false;
    };
  }, [servicios, version, claveTexto]);

  return estado;
}
