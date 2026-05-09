// scripts/r-territory-t4c-3-phase-4-kebab.js
//
// T4c-3 Phase 4: per-row kebab menu for bulk row actions (component-only edit).
//
// Per design lock v18 Q4=1. Three actions ship in v1:
//   - "Set all primary": flips is_primary=true on every assigned cell in the row;
//     converts inherited cells to explicit overrides on the way.
//   - "Clear row": sets all explicit cells to null in editedCells (route diff
//     deletes them on Save). Inherited cells fall through after refetch.
//   - "Copy from agent...": for each other agent listed in the menu, clicking
//     copies that agent's explicit cells to the target. is_primary=false and
//     apa_id=null on the copies (avoids conflict with source's primary; route
//     treats them as INSERTs not UPDATEs).
//
// "Reset to inherited" (the 4th action in the v18 design lock) is DEFERRED.
// Without builder changes, the component can't distinguish "explicit cell with
// inherited fallback" from "explicit cell without". Logged as
// F-RESET-TO-INHERITED-BUILDER-DEPENDENCY at v19 close.
//
// 5 anchored edits, all to components/admin-homes/TerritoryMatrix.tsx.
// Idempotent: bails if any Phase 4 marker already present.

const fs = require('fs');
const path = require('path');

const FILE = path.join('components', 'admin-homes', 'TerritoryMatrix.tsx');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }

if (!fs.existsSync(FILE)) fail(FILE + ' not found at ' + path.resolve(FILE));

const original = fs.readFileSync(FILE, 'utf8');

