"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Sincroniza um state simples (string) com um parâmetro de URL.
 *
 * - Leitura: lê do searchParams atual; cai pro defaultValue se ausente.
 * - Escrita: usa router.replace (não polui o histórico do browser).
 * - Quando o valor for igual ao default, o param é REMOVIDO da URL pra
 *   manter ela limpa.
 *
 * Útil pra mapear cada estado navegável a uma URL específica, viabilizando
 * deep linking (compartilhar/abrir o app já no estado certo) e roteamento
 * via voz/atalhos.
 */
export function useUrlState<T extends string>(
  key: string,
  defaultValue: T
): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = (searchParams.get(key) as T) || defaultValue;

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!next || next === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, String(next));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, key, defaultValue]
  );

  return [current, setValue];
}

/**
 * Atualiza vários parâmetros da URL de uma vez (atômico — um único
 * router.replace). Útil quando abrir/fechar um modal precisa setar
 * múltiplos params relacionados sem race conditions.
 *
 * Passe `null` ou string vazia em qualquer key pra REMOVER o param.
 */
export function useUrlPatch(): (
  patch: Record<string, string | null | undefined>
) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (patch) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );
}

/**
 * Variante numérica — converte int de e pra string nos bastidores.
 */
export function useUrlIntState(
  key: string,
  defaultValue: number
): [number, (next: number) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(key);
  const parsed = raw != null ? parseInt(raw, 10) : NaN;
  const current = Number.isFinite(parsed) ? parsed : defaultValue;

  const setValue = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!Number.isFinite(next) || next === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, String(next));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, key, defaultValue]
  );

  return [current, setValue];
}
