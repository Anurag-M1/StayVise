import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav className="flex mb-6" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        <li>
          <Link to="/" className="text-brand-mist hover:text-brand-forest transition-colors flex items-center">
            <Home size={16} />
            <span className="sr-only">Home</span>
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            <ChevronRight size={14} className="text-brand-mist mx-1" />
            {item.path ? (
              <Link
                to={item.path}
                className="text-sm font-medium text-brand-mist hover:text-brand-forest transition-colors"
                title={item.label}
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-sm font-bold text-brand-ink" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
