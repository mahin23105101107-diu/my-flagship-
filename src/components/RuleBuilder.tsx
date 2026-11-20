import { Plus, Trash2, Layers } from 'lucide-react';
import type { OperatorType, RuleGroupNode, RuleNode } from '../shared/engine.ts';
import type { UserSegment } from '../types/flagship.ts';

const OPERATORS: Array<{ value: OperatorType; label: string }> = [
  { value: 'EQUALS', label: 'Equals' },
  { value: 'NOT_EQUALS', label: 'Not Equals' },
  { value: 'IN', label: 'In List (csv)' },
  { value: 'CONTAINS', label: 'Contains' },
  { value: 'SEMVER_GREATER_THAN', label: 'Semver >' },
  { value: 'REGEX', label: 'Matches Regex' },
  { value: 'DATE_BEFORE', label: 'Date Before' },
  { value: 'DATE_AFTER', label: 'Date After' },
];

interface RuleBuilderProps {
  node: RuleGroupNode;
  segments?: UserSegment[];
  onChange: (next: RuleGroupNode) => void;
  depth?: number;
  onRemoveSelf?: () => void;
}

export function RuleBuilder({
  node,
  segments = [],
  onChange,
  depth = 0,
  onRemoveSelf,
}: RuleBuilderProps) {
  const updateChild = (idx: number, updated: RuleNode) => {
    const nextChildren = [...node.children];
    nextChildren[idx] = updated;
    onChange({ ...node, children: nextChildren });
  };

  const removeChild = (idx: number) => {
    const nextChildren = node.children.filter((_, i) => i !== idx);
    onChange({ ...node, children: nextChildren });
  };

  const addCondition = () => {
    onChange({
      ...node,
      children: [
        ...node.children,
        { kind: 'CONDITION', attribute: 'plan', operator: 'EQUALS', value: 'enterprise' },
      ],
    });
  };

  const addNestedGroup = () => {
    onChange({
      ...node,
      children: [
        ...node.children,
        {
          kind: 'GROUP',
          operator: node.operator === 'AND' ? 'OR' : 'AND',
          children: [{ kind: 'CONDITION', attribute: 'region', operator: 'IN', value: 'US,EU' }],
        },
      ],
    });
  };

  const addSegmentRef = () => {
    if (segments.length === 0) return;
    onChange({
      ...node,
      children: [...node.children, { kind: 'SEGMENT_REF', segmentKey: segments[0].key }],
    });
  };

  return (
    <div
      className={`rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-3 ${
        depth === 0
          ? 'bg-slate-50/70 dark:bg-slate-950/60'
          : 'bg-white dark:bg-slate-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Match
          </span>
          <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
            {(['AND', 'OR'] as const).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => onChange({ ...node, operator: op })}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  node.operator === op
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {op === 'AND' ? 'All (AND)' : 'Any (OR)'}
              </button>
            ))}
          </div>
          {depth > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">Nested Group</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={addCondition}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Condition
          </button>
          {depth < 2 && (
            <button
              type="button"
              onClick={addNestedGroup}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              Nested Group
            </button>
          )}
          {segments.length > 0 && (
            <button
              type="button"
              onClick={addSegmentRef}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Segment
            </button>
          )}
          {onRemoveSelf && (
            <button
              type="button"
              onClick={onRemoveSelf}
              aria-label="Remove group"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {node.children.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
          No conditions defined. Add a condition or segment reference above.
        </p>
      ) : (
        <div className="space-y-2">
          {node.children.map((child, idx) => {
            if (child.kind === 'GROUP') {
              return (
                <RuleBuilder
                  key={idx}
                  node={child}
                  segments={segments}
                  depth={depth + 1}
                  onChange={(updated) => updateChild(idx, updated)}
                  onRemoveSelf={() => removeChild(idx)}
                />
              );
            }

            if (child.kind === 'SEGMENT_REF') {
              return (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
                >
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 shrink-0">
                    In Segment
                  </span>
                  <select
                    value={child.segmentKey}
                    onChange={(e) =>
                      updateChild(idx, { kind: 'SEGMENT_REF', segmentKey: e.target.value })
                    }
                    className="flex-1 min-w-[180px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {segments.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name} ({s.key})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeChild(idx)}
                    aria-label="Remove segment condition"
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-[1fr_170px_1fr_auto] gap-2 items-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
              >
                <input
                  type="text"
                  value={child.attribute}
                  placeholder="attribute (e.g. email, plan, appVersion)"
                  onChange={(e) => updateChild(idx, { ...child, attribute: e.target.value })}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <select
                  value={child.operator}
                  onChange={(e) =>
                    updateChild(idx, { ...child, operator: e.target.value as OperatorType })
                  }
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={child.value}
                  placeholder="expected value"
                  onChange={(e) => updateChild(idx, { ...child, value: e.target.value })}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => removeChild(idx)}
                  aria-label="Remove condition"
                  className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 justify-self-end"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
