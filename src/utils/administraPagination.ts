export interface PaginatedEntityState<T extends { id: string }> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number | null;
  query: string;
}

export interface AdministraReadFilterCapabilities {
  legacyBarragensSupportsEmpreendedorIdFilter: boolean;
  v2BarragensSupportsQueryFilter: boolean;
  v2BarragensSupportsEmpreendedorIdFilter: boolean;
  requiredServerChangeSummary: string;
}

export function getAdministraBarragemFilterCapabilities(): AdministraReadFilterCapabilities {
  return {
    legacyBarragensSupportsEmpreendedorIdFilter: false,
    v2BarragensSupportsQueryFilter: false,
    v2BarragensSupportsEmpreendedorIdFilter: false,
    requiredServerChangeSummary:
      'Para filtrar barragens por empreendedorId no servidor, é necessário ampliar /api/administra-leitura (action "barragens" -> RPC csb_ler_barragens) com parâmetro opcional p_empreendedor_id e/ou habilitar q e empreendedor_id no contrato S2S v2.',
  };
}

export function mergeUniqueById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...primary, ...secondary]) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function preserveSelectedItemInList<T extends { id: string }>(
  items: T[],
  selectedItem?: T | null
): T[] {
  if (!selectedItem?.id) return mergeUniqueById(items, []);
  return mergeUniqueById(items, [selectedItem]);
}

export function createInitialPaginatedState<T extends { id: string }>(
  pageSize = 25
): PaginatedEntityState<T> {
  return {
    items: [],
    page: 1,
    pageSize,
    hasMore: false,
    total: null,
    query: '',
  };
}

export function resetPaginatedSearchState<T extends { id: string }>(
  query: string,
  pageSize = 25
): PaginatedEntityState<T> {
  return {
    items: [],
    page: 1,
    pageSize,
    hasMore: false,
    total: null,
    query,
  };
}

export function applyPaginatedPageResult<T extends { id: string }>(
  prev: PaginatedEntityState<T>,
  params: {
    query: string;
    page: number;
    pageSize: number;
    items: T[];
    hasMore: boolean;
    total: number | null;
    append: boolean;
    selectedItem?: T | null;
  }
): PaginatedEntityState<T> {
  const baseItems = params.append
    ? mergeUniqueById(prev.items, params.items)
    : mergeUniqueById(params.items, []);

  const nextItems = preserveSelectedItemInList(baseItems, params.selectedItem);

  return {
    items: nextItems,
    page: params.page,
    pageSize: params.pageSize,
    hasMore: params.hasMore,
    total: params.total !== null && params.total !== undefined ? params.total : params.append ? prev.total : null,
    query: params.query,
  };
}

export function formatPaginationCounterText(
  shownCount: number,
  total: number | null,
  hasMore: boolean,
  nounPlural: string
): string {
  if (typeof total === 'number' && Number.isFinite(total)) {
    return `Exibindo ${shownCount} de ${Math.max(total, shownCount)} ${nounPlural}`;
  }
  if (hasMore) {
    return `Exibindo ${shownCount} ${nounPlural} (há mais registros)`;
  }
  return `Exibindo ${shownCount} ${nounPlural}`;
}
