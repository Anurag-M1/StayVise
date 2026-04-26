import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';

export default function WhatsAppWidget() {
  const location = useLocation();
  const phoneNumber = '919470961258';
  const message = encodeURIComponent('Hi StayVise Support, I need help with...');

  // Hide on admin routes
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <a
      href={`https://wa.me/${phoneNumber}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-[9999] flex items-center justify-center w-14 h-14 bg-[#25D366] text-white rounded-full shadow-xl hover:scale-110 hover:shadow-2xl transition-all duration-300 group"
      aria-label="Contact Support on WhatsApp"
    >
      <MessageCircle size={28} />
      {/* Tooltip on hover */}
      <span className="absolute right-16 px-3 py-2 bg-brand-ink text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        Chat with Support
        <div className="absolute top-1/2 -right-1 -translate-y-1/2 border-4 border-transparent border-l-brand-ink" />
      </span>
    </a>
  );
}
