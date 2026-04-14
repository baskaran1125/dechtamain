import { useState, useEffect, useCallback } from 'react';
import { useWorker } from './WorkerContext';
import OverviewSection from './sections/OverviewSection';
import JobsSection from './sections/JobsSection';
import WalletSection from './sections/WalletSection';
import AnalyticsSection from './sections/AnalyticsSection';
import ProfileSection from './sections/ProfileSection';
import SettingsSection from './sections/SettingsSection';
import NotificationsSection from './sections/NotificationsSection';
import SupportSection from './sections/SupportSection';
import IncentivesSection from './sections/IncentivesSection';
import HelpSection from './sections/HelpSection';
import MoreSection from './sections/MoreSection';
import AddMoneyModal from './modals/AddMoneyModal';
import WithdrawModal from './modals/WithdrawModal';
import CompleteProfileModal, { ProfileData } from './modals/CompleteProfileModal';
import IncomingJobModal from './modals/IncomingJobModal';
import {
  getUnreadNotificationCount,
  completeWorkerProfile,
  getJobRateSettings,
  addMoneyToWallet,
  getWorkerWalletOrderStatus,
} from './workerSupabase';
import { SKILL_CATEGORIES } from './workerConstants';
import { DEMO_JOBS } from './constants/demoJobs';

import {
  BarChart2,
  Briefcase,
  Wallet,
  TrendingUp,
  MapPin,
  Moon,
  Sun,
  AlertTriangle,
  Lock,
  Bell,
  Target,
  MoreHorizontal,
} from 'lucide-react';

const NAV_ITEMS = [
  { key: 'overview', icon: <BarChart2 size={18} />, labelKey: 'nav_overview' },
  { key: 'jobs', icon: <Briefcase size={18} />, labelKey: 'nav_jobs' },
  { key: 'wallet', icon: <Wallet size={18} />, labelKey: 'nav_wallet' },
  { key: 'incentives', icon: <Target size={18} />, labelKey: 'nav_incentives' },
  { key: 'analytics', icon: <TrendingUp size={18} />, labelKey: 'nav_analytics' },
  { key: 'more', icon: <MoreHorizontal size={18} />, labelKey: 'nav_more' },
];

