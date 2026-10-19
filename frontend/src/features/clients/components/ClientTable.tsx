import { Eye, Edit3, Archive, RotateCcw, FolderOpen, Building, CheckCircle, Mail, Phone } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/lib/permissions';
import type { Client } from '../api/types';

export interface ClientTableProps {
  clients: Client[];
  isLoading: boolean;
  onView: (client: Client) => void;
  onEdit: (client: Client) => void;
  onArchive: (client: Client) => void;
  onRestore: (client: Client) => void;
}

export function ClientTable({
  clients,
  isLoading,
  onView,
  onEdit,
  onArchive,
  onRestore,
}: ClientTableProps) {
  const canEditClients = usePermission('clients:edit');

  if (isLoading) {
    return (
      <div className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5] p-8 text-center" data-testid="clients-table-loading">
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="h-6 w-6 animate-spin rounded-none border-2 border-[#0A0A0A] border-t-transparent" />
          <p className="text-xs font-mono text-[#4A4945] uppercase tracking-wider">Loading client directory...</p>
        </div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div
        className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5] p-12 text-center"
        data-testid="clients-empty-state"
      >
        <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
          <div className="p-3 bg-[#EAE8E3] rounded-none border border-[#0A0A0A] text-[#0A0A0A]">
            <FolderOpen className="h-8 w-8" />
          </div>
          <h3 className="font-bold text-sm text-[#0A0A0A] uppercase tracking-wider">No clients found</h3>
          <p className="text-xs font-mono text-[#4A4945]">
            No client records match your current filter parameters or tab selection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5] overflow-hidden" data-testid="clients-table-container">
      <Table data-testid="clients-table">
        <TableHeader>
          <TableRow className="bg-[#EAE8E3] border-b-2 border-[#0A0A0A] hover:bg-[#EAE8E3]">
            <TableHead className="font-mono font-bold uppercase tracking-wider text-xs text-[#0A0A0A] w-1/4">Client Name</TableHead>
            <TableHead className="font-mono font-bold uppercase tracking-wider text-xs text-[#0A0A0A]">TIN & RDO</TableHead>
            <TableHead className="font-mono font-bold uppercase tracking-wider text-xs text-[#0A0A0A]">Entity</TableHead>
            <TableHead className="font-mono font-bold uppercase tracking-wider text-xs text-[#0A0A0A]">Agreement</TableHead>
            <TableHead className="font-mono font-bold uppercase tracking-wider text-xs text-[#0A0A0A]">Contact</TableHead>
            <TableHead className="font-mono font-bold uppercase tracking-wider text-xs text-[#0A0A0A] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => {
            const isArchived = client.status === 'Archived' || Boolean(client.deletedAt);
            const primaryEmail = client.contactDetails?.find((c) => c.type === 'email')?.value;
            const primaryPhone = client.contactDetails?.find((c) => c.type === 'mobile' || c.type === 'phone')?.value;

            return (
              <TableRow
                key={client.id}
                className="hover:bg-[#E4E2DC] cursor-pointer transition-none border-b border-[#C8C5BC]"
                onClick={() => onView(client)}
                data-testid={`client-row-${client.id}`}
              >
                {/* Name & Trade Name */}
                <TableCell className="py-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs text-[#0A0A0A] flex items-center gap-1.5">
                      <Building className="h-3.5 w-3.5 text-[#4A4945] shrink-0" />
                      <span className="truncate" data-testid={`client-name-${client.id}`}>
                        {client.name}
                      </span>
                    </div>
                    {client.tradeName && (
                      <p className="text-xs font-mono text-[#4A4945] pl-5 truncate">
                        DBA: {client.tradeName}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* TIN & RDO */}
                <TableCell className="py-3">
                  <div className="text-xs font-mono text-[#0A0A0A] tabular-nums font-semibold" data-testid={`client-tin-${client.id}`}>
                    {client.tin}
                  </div>
                  {client.rdoCode && (
                    <div className="text-xs font-mono text-[#4A4945] mt-0.5">
                      RDO {client.rdoCode}
                    </div>
                  )}
                </TableCell>

                {/* Entity */}
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={`text-xs font-mono font-bold uppercase tracking-wider rounded-none px-2 py-0.5 ${
                      client.entity === 'ATA'
                        ? 'bg-[#0A0A0A] text-[#FAF9F5] border-[#0A0A0A]'
                        : 'bg-[#EAE8E3] text-[#0A0A0A] border-[#0A0A0A]'
                    }`}
                    data-testid={`client-entity-${client.id}`}
                  >
                    {client.entity}
                  </Badge>
                </TableCell>

                {/* Agreement / Retainer */}
                <TableCell className="py-3">
                  {client.retainer ? (
                    <div className="space-y-0.5">
                      <Badge
                        variant="secondary"
                        className="bg-[#0A0A0A] text-[#FAF9F5] border border-[#0A0A0A] rounded-none text-xs font-mono font-bold uppercase flex items-center gap-1 w-fit"
                        data-testid={`client-retainer-badge-${client.id}`}
                      >
                        <CheckCircle className="h-3 w-3 text-[#FAF9F5]" />
                        Retainer
                      </Badge>
                      {client.retainerFee !== null && client.retainerFee !== undefined && (
                        <div className="text-xs text-[#0A0A0A] font-mono tabular-nums">
                          ₱{client.retainerFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
                        </div>
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs font-mono uppercase rounded-none text-[#4A4945] border-[#C8C5BC] bg-transparent">
                      Standard
                    </Badge>
                  )}
                </TableCell>

                {/* Contact */}
                <TableCell className="py-3">
                  <div className="space-y-0.5 text-xs text-[#0A0A0A]">
                    {client.contactPerson && (
                      <div className="font-semibold truncate">{client.contactPerson}</div>
                    )}
                    {primaryEmail && (
                      <div className="flex items-center gap-1 text-xs font-mono text-[#4A4945] truncate">
                        <Mail className="h-3 w-3 text-[#4A4945] shrink-0" />
                        <span className="truncate">{primaryEmail}</span>
                      </div>
                    )}
                    {!primaryEmail && primaryPhone && (
                      <div className="flex items-center gap-1 text-xs font-mono text-[#4A4945] truncate">
                        <Phone className="h-3 w-3 text-[#4A4945] shrink-0" />
                        <span className="truncate">{primaryPhone}</span>
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* Actions */}
                <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {/* View Details */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onView(client)}
                      className="h-8 w-8 p-0 rounded-none text-[#0A0A0A] hover:bg-[#EAE8E3] hover:border hover:border-[#0A0A0A]"
                      data-testid={`view-client-btn-${client.id}`}
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    {/* Edit Client (gated on clients:edit) */}
                    {canEditClients && !isArchived && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(client)}
                        className="h-8 w-8 p-0 rounded-none text-[#0A0A0A] hover:bg-[#EAE8E3] hover:border hover:border-[#0A0A0A]"
                        data-testid={`edit-client-btn-${client.id}`}
                        title="Edit Client"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Archive / Restore Button (gated on clients:edit) */}
                    {canEditClients && (
                      isArchived ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRestore(client)}
                          className="h-8 w-8 p-0 rounded-none text-[#0A0A0A] hover:bg-[#EAE8E3] hover:border hover:border-[#0A0A0A]"
                          data-testid={`restore-client-btn-${client.id}`}
                          title="Restore Client"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onArchive(client)}
                          className="h-8 w-8 p-0 rounded-none text-[#E61919] hover:bg-[#EAE8E3] hover:border hover:border-[#E61919]"
                          data-testid={`archive-client-btn-${client.id}`}
                          title="Archive Client"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      )
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
