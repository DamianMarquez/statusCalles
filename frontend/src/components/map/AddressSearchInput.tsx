import { useEffect, useRef, useState } from 'react';
import { searchAddresses, type AddressSearchResult } from '../../api/addressesApi.js';

const searchDebounceMs = 300;
const minimumQueryLength = 3;

export function AddressSearchInput({
  label,
  value,
  displayValue,
  searchEnabled = true,
  onSelect,
  onClear,
}: {
  label: string;
  value: AddressSearchResult | null;
  displayValue?: string;
  searchEnabled?: boolean;
  onSelect: (result: AddressSearchResult) => void;
  onClear?: () => void;
}) {
  const [query, setQuery] = useState(displayValue ?? value?.displayName ?? '');
  const [items, setItems] = useState<AddressSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const requestId = useRef(0);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setQuery(displayValue ?? value?.displayName ?? '');
    setItems([]);
    setOpen(false);
  }, [value?.id, displayValue]);

  useEffect(() => {
    const normalized = query.trim().replace(/\s+/g, ' ');
    if (
      !searchEnabled ||
      normalized.length < minimumQueryLength ||
      value?.displayName === normalized
    ) {
      setItems([]);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      setSearched(false);
      void searchAddresses(normalized, controller.signal)
        .then((results) => {
          if (requestId.current === currentRequest) {
            setItems(results);
            setSearched(true);
            setOpen(true);
          }
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted || requestId.current !== currentRequest) return;
          setError(
            cause instanceof Error
              ? cause.message
              : 'No pudimos buscar la dirección en este momento.',
          );
          setSearched(true);
          setItems([]);
          setOpen(true);
        })
        .finally(() => {
          if (requestId.current === currentRequest) setLoading(false);
        });
    }, searchDebounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchEnabled, value?.displayName]);

  function select(result: AddressSearchResult) {
    editing.current = false;
    requestId.current += 1;
    setQuery(result.displayName);
    setItems([]);
    setOpen(false);
    setError('');
    onSelect(result);
  }

  return (
    <div className="address-search">
      <label className="address-search__label" htmlFor={`address-${label.replace(/\W/g, '-')}`}>
        {label}
      </label>
      <div className="address-search__control">
        <span aria-hidden="true">⌕</span>
        <input
          id={`address-${label.replace(/\W/g, '-')}`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && (items.length > 0 || Boolean(error))}
          aria-controls={`address-results-${label.replace(/\W/g, '-')}`}
          aria-label={label}
          value={query}
          onChange={(event) => {
            editing.current = true;
            setQuery(event.target.value);
            setOpen(true);
            setItems([]);
            setError('');
            if (value || displayValue) onClear?.();
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && items[0]) {
              event.preventDefault();
              select(items[0]);
            }
          }}
          placeholder="Calle y altura o dos calles"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            aria-label={`Limpiar ${label.toLocaleLowerCase('es-AR')}`}
            onClick={() => {
              editing.current = false;
              setQuery('');
              setItems([]);
              setError('');
              setOpen(false);
              onClear?.();
            }}
          >
            ×
          </button>
        )}
      </div>
      {loading && <span className="address-search__status">Buscando direcciones…</span>}
      {open &&
        query.trim().length >= minimumQueryLength &&
        !loading &&
        (items.length > 0 || error || searched) && (
          <div
            id={`address-results-${label.replace(/\W/g, '-')}`}
            className="address-search__results"
            role="listbox"
            aria-label={`Resultados para ${label.toLocaleLowerCase('es-AR')}`}
          >
            {error ? (
              <p role="alert">No pudimos buscar la dirección en este momento.</p>
            ) : items.length > 0 ? (
              items.map((item) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={item.id}
                  onClick={() => select(item)}
                >
                  <span className="address-search__result-icon" aria-hidden="true">
                    {item.type === 'INTERSECTION' ? '✕' : '📍'}
                  </span>
                  <span>
                    <strong>{item.displayName}</strong>
                    <small>
                      {[item.neighborhood, item.commune].filter(Boolean).join(' · ') || 'CABA'}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p>No encontramos esa dirección. Probá con calle y altura o calle y calle.</p>
            )}
          </div>
        )}
    </div>
  );
}
