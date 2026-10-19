import React from 'react';
import { X, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TeamMember } from '../api/useTeam';

export interface AssignerSelectProps {
  availableStaff: TeamMember[];
  primaryAssigneeId?: string | null;
  selectedCoAssigneeIds: string[];
  onPrimaryChange?: (userId: string | null) => void;
  onCoAssigneesChange: (userIds: string[]) => void;
  disabled?: boolean;
  managerOnlyPrimary?: boolean;
  attribution?: { assignedByName?: string; assignedAt?: string } | null;
  className?: string;
}

export function AssignerSelect({
  availableStaff,
  primaryAssigneeId,
  selectedCoAssigneeIds,
  onPrimaryChange,
  onCoAssigneesChange,
  disabled = false,
  managerOnlyPrimary = false,
  attribution,
  className = '',
}: AssignerSelectProps) {
  // Primary options: if managerOnlyPrimary, restrict to Manager | Admin
  const primaryCandidates = React.useMemo(() => {
    if (!managerOnlyPrimary) return availableStaff;
    return availableStaff.filter((m) => m.role === 'Manager' || m.role === 'Admin');
  }, [availableStaff, managerOnlyPrimary]);

  // Co-assignee candidates: non-manager, non-admin (or all staff if not managerOnlyPrimary),
  // strictly excluding the selected primary assignee and already selected co-assignees
  const eligibleCoAssignees = React.useMemo(() => {
    return availableStaff.filter((m) => {
      if (m.role === 'Admin') {
        return false;
      }
      if (managerOnlyPrimary && m.role === 'Manager' && !(m.departments && m.departments.includes('Operations'))) {
        return false;
      }
      if (primaryAssigneeId && m.id === primaryAssigneeId) {
        return false;
      }
      if (selectedCoAssigneeIds.includes(m.id)) {
        return false;
      }
      return true;
    });
  }, [availableStaff, managerOnlyPrimary, primaryAssigneeId, selectedCoAssigneeIds]);

  const handleAddCoAssignee = (userId: string) => {
    if (!userId || selectedCoAssigneeIds.includes(userId)) return;
    onCoAssigneesChange([...selectedCoAssigneeIds, userId]);
  };

  const handleRemoveCoAssignee = (userId: string) => {
    onCoAssigneesChange(selectedCoAssigneeIds.filter((id) => id !== userId));
  };

  const handleAssignAll = () => {
    const allEligibleIds = availableStaff
      .filter((m) => {
        if (m.role === 'Admin') {
          return false;
        }
        if (managerOnlyPrimary && m.role === 'Manager' && !(m.departments && m.departments.includes('Operations'))) {
          return false;
        }
        if (primaryAssigneeId && m.id === primaryAssigneeId) {
          return false;
        }
        return true;
      })
      .map((m) => m.id);

    const merged = Array.from(new Set([...selectedCoAssigneeIds, ...allEligibleIds]));
    onCoAssigneesChange(merged);
  };

  const staffById = React.useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const s of availableStaff) {
      map.set(s.id, s);
    }
    return map;
  }, [availableStaff]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Primary Assignee Selector (if onPrimaryChange provided) */}
      {onPrimaryChange && (
        <div className="space-y-1">
          <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[#4A4945]" />
            <span>{managerOnlyPrimary ? 'Manager *' : 'Primary Assignee'}</span>
          </label>
          <Select
            value={primaryAssigneeId || 'unassigned'}
            onValueChange={(val) => {
              const newId = val === 'unassigned' ? null : val;
              // If new primary manager was in co-assignees, remove them
              if (newId && selectedCoAssigneeIds.includes(newId)) {
                onCoAssigneesChange(selectedCoAssigneeIds.filter((id) => id !== newId));
              }
              onPrimaryChange(newId);
            }}
            disabled={disabled}
          >
            <SelectTrigger
              className="w-full h-9 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none font-mono text-xs text-[#0A0A0A]"
              data-testid="assigner-primary-select"
            >
              <SelectValue placeholder={managerOnlyPrimary ? 'Select Manager' : 'Select Assignee'} />
            </SelectTrigger>
            <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
              <SelectItem value="unassigned" className="font-mono text-xs">— Unassigned —</SelectItem>
              {primaryCandidates.map((m) => (
                <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                  {m.name} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Co-Assignees / Team Members Section */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-[#4A4945]" />
            <span>Team Members (Co-Assignees)</span>
          </label>
          {eligibleCoAssignees.length > 0 && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleAssignAll}
              data-testid="assigner-assign-all-btn"
              className="text-xs font-mono text-[#0A0A0A] hover:text-[#E61919] hover:bg-transparent h-6 px-1.5 underline underline-offset-2"
            >
              Assign all ({eligibleCoAssignees.length})
            </Button>
          )}
        </div>

        {/* Selected Chips */}
        {selectedCoAssigneeIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 p-2 bg-[#EAE8E3] rounded-none border border-[#0A0A0A] min-h-9 items-center">
            {selectedCoAssigneeIds.map((id) => {
              const member = staffById.get(id);
              const displayName = member?.name || id;
              return (
                <Badge
                  key={id}
                  variant="secondary"
                  size="compact"
                  className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-[#FAF9F5] border border-[#0A0A0A] text-[#0A0A0A] rounded-none font-mono text-xs"
                  data-testid={`assigner-coassignee-chip-${id}`}
                >
                  <span className="text-xs truncate max-w-36">{displayName}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCoAssignee(id)}
                      className="text-[#4A4945] hover:text-[#E61919] rounded-none p-0.5 focus:outline-none"
                      aria-label={`Remove ${displayName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              );
            })}
          </div>
        ) : (
          <div className="text-xs font-mono text-[#4A4945] italic py-1">No co-assignees selected.</div>
        )}

        {/* Add Co-Assignee Dropdown */}
        {!disabled && eligibleCoAssignees.length > 0 && (
          <Select value="" onValueChange={handleAddCoAssignee}>
            <SelectTrigger
              className="w-full h-8 text-xs font-mono bg-[#FAF9F5] border border-[#0A0A0A] text-[#4A4945] rounded-none"
              data-testid="assigner-coassignee-select"
            >
              <SelectValue placeholder="+ Add team member..." />
            </SelectTrigger>
            <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
              {eligibleCoAssignees.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                  {m.name} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Attribution Display */}
      {attribution?.assignedByName && (
        <div
          className="text-xs font-mono text-[#4A4945] pt-0.5"
          data-testid="assigner-attribution"
        >
          Assigned by {attribution.assignedByName}
          {attribution.assignedAt
            ? ` on ${new Date(attribution.assignedAt).toLocaleDateString()}`
            : ''}
        </div>
      )}
    </div>
  );
}
