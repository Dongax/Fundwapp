import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import ProgressBar from '../components/ProgressBar';

// Implements SDD Section 4.1: public landing page + contribution flow.
// No login required to view or contribute.
export default function PublicFundraiser() {
  const { slug } = useParams();
  const [fundraiser, setFundraiser] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ contributor_name: '', contributor_phone: '', amount: '', payment_method: 'mpesa' });
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    client.get(`/campaigns/public/${slug}`)
      .then((res) => setFundraiser(res.data))
      .catch(() => setError('Fundraiser not found or not currently active.'));
  }, [slug]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleContribute(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatusMessage('');
    try {
      const { data } = await client.post(`/payments/${slug}/contribute`, {
        ...form,
        amount: Number(form.amount),
      });
      setStatusMessage(data.message); // "Approve the prompt on your phone..."
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p style={{ textAlign: 'center', marginTop: 40 }}>{error}</p>;
  if (!fundraiser) return <p style={{ textAlign: 'center', marginTop: 40 }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 480, margin: '40px auto' }}>
      {fundraiser.cover_image_url && <img src={fundraiser.cover_image_url} alt={fundraiser.title} style={{ width: '100%', borderRadius: 8 }} />}
      <h2>{fundraiser.title}</h2>
      <p>{fundraiser.description}</p>
      <ProgressBar percent={fundraiser.progress_pct} />
      <p>{fundraiser.amount_raised} / {fundraiser.goal_amount} {fundraiser.currency} raised &middot; {fundraiser.contributor_count} contributors</p>

      <h3>Contribute</h3>
      <form onSubmit={handleContribute}>
        <input placeholder="Your name" value={form.contributor_name} onChange={update('contributor_name')} required />
        <input placeholder="Phone number" value={form.contributor_phone} onChange={update('contributor_phone')} required />
        <input placeholder="Amount" type="number" min="1" value={form.amount} onChange={update('amount')} required />
        <select value={form.payment_method} onChange={update('payment_method')}>
          <option value="mpesa">M-Pesa</option>
          <option value="airtel_money">Airtel Money</option>
          <option value="card">Debit/Credit Card</option>
          <option value="bank_transfer">Bank Transfer</option>
        </select>
        <button type="submit" disabled={submitting}>{submitting ? 'Sending request...' : 'Contribute'}</button>
      </form>
      {statusMessage && <p>{statusMessage}</p>}
    </div>
  );
}
