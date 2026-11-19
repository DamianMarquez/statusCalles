import { useRef, type KeyboardEvent } from 'react';

export function tabId(id: string) {
  return `stats-tab-${id}`;
}
export function panelId(id: string) {
  return `stats-panel-${id}`;
}

/** Pestañas accesibles: flechas, Inicio y Fin cambian de pestaña. El panel lo arma quien la usa. */
export function StatsTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    const next = tabs[target]!;
    onChange(next.id);
    buttons.current.get(next.id)?.focus();
  }

  return (
    <div className="analytics-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            if (element) buttons.current.set(tab.id, element);
            else buttons.current.delete(tab.id);
          }}
          id={tabId(tab.id)}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={panelId(tab.id)}
          tabIndex={active === tab.id ? 0 : -1}
          className={active === tab.id ? 'is-active' : ''}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
