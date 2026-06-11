import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, TrendingDown, DollarSign, AlertCircle, 
  ArrowUpRight, ArrowDownRight, Activity, Calendar, Trash2
} from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';

// Mock data for the next 12 weeks
const liquidityData = [
  { week: 'Uke 1', date: '01.okt', ingoing: 450000, outgoing: 320000, balance: 1250000, target: 1000000 },
  { week: 'Uke 2', date: '08.okt', ingoing: 280000, outgoing: 410000, balance: 1120000, target: 1000000 },
  { week: 'Uke 3', date: '15.okt', ingoing: 520000, outgoing: 380000, balance: 1260000, target: 1000000 },
  { week: 'Uke 4', date: '22.okt', ingoing: 310000, outgoing: 450000, balance: 1120000, target: 1000000 },
  { week: 'Uke 5', date: '29.okt', ingoing: 680000, outgoing: 520000, balance: 1280000, target: 1000000 },
  { week: 'Uke 6', date: '05.nov', ingoing: 250000, outgoing: 610000, balance: 920000, target: 1000000 }, // Under target
  { week: 'Uke 7', date: '12.nov', ingoing: 480000, outgoing: 320000, balance: 1080000, target: 1000000 },
  { week: 'Uke 8', date: '19.nov', ingoing: 350000, outgoing: 410000, balance: 1020000, target: 1000000 },
  { week: 'Uke 9', date: '26.nov', ingoing: 720000, outgoing: 380000, balance: 1360000, target: 1000000 },
  { week: 'Uke 10', date: '03.des', ingoing: 290000, outgoing: 550000, balance: 1100000, target: 1000000 },
  { week: 'Uke 11', date: '10.des', ingoing: 410000, outgoing: 350000, balance: 1160000, target: 1000000 },
  { week: 'Uke 12', date: '17.des', ingoing: 850000, outgoing: 620000, balance: 1390000, target: 1000000 },
];

// Keep a stable starting balance for recalculation when payments are added
const initialStartingBalance = liquidityData[0].balance;

// Start of chart weeks: use start of current week (Monday)
const getStartOfWeek = (d = new Date()) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day + 6) % 7; // days since Monday
  date.setDate(date.getDate() - diff);
  date.setHours(0,0,0,0);
  return date;
};
const chartStartDate = getStartOfWeek();

const monthMap: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, mai: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11
};

