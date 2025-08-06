import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppSettings } from './AppSettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSelector from './LanguageSelector';

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  restricted?: boolean;
}

interface SidebarProps {
  menuItems: MenuItem[];
}

const Sidebar: React.FC<SidebarProps> = ({ menuItems }) => {
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const { t } = useLanguage();
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    // Show all menu items to all authenticated users
    setFilteredItems(menuItems);
  }, [user, menuItems]);

  // Translate menu item labels
  const getTranslatedLabel = (label: string): string => {
    // Convert label to lowercase and remove spaces for key lookup
    const key = `sidebar.${label.toLowerCase().replace(/\s+/g, '')}`;
    return t(key);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 px-4 py-6">
      <div className="flex items-center gap-3 mb-8">
        <svg className="w-8 h-8" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" fill="#E60012"/>
          <path d="M25 35h50v30H25z" fill="white"/>
          <text x="50" y="55" textAnchor="middle" fill="#E60012" fontSize="16" fontWeight="bold">airtel</text>
        </svg>
        <span className="text-xl font-semibold">{settings.app_name}</span>
      </div>
      
      <nav className="mb-6">
        {filteredItems.map((item, index) => (
          <NavLink
            key={index}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-red-50 text-red-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{getTranslatedLabel(item.label)}</span>
          </NavLink>
        ))}
      </nav>
      
      <div className="px-4 pt-4 border-t border-gray-200">
        <LanguageSelector className="w-full" />
      </div>
    </div>
  );
};

export default Sidebar;