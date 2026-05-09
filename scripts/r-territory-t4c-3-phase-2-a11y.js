// scripts/r-territory-t4c-3-phase-2-a11y.js
//
// T4c-3 Phase 2: a11y basic floor (component-only edit).
//
// Per design lock v18 Q2=1: semantic <table> already shipped; this phase adds
// aria-label on cell buttons, role=dialog + focus trap + ESC on popover,
// visible focus rings on interactive elements.
//
// 15 anchored edits, all to components/admin-homes/TerritoryMatrix.tsx.
// Idempotent: bails if any Phase 2 marker already present.
// Atomic: in-memory edits, single write at end on success.
// Backup: timestamped pre-edit copy.

const fs = require('fs');
const path = require('path');

const FILE = path.join('components', 'admin-homes', 'TerritoryMatrix.tsx');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }

if (!fs.existsSync(FILE)) fail(FILE + ' not found at ' + path.resolve(FILE));

const original = fs.readFileSync(FILE, 'utf8');

const PHASE2_MARKERS = ['aria-modal="true"', 'role="dialog"', 'aria-label={ariaLabel}', 'focus-visible:ring-2'];
const present = PHASE2_MARKERS.filter(function (m) { return original.indexOf(m) !== -1; });
if (present.length > 0) {
  console.log('SKIP: Phase 2 markers already present: ' + present.join(', '));
  process.exit(0);
}

const NL = original.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
console.log('Detected line ending: ' + (NL === '\r\n' ? 'CRLF' : 'LF'));

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = FILE + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

let content = original;

function withNL(s) { return s.replace(/\n/g, NL); }

function tryEdit(label, oldStr, newStr) {
  const count = content.split(oldStr).length - 1;
  if (count !== 1) {
    fail(label + ': expected exactly 1 match, found ' + count);
  }
  content = content.replace(oldStr, newStr);
  console.log(label + ' OK');
}

tryEdit('E1 props interface',
  withNL(['interface CellButtonProps {', '  cell: MatrixCell | null', '  isEdited: boolean'].join('\n')),
  withNL(['interface CellButtonProps {', '  cell: MatrixCell | null', '  agentName: string', '  geoName: string', '  isEdited: boolean'].join('\n'))
);

tryEdit('E2 parent JSX prop pass',
  withNL(['                          cell={getCell(row.agent_id, col.geo_id)}', '                          isEdited={ck in editedCells}'].join('\n')),
  withNL(['                          cell={getCell(row.agent_id, col.geo_id)}', '                          agentName={row.agent_name}', '                          geoName={col.geo_name}', '                          isEdited={ck in editedCells}'].join('\n'))
);

tryEdit('E3 CellButton destructure',
  withNL(['function CellButton({', '  cell,', '  isEdited,'].join('\n')),
  withNL(['function CellButton({', '  cell,', '  agentName,', '  geoName,', '  isEdited,'].join('\n'))
);

tryEdit('E4 CellButton ariaLabel + buttonRef',
  withNL(["  const isExplicit = cell?.presence === 'explicit'", '  const isPrimary = isExplicit && cell?.is_primary === true'].join('\n')),
  withNL([
    "  const isExplicit = cell?.presence === 'explicit'",
    '  const isPrimary = isExplicit && cell?.is_primary === true',
    '  const buttonRef = useRef<HTMLButtonElement>(null)',
    '',
    '  // Compose a11y label by state.',
    '  const stateLabel = !canWrite',
    "    ? `${isExplicit ? (isPrimary ? 'primary' : 'assigned') : 'unassigned'}, read-only`",
    '    : isConflict',
    "      ? 'primary conflict, click to edit'",
    '      : isExplicit',
    "        ? `${isPrimary ? 'primary' : 'assigned'}, click to edit access flags`",
    "        : 'unassigned, click to assign'",
    '  const ariaLabel = `${agentName}, ${geoName}, ${stateLabel}`'
  ].join('\n'))
);

tryEdit('E5 CellButton handleEditorClose',
  withNL(['      // Empty cell -> toggle to explicit (default state).', '      onToggle()', '    }', '  }'].join('\n')),
  withNL([
    '      // Empty cell -> toggle to explicit (default state).',
    '      onToggle()',
    '    }',
    '  }',
    '',
    '  // Restore focus to originating button after popover closes.',
    '  const handleEditorClose = () => {',
    '    onClose()',
    '    requestAnimationFrame(() => buttonRef.current?.focus())',
    '  }'
  ].join('\n'))
);

