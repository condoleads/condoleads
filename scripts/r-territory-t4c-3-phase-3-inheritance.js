// scripts/r-territory-t4c-3-phase-3-inheritance.js
//
// T4c-3 Phase 3: inheritance preview (4 files, 17 anchored edits).
//
// Per design lock v18 Q3=1: cell tint + Lock overlay on inherited-only cells;
// popover shows lineage when editing.
//
// Files touched:
//   1. lib/admin-homes/territory-matrix.ts  -- type extension + builder logic
//   2. app/api/admin-homes/territory/matrix/route.ts  -- parent APA fetch (depth-1)
//   3. components/admin-homes/TerritoryMatrix.tsx  -- isInherited rendering + Lock overlay + popover banner + conditional Remove
//   4. scripts/r-territory-t4c-2-builder-smoke.ts  -- T9 inherited round-trip
//
// Idempotent: bails if any Phase 3 marker already present.
// Atomic: each file's edits accumulated in memory; all 4 files written at end on success.
// Backup: each file gets a timestamped backup before write.

const fs = require('fs');
const path = require('path');

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const STAMP = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());

// ---- Idempotency: bail if any Phase 3 marker is already present in any of the four files ----
const PHASE3_FILES = [
  'lib/admin-homes/territory-matrix.ts',
  'app/api/admin-homes/territory/matrix/route.ts',
  'components/admin-homes/TerritoryMatrix.tsx',
  'scripts/r-territory-t4c-2-builder-smoke.ts',
];
const PHASE3_MARKERS = [
  "presence: 'explicit' | 'inherited'",
  'inheritedRowsByAgent',
  'isInherited',
  "T9 -- inheritance",
];
for (const p of PHASE3_FILES) {
  if (!fs.existsSync(p)) fail(p + ' not found');
  const c = fs.readFileSync(p, 'utf8');
  const present = PHASE3_MARKERS.filter(function (m) { return c.indexOf(m) !== -1; });
  if (present.length > 0) {
    console.log('SKIP: Phase 3 markers already present in ' + p + ': ' + present.join(', '));
    process.exit(0);
  }
}

function fileEditor(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const NL = original.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  let content = original;
  function edit(label, oldLines, newLines) {
    const oldStr = oldLines.join('\n').replace(/\n/g, NL);
    const newStr = newLines.join('\n').replace(/\n/g, NL);
    const count = content.split(oldStr).length - 1;
    if (count !== 1) fail(filePath + ' / ' + label + ': expected 1 match, found ' + count);
    content = content.replace(oldStr, newStr);
    console.log('  ' + label + ' OK');
  }
  function save() {
    if (content === original) {
      console.log('  ' + filePath + ': no changes');
      return;
    }
    const backupPath = filePath + '.backup_' + STAMP;
    fs.writeFileSync(backupPath, original);
    fs.writeFileSync(filePath, content);
    console.log('  ' + filePath + ': WRITE OK (' + content.length + ' chars, delta: ' + (content.length - original.length) + ', backup ' + path.basename(backupPath) + ')');
  }
  function get() { return content; }
  return { edit: edit, save: save, get: get, NL: NL };
}

// ============================================================================
// FILE 1: lib/admin-homes/territory-matrix.ts
// ============================================================================
console.log('\n[1/4] lib/admin-homes/territory-matrix.ts');
const fe1 = fileEditor('lib/admin-homes/territory-matrix.ts');
console.log('  line ending: ' + (fe1.NL === '\r\n' ? 'CRLF' : 'LF'));

