import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../utils/api';
import { StatCard, fmt, C_THEME as C } from '../components/UI';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/reports/dashboard'), api.get('/reports/top-products')])
      .then(([r1, r2]) => { setData(r1.data); setTopProducts(r2.data); })
      .catch(() => toast.error('خطأ في تحميل البيانات'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>⏳ تحميل...</div>;
  if (!data) return null;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: 22, color: '#fff' }}>📊 لوحة التحكم</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>نظرة عامة على أداء الأعمال هذا الشهر</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="إيرادات الشهر" value={`${fmt(data.monthRevenue)} ر.س`} icon="💰" color="#10b981" />
        <StatCard label="صافي الربح" value={`${fmt(data.monthProfit)} ر.س`} icon="📈" color={data.monthProfit >= 0 ? '#6366f1' : '#ef4444'} />
        <StatCard label="المصروفات" value={`${fmt(data.monthExpTotal)} ر.س`} icon="💸" color="#f59e0b" />
        <StatCard label="قيمة المخزون" value={`${fmt(data.inventoryValue)} ر.س`} icon="📦" color="#3b82f6" />
        <StatCard label="إجمالي المنتجات" value={data.totalProducts} icon="🏷️" color="#8b5cf6" />
        <StatCard label="مخزون منخفض" value={data.lowStockProducts} icon="⚠️" color="#ef4444" sub="منتجات تحتاج تعبئة" />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Revenue Chart */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>📊 الإيرادات آخر 6 أشهر</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.chartData}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#rev)" strokeWidth={2} name="الإيرادات" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Expenses Chart */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>💸 المصروفات آخر 6 أشهر</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
              <Bar dataKey="expenses" fill="#f59e0b" radius={[4,4,0,0]} name="المصروفات" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>🏆 أفضل المنتجات مبيعاً</div>
        {topProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>لا توجد مبيعات حتى الآن</div>
        ) : (
          <div>
            {topProducts.slice(0, 5).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 4 ? `1px solid ${C.border}22` : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'][i] + '33', color: ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'][i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{i+1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{p.qty} وحدة</div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, color: '#10b981', fontWeight: 700 }}>{fmt(p.revenue)} ر.س</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>ربح: {fmt(p.profit)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
