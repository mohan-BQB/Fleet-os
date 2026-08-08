import { useEffect, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIcon } from './icons';

export interface NavDestination {
  label: string;
  path: string;
  icon: ReactElement;
  section: string;
}

// The "Jump to..." overlay (⌘K / Ctrl K, or the search pill in the rail) -
// reaches any of the ~19 nav destinations in two keystrokes without
// expanding a single collapsed section. Destinations are built once in
// Layout.tsx (which already computes every permission check the rail
// itself uses) and passed in here, so this component never has to
// duplicate that gating logic.
export default function CommandPalette({
  destinations, onClose,
}: { destinations: NavDestination[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) => d.label.toLowerCase().includes(q) || d.section.toLowerCase().includes(q));
  }, [destinations, query]);

  const groups = useMemo(() => {
    const map = new Map<string, NavDestination[]>();
    for (const d of filtered) {
      const list = map.get(d.section) ?? [];
      list.push(d);
      map.set(d.section, list);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => { setSelected(0); }, [query]);

  function go(d: NavDestination) {
    navigate(d.path);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const d = filtered[selected];
      if (d) go(d);
    }
  }

  // Flat index across every group, so ↑/↓ lands on the right row
  // regardless of which section it's grouped under for display.
  let rowIndex = -1;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Jump to">
        <div className="palette-search-row">
          <SearchIcon />
          <input
            autoFocus
            type="text"
            placeholder="Jump to…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-results">
          {groups.map(([section, items]) => (
            <div key={section}>
              <div className="palette-group-label">{section}</div>
              {items.map((d) => {
                rowIndex += 1;
                const isSelected = rowIndex === selected;
                return (
                  <button
                    type="button"
                    key={d.path + d.label}
                    className={`palette-row${isSelected ? ' selected' : ''}`}
                    onMouseEnter={() => setSelected(rowIndex)}
                    onClick={() => go(d)}
                  >
                    <span className="palette-icon">{d.icon}</span>
                    <span className="palette-label">{d.label}</span>
                    <span className="palette-section">{d.section}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && <div className="empty-state">No matches for &quot;{query}&quot;.</div>}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑↓</span>navigate</span>
          <span><span className="kbd">↵</span>open</span>
          <span><span className="kbd">esc</span>close</span>
        </div>
      </div>
    </div>
  );
}
