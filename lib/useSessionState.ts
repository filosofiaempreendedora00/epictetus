"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useState que persiste em sessionStorage. Necessário aqui porque o Next
 * App Router remonta o componente Board quando o path muda dentro do
 * catch-all [[...slug]] (ex.: / → /negocios/luma → /). Sem persistência,
 * states como `pendingCongelado` (modais entre stages) viram null mid-flow
 * e os modais simplesmente nunca aparecem.
 *
 * Comportamento: lê uma vez no mount (sincrono se janela disponível,
 * via efeito se SSR), escreve sempre que o state muda. JSON-serializa
 * automaticamente.
 */
export function useSessionState<T>(
  key: string,
  initial: T | (() => T)
): [T, (next: T | ((prev: T) => T)) => void] {
  const initialFn = (): T =>
    typeof initial === "function" ? (initial as () => T)() : initial;

  // Estado inicial: tenta ler do sessionStorage no primeiro render.
  // No SSR ou se falhar, cai pro initial.
  const [value, setValueState] = useState<T>(() => {
    if (typeof window === "undefined") return initialFn();
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw == null) return initialFn();
      return JSON.parse(raw) as T;
    } catch {
      return initialFn();
    }
  });

  // Mantém o key atual (caso mude entre renders)
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    setValueState((prev) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try {
        if (v == null) {
          window.sessionStorage.removeItem(keyRef.current);
        } else {
          window.sessionStorage.setItem(keyRef.current, JSON.stringify(v));
        }
      } catch {
        /* ignore quota / private mode */
      }
      return v;
    });
  }, []);

  return [value, setValue];
}
