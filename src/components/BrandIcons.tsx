import React from 'react';
import {
  Calendar,
  Cloud,
  Code2,
  Hash,
  MessageCircle,
  MessageSquare,
  Share2,
  Users,
  Video,
} from 'lucide-react';

interface ProductIconProps {
  iconKey: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ProductIcon: React.FC<ProductIconProps> = ({
  iconKey,
  name,
  size = 'md',
}) => {
  const dims =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-10 h-10 text-sm';

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 22 : 18;
  const key = iconKey.toLowerCase();

  if (key === 'salesforce') {
    return (
      <div
        className={`${dims} rounded-lg bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Cloud size={iconSize} />
      </div>
    );
  }

  if (key === 'hubspot') {
    return (
      <div
        className={`${dims} rounded-lg bg-orange-50 border border-orange-200 text-orange-700 flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Share2 size={iconSize} />
      </div>
    );
  }

  if (key === 'twilio') {
    return (
      <div
        className={`${dims} rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <MessageSquare size={iconSize} />
      </div>
    );
  }

  if (key === 'whatsapp') {
    return (
      <div
        className={`${dims} rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <MessageCircle size={iconSize} />
      </div>
    );
  }

  if (key === 'teams') {
    return (
      <div
        className={`${dims} rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Users size={iconSize} />
      </div>
    );
  }

  if (key === 'slack') {
    return (
      <div
        className={`${dims} rounded-lg bg-violet-50 border border-violet-200 text-violet-700 flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Hash size={iconSize} />
      </div>
    );
  }

  if (key === 'meet') {
    return (
      <div
        className={`${dims} rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Video size={iconSize} />
      </div>
    );
  }

  if (key === 'calendly' || name.toLowerCase().includes('calendly')) {
    return (
      <div
        className={`${dims} rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Calendar size={iconSize} />
      </div>
    );
  }

  const monogram = name.trim().slice(0, 2).toUpperCase() || 'CE';
  return (
    <div
      className={`${dims} rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-display font-semibold flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      {monogram.length === 2 ? monogram : <Code2 size={iconSize} />}
    </div>
  );
};