fe1.edit('B1 header comment',
  [
    '// SCOPE NOT YET COVERED (deferred to T4c-3 or follow-ups)',
    '//   - Inheritance preview (manager-wider-scope auto-covers managed agents).',
    '//   - Mobile responsive layout + a11y polish.',
    '//   - Bulk row actions ("apply this row to all communities in this muni").',
    '//   - Cross-agent primary conflict pre-check at edit time (currently surfaces',
    '//     server-side via the bulk-assign 400 response on Save).'
  ],
  [
    '// SCOPE EXTENSIONS (post-v17)',
    '//   T4c-3 Phase 1: mobile responsive layout (component-only).',
    '//   T4c-3 Phase 2: a11y basic floor (component-only).',
    '//   T4c-3 Phase 3: inheritance preview (THIS FILE -- adds \'inherited\' presence',
    '//     value + inheritance-fetch contract; serializer auto-excludes inherited',
    '//     cells via existing presence === \'explicit\' filter).',
    '//   Still deferred: bulk row actions (T4c-3 Phase 4); cross-agent primary',
    '//     conflict pre-check at edit time (currently surfaces server-side via',
    '//     the bulk-assign 400 response on Save).'
  ]
);

fe1.edit('B2 MatrixCell type',
  [
    '/**',
    " * Cell state for an (agent, geo) pair at the matrix's scope.",
    " * `presence: 'empty'` is implicit for missing keys -- the cells map stores",
    ' * only explicit assignments. Inheritance is intentionally NOT modelled here',
    ' * (T4c-3 scope).',
    ' */',
    'export interface MatrixCell {',
    "  presence: 'explicit'",
    '  apa_id: string | null',
    '  is_primary: boolean',
    '  condo_access: boolean',
    '  homes_access: boolean',
    '  buildings_access: boolean',
    '  buildings_mode: string',
    '}'
  ],
  [
    '/**',
    " * Cell state for an (agent, geo) pair at the matrix's scope.",
    " * `presence: 'empty'` is implicit for missing keys -- the cells map stores",
    ' * only explicit assignments and inherited cells.',
    ' *',
    " * 'explicit' = this agent's own active APA row at (scope, geo).",
    " * 'inherited' = this agent's parent has an active APA row at (scope, geo)",
    ' *   AND this agent has no explicit row there. Inherited cells are read-through',
    " *   visibility only; the serializer filters them out via presence === 'explicit'",
    " *   so a Save never persists them as the agent's own rows. Editing an inherited",
    " *   cell flips it to 'explicit' (creating an override).",
    ' */',
    'export interface MatrixCell {',
    "  presence: 'explicit' | 'inherited'",
    '  apa_id: string | null',
    '  is_primary: boolean',
    '  condo_access: boolean',
    '  homes_access: boolean',
    '  buildings_access: boolean',
    '  buildings_mode: string',
    '  inherited_from_agent_id?: string | null',
    '  inherited_from_agent_name?: string | null',
    '}'
  ]
);

fe1.edit('B3 MatrixBuildInputs adds inheritance maps',
  [
    '  apaRowsByAgent: Record<string, ApaRow[]>',
    '  writeDecisions: Record<string, boolean>',
    '}'
  ],
  [
    '  apaRowsByAgent: Record<string, ApaRow[]>',
    '  writeDecisions: Record<string, boolean>',
    '  inheritedRowsByAgent?: Record<string, ApaRow[]>',
    '  inheritedFromNamesByAgent?: Record<string, string>',
    '}'
  ]
);

fe1.edit('B4 builder inheritance loop',
  [
    '    preservedRowsByAgent[agentId] = preserved',
    '  }',
    '',
    '  return {'
  ],
  [
    '    preservedRowsByAgent[agentId] = preserved',
    '  }',
    '',
    '  // Process inherited cells (depth-1 parent walk per F-INHERITANCE-DEPTH-1):',
    '  // for each authorized agent with parent APA rows at the chosen scope, fill',
    '  // in cells where the agent has no explicit row. Explicit always wins.',
    '  const inheritedByAgent = input.inheritedRowsByAgent || {}',
    '  const inheritedNamesByAgent = input.inheritedFromNamesByAgent || {}',
    '',
    '  for (const agent of input.agents) {',
    '    if (!agent.parent_id) continue',
    '    const inheritedApa = inheritedByAgent[agent.id] || []',
    '    const parentName = inheritedNamesByAgent[agent.id] ?? null',
    '',
    '    for (const r of inheritedApa) {',
    '      if (r.scope !== input.scope) continue',
    '      const geoId = scopeColumnId(r, input.scope)',
    '      if (!geoId) continue',
    "      const key = agent.id + '|' + geoId",
    '      if (cells[key]) continue // explicit always wins',
    '',
    '      cells[key] = {',
    "        presence: 'inherited',",
    '        apa_id: r.id ?? null,',
    '        is_primary: r.is_primary,',
    '        condo_access: r.condo_access,',
    '        homes_access: r.homes_access,',
    '        buildings_access: r.buildings_access,',
    '        buildings_mode: r.buildings_mode,',
    '        inherited_from_agent_id: agent.parent_id,',
    '        inherited_from_agent_name: parentName,',
    '      }',
    '    }',
    '  }',
    '',
    '  return {'
  ]
);

