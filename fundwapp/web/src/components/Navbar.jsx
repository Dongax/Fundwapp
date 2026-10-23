import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <nav style={{ display: 'flex', gap: 16, padding: 16, borderBottom: '1px solid #eee' }}>
      <Link to="/"><strong>Fundwapp</strong></Link>
      {user ? (
        <>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/campaigns/new">Start a Fundraiser</Link>
          {user.role === 'admin' && <Link to="/admin">Admin</Link>}
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <>
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
        </>
      )}
    </nav>
  );
}
