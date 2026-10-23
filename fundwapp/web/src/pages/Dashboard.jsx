import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import ProgressBar from '../components/ProgressBar';

export default function Dashboard() {
  const [fundraisers, setFundraisers] = useState([]);

  useEffect(() => {
    client.get('/campaigns/mine').then((res) => setFundraisers(res.data));
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: '40px auto' }}>
      <h2>My fundraisers</h2>
      {fundraisers.length === 0 && <p>You haven't created a fundraiser yet.</p>}
      {fundraisers.map((f) => (
        <div key={f.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <h3>{f.title} <small>({f.status})</small></h3>
          <ProgressBar percent={(f.amount_raised / f.goal_amount) * 100} />
          <p>{f.amount_raised} / {f.goal_amount} {f.currency}</p>
          <Link to={`/f/${f.slug}`}>View public page</Link>
        </div>
      ))}
    </div>
  );
}