tryEdit('E6 CellButton button attrs',
  withNL([
    '      <button',
    '        type="button"',
    '        onClick={handleClick}',
    '        disabled={!canWrite}',
    '        className={`w-12 h-10 sm:h-7 rounded ${bg} flex items-center justify-center transition-colors disabled:cursor-not-allowed`}',
    '        title={'
  ].join('\n')),
  withNL([
    '      <button',
    '        ref={buttonRef}',
    '        type="button"',
    '        onClick={handleClick}',
    '        disabled={!canWrite}',
    '        aria-label={ariaLabel}',
    '        aria-pressed={isExplicit}',
    "        aria-haspopup={isExplicit ? 'dialog' : undefined}",
    '        aria-expanded={isExplicit ? isOpen : undefined}',
    '        className={`w-12 h-10 sm:h-7 rounded ${bg} flex items-center justify-center transition-colors disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1`}',
    '        title={'
  ].join('\n'))
);

tryEdit('E7 onClose -> handleEditorClose',
  withNL(['          onRemove={() => {', '            onToggle()', '            onClose()', '          }}', '          onClose={onClose}'].join('\n')),
  withNL(['          onRemove={() => {', '            onToggle()', '            handleEditorClose()', '          }}', '          onClose={handleEditorClose}'].join('\n'))
);

tryEdit('E8 CellEditor focus + key handlers',
  withNL([
    'function CellEditor({ cell, onUpdate, onRemove, onClose }: CellEditorProps) {',
    '  const ref = useRef<HTMLDivElement>(null)',
    '',
    '  // Click-outside closes.'
  ].join('\n')),
  withNL([
    'function CellEditor({ cell, onUpdate, onRemove, onClose }: CellEditorProps) {',
    '  const ref = useRef<HTMLDivElement>(null)',
    '',
    '  // Initial focus on first focusable inside the dialog (mount only).',
    '  useEffect(() => {',
    "    const first = ref.current?.querySelector<HTMLElement>('input, button, select')",
    '    first?.focus()',
    '  }, [])',
    '',
    '  // ESC closes; Tab/Shift+Tab traps focus inside the dialog.',
    '  useEffect(() => {',
    '    function onKeyDown(e: KeyboardEvent) {',
    "      if (e.key === 'Escape') {",
    '        e.preventDefault()',
    '        onClose()',
    '        return',
    '      }',
    "      if (e.key === 'Tab' && ref.current) {",
    '        const focusables = ref.current.querySelectorAll<HTMLElement>(',
    '          \'input, button, select, [tabindex]:not([tabindex="-1"])\'',
    '        )',
    '        if (focusables.length === 0) return',
    '        const first = focusables[0]',
    '        const last = focusables[focusables.length - 1]',
    '        const active = document.activeElement',
    '        if (e.shiftKey && active === first) {',
    '          e.preventDefault()',
    '          last.focus()',
    '        } else if (!e.shiftKey && active === last) {',
    '          e.preventDefault()',
    '          first.focus()',
    '        }',
    '      }',
    '    }',
    "    document.addEventListener('keydown', onKeyDown)",
    "    return () => document.removeEventListener('keydown', onKeyDown)",
    '  }, [onClose])',
    '',
    '  // Click-outside closes.'
  ].join('\n'))
);

tryEdit('E9 CellEditor dialog role/aria',
  withNL([
    '    <div',
    '      ref={ref}',
    '      className="absolute top-full left-0 z-50 bg-white border-2 border-gray-300 rounded shadow-lg p-3 min-w-[220px] mt-1"',
    '      onClick={e => e.stopPropagation()}',
    '    >'
  ].join('\n')),
  withNL([
    '    <div',
    '      ref={ref}',
    '      role="dialog"',
    '      aria-modal="true"',
    '      aria-label="Edit cell access flags"',
    '      className="absolute top-full left-0 z-50 bg-white border-2 border-gray-300 rounded shadow-lg p-3 min-w-[220px] mt-1"',
    '      onClick={e => e.stopPropagation()}',
    '    >'
  ].join('\n'))
);

