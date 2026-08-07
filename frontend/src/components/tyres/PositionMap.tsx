import { useMemo } from 'react';
import type { Tyre, TyreService, Vehicle } from '../../api/types';
import { generatePositions, latestTreadDepth, totalDistance } from './utils';

export default function PositionMap({
  vehicle, tyres, services, onAddAt, onReplace,
}: {
  vehicle: Vehicle; tyres: Tyre[]; services: TyreService[];
  onAddAt: (position: string) => void; onReplace: (tyre: Tyre) => void;
}) {
  const positions = useMemo(
    () => generatePositions(vehicle.number_of_tyres, vehicle.spare_tyres),
    [vehicle.number_of_tyres, vehicle.spare_tyres],
  );
  const byPosition = new Map(tyres.filter((t) => t.status !== 'retired' && t.position).map((t) => [t.position, t]));

  return (
    <section className="table-card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600 }}>Position map</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {positions.map((pos) => {
          const tyre = byPosition.get(pos);
          const run = tyre ? totalDistance(tyre) : null;
          const tread = tyre ? latestTreadDepth(tyre, services) : null;
          return (
            <div key={pos} style={{
              border: '1px solid var(--border-soft)', borderRadius: 10, padding: '10px 12px',
              background: tyre ? 'var(--good-soft)' : 'var(--paper)',
            }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 600 }}>
                {pos}
              </div>
              {tyre ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{tyre.brand || 'Unbranded'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{tyre.size || '—'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {run !== null ? `${run.toLocaleString('en-IN')} ${vehicle.metering_unit}` : 'No odometer data'}
                  </div>
                  {tread !== null && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Tread {tread}"</div>
                  )}
                  {tyre.status === 'fitted' && (
                    <button type="button" className="link-btn" style={{ marginTop: 6, fontSize: 11.5 }} onClick={() => onReplace(tyre)}>
                      Replace
                    </button>
                  )}
                </>
              ) : (
                <button type="button" className="link-btn" style={{ marginTop: 8, fontSize: 11.5 }} onClick={() => onAddAt(pos)}>
                  + Assign tyre
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