const normalizeDateInput = (value: string) => {
  const raw = value.trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');

  const buildDate = (day: string, month: string, year: string) => {
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    let y = parseInt(year, 10);
    if (year.length === 2) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${y}`;
  };

  if (digits.length === 6) {
    return buildDate(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)) || raw;
  }

  if (digits.length === 8) {
    return buildDate(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)) || raw;
  }

  const slashMatch = raw.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2}|\d{4})$/);
  if (slashMatch) {
    return buildDate(slashMatch[1], slashMatch[2], slashMatch[3]) || raw;
  }

  return raw;
};

const parseShortDate = (s: string) => {
  // Accepts 'dd.mmm', 'dd/mm/yy', 'dd/mm/yyyy', or ISO 'yyyy-mm-dd'
  if (!s) return null;
  const normalized = normalizeDateInput(s);
  const slashMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    return new Date(year, month, day);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
  const m = s.toLowerCase().match(/^(\d{1,2})\.(\w{3})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = monthMap[m[2]];
  if (mon === undefined) return null;
  const year = new Date().getFullYear();
  return new Date(year, mon, day);
};

const formatDisplayDate = (s: string) => {
  const d = parseShortDate(s) || (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00'));
  if (!d) return s;
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().slice(-2);
  return `${day}/${month}/${year}`;
};

const weekIndexForDate = (d: Date) => {
  const diff = d.getTime() - chartStartDate.getTime();
  const idx = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, idx);
};

const upcomingPayments = [
  { id: 1, type: 'Ut', description: 'MVA Termin 4', amount: 345000, date: '10.nov', status: 'pending' },
  { id: 2, type: 'Ut', description: 'Arbeidsgiveravgift', amount: 185000, date: '15.nov', status: 'pending' },
  { id: 3, type: 'Inn', description: 'Faktura #4092 - Storkunde AS', amount: 450000, date: '02.nov', status: 'expected' },
  { id: 4, type: 'Inn', description: 'Faktura #4095 - Prosjekt Y', amount: 220000, date: '08.nov', status: 'expected' },
  { id: 5, type: 'Ut', description: 'Husleie Q4', amount: 150000, date: '01.des', status: 'pending' },
];

const App = () => {
  const [timeframe, setTimeframe] = useState('12weeks');
  const [payments, setPayments] = useState<any[]>([]);
  const [chartData, setChartData] = useState(() => liquidityData.map(d => ({ ...d })));
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [hasSeededDefaults, setHasSeededDefaults] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState<'Inn' | 'Ut'>('Inn');
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    date: '',
  });
  const [showAllModal, setShowAllModal] = useState(false);

  // Calculate key metrics from mutable chart data
  const currentBalance = chartData[0].balance;
  const lowestForecast = Math.min(...chartData.map(d => d.balance));
  const averageIngoing = chartData.reduce((acc, curr) => acc + curr.ingoing, 0) / chartData.length;
  const averageOutgoing = chartData.reduce((acc, curr) => acc + curr.outgoing, 0) / chartData.length;
  const netCashflow = averageIngoing - averageOutgoing;
  const bufferThreshold = 1000000;
  const lowestWeekData = chartData.find(d => d.balance < bufferThreshold);
  const lowestWeekLabel = lowestWeekData?.week || null;
  const hasWarning = lowestWeekData !== undefined;

  // Add payment handler: compute weekIndex from date and save to Firestore
  const handleAddPayment = async () => {
    if (formData.description && formData.amount && formData.date) {
      const normalizedDate = normalizeDateInput(formData.date);
      const parsedDate = parseShortDate(normalizedDate);
      if (!parsedDate) return;
      const payload = {
        type: paymentType,
        description: formData.description,
        amount: parseInt(formData.amount, 10),
        date: normalizedDate,
        status: 'pending',
        createdAt: Date.now(),
      };
      setShowAddPaymentModal(false);
      try {
        const docRef = await addDoc(collection(db, 'payments'), payload);
        setPayments(prev => [...prev, { id: docRef.id, ...payload }]);
        setFormData({ description: '', amount: '', date: '' });
      } catch (error) {
        console.error(error);
        setPaymentError('Feil ved lagring av betalingen');
        setShowAddPaymentModal(true);
      }
    }
  };

  // Export to CSV handler
  const handleExport = () => {
    const headers = ['Type', 'Description', 'Amount', 'Date', 'Status'];
    const rows = payments.map(p => [p.type, p.description, p.amount, p.date, p.status]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payments.csv';
    a.click();
  };

  const handleDeletePayment = async (id: string | number) => {
    try {
      await deleteDoc(doc(db, 'payments', String(id)));
      setPayments(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error(error);
      setPaymentError('Feil ved sletting av betalingen');
    }
  };

  const seedDefaultPayments = async () => {
    const paymentsCollection = collection(db, 'payments');
    const timestamp = Date.now();
    const entries = liquidityData.flatMap((week, index) => [
      {
        type: 'Inn',
        description: `Basis innbetaling ${week.week}`,
        amount: week.ingoing,
        date: week.date,
        status: 'forecast',
        createdAt: timestamp + index * 2,
      },
      {
        type: 'Ut',
        description: `Basis utbetaling ${week.week}`,
        amount: week.outgoing,
        date: week.date,
        status: 'forecast',
        createdAt: timestamp + index * 2 + 1,
      },
    ]);
    for (const entry of entries) {
      await addDoc(paymentsCollection, entry);
    }
    setHasSeededDefaults(true);
  };

  const getTimestampValue = (item: any) => {
    if (!item.createdAt) return 0;
    if (typeof item.createdAt === 'number') return item.createdAt;
    if (item.createdAt.seconds) return item.createdAt.seconds * 1000;
    return 0;
  };

  useEffect(() => {
    const paymentsQuery = query(collection(db, 'payments'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(paymentsQuery, async (snapshot) => {
      if (snapshot.empty && !hasSeededDefaults) {
        await seedDefaultPayments();
        return;
      }
      const data = snapshot.docs
        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
        .sort((a: any, b: any) => getTimestampValue(a) - getTimestampValue(b));
      setPayments(data as any[]);
      setLoadingPayments(false);
    }, (error) => {
      console.error(error);
      setPaymentError('Kunne ikke laste betalinger fra Firestore. Vennligst sjekk tilkobling eller regler.');
      setPayments(upcomingPayments);
      setLoadingPayments(false);
    });
    return () => unsubscribe();
  }, [hasSeededDefaults]);

  // Rebuild chartData whenever payments change by applying all payments to a fresh base
  useEffect(() => {
    const base = liquidityData.map(d => ({ week: d.week, date: d.date, ingoing: 0, outgoing: 0, target: d.target }));
    payments.forEach((p: any) => {
      let parsed: Date | null = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(p.date)) parsed = new Date(p.date + 'T00:00:00');
      else parsed = parseShortDate(p.date);
      const idx = parsed ? Math.min(weekIndexForDate(parsed), base.length - 1) : (p.weekIndex ?? 0);
      if (idx < 0 || idx >= base.length) return;
      if (p.type === 'Inn') base[idx].ingoing += p.amount;
      else base[idx].outgoing += p.amount;
    });
    // recalc balances from initialStartingBalance
    let prevBal = initialStartingBalance;
    const updated = base.map((wk, i) => {
      const bal = i === 0 ? initialStartingBalance + wk.ingoing - wk.outgoing : prevBal + wk.ingoing - wk.outgoing;
      prevBal = bal;
      return { ...wk, balance: bal };
    });
    setChartData(updated);
  }, [payments]);

  // derive filtered data for charts based on timeframe
  const weeksCount = timeframe === '4weeks' ? 4 : timeframe === '12weeks' ? 12 : 24;
  const filteredData = chartData.slice(0, Math.min(weeksCount, chartData.length));

  // Formatting helpers
  const formatCurrency = (value: any) => {
    return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(value);
  };

  const formatShortCurrency = (value: any) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="text-blue-600" />
              Likviditetsprognose
            </h1>
            <p className="text-slate-500">Oversikt over forventet kontantstrøm og saldo</p>
          </div>
          
          <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
            <button 
              onClick={() => setTimeframe('4weeks')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeframe === '4weeks' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              4 uker
            </button>
            <button 
              onClick={() => setTimeframe('12weeks')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeframe === '12weeks' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              12 uker
            </button>
            <button 
              onClick={() => setTimeframe('6months')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeframe === '6months' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              6 mnd
            </button>
          </div>
        </div>

        {paymentError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <strong>Databaseproblem:</strong> {paymentError}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Current Balance */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-500">Dagens Saldo</span>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <DollarSign size={20} />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(currentBalance)}</div>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                <span className="text-emerald-600 flex items-center font-medium">
                  <ArrowUpRight size={16} /> 2.4%
                </span> fra forrige uke
              </div>
            </div>
          </div>

          {/* Lowest Forecast */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-500">Laveste prognose (periode)</span>
              <div className={`p-2 rounded-lg ${lowestForecast < 1000000 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <AlertCircle size={20} />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(lowestForecast)}</div>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                {hasWarning ? (
                  <span className="text-amber-600 font-medium text-xs">Under buffermål i {lowestWeekLabel}</span>
                ) : (
                  <span className="text-emerald-600 font-medium text-xs">Over buffermål hele perioden</span>
                )}
              </div>
            </div>
          </div>

          {/* Avg Cashflow */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-500">Gj.snitt Netto Kontantstrøm</span>
              <div className={`p-2 rounded-lg ${netCashflow >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {netCashflow >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(netCashflow)}/uke</div>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                Inn: {formatShortCurrency(averageIngoing)} | Ut: {formatShortCurrency(averageOutgoing)}
              </div>
            </div>
          </div>
          
          {/* Buffer Target */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-500">Strategisk Buffermål</span>
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <Calendar size={20} />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(1000000)}</div>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                Basert på 2 mnd faste kostnader
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Chart Section */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Balance Forecast Chart */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Saldoutvikling (Prognose)</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis 
                      tickFormatter={formatShortCurrency} 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#64748b', fontSize: 12}}
                      domain={[500000, 1500000]}
                    />
                    <Tooltip 
                      formatter={(value: any) => formatCurrency(value)}
                      labelStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                    <ReferenceLine y={1000000} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Buffermål', fill: '#f59e0b', fontSize: 12 }} />
                    <Line 
                      type="monotone" 
                      name="Forventet Saldo"
                      dataKey="balance" 
                      stroke="#2563eb" 
                      strokeWidth={3} 
                      dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                      activeDot={{ r: 6, strokeWidth: 0, fill: '#2563eb' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cashflow Bar Chart */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Inn- og utbetalinger per uke</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis 
                      tickFormatter={formatShortCurrency} 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#64748b', fontSize: 12}}
                    />
                    <Tooltip 
                      formatter={(value: any) => formatCurrency(value)}
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                    <Bar name="Innbetalinger" dataKey="ingoing" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar name="Utbetalinger" dataKey="outgoing" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            
            {/* Critical Events/Warnings */}
            <div className={`${hasWarning ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'bg-emerald-50 border border-emerald-200 text-emerald-900'} rounded-xl p-5 shadow-sm`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`${hasWarning ? 'text-amber-600' : 'text-emerald-600'} mt-0.5 flex-shrink-0`} size={20} />
                <div>
                  <h3 className={`font-semibold ${hasWarning ? 'text-amber-900' : 'text-emerald-900'}`}>{hasWarning ? 'Varsler' : 'Ingen varsler'}</h3>
                  <p className="text-sm mt-1">
                    {hasWarning ? (
                      <>Prognosen viser at saldo kan falle under strategisk buffermål ({formatCurrency(bufferThreshold)}) i <strong>{lowestWeekLabel}</strong> på grunn av store forventede utbetalinger (MVA).</>
                    ) : (
                      <>Prognosen viser ikke noen varsler. Saldo holder over strategisk buffermål ({formatCurrency(bufferThreshold)}) i perioden.</>
                    )}
                  </p>
                  {hasWarning && (
                    <button
                      onClick={() => {
                        setTimeframe('12weeks');
                        setShowAllModal(true);
                      }}
                      className="mt-3 text-sm font-medium text-amber-700 hover:text-amber-900 bg-amber-100 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Se detaljer for {lowestWeekLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Upcoming Significant Payments */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800">Store forventede poster</h3>
                <button onClick={() => setShowAllModal(true)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Se alle</button>
              </div>
              <div className="divide-y divide-slate-100">
                {payments.map((payment: any) => (
                  <div key={payment.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-slate-800">{payment.description}</span>
                      <span className={`font-semibold ${payment.type === 'Inn' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {payment.type === 'Inn' ? '+' : '-'}{formatCurrency(payment.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Calendar size={14} /> Forfall: {formatDisplayDate(payment.date)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        payment.type === 'Inn' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        {payment.type === 'Inn' ? 'Forventet innbetaling' : 'Forventet utbetaling'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* All Payments Modal */}
            {showAllModal && (
              <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Alle forventede poster</h2>
                    <button onClick={() => setShowAllModal(false)} className="text-slate-500 hover:text-slate-700">Lukk</button>
                  </div>
                  <div className="space-y-3 max-h-80 overflow-auto">
                    {payments.length === 0 ? (
                      <div className="text-sm text-slate-500">Ingen poster funnet.</div>
                    ) : (
                      payments.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                            <div className="font-medium text-slate-800">{p.description}</div>
                            <div className="text-sm text-slate-500">Forfall: {formatDisplayDate(p.date)}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`font-semibold ${p.type === 'Inn' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {p.type === 'Inn' ? '+' : '-'}{formatCurrency(p.amount)}
                            </div>
                            <button onClick={() => handleDeletePayment(p.id)} className="p-2 rounded-md text-slate-600 hover:bg-slate-100">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">Hurtighandlinger</h3>
              <div className="space-y-2">
                <button 
                  onClick={() => {
                    setPaymentType('Inn');
                    setShowAddPaymentModal(true);
                  }}
                  className="w-full flex items-center justify-between p-3 text-left border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <span className="text-slate-700 font-medium group-hover:text-blue-700">Legg til forventet inntekt</span>
                  <ArrowUpRight size={18} className="text-slate-400 group-hover:text-blue-600" />
                </button>
                <button 
                  onClick={() => {
                    setPaymentType('Ut');
                    setShowAddPaymentModal(true);
                  }}
                  className="w-full flex items-center justify-between p-3 text-left border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <span className="text-slate-700 font-medium group-hover:text-blue-700">Legg til forventet utgift</span>
                  <ArrowDownRight size={18} className="text-slate-400 group-hover:text-blue-600" />
                </button>
                <button 
                  onClick={handleExport}
                  className="w-full flex items-center justify-between p-3 text-left border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-slate-700 font-medium">Eksporter rapport</span>
                  <span className="text-slate-400 text-sm">CSV/PDF</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Add Payment Modal */}
        {showAddPaymentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">
                {paymentType === 'Inn' ? 'Legg til forventet inntekt' : 'Legg til forventet utgift'}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Beskrivelse</label>
                  <input
                    type="text"
                    placeholder="f.eks. Faktura #4096"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Beløp (NOK)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Forfallsdato</label>
                  <input
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: normalizeDateInput(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Én gyldig datoformat: dd/mm/yyyy (eller 6/8 sifre som auto-konverteres)</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddPaymentModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleAddPayment}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Legg til
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;