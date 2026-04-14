import { useState, useEffect } from 'react';
import { SplashScreen } from './components/splash/SplashScreen';
import { Sidebar }      from './components/layout/Sidebar';
import { Header }       from './components/layout/Header';
import { MobileNav }    from './components/layout/MobileNav';
import { Toast }        from './components/ui/Toast';
import { Icons }        from './components/ui/Icons';
import { SupportModal } from './components/modals/SupportModal';

import WelcomePage      from './pages/WelcomePage';
import DriverPlaceholder from './pages/DriverPlaceholder';
import WorkerPlaceholder from './pages/WorkerPlaceholder';
import LoginPage         from './pages/LoginPage';
import Dashboard         from './pages/Dashboard';
import ProductList       from './pages/ProductList';
import  ProductForm    from './pages/ProductForm';
import OrdersPage        from './pages/OrdersPage';
import  WalletPage     from './pages/WalletPage';
import  SalesSummary   from './pages/SalesSummary';
import BillingPage       from './pages/BillingPage';
import  SettingsPage   from './pages/SettingsPage';

import {
  getProfile, updateProfile,
  getProducts, createProduct, updateProduct, toggleActive, boostProduct,
  getOrders, createOrder, updateOrderStatus,
  getInvoices, createInvoice,
  getSettlements,
} from './api/apiClient';
import { getCurrentLocation, reverseGeocodeCoordinates } from './utils/locationUtils';

const NAV = [
  { id: 'home',     label: 'Dashboard', icon: <Icons.Home /> },
  { id: 'products', label: 'Catalog',   icon: <Icons.Grid /> },
  { id: 'orders',   label: 'Orders',    icon: <Icons.Truck /> },
  { id: 'wallet',   label: 'Wallet',    icon: <Icons.Wallet /> },
  { id: 'sales',    label: 'Analytics', icon: <Icons.BarChart /> },
  { id: 'billing',  label: 'Billing',   icon: <Icons.Receipt /> },
  { id: 'settings', label: 'Settings',  icon: <Icons.Settings /> },
];

const extractVendorPayload = (responseData) => {
  if (!responseData) return {};
  if (responseData.vendor && typeof responseData.vendor === 'object') return responseData.vendor;
  if (responseData.data && typeof responseData.data === 'object') return responseData.data;
  return responseData;
};

