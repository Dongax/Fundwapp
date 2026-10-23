import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

export default function CreateCampaign() {
  const [form, setForm] = useState({ title: '', description: '', category: '', goal_amount: '', end_date: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await client.post('/campaigns', { ...form, goal_amount: Number(form.goal_amount) });
      navigate(`/f/${data.slug}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create fundraiser');
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto' }}>
      <h2>Start a fundraiser</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Title" value={form.title} onChange={update('title')} required />
        <textarea placeholder="Description" value={form.description} onChange={update('description')} />
        <input placeholder="Category" value={form.category} onChange={update('category')} />
        <input placeholder="Goal amount" type="number" min="1" value={form.goal_amount} onChange={update('goal_amount')} required />
        <input placeholder="End date" type="date" value={form.end_date} onChange={update('end_date')} />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Create fundraiser</button>
      </form>
    </div>
  );
}
