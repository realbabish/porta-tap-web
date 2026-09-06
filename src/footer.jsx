import React from 'react';

export default function Footer({ className = '' }) {
    return (
        <footer className={`w-full py-8 flex flex-col items-center justify-center relative group mt-auto ${className}`}>

            {/* Custom CSS for the waving flag animation */}
            <style>
                {`
          @keyframes wave {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-12deg); }
            75% { transform: rotate(12deg); }
          }
          .animate-wave {
            display: inline-block;
            animation: wave 2.5s ease-in-out infinite;
            transform-origin: bottom center;
          }
        `}
            </style>

            {/* Animated glowing separator line */}
            <div className="w-48 h-[1px] bg-gradient-to-r from-transparent via-slate-700 group-hover:via-amber-500/50 to-transparent mb-5 transition-all duration-700 ease-in-out opacity-50 group-hover:opacity-100 group-hover:w-64" />

            {/* Main Footer Text */}
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-slate-300 transition-colors duration-300">
                <span>&copy; 2026 Shrestha Integrated Systems</span>
                <span className="text-base animate-wave drop-shadow-md" title="Proudly Canadian">🇨🇦</span>
            </div>

            {/* Website Link with gradient sweep effect */}
            <a
                href="https://integratedsystems.ca"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-[11px] font-medium text-slate-400 hover:text-transparent hover:bg-clip-text hover:bg-gradient-to-r hover:from-amber-400 hover:to-amber-200 transition-all duration-300 relative inline-block pb-0.5"
            >
                integratedsystems.ca
                {/* Underline that expands on hover */}
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-gradient-to-r from-amber-400 to-amber-200 group-hover:w-full transition-all duration-500 ease-out" />
            </a>

            {/* Ambient background glow on hover */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-sm bg-amber-500/0 group-hover:bg-amber-500/[0.03] blur-2xl transition-colors duration-1000 pointer-events-none -z-10 rounded-full" />

        </footer>
    );
}