// ============================================================================
// FILE 2: app/api/admin-homes/territory/matrix/route.ts
// ============================================================================
console.log('\n[2/4] app/api/admin-homes/territory/matrix/route.ts');
const fe2 = fileEditor('app/api/admin-homes/territory/matrix/route.ts');
console.log('  line ending: ' + (fe2.NL === '\r\n' ? 'CRLF' : 'LF'));

fe2.edit('R1 step 7b parent APA fetch',
  [
    '  for (const id of agentIds) if (!apaRowsByAgent[id]) apaRowsByAgent[id] = []',
    '',
    '  // ---- 8. Compute tenant footprint at chosen scope ----'
  ],
  [
    '  for (const id of agentIds) if (!apaRowsByAgent[id]) apaRowsByAgent[id] = []',
    '',
    '  // ---- 7b. Fetch parent agent names + parent APA rows (depth-1 inheritance walk) ----',
    "  // Per W-TERRITORY v18 design lock Q3=1 + F-INHERITANCE-DEPTH-1: each managed",
    "  // agent's matrix cells inherit from the agent's parent (depth-1 only -- mirrors",
    '  // the per-agent page pattern in app/admin-homes/agents/[id]/page.tsx).',
    '  const distinctParentIds = Array.from(',
    '    new Set(agents.map(a => a.parent_id).filter((x): x is string => x !== null))',
    '  )',
    '',
    '  const inheritedRowsByAgent: Record<string, ApaRow[]> = {}',
    '  const inheritedFromNamesByAgent: Record<string, string> = {}',
    '',
    '  if (distinctParentIds.length > 0) {',
    '    const [parentsRes, parentApaRes] = await Promise.all([',
    '      supabase',
    "        .from('agents')",
    "        .select('id, name')",
    "        .eq('tenant_id', tenantId)",
    "        .in('id', distinctParentIds),",
    '      supabase',
    "        .from('agent_property_access')",
    "        .select('id, agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id, is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode')",
    "        .eq('tenant_id', tenantId)",
    "        .eq('is_active', true)",
    "        .in('agent_id', distinctParentIds),",
    '    ])',
    '    if (parentsRes.error) return NextResponse.json({ error: parentsRes.error.message }, { status: 500 })',
    '    if (parentApaRes.error) return NextResponse.json({ error: parentApaRes.error.message }, { status: 500 })',
    '',
    '    const parentNamesById = new Map<string, string>(',
    '      (parentsRes.data || []).map((p: any) => [p.id, p.name as string])',
    '    )',
    '    const parentApaByParent: Record<string, ApaRow[]> = {}',
    '    for (const r of (parentApaRes.data || []) as ApaRow[]) {',
    '      const arr = parentApaByParent[r.agent_id] || []',
    '      arr.push(r)',
    '      parentApaByParent[r.agent_id] = arr',
    '    }',
    '',
    '    for (const a of agents) {',
    '      if (!a.parent_id) continue',
    '      inheritedRowsByAgent[a.id] = parentApaByParent[a.parent_id] || []',
    '      const pname = parentNamesById.get(a.parent_id)',
    '      if (pname) inheritedFromNamesByAgent[a.id] = pname',
    '    }',
    '  }',
    '',
    '  // ---- 8. Compute tenant footprint at chosen scope ----'
  ]
);

