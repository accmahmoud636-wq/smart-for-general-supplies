import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import { Purchases, Sales } from './pages/Invoices';
import { Categories, Suppliers, Customers, Expenses, StockPage, Users, Reports } from './pages/OtherPages';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f172a',color:'#6366f1',fontSize:20 }}>⏳ جاري التحميل...</div>;
  if (!user) return <Navigate to="/login" />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f172a',color:'#6366f1',fontSize:20 }}>⏳</div>;
  return (
    <Routes>
      <Route path="/login"      element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/"           element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/products"   element={<PrivateRoute><Products /></PrivateRoute>} />
      <Route path="/categories" element={<PrivateRoute><Categories /></PrivateRoute>} />
      <Route path="/suppliers"  element={<PrivateRoute><Suppliers /></PrivateRoute>} />
      <Route path="/customers"  element={<PrivateRoute><Customers /></PrivateRoute>} />
      <Route path="/purchases"  element={<PrivateRoute><Purchases /></PrivateRoute>} />
      <Route path="/sales"      element={<PrivateRoute><Sales /></PrivateRoute>} />
      <Route path="/expenses"   element={<PrivateRoute><Expenses /></PrivateRoute>} />
      <Route path="/stock"      element={<PrivateRoute><StockPage /></PrivateRoute>} />
      <Route path="/reports"    element={<PrivateRoute><Reports /></PrivateRoute>} />
      <Route path="/users"      element={<PrivateRoute><Users /></PrivateRoute>} />
      <Route path="*"           element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" toastOptions={{ style:{ background:'#1e293b',color:'#e2e8f0',border:'1px solid #334155' } }} />
      <AppRoutes />
    </AuthProvider>
  );
}
