import { useState } from 'react';
import Customers from './Customers';
import Vendors from './Vendors';

// One Masters entry, two full existing pages behind a toggle - reused
// wholesale (each keeps its own header/table/form), not reimplemented.
// Customer = who bills you (receivable); Vendor = who you bill (payable).
export default function CustomerVendor() {
  const [tab, setTab] = useState<'customers' | 'vendors'>('customers');

  return (
    <>
      <div className="cv-tabstrip">
        <button
          type="button"
          className={`cv-tab${tab === 'customers' ? ' active' : ''}`}
          onClick={() => setTab('customers')}
        >
          Customers
        </button>
        <button
          type="button"
          className={`cv-tab${tab === 'vendors' ? ' active' : ''}`}
          onClick={() => setTab('vendors')}
        >
          Vendors
        </button>
      </div>
      {tab === 'customers' ? <Customers /> : <Vendors />}
    </>
  );
}
