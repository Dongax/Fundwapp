import { useEffect, useState } from 'react';
import client from '../api/client';

// Admin-only: approve campaigns, manage users, monitor flagged activity (SDD 2.1).
export default function AdminPortal() {
  const [pending, setPending] = useState([]);
  const [flagged, setFlagged] = useState([]);

  function loadPending() {
    client.get('/admin/fundraisers/pending').then((res) => setPending(res.data));
  }

  useEffect(() => {
    loadPending();
    client.get('/admin/flagged-activity').then((res) => setFlagged(res.data));
  }, []);

  async function approve(id) {
    await client.patch(`/admin/fundraisers/${id}/approve`);
    loadPending();
  }

  async function reject(id) {
    await client.patch(`/admin/fundraisers/${id}/reject`, { reason: 'Does not meet guidelines' });
    loadPending();
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto' }}>
      <h2>Admin Portal</h2>

      <h3>Pending fundraisers</h3>
      {pending.length === 0 && <p>Nothing pending review.</p>}
      {pending.map((f) => (
        <div key={f.id} style={{ border: '1px solid #eee', padding: 12, marginBottom: 8 }}>
          <strong>{f.title}</strong> — goal {f.goal_amount} {f.currency}
          <div>
            <button onClick={() => approve(f.id)}>Approve</button>
            <button onClick={() => reject(f.id)}>Reject</button>
          </div>
        </div>
      ))}

      <h3>Recent failed contributions (flagged activity)</h3>
      {flagged.map((c) => (
        <div key={c.id}>{c.contributor_name} — {c.amount} via {c.payment_method} — failed</div>
      ))}
    </div>
  );
}
