import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MessageSquare, BookOpen, GamepadIcon, CreditCard, LayoutDashboard, FilterIcon, Settings, Building } from 'lucide-react';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import RestrictedRoute from './components/RestrictedRoute';
import Navigation from './components/Navigation';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import WhatsApp from './pages/WhatsApp';
import NumberFiltering from './pages/NumberFiltering';
import CustomerService from './pages/CustomerService';
import Education from './pages/Education';
import Quiz from './pages/Quiz';
import SettingsPage from './pages/Settings';
import Payments from './pages/Payments';
import Features from './pages/Features';
import Help from './pages/Help';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import AirtelChat from './pages/AirtelChat';
import Business from './pages/Business';
import BusinessPayment from './pages/BusinessPayment';
import ProfessionalSubscription from './pages/ProfessionalSubscription';
import CreateAdmin from './pages/CreateAdmin';
import WhatsAppVerification from './pages/WhatsAppVerification';

function App() {
  const menuItems = [
    { icon: MessageSquare, label: 'WhatsApp', path: '/whatsapp', restricted: false },
    { icon: MessageSquare, label: 'Service Client', path: '/customer-service', restricted: false },
    { icon: BookOpen, label: 'Éducation', path: '/education', restricted: false },
    { icon: GamepadIcon, label: 'Quiz', path: '/quiz', restricted: false },
    { icon: CreditCard, label: 'Paiements', path: '/payments', restricted: false },
    { icon: Building, label: 'Business', path: '/business', restricted: false },
    { icon: LayoutDashboard, label: 'Tableau de Bord', path: '/dashboard', restricted: false },
    { icon: FilterIcon, label: 'Filtrage des numéros', path: '/number-filtering', restricted: false },
    { icon: Settings, label: 'Paramètres', path: '/settings', restricted: false }
  ];

  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<><Navigation /><Home /></>} />
          <Route path="/features" element={<><Navigation /><Features /></>} />
          <Route path="/help" element={<><Navigation /><Help /></>} />
          <Route path="/login" element={<><Navigation /><Login /></>} />
          <Route path="/register" element={<><Navigation /><Register /></>} />
          <Route path="/reset-password" element={<><Navigation /><ResetPassword /></>} />
          <Route path="/airtel-chat" element={<><Navigation /><AirtelChat /></>} />
          <Route path="/business-payment/:planId" element={<><Navigation /><BusinessPayment /></>} />
          <Route path="/professional-subscription" element={<><Navigation /><ProfessionalSubscription /></>} />
          <Route path="/create-admin" element={<CreateAdmin />} />
          <Route path="/whatsapp-verification" element={<><Navigation /><WhatsAppVerification /></>} />

          {/* All modules accessible to authenticated users */}
          <Route path="/whatsapp" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <WhatsApp />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/customer-service" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <CustomerService />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/education" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <Education />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/quiz" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <Quiz />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/business" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <Business />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/number-filtering" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <NumberFiltering />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <Dashboard />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/payments" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <Payments />
                </main>
              </div>
            </PrivateRoute>
          } />
          <Route path="/settings" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-50">
                <Sidebar menuItems={menuItems} />
                <main className="flex-1 overflow-y-auto">
                  <SettingsPage />
                </main>
              </div>
            </PrivateRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;