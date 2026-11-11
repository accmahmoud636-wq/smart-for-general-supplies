import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Products from './pages/Products';
import { Purchases, Sales } from './pages/Invoices';
import { Categories, Suppliers, Customers, Expenses, StockPage, Reports } from './pages/OtherPages';
import Settings from './pages/Settings';
import AmazonHub from './pages/AmazonHub';
import Shipments from './pages/Shipments';
import Damaged from './pages/Damaged';
import Seasons from './pages/Seasons';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',color:'#6366f1',fontSize:20 }}>⏳ جاري التحميل...</div>;
  if (!user) return <Navigate to="/login" />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',color:'#6366f1',fontSize:20 }}>⏳</div>;
  return (
    <Routes>
      <Route path="/login"      element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/"           element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/shipments"  element={<PrivateRoute><Shipments /></PrivateRoute>} />
      <Route path="/scan"       element={<Navigate to="/shipments" />} />
      <Route path="/seasons"    element={<PrivateRoute><Seasons /></PrivateRoute>} />
      <Route path="/damaged"    element={<PrivateRoute><Damaged /></PrivateRoute>} />
      <Route path="/amazon"     element={<PrivateRoute><AmazonHub /></PrivateRoute>} />
      <Route path="/products"   element={<PrivateRoute><Products /></PrivateRoute>} />
      <Route path="/categories" element={<PrivateRoute><Categories /></PrivateRoute>} />
      <Route path="/suppliers"  element={<PrivateRoute><Suppliers /></PrivateRoute>} />
      <Route path="/customers"  element={<PrivateRoute><Customers /></PrivateRoute>} />
      <Route path="/purchases"  element={<PrivateRoute><Purchases /></PrivateRoute>} />
      <Route path="/sales"      element={<PrivateRoute><Sales /></PrivateRoute>} />
      <Route path="/expenses"   element={<PrivateRoute><Expenses /></PrivateRoute>} />
      <Route path="/stock"      element={<PrivateRoute><StockPage /></PrivateRoute>} />
      <Route path="/reports"    element={<PrivateRoute><Reports /></PrivateRoute>} />
      <Route path="/reports/inventory" element={<PrivateRoute><Reports /></PrivateRoute>} />
      <Route path="/settings"   element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/users"      element={<Navigate to="/settings?tab=users" />} />
      <Route path="*"           element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" toastOptions={{ style:{ background:'var(--card)',color:'var(--text)',border:'1px solid var(--border)' } }} />
      <AppRoutes />
    </AuthProvider>
  );
}
