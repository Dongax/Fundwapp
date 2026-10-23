import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import PublicFundraiser from './pages/PublicFundraiser';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateCampaign from './pages/CreateCampaign';
import AdminPortal from './pages/AdminPortal';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/f/:slug" element={<PublicFundraiser />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={
          <RequireAuth><Dashboard /></RequireAuth>
        } />
        <Route path="/campaigns/new" element={
          <RequireAuth><CreateCampaign /></RequireAuth>
        } />
        <Route path="/admin" element={
          <RequireAuth role="admin"><AdminPortal /></RequireAuth>
        } />
      </Routes>
    </>
  );
}