fe2.edit('R2 buildTerritoryMatrix call adds inheritance inputs',
  [
    '    geos,',
    '    apaRowsByAgent,',
    '    writeDecisions,',
    '  })'
  ],
  [
    '    geos,',
    '    apaRowsByAgent,',
    '    writeDecisions,',
    '    inheritedRowsByAgent,',
    '    inheritedFromNamesByAgent,',
    '  })'
  ]
);

// ============================================================================
// FILE 3: components/admin-homes/TerritoryMatrix.tsx
// ============================================================================
console.log('\n[3/4] components/admin-homes/TerritoryMatrix.tsx');
const fe3 = fileEditor('components/admin-homes/TerritoryMatrix.tsx');
console.log('  line ending: ' + (fe3.NL === '\r\n' ? 'CRLF' : 'LF'));

fe3.edit('C1 add Lock to lucide imports',
  ["import { Star, Check, AlertCircle, Save as SaveIcon } from 'lucide-react'"],
  ["import { Star, Check, AlertCircle, Save as SaveIcon, Lock } from 'lucide-react'"]
);

fe3.edit('C2 isInherited + extended ariaLabel',
  [
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
  ],
  [
    "  const isExplicit = cell?.presence === 'explicit'",
    "  const isInherited = cell?.presence === 'inherited'",
    '  const isPrimary = (isExplicit || isInherited) && cell?.is_primary === true',
    "  const inheritedFrom = isInherited ? (cell?.inherited_from_agent_name ?? 'manager') : null",
    '  const buttonRef = useRef<HTMLButtonElement>(null)',
    '',
    '  // Compose a11y label by state.',
    '  const stateLabel = !canWrite',
    "    ? `${isExplicit ? (isPrimary ? 'primary' : 'assigned') : isInherited ? `inherited from ${inheritedFrom}` : 'unassigned'}, read-only`",
    '    : isConflict',
    "      ? 'primary conflict, click to edit'",
    '      : isExplicit',
    "        ? `${isPrimary ? 'primary' : 'assigned'}, click to edit access flags`",
    '        : isInherited',
    "          ? `inherited from ${inheritedFrom}${isPrimary ? ' (primary)' : ''}, click to override`",
    "          : 'unassigned, click to assign'",
    '  const ariaLabel = `${agentName}, ${geoName}, ${stateLabel}`'
  ]
);

fe3.edit('C3 bg precedence chain adds inherited',
  [
    '  // Compose visual classes by precedence: conflict > edited > explicit > empty,',
    '  // dimmed if !canWrite.',
    "  let bg = 'bg-gray-50 hover:bg-blue-50'",
    "  if (isExplicit) bg = 'bg-blue-100 hover:bg-blue-200'",
    "  if (isEdited) bg = 'bg-yellow-100 border border-yellow-400 hover:bg-yellow-200'",
    "  if (isConflict) bg = 'bg-red-200 border-2 border-red-500 ring-2 ring-red-300'",
    '  if (!canWrite) {',
    "    bg = isExplicit ? 'bg-gray-100' : 'bg-gray-50 opacity-60'",
    '  }'
  ],
  [
    '  // Compose visual classes by precedence: conflict > edited > explicit > inherited > empty,',
    '  // dimmed if !canWrite.',
    "  let bg = 'bg-gray-50 hover:bg-blue-50'",
    "  if (isInherited) bg = 'bg-gray-100 hover:bg-gray-200'",
    "  if (isExplicit) bg = 'bg-blue-100 hover:bg-blue-200'",
    "  if (isEdited) bg = 'bg-yellow-100 border border-yellow-400 hover:bg-yellow-200'",
    "  if (isConflict) bg = 'bg-red-200 border-2 border-red-500 ring-2 ring-red-300'",
    '  if (!canWrite) {',
    "    bg = isExplicit ? 'bg-gray-100' : isInherited ? 'bg-gray-100 opacity-80' : 'bg-gray-50 opacity-60'",
    '  }'
  ]
);

