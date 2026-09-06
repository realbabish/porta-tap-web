import React from 'react';

/**
 * Official Logo for Shrestha Integrated Systems
 *
 * Faithfully reproduces the vector geometry from the company's PIL specification:
 * - Geometric 'S' body in pure white (#ffffff)
 * - Yellow accent nodes (#facc15) at (48, 10) and (4, 47)
 * - ViewBox centered on the mark: 0 5 60 55
 */
export function LogoMark({ className = "w-8 h-8", whiteColor = "#ffffff", yellowColor = "#facc15" }) {
  return (
    <svg
      viewBox="0 5 60 55"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-300 ${className}`}
      aria-label="Shrestha Integrated Systems Logo"
    >
      <defs>
        <filter id="accent-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#facc15" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* White 'S' body polygon */}
      <polygon
        points="45,10 10,10 10,35 35,35 35,45 10,45 10,55 50,55 50,25 25,25 25,20 45,20"
        fill={whiteColor}
      />

      {/* Yellow accent nodes (8x8 squares) */}
      <rect
        x="48"
        y="10"
        width="8"
        height="8"
        fill={yellowColor}
        filter="url(#accent-glow)"
      />
      <rect
        x="4"
        y="47"
        width="8"
        height="8"
        fill={yellowColor}
        filter="url(#accent-glow)"
      />
    </svg>
  );
}

export default function Logo({
  variant = 'horizontal', // 'horizontal' | 'stacked' | 'mark'
  size = 'md', // 'sm' | 'md' | 'lg'
  subtext = 'INTEGRATED SYSTEMS',
  title = 'SHRESTHA',
  className = '',
}) {
  if (variant === 'mark') {
    const markSizes = {
      sm: 'w-6 h-6',
      md: 'w-9 h-9',
      lg: 'w-12 h-12',
      xl: 'w-16 h-16',
    };
    return <LogoMark className={`${markSizes[size] || 'w-9 h-9'} ${className}`} />;
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className="relative p-3 rounded-2xl bg-gradient-to-b from-slate-900 to-black border border-slate-800 shadow-2xl mb-3 group hover:border-amber-500/40 transition-colors">
          <div className="absolute -inset-1 rounded-2xl bg-amber-500/10 blur-md opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <LogoMark className="w-14 h-14 relative" />
        </div>
        <div className="tracking-[0.25em] font-black text-white text-base">
          {title}
        </div>
        <div className="tracking-[0.35em] text-[10px] font-bold text-amber-400 uppercase mt-0.5">
          {subtext}
        </div>
      </div>
    );
  }

  // Default: Horizontal lockup
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const titleSizes = {
    sm: 'text-xs tracking-[0.2em]',
    md: 'text-sm tracking-[0.25em]',
    lg: 'text-base tracking-[0.3em]',
  };

  const subtextSizes = {
    sm: 'text-[8px] tracking-[0.3em]',
    md: 'text-[9px] tracking-[0.35em]',
    lg: 'text-[11px] tracking-[0.4em]',
  };

  return (
    <div className={`inline-flex items-center gap-3.5 group select-none ${className}`}>
      <div className="relative p-1.5 rounded-xl bg-slate-900/90 border border-slate-800/80 shadow-inner group-hover:border-amber-500/40 transition-colors">
        <LogoMark className={iconSizes[size] || 'w-8 h-8'} />
      </div>
      <div className="flex flex-col">
        <span className={`font-black text-white leading-none ${titleSizes[size]}`}>
          {title}
        </span>
        <span className={`font-bold text-amber-400 uppercase leading-tight mt-1 ${subtextSizes[size]}`}>
          {subtext}
        </span>
      </div>
    </div>
  );
}
