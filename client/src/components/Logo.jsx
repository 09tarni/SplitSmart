export default function Logo({ size = 36, showText = true, textColor = '#1a1a1a', dark = false }) {
    return (
      <div className="flex items-center gap-2.5">
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Background */}
          <rect width="40" height="40" rx="12" fill="#009B4D"/>
          
          {/* Split line - diagonal */}
          <line x1="10" y1="30" x2="30" y2="10" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
          
          {/* Left coin / person */}
          <circle cx="13" cy="24" r="7" fill="rgba(255,255,255,0.15)" stroke="white" strokeWidth="1.5"/>
          <text x="13" y="28" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="Arial">₹</text>
  
          {/* Right coin / person */}
          <circle cx="27" cy="16" r="7" fill="rgba(255,255,255,0.15)" stroke="#FFCC00" strokeWidth="1.5"/>
          <text x="27" y="20" textAnchor="middle" fill="#FFCC00" fontSize="9" fontWeight="700" fontFamily="Arial">₹</text>
  
          {/* Arrow between them */}
          <path d="M19 21 L22 18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M21 17.5 L22 18 L21.5 19.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
  
        {showText && (
  <div className="flex flex-col leading-none">
    <span
      className="font-black text-lg tracking-tight"
      style={{ color: dark ? 'white' : textColor, letterSpacing: '-0.02em' }}
    >
      Split
      <span style={{ color: dark ? '#FFCC00' : '#009B4D' }}>
        Smart
      </span>
    </span>
    <span
      className="text-[9px] font-semibold tracking-widest uppercase"
      style={{ color: dark ? 'rgba(255,255,255,0.5)' : '#9ca3af' }}
    >
      Expense Splitter
    </span>
  </div>
)}
      </div>
    );
  }