export default function WorkerLayout() {
  const { state, setState, switchSection, showToast, t, generateJobId } = useWorker();
  const [addMoneyOpen, setAddMoneyOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [completeProfileOpen, setCompleteProfileOpen] = useState(false);
  const [suspensionTimeLeft, setSuspensionTimeLeft] = useState('');
  const [rateRange, setRateRange] = useState<{ minRate: string; maxRate: string } | null>(null);

  // Fetch job rate settings
  useEffect(() => {
    const fetchRateSettings = async () => {
      try {
        const res = await getJobRateSettings(state.user.selectedCategory);
        const settings = res?.data ?? res;
        if (settings) {
          setRateRange({ minRate: settings.minRate || '400', maxRate: settings.maxRate || '800' });
        }
      } catch (err) {
        // Use default if fetch fails
        setRateRange({ minRate: '400', maxRate: '800' });
      }
    };
    fetchRateSettings();
  }, [state.user.selectedCategory]);

  // Fetch unread notification count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const res = await getUnreadNotificationCount();
        setUnreadCount(res?.count ?? res?.data?.count ?? 0);
      } catch (err) {
        // Ignore errors
      }
    };
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Global job polling - shows incoming jobs everywhere when online
  useEffect(() => {
    if (state.isActive && !state.hasActiveJob && !state.incomingJob && state.user.selectedSkills.length > 0 && state.pendingJobs.length === 0) {
      // Random delay between 3-8 seconds before showing a job
      const delay = 3000 + Math.random() * 5000;
      const timeout = setTimeout(() => {
        const skills = state.user.selectedSkills;
        const randomSkill = skills[Math.floor(Math.random() * skills.length)];
        const jobsForSkill = DEMO_JOBS[randomSkill] || [];

        if (jobsForSkill.length > 0) {
          const randomJob = jobsForSkill[Math.floor(Math.random() * jobsForSkill.length)];
          setState(p => ({ ...p, incomingJob: { ...randomJob, id: generateJobId() }, totalJobsReceived: p.totalJobsReceived + 1 }));
        }
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [state.isActive, state.hasActiveJob, state.incomingJob, state.user.selectedSkills, state.pendingJobs, setState, generateJobId]);

  // Handle job accept
  const handleJobAccept = useCallback(() => {
    if (!state.isActive) { showToast('Please go online first'); return; }
    if (state.isFrozen) { showToast('Pay fees first!', 'error'); return; }
    if (!state.incomingJob) { showToast('No job to accept'); return; }

    setState(p => ({
      ...p,
      hasActiveJob: true,
      jobArrived: false,
      declinedCount: 0,
      currentJobDetails: p.incomingJob,
      incomingJob: null
    }));
    showToast('Job Accepted! Please proceed to the site.');
    switchSection('jobs'); // Navigate to jobs section to see the active job
  }, [state.isActive, state.isFrozen, state.incomingJob, setState, showToast, switchSection]);

  // Handle job decline
  const handleJobDecline = useCallback(() => {
    if (state.isSuspended) { showToast('Account is already suspended.', 'error'); return; }
    const newDeclineCount = state.declinedCount + 1;

    if (newDeclineCount >= 10) {
      setState(p => ({
        ...p,
        isSuspended: true,
        suspensionEndTime: Date.now() + 30 * 60 * 1000, // 30 minutes
        declinedCount: 0,
        isActive: false,
        incomingJob: null
      }));
      showToast('10 Declines reached. Account suspended for 30 minutes!', 'error');
    } else {
      setState(p => ({ ...p, declinedCount: newDeclineCount, incomingJob: null }));
      showToast(`Job Declined. ${10 - newDeclineCount} declines until suspension.`, 'warning');
    }
  }, [state.isSuspended, state.declinedCount, setState, showToast]);

  // Suspension countdown timer
  useEffect(() => {
    if (!state.isSuspended || !state.suspensionEndTime) {
      setSuspensionTimeLeft('');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = state.suspensionEndTime - now;

      if (remaining <= 0) {
        // Suspension ended
        setState(p => ({ ...p, isSuspended: false, suspensionEndTime: 0 }));
        setSuspensionTimeLeft('');
        showToast('Suspension ended. You can go online now.', 'success');
        return;
      }

      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setSuspensionTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [state.isSuspended, state.suspensionEndTime, setState, showToast]);

  // Intercept modal sections
  useEffect(() => {
    const activeSection = state.activeSection;
    if (activeSection === 'add-money-modal' && !addMoneyOpen) {
      setAddMoneyOpen(true); 
      setState(p => ({ ...p, activeSection: 'wallet' }));
    }
    if (activeSection === 'withdrawal-modal' && !withdrawOpen) {
      setWithdrawOpen(true); 
      setState(p => ({ ...p, activeSection: 'wallet' }));
    }
  }, [state.activeSection, addMoneyOpen, withdrawOpen, setState]);

  const handleNavClick = (target: string) => {
    if (target === 'jobs') {
      if (!state.user.isProfileComplete) {
        setCompleteProfileOpen(true);
        showToast('Please complete your profile to access jobs', 'warning');
        return;
      }
      if (!state.user.isApproved || state.isSuspended) {
        if (!state.user.isApproved) showToast('Approval required.', 'error');
        else showToast('Account suspended.', 'error');
        return;
      }
    }
    switchSection(target);
  };

  const handleStatusToggle = () => {
    if (state.isFrozen) { showToast('Account Locked! Pay fees.', 'error'); return; }
    if (state.hasActiveJob) { showToast('Cannot go offline with active job.', 'error'); return; }
    if (state.isSuspended) { showToast('Account is suspended. Cannot go online.', 'error'); return; }
    // Check admin approval before allowing online
    if (!state.isActive && !state.user.isApproved) {
      showToast('Admin approval required to go online.', 'error');
      return;
    }
    // Check profile completion before allowing online
    if (!state.isActive && !state.user.isProfileComplete) {
      showToast('Please complete your profile first.', 'error');
      setCompleteProfileOpen(true);
      return;
    }
    // Toggle online status and track online start time
    setState(p => {
      const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD
      const isNewDay = p.lastOnlineDate !== today;

      if (!p.isActive) {
        // Going online
        return {
          ...p,
          isActive: true,
          onlineStartTime: Date.now(),
          todayOnlineSeconds: isNewDay ? 0 : p.todayOnlineSeconds, // Reset if new day
          lastOnlineDate: today
        };
      } else {
        // Going offline - accumulate the current session time
        const sessionSeconds = p.onlineStartTime
          ? Math.floor((Date.now() - p.onlineStartTime) / 1000)
          : 0;
        return {
          ...p,
          isActive: false,
          onlineStartTime: null,
          todayOnlineSeconds: p.todayOnlineSeconds + sessionSeconds,
          lastOnlineDate: today
        };
      }
    });
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForWorkerPaymentConfirmation = async (orderId: string) => {
    const maxAttempts = 40; // ~2 minutes
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const statusRes = await getWorkerWalletOrderStatus(orderId);
        const status = String(statusRes?.status || statusRes?.data?.status || '').toUpperCase();
        if (status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED') {
          return status;
        }
      } catch {}
      await sleep(3000);
    }
    return 'PENDING';
  };

  const handleAddMoneyProceed = async (amount: number) => {
    setAddMoneyOpen(false);

    try {
      showToast('Opening Cashfree payment...', 'warning');
      const res = await addMoneyToWallet(amount, 'Wallet top-up via Cashfree');
      const payload = res?.data ?? res;

      if (!payload?.success || !payload?.order_id || !payload?.payment_link) {
        throw new Error(payload?.message || 'Unable to start payment');
      }

      const popup = window.open(payload.payment_link, '_blank', 'noopener,noreferrer');
      if (!popup) {
        window.location.href = payload.payment_link;
        return;
      }

      showToast('Complete payment in Cashfree. Waiting for confirmation...', 'warning');
      const finalStatus = await waitForWorkerPaymentConfirmation(payload.order_id);

      if (finalStatus === 'SUCCESS') {
        setState((p) => ({
          ...p,
          wallet: { ...p.wallet, net: p.wallet.net + amount, gross: p.wallet.gross + amount },
          transactions: [
            ...p.transactions,
            {
              jobId: `DEP-${Math.floor(100000 + Math.random() * 900000)}`,
              service: 'Wallet Top-up (Cashfree)',
              date: new Date().toLocaleDateString(),
              amount,
              transactionType: 'credit',
            },
          ],
        }));
        showToast(`INR ${amount} added successfully!`, 'success');
      } else if (finalStatus === 'FAILED' || finalStatus === 'CANCELLED') {
        showToast('Payment failed. Please try again.', 'error');
      } else {
        showToast('Payment is pending. Check again after a short wait.', 'warning');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to start payment', 'error');
    }
  };

  const handleWithdraw = (amount: number) => {
    setState(p => ({
      ...p,
      wallet: { ...p.wallet, net: p.wallet.net - amount, gross: p.wallet.gross - amount },
      withdrawals: [...p.withdrawals, {
        date: new Date().toLocaleDateString(),
        refId: 'WDR-' + Math.floor(100000 + Math.random() * 900000),
        amount
      }]
    }));
    setWithdrawOpen(false);
    showToast(`Withdrawal of INR ${amount} successful!`, 'success');
  };

  const handleProfileComplete = async (profileData: ProfileData) => {
    try {
      await completeWorkerProfile({
        qualification: profileData.qualification,
        aadharNumber: profileData.aadharNumber,
        panNumber: profileData.panNumber,
        state: profileData.locState,
        city: profileData.locCity,
        area: profileData.locArea,
        address: profileData.address,
        skillCategory: profileData.selectedSkills[0] || '',
        bankAccount: profileData.bankAccount,
        ifsc: profileData.ifsc,
        bankName: profileData.bankName,
        branch: profileData.branch,
      });

      setState(p => ({
        ...p,
        user: {
          ...p.user,
          photoFile: profileData.photoFile,
          qualification: profileData.qualification,
          aadharNumber: profileData.aadharNumber,
          aadharFile: null,
          panNumber: profileData.panNumber,
          panFile: null,
          location: {
            state: profileData.locState,
            city: profileData.locCity,
            area: profileData.locArea,
            address: profileData.address
          },
          selectedCategory: profileData.selectedSkills[0] || '',
          selectedSkills: profileData.selectedSkills,
          bankDetails: {
            ...p.user.bankDetails,
            account: profileData.bankAccount,
            ifsc: profileData.ifsc,
            name: profileData.bankName,
            branch: profileData.branch,
            status: (profileData.bankAccount && profileData.ifsc) ? 'pending' : 'missing' as const
          },
          hasBankDetails: !!(profileData.bankAccount && profileData.ifsc),
          isProfileComplete: true
        }
      }));
      setCompleteProfileOpen(false);
      showToast('Profile completed successfully!', 'success');
      switchSection('jobs');
    } catch (err: any) {
      showToast(err.message || 'Failed to complete profile', 'error');
    }
  };

  const getStatusText = () => {
    if (state.isSuspended) return 'Suspended';
    if (state.hasActiveJob) return 'Job Active (Online)';
    if (state.isFrozen) return 'Account Locked';
    if (!state.user.isApproved) return 'Pending Approval';
    if (state.isActive) return t('status_online');
    return t('status_offline');
  };

  const getStatusColor = () => {
    if (state.isSuspended) return 'var(--warning)';
    if (state.hasActiveJob) return 'var(--warning)';
    if (state.isFrozen) return 'var(--danger)';
    if (!state.user.isApproved) return 'var(--warning)';
    if (state.isActive) return 'var(--text-main)';
    return 'var(--text-muted)';
  };

  const locString = state.user.location.area && state.user.location.city
    ? `${state.user.location.area}, ${state.user.location.city}`
    : state.user.location.city || 'Unknown';

  const renderSection = () => {
    switch (state.activeSection) {
      case 'overview': return <OverviewSection />;
      case 'jobs': return <JobsSection />;
      case 'wallet': return <WalletSection />;
      case 'analytics': return <AnalyticsSection />;
      case 'profile': return <ProfileSection />;
      case 'settings': return <SettingsSection />;
      case 'notifications': return <NotificationsSection />;
      case 'support': return <SupportSection />;
      case 'incentives': return <IncentivesSection />;
      case 'help': return <HelpSection />;
      case 'more': return <MoreSection />;
      default: return <OverviewSection />;
    }
  };

  return (
    <div className="worker-app">
      {/* Sidebar */}
      <aside className="worker-sidebar w-glass">
        <div className="sidebar-logo">
          <img src={state.theme === 'light' ? '/logo-light.png' : '/logo-dark.png'} alt="Dechta" style={{ width: 150 }} />
        </div>
        <nav className="nav-list">
          {NAV_ITEMS.map(item => (
            <button key={item.key}
              className={`nav-item ${state.activeSection === item.key ? 'active' : ''} ${item.key === 'jobs' && (!state.user.isApproved || state.isSuspended) ? 'disabled' : ''}`}
              onClick={() => handleNavClick(item.key)}>
              <span className="emoji-icon" style={{ display: 'flex', alignItems: 'center' }} aria-hidden="true">{item.icon}</span>
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="worker-main w-glass">
        {/* Header */}
        <div className="worker-header">
          <div className="welcome-text">
            <h2>{t('welcome')}{state.user.name}</h2>
            <p style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={16} /> {locString}</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src={state.theme === 'light' ? '/logo-light.png' : '/logo-dark.png'} alt="Dechta" className="mobile-header-logo" />

            {/* Notification Bell */}
            <button
              onClick={() => switchSection('notifications')}
              style={{
                position: 'relative',
                background: state.activeSection === 'notifications' ? 'var(--logo-accent)' : 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '50%',
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: state.activeSection === 'notifications' ? '#000' : 'var(--text-main)',
              }}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  background: '#ef4444',
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 10,
                  padding: '2px 6px',
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <div className="w-toggle-wrapper">
              <span className="w-toggle-label" style={{ color: getStatusColor() }}>{getStatusText()}</span>
              <div className={`w-toggle-switch ${state.isActive ? 'active' : ''} ${state.isFrozen || state.hasActiveJob || state.isSuspended || !state.user.isApproved ? 'disabled' : ''}`}
                onClick={handleStatusToggle} />
            </div>
            <button className={`w-theme-toggle ${state.theme === 'light' ? 'light-active' : ''}`}
              onClick={() => {
                const newTheme = state.theme === 'dark' ? 'light' : 'dark';
                setState(p => ({ ...p, theme: newTheme }));
                showToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} Theme`, 'success');
              }}>
              <div className="w-theme-flip-inner">
                <div className="w-theme-flip-front" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }} aria-hidden="true">
                  <Moon size={16} />
                </div>
                <div className="w-theme-flip-back" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }} aria-hidden="true">
                  <Sun size={16} />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Suspension Alert */}
        {state.isSuspended && (
          <div className="w-freeze-alert w-suspension-alert" style={{ marginBottom: 20, marginRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} /> <b>Account Suspended:</b> Too many declines. Account suspended for 30 min.
            </div>
            {suspensionTimeLeft && (
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '4px 10px',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'monospace'
              }}>
                {suspensionTimeLeft}
              </div>
            )}
          </div>
        )}
        {state.isFrozen && (
          <div className="w-freeze-alert" style={{ marginBottom: 20 }}>
            <Lock size={16} /> Account Frozen: Commission limit reached. Pay fees to unlock.
          </div>
        )}

        {/* Content */}
        <div className="worker-scroll" key={state.activeSection}>
          {renderSection()}
        </div>
      </main>

      {/* Modals */}
      <AddMoneyModal open={addMoneyOpen} onClose={() => setAddMoneyOpen(false)} onProceed={handleAddMoneyProceed} />
      <WithdrawModal open={withdrawOpen} balance={state.wallet.net} onClose={() => setWithdrawOpen(false)} onWithdraw={handleWithdraw} />
      <CompleteProfileModal open={completeProfileOpen} onClose={() => setCompleteProfileOpen(false)} onComplete={handleProfileComplete} />

      {/* Global Incoming Job Modal - Shows everywhere when user is online */}
      {state.isActive && !state.hasActiveJob && state.incomingJob && (
        <IncomingJobModal
          job={state.incomingJob}
          onAccept={handleJobAccept}
          onDecline={handleJobDecline}
          isPremium={state.isPremium}
          rateRange={rateRange}
        />
      )}
    </div>
  );
}