const App = () => {
  const [selectedRole,  setSelectedRole] = useState(null);  // null = show welcome, 'vendor' = vendor app
  const [isAuth,       setIsAuth]       = useState(false);
  const [view,         setView]         = useState('home');
  const [isDark,       setIsDark]       = useState(true);
  const [toasts,       setToasts]       = useState([]);
  const [showSupport,  setShowSupport]  = useState(false);

  const [vendor,       setVendor]       = useState({});
  const [products,     setProducts]     = useState([]);
  const [orders,       setOrders]       = useState([]);
  const [invoices,     setInvoices]     = useState([]);
  const [settlements,  setSettlements]  = useState([]);
  const [editProduct,  setEditProduct]  = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    const token = localStorage.getItem('dechta_token');
    if (token) { setIsAuth(true); fetchAll(); }
  }, []);

  // -- Auto-poll for new orders every 30 seconds -------------
  // This ensures online orders placed from the client app appear
  // on the vendor dashboard without requiring a manual refresh.
  useEffect(() => {
    if (!isAuth) return;
    const interval = setInterval(async () => {
      try {
        const oRes = await getOrders();
        setOrders(oRes.data.data || oRes.data.orders || []);
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem('dechta_token');
          setIsAuth(false);
        }
      }
    }, 30000); // poll every 30 seconds
    return () => clearInterval(interval);
  }, [isAuth]);

  useEffect(() => {
    const syncVendorLocation = async () => {
      if (selectedRole !== 'vendor' || !isAuth) return;

      try {
        const gps = await getCurrentLocation();
        const resolved = await reverseGeocodeCoordinates(gps.lat, gps.lng).catch(() => null);
        const locationLabel =
          resolved?.displayName ||
          [resolved?.area, resolved?.city, resolved?.state].filter(Boolean).join(', ') ||
          `Lat ${Number(gps.lat).toFixed(5)}, Lng ${Number(gps.lng).toFixed(5)}`;

        const payload = {
          latitude: gps.lat,
          longitude: gps.lng,
          locationLabel,
        };

        if ((!vendor?.address || !String(vendor.address).trim()) && resolved?.displayName) {
          payload.address = resolved.displayName;
        }

        const res = await updateProfile(payload);
        const nextVendor = extractVendorPayload(res?.data);
        if (Object.keys(nextVendor).length) {
          setVendor(nextVendor);
        }
      } catch {
        notify('Please turn on location to improve delivery distance and charge calculation.', 'info');
      }
    };

    syncVendorLocation();
  }, [selectedRole, isAuth]);

  const notify = (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  };

  const fetchAll = async () => {
    try {
      const [vRes, pRes, oRes, sRes, iRes] = await Promise.all([
        getProfile(), getProducts(), getOrders(), getSettlements(), getInvoices(),
      ]);
      setVendor(extractVendorPayload(vRes?.data));
      setProducts(pRes.data?.products || pRes.data?.data || []);
      setOrders(oRes.data?.data || oRes.data?.orders || []);
      setSettlements(sRes.data?.settlements || sRes.data?.data || []);
      setInvoices(iRes.data?.invoices || iRes.data?.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('dechta_token');
        setIsAuth(false);
      }
    }
  };

  const handleLoginSuccess = (vendorData) => {
    setVendor(vendorData);
    setIsAuth(true);
    fetchAll();
  };

  const handleLogout = () => {
    localStorage.removeItem('dechta_token');
    setIsAuth(false);
    setSelectedRole(null);  // Go back to welcome page
    setVendor({}); setProducts([]); setOrders([]);
  };

  // -- Product handlers --------------------------------------
  const handleSaveProduct = async (prod) => {
    try {
      if (prod.id) {
        const res = await updateProduct(prod.id, prod);
        setProducts(p => p.map(x => x.id === prod.id ? res.data.product : x));
      } else {
        const res = await createProduct(prod);
        setProducts(p => [res.data.product, ...p]);
      }
      notify(prod.id ? 'Product Updated!' : 'Product Saved!', 'success');
      setEditProduct(null);
      setView('products');
      fetchAll(); // Force a clean sync to destroy any ghost state variables
    } catch (err) { notify(err.response?.data?.message || err.response?.data?.error || 'Save failed', 'error'); }
  };

  const handleToggleActive = async (id) => {
    try {
      const res = await toggleActive(id);
      setProducts(p => p.map(x => x.id === id ? { ...x, is_active: res.data.product.is_active } : x));
    } catch { notify('Failed to update status', 'error'); }
  };

  const handleBoost = async (id) => {
    try {
      await boostProduct(id);
      setProducts(p => p.map(x => x.id === id ? { ...x, isBoosted: true } : x));
      notify('Product Boosted! ??', 'success');
    } catch { notify('Boost failed', 'error'); }
  };

  // -- Order handlers ----------------------------------------
  const handleUpdateStatus = async (id, status) => {
    try {
      const res = await updateOrderStatus(id, status);
      setOrders(p => p.map(o => o.id === id ? res.data : o));
    } catch { notify('Status update failed', 'error'); }
  };

  const handleOfflineBill = async ({ customerName, customerPhone, customerGst, address, items, totalAmount }) => {
    try {
      await createInvoice({
        customer_name: customerName, 
        customer_phone: customerPhone, 
        customer_gst: customerGst,
        customer_address: address, 
        items, 
        tax_rate: 18,
        total_amount: totalAmount,
        subtotal: totalAmount / 1.18,
        tax_amount: totalAmount - (totalAmount / 1.18)
      });
      notify('Offline Bill Generated! ??', 'success');
      fetchAll();
    } catch (err) { notify(err.response?.data?.error || 'Bill failed', 'error'); }
  };

  // -- Vendor update handler ---------------------------------
  const handleUpdateVendor = async (data) => {
    try {
      const res = await updateProfile(data);
      const updatedVendor = extractVendorPayload(res?.data);
      if (updatedVendor && Object.keys(updatedVendor).length > 0) {
        setVendor(updatedVendor);
      } else {
        await fetchAll();
      }
      notify('Settings saved', 'success');
      return updatedVendor;
    } catch { notify('Save failed', 'error'); }
    return null;
  };

  const lowStockCount = products.filter(p => p.stock < 5).length;

  // -- Show Welcome Page (Role Selection) --------------------
  if (!selectedRole) {
    return (
      <>
        <WelcomePage onRoleSelect={(role) => setSelectedRole(role)} />
        {toasts.map(t => (
          <Toast key={t.id} message={t.msg} type={t.type}
            onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
        ))}
      </>
    );
  }

  // -- Driver Role ------------------------------------------
  if (selectedRole === 'driver') {
    return (
      <>
        <DriverPlaceholder onBack={() => setSelectedRole(null)} />
        {toasts.map(t => (
          <Toast key={t.id} message={t.msg} type={t.type}
            onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
        ))}
      </>
    );
  }

  // -- Worker Role ------------------------------------------
  if (selectedRole === 'worker') {
    return (
      <>
        <WorkerPlaceholder onBack={() => setSelectedRole(null)} />
        {toasts.map(t => (
          <Toast key={t.id} message={t.msg} type={t.type}
            onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
        ))}
      </>
    );
  }

  // -- Vendor Role – Pre-auth view --------------------------
  if (selectedRole === 'vendor' && !isAuth) {
    return (
      <>
        <SplashScreen />
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          isDark={isDark}
          toggleTheme={() => setIsDark(!isDark)}
          notify={notify}
        />
        {toasts.map(t => (
          <Toast key={t.id} message={t.msg} type={t.type}
            onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
        ))}
      </>
    );
  }

  // -- Vendor Role – Authenticated layout ----------------------
  if (selectedRole === 'vendor') {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden font-sans text-gray-900 dark:text-white">
      <Sidebar
        view={view} setView={setView}
        vendor={vendor} onLogout={handleLogout}
        navItems={NAV}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Header
          view={view}
          isDark={isDark}
          toggleTheme={() => setIsDark(!isDark)}
          lowStockCount={lowStockCount}
          onSupport={() => setShowSupport(true)}
        />

        <div className="flex-1 overflow-y-auto no-scrollbar bg-gray-50 dark:bg-slate-950 pb-20 md:pb-0">
          {view === 'home'        && <Dashboard    products={products} orders={orders} setView={setView} />}
          {view === 'products'    && <ProductList  products={products} setView={setView} toggleActive={handleToggleActive} onBoost={handleBoost} onEdit={p => { setEditProduct(p); setView('add-product'); }} />}
          {view === 'add-product' && <ProductForm  onSave={handleSaveProduct} editingProduct={editProduct} onCancel={() => { setEditProduct(null); setView('products'); }} notify={notify} />}
          {view === 'orders'      && <OrdersPage   orders={orders} onUpdateStatus={handleUpdateStatus} notify={notify} products={products} vendor={vendor} />}
          {view === 'wallet'      && <WalletPage   orders={orders} settlements={settlements} setSettlements={setSettlements} notify={notify} />}
          {view === 'sales'       && <SalesSummary orders={orders} products={products} notify={notify} />}
          {view === 'billing'     && <BillingPage  invoices={invoices} orders={orders} products={products} vendor={vendor} onGenerateOfflineBill={handleOfflineBill} />}
          {view === 'settings'    && <SettingsPage vendor={vendor} updateVendor={handleUpdateVendor} notify={notify} />}
        </div>

        <MobileNav view={view} setView={setView} navItems={NAV} />
      </main>

      {toasts.map(t => (
        <Toast key={t.id} message={t.msg} type={t.type}
          onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
      ))}

      {showSupport && <SupportModal onClose={() => setShowSupport(false)} notify={notify} />}
    </div>
    );
  }

  // -- Fallback (should not reach here) ---------------------
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="text-center">
        <p className="text-2xl mb-4">Invalid role selected</p>
        <button onClick={() => setSelectedRole(null)} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
          Go back to Welcome
        </button>
      </div>
    </div>
  );
};

export default App;
