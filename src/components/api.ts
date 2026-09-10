export async function api<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const result = await response
    .json()
    .catch(() => ({ error: "Le serveur n’a pas retourné une réponse valide." }));
  if (!response.ok) throw new Error(result.error || "L’opération n’a pas abouti.");
  return result as T;
}
export function post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function allItems<T>(path: string): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const response = await api<{ items: T[] }>(
      `${path}${path.includes("?") ? "&" : "?"}pageSize=250&page=${page}`,
    );
    result.push(...response.items);
    if (response.items.length < 250) return result;
  }
}
