import { Search, RotateCcw, Building2, Archive, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ClientFilters, ClientCounts } from '../api/types';

export interface ClientFilterBarProps {
  filters: ClientFilters;
  counts?: ClientCounts;
  onFilterChange: (newFilters: Partial<ClientFilters>) => void;
  onReset: () => void;
  activeTab: 'active' | 'archived';
  onTabChange: (tab: 'active' | 'archived') => void;
}

export function ClientFilterBar({
  filters,
  counts,
  onFilterChange,
  onReset,
  activeTab,
  onTabChange,
}: ClientFilterBarProps) {
  return (
    <div className="space-y-3" data-testid="clients-filter-bar">
      {/* Architectural Tab Strip: Active vs Archived */}
      <div className="w-full justify-start rounded-none bg-[#EAE8E3] p-0 border border-[#0A0A0A] border-b-2 flex flex-nowrap overflow-x-auto gap-0">
        <button
          type="button"
          onClick={() => onTabChange('active')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-none border-r border-[#C8C5BC] font-mono text-xs font-semibold tracking-wider px-4 py-2.5 transition-colors cursor-pointer shrink-0 select-none ${
            activeTab === 'active'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] shadow-[inset_0_-3px_0_0_#E61919]'
              : 'text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A]'
          }`}
          data-testid="clients-tab-active"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
          <span>Active Clients</span>
          {counts !== undefined && (
            <span
              className={`ml-2 px-1.5 py-0 text-xs font-mono rounded-none border tabular-nums ${
                activeTab === 'active'
                  ? 'bg-[#0A0A0A] text-[#FAF9F5] border-[#FAF9F5]'
                  : 'bg-[#EAE8E3] text-[#0A0A0A] border-[#0A0A0A]'
              }`}
              data-testid="clients-count-active"
            >
              {counts.active}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('archived')}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-none border-r border-[#C8C5BC] font-mono text-xs font-semibold tracking-wider px-4 py-2.5 transition-colors cursor-pointer shrink-0 select-none ${
            activeTab === 'archived'
              ? 'bg-[#0A0A0A] text-[#FAF9F5] shadow-[inset_0_-3px_0_0_#E61919]'
              : 'text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A]'
          }`}
          data-testid="clients-tab-archived"
        >
          <Archive className="h-3.5 w-3.5 mr-2" />
          <span>Archived Clients</span>
          {counts !== undefined && (
            <span
              className={`ml-2 px-1.5 py-0 text-xs font-mono rounded-none border tabular-nums ${
                activeTab === 'archived'
                  ? 'bg-[#0A0A0A] text-[#FAF9F5] border-[#FAF9F5]'
                  : 'bg-[#EAE8E3] text-[#0A0A0A] border-[#0A0A0A]'
              }`}
              data-testid="clients-count-archived"
            >
              {counts.archived}
            </span>
          )}
        </button>
      </div>

      {/* Filter controls row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#4A4945]" />
          <Input
            type="text"
            placeholder="Search by client name, TIN, or trade name..."
            value={filters.search ?? ''}
            onChange={(e) => onFilterChange({ search: e.target.value, page: 1 })}
            className="pl-8 text-xs h-9 bg-[#FFFFFF] rounded-none border border-[#111111]"
            data-testid="clients-search-input"
          />
        </div>

        {/* Retainer Filter */}
        <div className="w-full sm:w-44">
          <Select
            value={filters.retainer === true ? 'retainer' : filters.retainer === false ? 'non-retainer' : 'all'}
            onValueChange={(val) => {
              if (val === 'retainer') onFilterChange({ retainer: true, page: 1 });
              else if (val === 'non-retainer') onFilterChange({ retainer: false, page: 1 });
              else onFilterChange({ retainer: undefined, page: 1 });
            }}
          >
            <SelectTrigger className="text-xs h-9 bg-[#FFFFFF] rounded-none border border-[#111111]" data-testid="clients-retainer-select">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]">
              <SelectItem value="all" className="rounded-none">All Retainer Types</SelectItem>
              <SelectItem value="retainer" className="rounded-none">Retainer Clients Only</SelectItem>
              <SelectItem value="non-retainer" className="rounded-none">Non-Retainer Clients</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Entity Filter (when needed) */}
        {filters.entity !== undefined && (
          <div className="w-full sm:w-36">
            <Select
              value={filters.entity ?? 'ALL'}
              onValueChange={(val) => onFilterChange({ entity: val === 'ALL' ? undefined : val, page: 1 })}
            >
              <SelectTrigger className="text-xs h-9 bg-[#FFFFFF] rounded-none border border-[#111111]" data-testid="clients-entity-select">
                <Building2 className="h-3.5 w-3.5 mr-1 text-[#4A4945]" />
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]">
                <SelectItem value="ALL" className="rounded-none">All Entities</SelectItem>
                <SelectItem value="ATA" className="rounded-none">ATA</SelectItem>
                <SelectItem value="LTA" className="rounded-none">LTA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Reset Filter Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReset}
          className="text-xs font-mono font-semibold h-9 text-[#0A0A0A] hover:bg-[#EAE8E3] bg-[#FAF9F5] rounded-none border border-[#0A0A0A] cursor-pointer"
          data-testid="clients-reset-filters-btn"
          title="Reset Filters"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Reset
        </Button>
      </div>
    </div>
  );
}
