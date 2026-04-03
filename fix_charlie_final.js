const fs = require('fs');
const file = 'app/charlie/components/CharlieOverlay.tsx';
let c = fs.readFileSync(file, 'utf8');

// 1. Remove mobile toggle from header
c = c.replace(
            {/* Mobile panel toggle */}
          {hasResults && (
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 100,
              padding: 3,
              gap: 2,
            }} className="charlie-mobile-toggle">
              {(['chat', 'results'] as const).map(p => (
                <button key={p} onClick={() => onPanelChange(p)} style={{
                  padding: '5px 14px',
                  borderRadius: 100,
                  border: 'none',
                  cursor: 'pointer',
                  background: state.activePanel === p ? '#3b82f6' : 'transparent',
                  color: state.activePanel === p ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  {p === 'results' ? 'Results' : 'Chat'}
                </button>
              ))}
            </div>
          )},
  ''
);

// 2. Replace body section
const oldBody =         {/* Body — split panels */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          {/* Chat panel */}
          <div style={{
            width: hasResults ? '42%' : '100%',
            borderRight: hasResults ? '1px solid rgba(255,255,255,0.07)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }} style={{ display: isMobile && hasResults && state.activePanel === 'results' ? 'none' : 'flex', flexDirection: 'column', width: hasResults && !isMobile ? '42%' : '100%', borderRight: hasResults && !isMobile ? '1px solid rgba(255,255,255,0.07)' : 'none', flexShrink: 0 }}>;

const newBody =         {/* Body */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          overflow: isMobile ? 'auto' : 'hidden',
          minHeight: 0,
        }}>
          {/* Chat panel */}
          <div style={{
            width: isMobile ? '100%' : (hasResults ? '42%' : '100%'),
            borderRight: !isMobile && hasResults ? '1px solid rgba(255,255,255,0.07)' : 'none',
            borderBottom: isMobile && hasResults ? '1px solid rgba(255,255,255,0.07)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            overflow: isMobile ? 'visible' : 'hidden',
          }}>;

if (c.includes(oldBody)) {
  c = c.replace(oldBody, newBody);
  console.log('body: DONE');
} else {
  console.log('body: NO MATCH');
}

// 3. Fix results panel - no more conditional display, full width on mobile
const oldResults =           {/* Results panel */}
          {hasResults && (
            <div style={{ display: isMobile && state.activePanel === 'chat' ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>;
const newResults =           {/* Results panel */}
          {hasResults && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: isMobile ? 'none' : 1, overflow: isMobile ? 'visible' : 'hidden', width: isMobile ? '100%' : 'auto' }}>;

if (c.includes(oldResults)) {
  c = c.replace(oldResults, newResults);
  console.log('results: DONE');
} else {
  console.log('results: NO MATCH');
}

// 4. Clean up style block
c = c.replace(
  "        @media (min-width: 769px) { .charlie-mobile-toggle { display: none !important; } }",
  ""
);

// 5. Remove isMobile auto-switch effect (no longer needed)
c = c.replace(
  "  // Auto-switch to results panel on mobile when results arrive\n  useEffect(() => {\n    if (hasResults && window.innerWidth < 769) {\n      onPanelChange('results')\n    }\n  }, [hasResults])\n\n  ",
  "  "
);

fs.writeFileSync(file, c);
console.log('ALL DONE');