tryEdit('E10 buildings-mode select focus ring',
  withNL([
    '            <select',
    '              id="cell-buildings-mode"',
    '              value={cell.buildings_mode}',
    '              onChange={e => onUpdate({ buildings_mode: e.target.value })}',
    '              className="border rounded px-1 py-0.5"',
    '            >'
  ].join('\n')),
  withNL([
    '            <select',
    '              id="cell-buildings-mode"',
    '              value={cell.buildings_mode}',
    '              onChange={e => onUpdate({ buildings_mode: e.target.value })}',
    '              className="border rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"',
    '            >'
  ].join('\n'))
);

tryEdit('E11 Remove button focus ring',
  withNL([
    '        <button',
    '          type="button"',
    '          onClick={onRemove}',
    '          className="text-xs text-red-600 hover:text-red-800"',
    '        >',
    '          Remove assignment',
    '        </button>'
  ].join('\n')),
  withNL([
    '        <button',
    '          type="button"',
    '          onClick={onRemove}',
    '          className="text-xs text-red-600 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 rounded"',
    '        >',
    '          Remove assignment',
    '        </button>'
  ].join('\n'))
);

tryEdit('E12 Close button focus ring',
  withNL([
    '        <button',
    '          type="button"',
    '          onClick={onClose}',
    '          className="text-xs text-gray-600 hover:text-gray-900"',
    '        >',
    '          Close',
    '        </button>'
  ].join('\n')),
  withNL([
    '        <button',
    '          type="button"',
    '          onClick={onClose}',
    '          className="text-xs text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-1 rounded"',
    '        >',
    '          Close',
    '        </button>'
  ].join('\n'))
);

tryEdit('E13 scope select focus ring',
  withNL([
    '          <select',
    '            id="matrix-scope"',
    '            value={scope}',
    '            onChange={e => setScope(e.target.value as MatrixScope)}',
    '            className="border rounded px-2 py-1"',
    '            disabled={loading || saving}',
    '          >'
  ].join('\n')),
  withNL([
    '          <select',
    '            id="matrix-scope"',
    '            value={scope}',
    '            onChange={e => setScope(e.target.value as MatrixScope)}',
    '            className="border rounded px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"',
    '            disabled={loading || saving}',
    '          >'
  ].join('\n'))
);

tryEdit('E14 Discard button focus ring',
  withNL([
    '          <button',
    '            type="button"',
    '            onClick={handleDiscard}',
    '            disabled={saving}',
    '            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"',
    '          >',
    '            Discard',
    '          </button>'
  ].join('\n')),
  withNL([
    '          <button',
    '            type="button"',
    '            onClick={handleDiscard}',
    '            disabled={saving}',
    '            className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-1 rounded"',
    '          >',
    '            Discard',
    '          </button>'
  ].join('\n'))
);

tryEdit('E15 Save button focus ring',
  withNL([
    '          <button',
    '            type="button"',
    '            onClick={handleSave}',
    '            disabled={saving}',
    '            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1.5 disabled:opacity-50"',
    '          >'
  ].join('\n')),
  withNL([
    '          <button',
    '            type="button"',
    '            onClick={handleSave}',
    '            disabled={saving}',
    '            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"',
    '          >'
  ].join('\n'))
);

for (const m of PHASE2_MARKERS) {
  if (content.indexOf(m) === -1) fail('Marker missing after edits: ' + m);
}

if (content.indexOf('onClose={handleEditorClose}') === -1) fail('onClose -> handleEditorClose swap missing.');
if (content.indexOf('handleEditorClose()') === -1) fail('handleEditorClose call inside onRemove missing.');

const oldDialogPattern = withNL('    <div\n      ref={ref}\n      className="absolute top-full');
if (content.indexOf(oldDialogPattern) !== -1) fail('Old CellEditor dialog div without role still present.');

fs.writeFileSync(FILE, content, 'utf8');
console.log('WRITE OK: ' + FILE + ' (' + content.length + ' chars, delta: ' + (content.length - original.length) + ')');
console.log('DONE: T4c-3 Phase 2 (a11y basic floor) applied.');
