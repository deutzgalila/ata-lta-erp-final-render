import { useState, useMemo } from 'react';
import {
  RotateCcw,
  Search,
  Eye,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ArchiveConfirmModal } from './ArchiveConfirmModal';
import { useWorkRequests } from '../api/useWorkRequests';
import type { WorkRequest } from '../api/types';

export interface OperationsArchiveTabProps {
  onRestoreWr?: (wr: WorkRequest) => void;
  onViewWr?: (wr: WorkRequest) => void;
}

export function OperationsArchiveTab({
  onRestoreWr,
  onViewWr,
}: OperationsArchiveTabProps) {
  const [category, setCategory] = useState<'All' | 'Completed' | 'Cancelled'>('All');
  const [search, setSearch] = useState('');
  const [restoreTargetWr, setRestoreTargetWr] = useState<WorkRequest | null>(null);

  // Queries archived work requests
  const { data: rawArchived, isLoading, refetch } = useWorkRequests({
    archived: true,
  });
  const archivedRequests: WorkRequest[] = useMemo(() => {
    if (Array.isArray(rawArchived)) return rawArchived;
    return rawArchived?.data ?? [];
  }, [rawArchived]);

  // Filter by category and search
  const filteredList = useMemo(() => {
    return archivedRequests.filter((wr) => {
      // Category filter
      if (category === 'Completed' && wr.status !== 'Completed') return false;
      if (category === 'Cancelled' && wr.status !== 'Cancelled') return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const titleMatch = wr.title.toLowerCase().includes(q);
        const clientMatch = wr.clientName?.toLowerCase().includes(q) || false;
        if (!titleMatch && !clientMatch) return false;
      }

      return true;
    });
  }, [archivedRequests, category, search]);

  const handleOpenRestore = (wr: WorkRequest) => {
    if (onRestoreWr) {
      onRestoreWr(wr);
    } else {
      setRestoreTargetWr(wr);
    }
  };

  return (
    <div className="space-y-4" data-testid="operations-archive-tab">
      {/* Header controls: Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-[#FAF9F5] border-2 border-[#0A0A0A] rounded-none">
        {/* Category buttons */}
        <div className="flex items-center gap-1.5" data-testid="archive-category-filters">
          <Button
            type="button"
            variant={category === 'All' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory('All')}
            className={`text-xs font-mono uppercase tracking-wider rounded-none ${
              category === 'All'
                ? 'bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#0A0A0A]'
                : 'border border-[#0A0A0A] bg-[#EAE8E3] text-[#0A0A0A] hover:bg-[#E4E2DC]'
            }`}
            data-testid="archive-cat-all"
          >
            All Archived ({archivedRequests.length})
          </Button>
          <Button
            type="button"
            variant={category === 'Completed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory('Completed')}
            className={`text-xs font-mono uppercase tracking-wider rounded-none ${
              category === 'Completed'
                ? 'bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#0A0A0A]'
                : 'border border-[#0A0A0A] bg-[#EAE8E3] text-[#0A0A0A] hover:bg-[#E4E2DC]'
            }`}
            data-testid="archive-cat-completed"
          >
            Accomplished
          </Button>
          <Button
            type="button"
            variant={category === 'Cancelled' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory('Cancelled')}
            className={`text-xs font-mono uppercase tracking-wider rounded-none ${
              category === 'Cancelled'
                ? 'bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#0A0A0A]'
                : 'border border-[#0A0A0A] bg-[#EAE8E3] text-[#0A0A0A] hover:bg-[#E4E2DC]'
            }`}
            data-testid="archive-cat-cancelled"
          >
            Cancelled
          </Button>
        </div>

        {/* Search Input */}
        <div className="w-full sm:w-64 relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-[#4A4945]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archive..."
            className="h-8 pl-8 text-xs font-mono bg-[#FAF9F5] border border-[#0A0A0A] rounded-none text-[#0A0A0A] placeholder:text-[#4A4945]"
            data-testid="archive-search-input"
          />
        </div>
      </div>

      {/* Archive Table */}
      <div className="border-2 border-[#0A0A0A] rounded-none bg-[#FAF9F5] overflow-hidden shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#EAE8E3] hover:bg-[#EAE8E3] border-b-2 border-[#0A0A0A]">
              <TableHead className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A] w-1/3">
                Work Request
              </TableHead>
              <TableHead className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A]">Client</TableHead>
              <TableHead className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A]">Entity</TableHead>
              <TableHead className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A]">Priority</TableHead>
              <TableHead className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A]">Status</TableHead>
              <TableHead className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A]">Archived Date</TableHead>
              <TableHead className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A] text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-xs font-mono text-[#4A4945]">
                  Loading archived requests...
                </TableCell>
              </TableRow>
            ) : filteredList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center justify-center space-y-2 text-[#4A4945]">
                    <Archive className="h-8 w-8 text-[#4A4945]/50" />
                    <p className="text-xs font-mono font-medium">No archived work requests found</p>
                    <p className="text-xs font-mono text-[#4A4945]">
                      Completed or cancelled requests will appear here once archived.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredList.map((wr) => (
                <TableRow key={wr.id} className="hover:bg-[#EAE8E3]/60 border-b border-[#C8C5BC]" data-testid={`archive-row-${wr.id}`}>
                  {/* Title */}
                  <TableCell className="font-mono text-xs text-[#0A0A0A]">
                    <div className="flex flex-col">
                      <span className="font-semibold">{wr.title}</span>
                      {wr.description && (
                        <span className="text-xs font-mono text-[#4A4945] truncate max-w-xs">
                          {wr.description}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Client */}
                  <TableCell className="text-xs font-mono text-[#0A0A0A]">
                    {wr.clientName || '—'}
                  </TableCell>

                  {/* Entity */}
                  <TableCell>
                    <Badge variant={wr.entity === 'LTA' ? 'lta' : 'ata'} size="compact" className="rounded-none font-mono text-xs">
                      {wr.entity}
                    </Badge>
                  </TableCell>

                  {/* Priority */}
                  <TableCell>
                    <Badge
                      variant={
                        wr.priority === 'Urgent'
                          ? 'destructive'
                          : wr.priority === 'High'
                            ? 'warning'
                            : 'secondary'
                      }
                      size="compact"
                      className="rounded-none font-mono text-xs"
                    >
                      {wr.priority}
                    </Badge>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge
                      variant={
                        wr.status === 'Completed'
                          ? 'success'
                          : wr.status === 'Cancelled'
                            ? 'destructive'
                            : 'secondary'
                      }
                      size="compact"
                      className="rounded-none font-mono text-xs"
                    >
                      {wr.status}
                    </Badge>
                  </TableCell>

                  {/* Date */}
                  <TableCell className="text-xs font-mono text-[#4A4945]">
                    {wr.updatedAt ? new Date(wr.updatedAt).toLocaleDateString() : '—'}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {onViewWr && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onViewWr(wr)}
                          title="View Details"
                          className="rounded-none text-[#4A4945] hover:text-[#0A0A0A] hover:bg-[#EAE8E3]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleOpenRestore(wr)}
                        className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A] font-mono text-xs uppercase tracking-wider gap-1"
                        data-testid={`restore-btn-${wr.id}`}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Internal Archive Confirm Modal for restore */}
      {restoreTargetWr && (
        <ArchiveConfirmModal
          isOpen={Boolean(restoreTargetWr)}
          actionType="restore"
          workRequest={restoreTargetWr}
          onClose={() => setRestoreTargetWr(null)}
          onSuccess={() => {
            setRestoreTargetWr(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