fe3.edit('C4 handleClick allows popover for inherited',
  [
    '  const handleClick = () => {',
    '    if (!canWrite) return',
    '    if (isExplicit) {',
    '      // Explicit cell -> open popover for editing access flags / removing.',
    '      onOpen()',
    '    } else {',
    '      // Empty cell -> toggle to explicit (default state).',
    '      onToggle()',
    '    }',
    '  }'
  ],
  [
    '  const handleClick = () => {',
    '    if (!canWrite) return',
    '    if (isExplicit || isInherited) {',
    '      // Explicit -> edit; inherited -> open popover (editing creates an override).',
    '      onOpen()',
    '    } else {',
    '      // Empty cell -> toggle to explicit (default state).',
    '      onToggle()',
    '    }',
    '  }'
  ]
);

fe3.edit('C5 button aria-haspopup/expanded for inherited + relative class',
  [
    '        aria-label={ariaLabel}',
    '        aria-pressed={isExplicit}',
    "        aria-haspopup={isExplicit ? 'dialog' : undefined}",
    '        aria-expanded={isExplicit ? isOpen : undefined}',
    '        className={`w-12 h-10 sm:h-7 rounded ${bg} flex items-center justify-center transition-colors disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1`}'
  ],
  [
    '        aria-label={ariaLabel}',
    '        aria-pressed={isExplicit}',
    "        aria-haspopup={(isExplicit || isInherited) ? 'dialog' : undefined}",
    '        aria-expanded={(isExplicit || isInherited) ? isOpen : undefined}',
    '        className={`relative w-12 h-10 sm:h-7 rounded ${bg} flex items-center justify-center transition-colors disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1`}'
  ]
);

fe3.edit('C6 button title adds inherited case',
  [
    '        title={',
    '          !canWrite',
    "            ? 'You do not have permission to edit this row'",
    '            : isExplicit',
    "              ? `Edit (primary: ${isPrimary ? 'yes' : 'no'})`",
    "              : 'Click to assign'",
    '        }'
  ],
  [
    '        title={',
    '          !canWrite',
    "            ? 'You do not have permission to edit this row'",
    '            : isExplicit',
    "              ? `Edit (primary: ${isPrimary ? 'yes' : 'no'})`",
    '              : isInherited',
    "                ? `Inherited from ${inheritedFrom}${isPrimary ? ' (primary)' : ''} -- click to override`",
    "                : 'Click to assign'",
    '        }'
  ]
);

fe3.edit('C7 icon rendering adds Lock overlay + inherited variants',
  [
    '      >',
    '        {isExplicit && (',
    '          isPrimary',
    '            ? <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />',
    '            : <Check className="w-3 h-3 text-blue-700" />',
    '        )}',
    '      </button>'
  ],
  [
    '      >',
    '        {isInherited && (',
    '          <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-gray-400" aria-hidden="true" />',
    '        )}',
    '        {isExplicit && (',
    '          isPrimary',
    '            ? <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />',
    '            : <Check className="w-3 h-3 text-blue-700" />',
    '        )}',
    '        {isInherited && (',
    '          isPrimary',
    '            ? <Star className="w-3 h-3 fill-amber-300 text-amber-300" />',
    '            : <Check className="w-3 h-3 text-gray-500" />',
    '        )}',
    '      </button>'
  ]
);

fe3.edit('C8 CellEditor inheritance banner',
  [
    '      onClick={e => e.stopPropagation()}',
    '    >',
    '      <div className="space-y-2">'
  ],
  [
    '      onClick={e => e.stopPropagation()}',
    '    >',
    "      {cell.presence === 'inherited' && (",
    '        <div className="bg-gray-50 border-b border-gray-200 -mt-3 -mx-3 mb-3 px-3 py-2 text-xs text-gray-700 flex items-center gap-1.5 rounded-t">',
    '          <Lock className="w-3 h-3 text-gray-500" aria-hidden="true" />',
    '          <span>',
    "            Inherited from <span className=\"font-medium\">{cell.inherited_from_agent_name ?? 'manager'}</span>",
    '            <span className="text-gray-400"> -- editing creates an override</span>',
    '          </span>',
    '        </div>',
    '      )}',
    '      <div className="space-y-2">'
  ]
);

