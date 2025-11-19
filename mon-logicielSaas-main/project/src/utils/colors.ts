// Color utility functions for quiz and other components
export const getProfileColor = (profile: string) => {
  switch (profile) {
    case 'vip': return 'text-purple-600 bg-purple-100';
    case 'active': return 'text-green-600 bg-green-100';
    case 'discovery': return 'text-blue-600 bg-blue-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'text-green-600 bg-green-100';
    case 'active': return 'text-blue-600 bg-blue-100';
    case 'ended': return 'text-gray-600 bg-gray-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};