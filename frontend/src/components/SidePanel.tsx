import type { ReactNode } from 'react';
import { CollapseIcon, ExpandIcon } from './icons';
import './Modal.css';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export default function SidePanel({ title, onClose, children, fullScreen, onToggleFullScreen }: Props) {
  return (
    <div className="modal-backdrop panel-backdrop" onClick={onClose}>
      <div
        className={`side-panel${fullScreen ? ' full' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
      >
        <div className="modal-head no-print">
          <h2>{title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onToggleFullScreen && (
              <button
                className="modal-close"
                onClick={onToggleFullScreen}
                aria-label={fullScreen ? 'Exit full screen' : 'Expand to full screen'}
                title={fullScreen ? 'Exit full screen' : 'Expand to full screen'}
              >
                {fullScreen ? <CollapseIcon /> : <ExpandIcon />}
              </button>
            )}
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
