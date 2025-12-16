import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Download, FileText, Calendar, CreditCard, DollarSign, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import SubscriberConfigLinks from '../components/SubscriberConfigLinks';
import { getUserSubscriptionPlan } from '../lib/access-control';

interface Invoice {
  id: string;
  invoice_number: string;
  payer_name: string;
  payer_email: string | null;
  payer_phone: string | null;
  plan_name: string;
  plan_duration: string;
  amount: number;
  currency: string;
  payment_gateway: string;
  payment_status: string;
  payment_date: string;
  payment_method: string | null;
  invoice_url: string | null;
  created_at: string;
}

const Invoices: React.FC = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showExampleNotification, setShowExampleNotification] = useState(false);

  useEffect(() => {
    if (user) {
      fetchInvoices();
      checkAdminStatus();
    }
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;
    try {
      const plan = await getUserSubscriptionPlan(user.id);
      setIsAdmin(plan === 'admin');
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user?.id)
        .order('payment_date', { ascending: false });

      if (fetchError) throw fetchError;

      setInvoices(data || []);
    } catch (err: any) {
      console.error('Error fetching invoices:', err);
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'XOF' ? 'XOF' : 'USD',
      minimumFractionDigits: 0,
    }).format(amount / 100);
  };

  const downloadInvoice = async (invoice: Invoice) => {
    try {
      setDownloadingId(invoice.id);

      // If invoice_url exists, download from there
      if (invoice.invoice_url) {
        window.open(invoice.invoice_url, '_blank');
        return;
      }

      // Generate invoice HTML
      const invoiceHTML = generateInvoiceHTML(invoice);

      // Create a blob and download
      const blob = new Blob([invoiceHTML], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoice_number}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading invoice:', err);
      alert('Failed to download invoice. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadExampleInvoice = async () => {
    try {
      setDownloadingId('example');
      setShowExampleNotification(false);

      // Check if user has any real invoices or active subscription
      const { data: subscriptions } = await supabase
        .from('business_subscriptions')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .limit(1);

      // Show notification about invoice state
      if (!subscriptions || subscriptions.length === 0) {
        setShowExampleNotification(true);
        setTimeout(() => setShowExampleNotification(false), 5000);
      }

      // Create example invoice with mock data
      const exampleInvoice: Invoice = {
        id: 'example-invoice-id',
        invoice_number: 'INV-EXAMPLE-2024-001',
        payer_name: 'Example Client Name',
        payer_email: 'client@example.com',
        payer_phone: '+242 06 000 0000',
        plan_name: 'Professional Plan',
        plan_duration: '1 month',
        amount: 4900000, // 49,000 XOF in cents
        currency: 'XOF',
        payment_gateway: 'Airtel Money',
        payment_status: 'completed',
        payment_date: new Date().toISOString(),
        payment_method: 'Mobile Money',
        invoice_url: null,
        created_at: new Date().toISOString()
      };

      // Generate and download invoice HTML
      const invoiceHTML = generateInvoiceHTML(exampleInvoice);
      const blob = new Blob([invoiceHTML], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exampleInvoice.invoice_number}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading example invoice:', err);
      alert('Failed to download example invoice. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const generateInvoiceHTML = (invoice: Invoice) => {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice ${invoice.invoice_number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
        .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 3px solid #e60012; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #e60012; font-size: 32px; }
        .header .invoice-number { color: #666; margin-top: 10px; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
        .detail-box h3 { color: #333; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
        .detail-box p { color: #666; line-height: 1.6; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        .table th { background: #f8f8f8; font-weight: 600; color: #333; }
        .total { text-align: right; padding: 20px 0; border-top: 2px solid #e60012; }
        .total .amount { font-size: 24px; color: #e60012; font-weight: bold; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .status.completed { background: #dcfce7; color: #166534; }
        .status.pending { background: #fef3c7; color: #92400e; }
        .status.failed { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="header">
            <h1>INVOICE</h1>
            <p class="invoice-number">${invoice.invoice_number}</p>
            <p style="margin-top: 5px; color: #666;">
                <span class="status ${invoice.payment_status}">${invoice.payment_status.toUpperCase()}</span>
            </p>
        </div>

        <div class="details">
            <div class="detail-box">
                <h3>Bill To</h3>
                <p>
                    <strong>${invoice.payer_name}</strong><br>
                    ${invoice.payer_email ? invoice.payer_email + '<br>' : ''}
                    ${invoice.payer_phone ? invoice.payer_phone : ''}
                </p>
            </div>
            <div class="detail-box">
                <h3>Invoice Details</h3>
                <p>
                    <strong>Date:</strong> ${format(new Date(invoice.payment_date), 'dd/MM/yyyy HH:mm')}<br>
                    <strong>Payment Method:</strong> ${invoice.payment_gateway}<br>
                    ${invoice.payment_method ? `<strong>Payment Type:</strong> ${invoice.payment_method}<br>` : ''}
                </p>
            </div>
        </div>

        <table class="table">
            <thead>
                <tr>
                    <th>Description</th>
                    <th>Duration</th>
                    <th style="text-align: right;">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <strong>${invoice.plan_name} Subscription Plan</strong><br>
                        <small style="color: #666;">Subscription service</small>
                    </td>
                    <td>${invoice.plan_duration}</td>
                    <td style="text-align: right;">${formatAmount(invoice.amount, invoice.currency)}</td>
                </tr>
            </tbody>
        </table>

        <div class="total">
            <p style="color: #666; margin-bottom: 10px;">Total Amount</p>
            <p class="amount">${formatAmount(invoice.amount, invoice.currency)}</p>
        </div>

        <div class="footer">
            <p>Thank you for your business!</p>
            <p style="margin-top: 10px;">This is a computer-generated invoice and does not require a signature.</p>
        </div>
    </div>
</body>
</html>
    `;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
            <p className="mt-2 text-gray-600">View and download your payment history and invoices</p>
          </div>

          {isAdmin && (
            <button
              onClick={downloadExampleInvoice}
              disabled={downloadingId === 'example'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloadingId === 'example' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Example Invoice</span>
                </>
              )}
            </button>
          )}
        </div>

        {showExampleNotification && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3" />
              <div>
                <h4 className="text-sm font-medium text-yellow-900">Example Invoice Generated</h4>
                <p className="mt-1 text-sm text-yellow-700">
                  This is a demonstration invoice. No active subscription found for this account. The invoice data is for example purposes only.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="mb-6">
          <SubscriberConfigLinks />
        </div>

        {invoices.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices yet</h3>
            <p className="text-gray-600">Your payment history will appear here once you make a purchase.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gateway
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileText className="w-5 h-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {invoice.invoice_number}
                            </div>
                            <div className="text-sm text-gray-500">{invoice.payer_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{invoice.plan_name}</div>
                        <div className="text-sm text-gray-500">{invoice.plan_duration}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm font-medium text-gray-900">
                          <DollarSign className="w-4 h-4 mr-1 text-gray-400" />
                          {formatAmount(invoice.amount, invoice.currency)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <CreditCard className="w-4 h-4 mr-2 text-gray-400" />
                          <span className="text-sm text-gray-900">{invoice.payment_gateway}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                          {format(new Date(invoice.payment_date), 'dd/MM/yyyy HH:mm')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.payment_status)}`}>
                          {getStatusIcon(invoice.payment_status)}
                          {invoice.payment_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => downloadInvoice(invoice)}
                          disabled={downloadingId === invoice.id}
                          className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {downloadingId === invoice.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Downloading...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              <span>Download</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <FileText className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
              <div>
                <h4 className="text-sm font-medium text-blue-900">Invoice Information</h4>
                <p className="mt-1 text-sm text-blue-700">
                  All invoices are automatically generated and stored securely. You can download them anytime for your records.
                  For any billing inquiries, please contact our support team.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Invoices;
