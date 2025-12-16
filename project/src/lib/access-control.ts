import { supabase } from './supabase';

export type SubscriptionPlan = 'basic' | 'pro' | 'enterprise' | 'admin';

export interface AccessControl {
  canAccessWhatsApp: boolean;
  canAccessCustomerService: boolean;
  canAccessQuiz: boolean;
  canAccessNumberFiltering: boolean;
  canAccessPayments: boolean;
  canAccessDashboard: boolean;
  canAccessSettings: boolean;
  settingsTabs: string[];
}

/**
 * Define access rules for each subscription plan
 */
const ACCESS_RULES: Record<SubscriptionPlan, AccessControl> = {
  basic: {
    canAccessWhatsApp: true,
    canAccessCustomerService: false,
    canAccessQuiz: false,
    canAccessNumberFiltering: true,
    canAccessPayments: true,
    canAccessDashboard: false,
    canAccessSettings: true,
    settingsTabs: ['profile', 'whatsapp', 'webhook', 'contacts', 'security']
  },
  pro: {
    canAccessWhatsApp: true,
    canAccessCustomerService: true,
    canAccessQuiz: false,
    canAccessNumberFiltering: true,
    canAccessPayments: true,
    canAccessDashboard: false,
    canAccessSettings: true,
    settingsTabs: ['profile', 'whatsapp', 'webhook', 'contacts', 'security']
  },
  enterprise: {
    canAccessWhatsApp: true,
    canAccessCustomerService: true,
    canAccessQuiz: true,
    canAccessNumberFiltering: true,
    canAccessPayments: true,
    canAccessDashboard: false,
    canAccessSettings: true,
    settingsTabs: ['profile', 'whatsapp', 'webhook', 'contacts', 'security']
  },
  admin: {
    canAccessWhatsApp: true,
    canAccessCustomerService: true,
    canAccessQuiz: true,
    canAccessNumberFiltering: true,
    canAccessPayments: true,
    canAccessDashboard: true,
    canAccessSettings: true,
    settingsTabs: ['profile', 'whatsapp', 'webhook', 'contacts', 'security', 'groq', 'payment', 'pricing', 'analytics', 'app', 'appearance']
  }
};

/**
 * Get user's subscription plan from database
 */
export async function getUserSubscriptionPlan(userId: string): Promise<SubscriptionPlan> {
  try {
    // Check if user is admin
    const { data: profileData } = await supabase
      .from('profils_utilisateurs')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (profileData?.is_admin === true) {
      return 'admin';
    }

    // Check for active business subscription
    const { data: subscription } = await supabase
      .from('business_subscriptions')
      .select('plan, status, end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('end_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscription && subscription.plan) {
      return subscription.plan as SubscriptionPlan;
    }

    // Default to basic if no subscription found
    return 'basic';
  } catch (error) {
    console.error('Error getting user subscription plan:', error);
    return 'basic';
  }
}

/**
 * Get access control rules for a user
 */
export async function getUserAccessControl(userId: string): Promise<AccessControl> {
  const plan = await getUserSubscriptionPlan(userId);
  return ACCESS_RULES[plan];
}

/**
 * Check if user can access a specific module
 */
export async function canAccessModule(userId: string, module: string): Promise<boolean> {
  const access = await getUserAccessControl(userId);

  switch (module.toLowerCase()) {
    case 'whatsapp':
      return access.canAccessWhatsApp;
    case 'customer-service':
    case 'customerservice':
      return access.canAccessCustomerService;
    case 'quiz':
      return access.canAccessQuiz;
    case 'number-filtering':
    case 'numberfiltering':
      return access.canAccessNumberFiltering;
    case 'payments':
      return access.canAccessPayments;
    case 'dashboard':
      return access.canAccessDashboard;
    case 'settings':
      return access.canAccessSettings;
    default:
      return false;
  }
}

/**
 * Get filtered menu items based on user's subscription
 */
export async function getFilteredMenuItems(userId: string, allMenuItems: any[]): Promise<any[]> {
  const access = await getUserAccessControl(userId);

  return allMenuItems.filter(item => {
    const path = item.path.toLowerCase();

    if (path.includes('whatsapp')) return access.canAccessWhatsApp;
    if (path.includes('customer-service')) return access.canAccessCustomerService;
    if (path.includes('quiz')) return access.canAccessQuiz;
    if (path.includes('number-filtering')) return access.canAccessNumberFiltering;
    if (path.includes('payment')) return access.canAccessPayments;
    if (path.includes('invoice')) return access.canAccessPayments;
    if (path.includes('dashboard')) return access.canAccessDashboard;
    if (path.includes('settings')) return access.canAccessSettings;

    return false;
  });
}

/**
 * Get allowed settings tabs based on user's subscription
 */
export async function getAllowedSettingsTabs(userId: string): Promise<string[]> {
  const access = await getUserAccessControl(userId);
  return access.settingsTabs;
}

/**
 * Mask email address for privacy
 * Example: peaatipo@gmail.com -> .........atipo@gmail.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;

  const [localPart, domain] = email.split('@');

  if (localPart.length <= 4) {
    // If local part is too short, mask first character only
    return '.' + localPart.slice(1) + '@' + domain;
  }

  // Keep last 4 characters of local part, mask the rest with dots
  const visiblePart = localPart.slice(-4);
  const maskedPart = '.'.repeat(localPart.length - 4);

  return maskedPart + visiblePart + '@' + domain;
}