fe3.edit('C9 conditional Remove button (explicit only)',
  [
    '      <div className="flex items-center justify-between mt-3 pt-2 border-t">',
    '        <button',
    '          type="button"',
    '          onClick={onRemove}',
    '          className="text-xs text-red-600 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 rounded"',
    '        >',
    '          Remove assignment',
    '        </button>'
  ],
  [
    '      <div className="flex items-center justify-between mt-3 pt-2 border-t">',
    "        {cell.presence === 'explicit' ? (",
    '          <button',
    '            type="button"',
    '            onClick={onRemove}',
    '            className="text-xs text-red-600 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 rounded"',
    '          >',
    '            Remove assignment',
    '          </button>',
    '        ) : (',
    '          <span aria-hidden="true" />',
    '        )}'
  ]
);

// ============================================================================
// FILE 4: scripts/r-territory-t4c-2-builder-smoke.ts
// ============================================================================
console.log('\n[4/4] scripts/r-territory-t4c-2-builder-smoke.ts');
const fe4 = fileEditor('scripts/r-territory-t4c-2-builder-smoke.ts');
console.log('  line ending: ' + (fe4.NL === '\r\n' ? 'CRLF' : 'LF'));

fe4.edit('S1 header coverage adds T9',
  [
    '//   T8 -- round-trip: build -> serialize unchanged -> payload contains all original rows',
    '//         (regression sentinel: catches accidental other-scope-row deletion)'
  ],
  [
    '//   T8 -- round-trip: build -> serialize unchanged -> payload contains all original rows',
    '//         (regression sentinel: catches accidental other-scope-row deletion)',
    '//   T9 -- inheritance: inherited cells appear with presence=\'inherited\'; explicit',
    '//         beats inherited at same key; serializer emits ZERO inherited rows in',
    '//         payload (regression sentinel: catches accidental over-serialization).'
  ]
);