const PHASE4_MARKERS = ['MoreVertical', 'KebabMenu', 'openKebabAgentId', 'handleSetAllPrimary'];
const present = PHASE4_MARKERS.filter(function (m) { return original.indexOf(m) !== -1; });
if (present.length > 0) {
  console.log('SKIP: Phase 4 markers already present: ' + present.join(', '));
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

tryEdit('E1 add MoreVertical to lucide imports',
  "import { Star, Check, AlertCircle, Save as SaveIcon, Lock } from 'lucide-react'",
  "import { Star, Check, AlertCircle, Save as SaveIcon, Lock, MoreVertical } from 'lucide-react'"
);

tryEdit('E2 openKebabAgentId state',
  withNL([
    '  const [openCellKey, setOpenCellKey] = useState<string | null>(null)',
    '',
    '  // ---- Fetch matrix on mount + scope change + tenant change ----'
  ].join('\n')),
  withNL([
    '  const [openCellKey, setOpenCellKey] = useState<string | null>(null)',
    '  const [openKebabAgentId, setOpenKebabAgentId] = useState<string | null>(null)',
    '',
    '  // ---- Fetch matrix on mount + scope change + tenant change ----'
  ].join('\n'))
);

tryEdit('E3 bulk action handlers',
  withNL([
    '  const updateCell = useCallback(',
    '    (agentId: string, geoId: string, patch: Partial<MatrixCell>) => {',
    '      const key = cellKey(agentId, geoId)',
    '      const current = getCell(agentId, geoId)',
    '      if (!current) return',
    '      setEditedCells(prev => ({',
    '        ...prev,',
    "        [key]: { ...current, ...patch, presence: 'explicit' as const },",
    '      }))',
    '      setEditedAgentIds(prev => new Set(prev).add(agentId))',
    '    },',
    '    [getCell]',
    '  )',
    '',
    '  // ---- Save lifecycle ----'
  ].join('\n')),
  withNL([
    '  const updateCell = useCallback(',
    '    (agentId: string, geoId: string, patch: Partial<MatrixCell>) => {',
    '      const key = cellKey(agentId, geoId)',
    '      const current = getCell(agentId, geoId)',
    '      if (!current) return',
    '      setEditedCells(prev => ({',
    '        ...prev,',
    "        [key]: { ...current, ...patch, presence: 'explicit' as const },",
    '      }))',
    '      setEditedAgentIds(prev => new Set(prev).add(agentId))',
    '    },',
    '    [getCell]',
    '  )',
    '',
    '  // ---- Bulk row actions (kebab menu) ----',
    '  const handleSetAllPrimary = useCallback((agentId: string) => {',
    '    if (!matrix) return',
    '    const updates: Record<string, MatrixCell | null> = {}',
    '    for (const col of matrix.columns) {',
    '      const key = cellKey(agentId, col.geo_id)',
    '      const current = getCell(agentId, col.geo_id)',
    '      if (!current) continue',
    "      if (current.presence === 'explicit' && current.is_primary) continue",
    "      updates[key] = { ...current, presence: 'explicit' as const, is_primary: true }",
    '    }',
    '    if (Object.keys(updates).length === 0) return',
    '    setEditedCells(prev => ({ ...prev, ...updates }))',
    '    setEditedAgentIds(prev => new Set(prev).add(agentId))',
    '  }, [matrix, getCell])',
    '',
    '  const handleClearRow = useCallback((agentId: string) => {',
    '    if (!matrix) return',
    '    const updates: Record<string, MatrixCell | null> = {}',
    '    for (const col of matrix.columns) {',
    '      const key = cellKey(agentId, col.geo_id)',
    '      const current = getCell(agentId, col.geo_id)',
    "      if (current?.presence === 'explicit') updates[key] = null",
    '    }',
    '    if (Object.keys(updates).length === 0) return',
    '    setEditedCells(prev => ({ ...prev, ...updates }))',
    '    setEditedAgentIds(prev => new Set(prev).add(agentId))',
    '  }, [matrix, getCell])',
    '',
    '  const handleCopyFromAgent = useCallback((targetAgentId: string, sourceAgentId: string) => {',
    '    if (!matrix) return',
    '    const updates: Record<string, MatrixCell | null> = {}',
    '    for (const col of matrix.columns) {',
    '      const sourceCell = getCell(sourceAgentId, col.geo_id)',
    "      if (!sourceCell || sourceCell.presence !== 'explicit') continue",
    '      const targetKey = cellKey(targetAgentId, col.geo_id)',
    '      updates[targetKey] = {',
    "        presence: 'explicit' as const,",
    '        apa_id: null,',
    '        is_primary: false,',
    '        condo_access: sourceCell.condo_access,',
    '        homes_access: sourceCell.homes_access,',
    '        buildings_access: sourceCell.buildings_access,',
    '        buildings_mode: sourceCell.buildings_mode,',
    '      }',
    '    }',
    '    if (Object.keys(updates).length === 0) return',
    '    setEditedCells(prev => ({ ...prev, ...updates }))',
    '    setEditedAgentIds(prev => new Set(prev).add(targetAgentId))',
    '  }, [matrix, getCell])',
    '',
    '  // ---- Save lifecycle ----'
  ].join('\n'))
);

tryEdit('E4 agent td adds kebab button + menu',
  withNL([
    '                  <td className="p-2 sticky left-0 bg-white z-10 align-top">',
    '                    <div className="font-medium">{row.agent_name}</div>',
    '                    <div className="text-xs text-gray-500">',
    "                      {row.agent_role || 'agent'}{row.is_self ? ' (you)' : ''}",
    '                    </div>',
    '                    {!row.can_write && (',
    '                      <div className="text-[10px] text-gray-400 mt-0.5">read-only</div>',
    '                    )}',
    '                  </td>'
  ].join('\n')),
  withNL([
    '                  <td className="p-2 sticky left-0 bg-white z-10 align-top">',
    '                    <div className="flex items-start justify-between gap-2">',
    '                      <div className="flex-1 min-w-0">',
    '                        <div className="font-medium">{row.agent_name}</div>',
    '                        <div className="text-xs text-gray-500">',
    "                          {row.agent_role || 'agent'}{row.is_self ? ' (you)' : ''}",
    '                        </div>',
    '                        {!row.can_write && (',
    '                          <div className="text-[10px] text-gray-400 mt-0.5">read-only</div>',
    '                        )}',
    '                      </div>',
    '                      {row.can_write && (',
    '                        <div className="relative">',
    '                          <button',
    '                            type="button"',
    '                            onClick={() => setOpenKebabAgentId(openKebabAgentId === row.agent_id ? null : row.agent_id)}',
    '                            aria-label={`Bulk actions for ${row.agent_name}`}',
    '                            aria-haspopup="menu"',
    '                            aria-expanded={openKebabAgentId === row.agent_id}',
    '                            className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 rounded"',
    '                          >',
    '                            <MoreVertical className="w-4 h-4" aria-hidden="true" />',
    '                          </button>',
    '                          {openKebabAgentId === row.agent_id && (',
    '                            <KebabMenu',
    '                              agentId={row.agent_id}',
    '                              agentName={row.agent_name}',
    '                              matrix={matrix}',
    '                              onSetAllPrimary={() => handleSetAllPrimary(row.agent_id)}',
    '                              onClearRow={() => handleClearRow(row.agent_id)}',
    '                              onCopyFromAgent={(sourceId) => handleCopyFromAgent(row.agent_id, sourceId)}',
    '                              onClose={() => setOpenKebabAgentId(null)}',
    '                            />',
    '                          )}',
    '                        </div>',
    '                      )}',
    '                    </div>',
    '                  </td>'
  ].join('\n'))
);

tryEdit('E5 KebabMenu component appended',
  withNL([
    '          Close',
    '        </button>',
    '      </div>',
    '    </div>',
    '  )',
    '}'
  ].join('\n')),
  withNL([
    '          Close',
    '        </button>',
    '      </div>',
    '    </div>',
    '  )',
    '}',
    '',
    '// ============================================================================',
    '// KebabMenu -- per-row bulk actions dropdown',
    '// ============================================================================',
    '',
    'interface KebabMenuProps {',
    '  agentId: string',
    '  agentName: string',
    '  matrix: TerritoryMatrixData',
    '  onSetAllPrimary: () => void',
    '  onClearRow: () => void',
    '  onCopyFromAgent: (sourceAgentId: string) => void',
    '  onClose: () => void',
    '}',
    '',
    'function KebabMenu({',
    '  agentId,',
    '  agentName,',
    '  matrix,',
    '  onSetAllPrimary,',
    '  onClearRow,',
    '  onCopyFromAgent,',
    '  onClose,',
    '}: KebabMenuProps) {',
    '  const ref = useRef<HTMLDivElement>(null)',
    '',
    '  // Initial focus on first menu item (mount only).',
    '  useEffect(() => {',
    "    const first = ref.current?.querySelector<HTMLElement>('button')",
    '    first?.focus()',
    '  }, [])',
    '',
    '  // ESC closes; Tab/Shift+Tab traps focus inside the menu.',
    '  useEffect(() => {',
    '    function onKeyDown(e: KeyboardEvent) {',
    "      if (e.key === 'Escape') {",
    '        e.preventDefault()',
    '        onClose()',
    '        return',
    '      }',
    "      if (e.key === 'Tab' && ref.current) {",
    "        const focusables = ref.current.querySelectorAll<HTMLElement>('button')",
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
    '  // Click-outside closes.',
    '  useEffect(() => {',
    '    function onDocMouseDown(e: MouseEvent) {',
    '      if (ref.current && !ref.current.contains(e.target as Node)) onClose()',
    '    }',
    "    document.addEventListener('mousedown', onDocMouseDown)",
    "    return () => document.removeEventListener('mousedown', onDocMouseDown)",
    '  }, [onClose])',
    '',
    '  const otherAgents = matrix.rows.filter(r => r.agent_id !== agentId)',
    '',
    '  return (',
    '    <div',
    '      ref={ref}',
    '      role="menu"',
    '      aria-label={`Bulk actions for ${agentName}`}',
    '      className="absolute right-0 top-full z-30 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[200px] py-1 max-h-[60vh] overflow-y-auto"',
    '      onClick={e => e.stopPropagation()}',
    '    >',
    '      <button',
    '        type="button"',
    '        role="menuitem"',
    '        onClick={() => { onSetAllPrimary(); onClose() }}',
    '        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50"',
    '      >',
    '        Set all primary',
    '      </button>',
    '      <button',
    '        type="button"',
    '        role="menuitem"',
    '        onClick={() => { onClearRow(); onClose() }}',
    '        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50 text-red-600"',
    '      >',
    '        Clear row',
    '      </button>',
    '      {otherAgents.length > 0 && (',
    '        <>',
    '          <div className="border-t border-gray-200 my-1" role="separator" />',
    '          <div className="px-3 py-1 text-xs text-gray-500 font-medium uppercase tracking-wider">',
    '            Copy from',
    '          </div>',
    '          {otherAgents.map(other => (',
    '            <button',
    '              type="button"',
    '              role="menuitem"',
    '              key={other.agent_id}',
    '              onClick={() => { onCopyFromAgent(other.agent_id); onClose() }}',
    '              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50"',
    '            >',
    '              {other.agent_name}',
    '              {other.agent_role && (',
    '                <span className="text-xs text-gray-400 ml-1">({other.agent_role})</span>',
    '              )}',
    '            </button>',
    '          ))}',
    '        </>',
    '      )}',
    '    </div>',
    '  )',
    '}'
  ].join('\n'))
);

for (const m of PHASE4_MARKERS) {
  if (content.indexOf(m) === -1) fail('Marker missing after edits: ' + m);
}

fs.writeFileSync(FILE, content, 'utf8');
console.log('WRITE OK: ' + FILE + ' (' + content.length + ' chars, delta: ' + (content.length - original.length) + ')');
console.log('DONE: T4c-3 Phase 4 (kebab menu) applied.');
