import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

export default function Register() {
  const [form, setForm] = useState({ full_name: '', phone_number: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/auth/register', form);
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  }

  if (done) return <p style={{ textAlign: 'center', marginTop: 40 }}>Check your phone for a verification code. Redirecting to login...</p>;

  return (
    <div style={{ maxWidth: 360, margin: '40px auto' }}>
      <h2>Create an account</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Full name" value={form.full_name} onChange={update('full_name')} required />
        <input placeholder="Phone number" value={form.phone_number} onChange={update('phone_number')} required />
        <input placeholder="Email (optional)" value={form.email} onChange={update('email')} />
        <input placeholder="Password" type="password" value={form.password} onChange={update('password')} required minLength={8} />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Register</button>
      </form>
    </div>
  );
}