fe4.edit('S2 T9 test block before runner',
  [
    '// ============================================================================',
    '// Runner',
    '// ============================================================================',
    '',
    "console.log('=== T4c-2 Phase A builder smoke results ===\\n')"
  ],
  [
    '// ============================================================================',
    '// T9: inheritance preview (regression sentinel + visibility check)',
    '// ============================================================================',
    "// Inherited cells appear with presence='inherited'. Explicit ALWAYS wins at",
    '// the same key. The serializer emits zero inherited rows in the payload',
    '// (regression sentinel: any accidental over-serialization would duplicate the',
    "// parent's APA rows onto the managed agent's record on next Save).",
    '{',
    '  // A2 is managed by A1. Parent A1 has 2 community APA rows (C1 primary, C2',
    '  // condo-disabled). A2 has its own explicit row at C1 only -- which must beat',
    '  // the inherited row at the same (A2, C1) key. C2 falls through to inherited.',
    '  const inheritedA2: ApaRow[] = [',
    "    apa({ id: 'pr1', agent_id: A1, scope: 'community', community_id: C1, is_primary: true }),",
    "    apa({ id: 'pr2', agent_id: A1, scope: 'community', community_id: C2, is_primary: false, condo_access: false }),",
    '  ]',
    '  const apaA2WithExplicit: ApaRow[] = [',
    "    apa({ id: 'r2', agent_id: A2, scope: 'community', community_id: C1, is_primary: false }),",
    '  ]',
    '',
    '  const m = buildTerritoryMatrix(inputs({',
    "    scope: 'community',",
    '    authorizedAgentIds: [A2],',
    "    agents: [{ id: A2, name: 'Bob', role: 'agent', parent_id: A1 }],",
    '    geos: [',
    "      { id: C1, name: 'Comm 1', parent_id: null, parent_name: null },",
    "      { id: C2, name: 'Comm 2', parent_id: null, parent_name: null },",
    '    ],',
    '    apaRowsByAgent: { [A2]: apaA2WithExplicit },',
    '    writeDecisions: { [A2]: true },',
    '    inheritedRowsByAgent: { [A2]: inheritedA2 },',
    "    inheritedFromNamesByAgent: { [A2]: 'Alice' },",
    '  }))',
    '',
    '  const explicitCell = m.cells[cellKey(A2, C1)]',
    '  const inheritedCell = m.cells[cellKey(A2, C2)]',
    '',
    '  // Round-trip: serialize without edits -- inherited rows must NOT appear',
    '  const payload = serializeMatrixToBulkAssignPayload(m, {}, [A2])',
    '  const rows = payload.assignments[A2] || []',
    '  const inheritedInPayload = rows.some(r => r.community_id === C2)',
    '  const explicitInPayload = rows.some(r => r.community_id === C1)',
    '',
    '  results.push({',
    "    name: 'T9: inheritance -- explicit wins, inherited renders, serializer omits inherited',",
    '    pass:',
    "      explicitCell?.presence === 'explicit' &&",
    "      explicitCell?.apa_id === 'r2' &&",
    '      explicitCell?.is_primary === false &&',
    "      inheritedCell?.presence === 'inherited' &&",
    '      inheritedCell?.inherited_from_agent_id === A1 &&',
    "      inheritedCell?.inherited_from_agent_name === 'Alice' &&",
    '      inheritedCell?.condo_access === false &&',
    '      explicitInPayload &&',
    '      !inheritedInPayload &&',
    '      rows.length === 1,',
    '    detail: `explicit.presence=${explicitCell?.presence} apa_id=${explicitCell?.apa_id} primary=${explicitCell?.is_primary}; inherited.presence=${inheritedCell?.presence} from=${inheritedCell?.inherited_from_agent_name} condo=${inheritedCell?.condo_access}; payloadRows=${rows.length} explicitInPayload=${explicitInPayload} inheritedInPayload=${inheritedInPayload}`,',
    '  })',
    '}',
    '',
    '// ============================================================================',
    '// Runner',
    '// ============================================================================',
    '',
    "console.log('=== T4c-2 Phase A builder smoke results ===\\n')"
  ]
);

// ============================================================================
// Verify all expected markers landed, then write all files
// ============================================================================

console.log('\n[verify] markers across all four files');
const FINAL_MARKERS = [
  ["lib/admin-homes/territory-matrix.ts", fe1.get(), "presence: 'explicit' | 'inherited'"],
  ["lib/admin-homes/territory-matrix.ts", fe1.get(), "inheritedRowsByAgent?: Record<string, ApaRow[]>"],
  ["lib/admin-homes/territory-matrix.ts", fe1.get(), "F-INHERITANCE-DEPTH-1"],
  ["app/api/admin-homes/territory/matrix/route.ts", fe2.get(), "distinctParentIds"],
  ["app/api/admin-homes/territory/matrix/route.ts", fe2.get(), "inheritedFromNamesByAgent"],
  ["components/admin-homes/TerritoryMatrix.tsx", fe3.get(), "isInherited"],
  ["components/admin-homes/TerritoryMatrix.tsx", fe3.get(), "Lock"],
  ["components/admin-homes/TerritoryMatrix.tsx", fe3.get(), "inherited_from_agent_name"],
  ["scripts/r-territory-t4c-2-builder-smoke.ts", fe4.get(), "T9: inheritance"],
];
for (const [filePath, content, marker] of FINAL_MARKERS) {
  if (content.indexOf(marker) === -1) fail('Marker missing in ' + filePath + ': ' + marker);
}
console.log('  all ' + FINAL_MARKERS.length + ' markers OK');

console.log('\n[write] all four files');
fe1.save();
fe2.save();
fe3.save();
fe4.save();

console.log('\nDONE: T4c-3 Phase 3 (inheritance preview) applied.');
