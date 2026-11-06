import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Code2,
  Edit3,
  Eye,
  FileCheck2,
  LayoutGrid,
  List,
  Lock,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatIntegrationStatus,
  formatShortDate,
  formatUiLayer,
  IntegrationWithAccess,
  UI_LAYER_OPTIONS,
} from '../lib/api';
import { Category, Developer, GenerationRun, UILayer } from '../shared/types';
import { ProductIcon } from './BrandIcons';

interface CatalogViewProps {
  mode: 'all' | 'mine';
  currentDeveloper: Developer;
  developers: Developer[];
  integrations: IntegrationWithAccess[];
  categories: Category[];
  runs: GenerationRun[];
  viewMode: 'tile' | 'list';
  onChangeViewMode: (next: 'tile' | 'list') => void;
  onAddIntegration: () => void;
  onConfigureDocsOrCapabilities: (integrationId: string) => void;
  onOpenRunWorkbench: (integrationId: string, runId?: string) => void;
  onOpenCodeWorkspace: (integrationId: string, runId: string) => void;
  onUpdateIntegration: (
    integrationId: string,
    patch: { name: string; description: string; categoryId: string; uiLayers?: UILayer[] }
  ) => Promise<void>;
  onDeleteOrArchiveIntegration: (
    integrationId: string,
    actionMode: 'archive' | 'soft_delete'
  ) => Promise<void>;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  mode,
  currentDeveloper,
  developers,
  integrations,
  categories,
  runs,
  viewMode,
  onChangeViewMode,
  onAddIntegration,
  onConfigureDocsOrCapabilities,
  onOpenRunWorkbench,
  onOpenCodeWorkspace,
  onUpdateIntegration,
  onDeleteOrArchiveIntegration,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'system' | 'mine' | 'others'>(
    mode === 'mine' ? 'mine' : 'all'
  );
  const [sortBy, setSortBy] = useState<'name_asc' | 'updated_desc' | 'type'>('name_asc');

  // Modals state
  const [inspectingItem, setInspectingItem] = useState<IntegrationWithAccess | null>(null);
  const [editingItem, setEditingItem] = useState<IntegrationWithAccess | null>(null);
  const [deletingItem, setDeletingItem] = useState<IntegrationWithAccess | null>(null);

  // Edit modal fields
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCatId, setEditCatId] = useState('');
  const [editLayers, setEditLayers] = useState<UILayer[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete modal confirmation
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const scopedBaseList = useMemo(() => {
    if (mode === 'mine') {
      return integrations.filter((i) => !i.isDefault && i.ownerId === currentDeveloper.id);
    }
    return integrations;
  }, [integrations, mode, currentDeveloper.id]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scopedBaseList.length };
    for (const cat of categories) {
      counts[cat.id] = scopedBaseList.filter((i) => i.categoryId === cat.id).length;
    }
    return counts;
  }, [scopedBaseList, categories]);

  const filteredItems = useMemo(() => {
    return scopedBaseList
      .filter((item) => {
        if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) {
          return false;
        }
        if (mode !== 'mine') {
          if (ownershipFilter === 'system' && !item.isDefault) return false;
          if (ownershipFilter === 'mine' && item.ownerId !== currentDeveloper.id) return false;
          if (
            ownershipFilter === 'others' &&
            (item.isDefault || item.ownerId === currentDeveloper.id)
          ) {
            return false;
          }
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const catName =
            categories.find((c) => c.id === item.categoryId)?.name.toLowerCase() ?? '';
          const ownerName =
            developers.find((d) => d.id === item.ownerId)?.name.toLowerCase() ?? 'cloudeagle';
          const hay = `${item.name} ${item.description} ${catName} ${ownerName} ${(item.uiLayers ?? []).join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name_asc') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'updated_desc') {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        if (a.isDefault !== b.isDefault) {
          return a.isDefault ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [
    scopedBaseList,
    selectedCategoryId,
    mode,
    ownershipFilter,
    currentDeveloper.id,
    searchQuery,
    categories,
    developers,
    sortBy,
  ]);

  const openEditModal = (item: IntegrationWithAccess) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditDesc(item.description);
    setEditCatId(item.categoryId);
    setEditLayers(item.uiLayers ? [...item.uiLayers] : []);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await onUpdateIntegration(editingItem.id, {
        name: editName,
        description: editDesc,
        categoryId: editCatId,
        uiLayers: editLayers,
      });
      setEditingItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update integration.');
    } finally {
      setEditSaving(false);
    }
  };

  const openDeleteModal = (item: IntegrationWithAccess) => {
    setDeletingItem(item);
    setConfirmDeleteText('');
    setDeleteError(null);
  };

  const handleConfirmArchiveOrDelete = async (actionMode: 'archive' | 'soft_delete') => {
    if (!deletingItem) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await onDeleteOrArchiveIntegration(deletingItem.id, actionMode);
      setDeletingItem(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const getCategoryName = (catId: string) =>
    categories.find((c) => c.id === catId)?.name ?? 'Uncategorized';

  const getOwnerLabel = (item: IntegrationWithAccess) => {
    if (item.isDefault || item.sourceType === 'system') {
      return 'System Default';
    }
    const owner = developers.find((d) => d.id === item.ownerId);
    return owner ? `${owner.name}${owner.id === currentDeveloper.id ? ' (You)' : ''}` : 'Custom';
  };

  const getActiveDependencyRun = (integrationId: string) =>
    runs.find(
      (r) =>
        r.integrationId === integrationId &&
        (r.status === 'running' || r.status === 'queued' || r.status === 'awaiting_approval')
    );

  return (
    <div className="space-y-6">
      {/* Page Title & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {mode === 'mine' ? 'My Custom Integrations' : 'Integration Catalog'}
          </h1>
          <p className="text-sm text-slate-600">
            {mode === 'mine'
              ? `Custom integrations owned by ${currentDeveloper.name}. Creator-owned items support full configuration, editing, and archiving.`
              : 'Browse immutable CloudEagle system references and developer-owned custom connectors. Scheduling is ready for your custom Calendly connector.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onAddIntegration}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus size={15} />
          Add Integration
        </button>
      </div>

      {/* Interactive Category Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-full sm:w-72">
              <label htmlFor="catalog-category-dropdown" className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <select
                id="catalog-category-dropdown"
                aria-label="Filter integrations by category"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600 cursor-pointer"
              >
                <option value="all">
                  All Categories ({categoryCounts.all ?? 0})
                </option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({categoryCounts[cat.id] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-5 hidden sm:block text-xs font-semibold text-slate-500 whitespace-nowrap">
              Showing <span className="font-bold text-slate-900">{filteredItems.length}</span> {filteredItems.length === 1 ? 'integration' : 'integrations'}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-end">
            {(searchQuery || selectedCategoryId !== 'all' || ownershipFilter !== (mode === 'mine' ? 'mine' : 'all')) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                  setOwnershipFilter(mode === 'mine' ? 'mine' : 'all');
                }}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Search, Ownership, Sort & Tile/List View Switcher */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              aria-label="Search integrations"
              placeholder="Search by name, capability, category, or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {mode !== 'mine' && (
              <div>
                <label htmlFor="ownership-filter" className="sr-only">
                  Ownership Filter
                </label>
                <select
                  id="ownership-filter"
                  aria-label="Filter by ownership"
                  value={ownershipFilter}
                  onChange={(e) =>
                    setOwnershipFilter(e.target.value as 'all' | 'system' | 'mine' | 'others')
                  }
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  <option value="all">Ownership: All</option>
                  <option value="system">System Default (Locked)</option>
                  <option value="mine">Owned by {currentDeveloper.name.split(' ')[0]}</option>
                  <option value="others">Owned by Other Developers</option>
                </select>
              </div>
            )}

            <div>
              <label htmlFor="catalog-sort" className="sr-only">
                Sort integrations
              </label>
              <select
                id="catalog-sort"
                aria-label="Sort integrations"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'name_asc' | 'updated_desc' | 'type')
                }
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                <option value="name_asc">Sort: Name (A–Z)</option>
                <option value="updated_desc">Sort: Last Modified</option>
                <option value="type">Sort: Custom First</option>
              </select>
            </div>

            {/* Persisted Tile / List Segmented Toggle */}
            <div
              className="flex items-center p-1 bg-slate-100 rounded-lg"
              role="group"
              aria-label="Catalog layout view"
            >
              <button
                type="button"
                aria-label="Tile view"
                aria-pressed={viewMode === 'tile'}
                onClick={() => onChangeViewMode('tile')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'tile'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid size={13} />
                Tile
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                onClick={() => onChangeViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List size={13} />
                List
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            {selectedCategoryId === 'cat-scheduling'
              ? 'No completed Scheduling integrations in catalog yet'
              : 'No integrations match your current filters'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {selectedCategoryId === 'cat-scheduling'
              ? 'Calendly is intentionally unseeded so you can create, validate, and generate it end-to-end in this workspace.'
              : 'Adjust your search query or ownership filter, or create a new custom integration.'}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            {(searchQuery || selectedCategoryId !== 'all' || ownershipFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                  setOwnershipFilter(mode === 'mine' ? 'mine' : 'all');
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Reset Filters
              </button>
            )}
            <button
              type="button"
              onClick={onAddIntegration}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Add Integration
            </button>
          </div>
        </div>
      ) : viewMode === 'tile' ? (
        /* TILE VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredItems.map((item) => {
            const latestRun = runs.find((r) => r.id === item.latestRunId);
            return (
              <article
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  {/* Card Top: Product Icon + Title + Lock/Ownership */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ProductIcon iconKey={item.iconKey} name={item.name} size="md" />
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-slate-900 truncate">
                          {item.name}
                        </h2>
                        {/* Clean inline unboxed metadata */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span>{getCategoryName(item.categoryId)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">v{item.version}</span>
                        </div>
                      </div>
                    </div>

                    {item.isDefault ? (
                      <span
                        title="Managed by CloudEagle: view only."
                        className="inline-flex items-center gap-1 text-xs text-slate-500 shrink-0"
                      >
                        <Lock size={13} className="text-slate-400" />
                        <span>View only</span>
                      </span>
                    ) : (
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          item.access.canEdit ? 'text-sky-700' : 'text-slate-500'
                        }`}
                      >
                        {item.access.canEdit ? 'Owner' : 'View only'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>

                  {/* Unboxed Metadata Details */}
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-700 font-medium">
                        {formatIntegrationStatus(item.status)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{getOwnerLabel(item)}</span>
                    </div>
                    <div className="tabular-nums">
                      Modified {formatShortDate(item.updatedAt)}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-label={`View ${item.name} details`}
                    onClick={() => setInspectingItem(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                  >
                    <Eye size={13} />
                    Details
                  </button>

                  {!item.isDefault && (
                    <div className="flex items-center gap-1.5">
                      {item.access.canEdit ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Configure ${item.name} docs and model`}
                            onClick={() => onConfigureDocsOrCapabilities(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors whitespace-nowrap"
                          >
                            <FileCheck2 size={13} />
                            {item.status === 'draft' ? 'Validate Docs' : 'Configure'}
                          </button>

                          {latestRun && (
                            <button
                              type="button"
                              aria-label={`Open ${item.name} run workbench`}
                              onClick={() => onOpenRunWorkbench(item.id, latestRun.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap"
                            >
                              <Play size={13} />
                              Run
                            </button>
                          )}

                          {latestRun && latestRun.checkpointVersion >= 5 && (
                            <button
                              type="button"
                              aria-label={`Open ${item.name} code workspace`}
                              onClick={() => onOpenCodeWorkspace(item.id, latestRun.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 rounded-md transition-colors whitespace-nowrap"
                            >
                              <Code2 size={13} />
                              Code
                            </button>
                          )}

                          <button
                            type="button"
                            aria-label={`Edit ${item.name} metadata`}
                            onClick={() => openEditModal(item)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>

                          <button
                            type="button"
                            aria-label={`Archive or delete ${item.name}`}
                            onClick={() => openDeleteModal(item)}
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {latestRun && latestRun.checkpointVersion >= 5 && (
                            <button
                              type="button"
                              aria-label={`Inspect ${item.name} code read-only`}
                              onClick={() => onOpenCodeWorkspace(item.id, latestRun.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap"
                            >
                              <Code2 size={13} />
                              View Code
                            </button>
                          )}
                          <span
                            title={item.access.reason}
                            className="text-xs text-slate-400 inline-flex items-center gap-1"
                          >
                            <Lock size={12} />
                            Read-only
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Integration</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Owner / Source</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Modified</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredItems.map((item) => {
                const latestRun = runs.find((r) => r.id === item.latestRunId);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <ProductIcon iconKey={item.iconKey} name={item.name} size="sm" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.isDefault && (
                              <Lock
                                size={12}
                                className="text-slate-400"
                                aria-label="Managed by CloudEagle: view only"
                              />
                            )}
                          </div>
                          <p className="text-slate-500 truncate max-w-xs">{item.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {getCategoryName(item.categoryId)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {getOwnerLabel(item)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {formatIntegrationStatus(item.status)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 tabular-nums whitespace-nowrap">
                      {formatShortDate(item.updatedAt)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`View ${item.name} details`}
                          onClick={() => setInspectingItem(item)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          Details
                        </button>
                        {!item.isDefault &&
                          (item.access.canEdit ? (
                            <>
                              <button
                                type="button"
                                aria-label={`Configure ${item.name}`}
                                onClick={() => onConfigureDocsOrCapabilities(item.id)}
                                className="px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
                              >
                                {item.status === 'draft' ? 'Validate Docs' : 'Configure'}
                              </button>
                              {latestRun && (
                                <button
                                  type="button"
                                  aria-label={`Supervise ${item.name} run`}
                                  onClick={() => onOpenRunWorkbench(item.id, latestRun.id)}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                                >
                                  Run
                                </button>
                              )}
                              {latestRun && latestRun.checkpointVersion >= 5 && (
                                <button
                                  type="button"
                                  aria-label={`Open ${item.name} code workspace`}
                                  onClick={() => onOpenCodeWorkspace(item.id, latestRun.id)}
                                  className="px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                                >
                                  Code
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`Edit ${item.name} metadata`}
                                onClick={() => openEditModal(item)}
                                className="p-1 text-slate-500 hover:text-slate-900 rounded"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${item.name}`}
                                onClick={() => openDeleteModal(item)}
                                className="p-1 text-slate-500 hover:text-rose-700 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              {latestRun && latestRun.checkpointVersion >= 5 && (
                                <button
                                  type="button"
                                  aria-label={`Inspect ${item.name} code read-only`}
                                  onClick={() => onOpenCodeWorkspace(item.id, latestRun.id)}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                                >
                                  View Code
                                </button>
                              )}
                              <span
                                title={item.access.reason}
                                className="text-xs text-slate-400 inline-flex items-center gap-1 pl-1"
                              >
                                <Lock size={12} />
                                Read-only
                              </span>
                            </>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* System / Custom Details Inspection Modal */}
      {inspectingItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <ProductIcon
                  iconKey={inspectingItem.iconKey}
                  name={inspectingItem.name}
                  size="lg"
                />
                <div>
                  <h2 id="detail-modal-title" className="text-lg font-bold text-slate-900">
                    {inspectingItem.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {getCategoryName(inspectingItem.categoryId)} · Version v
                    {inspectingItem.version} · {formatIntegrationStatus(inspectingItem.status)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close integration details"
                onClick={() => setInspectingItem(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">{inspectingItem.description}</p>

            {/* Governance / Access Notice */}
            <div
              className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                inspectingItem.access.canEdit
                  ? 'bg-sky-50/70 border-sky-200 text-sky-900'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              <Lock size={15} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">
                  {inspectingItem.isDefault
                    ? 'Managed by CloudEagle: view only'
                    : inspectingItem.access.canEdit
                    ? `Owned by ${currentDeveloper.name}`
                    : 'Read-Only Access (Owned by another developer)'}
                </p>
                <p>{inspectingItem.access.reason}</p>
                {inspectingItem.isDefault && (
                  <p className="text-slate-500">
                    Note: System catalog entries illustrate platform connector metadata and are not
                    claimed as live connected customer tenants in this developer workspace.
                  </p>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs border-t border-slate-200 pt-4">
              <div>
                <dt className="text-slate-500">Source Type</dt>
                <dd className="font-medium text-slate-900 mt-0.5">{inspectingItem.sourceType}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {getCategoryName(inspectingItem.categoryId)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-slate-900 mt-0.5 tabular-nums">
                  {formatShortDate(inspectingItem.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Last Updated</dt>
                <dd className="font-medium text-slate-900 mt-0.5 tabular-nums">
                  {formatShortDate(inspectingItem.updatedAt)}
                </dd>
              </div>
            </dl>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
              {!inspectingItem.isDefault && inspectingItem.access.canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const id = inspectingItem.id;
                    setInspectingItem(null);
                    onConfigureDocsOrCapabilities(id);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors"
                >
                  Open Configuration &amp; Docs
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Custom Integration Metadata Modal */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-modal-title"
        >
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 id="edit-modal-title" className="text-lg font-bold text-slate-900">
                Edit Integration Metadata
              </h2>
              <button
                type="button"
                aria-label="Cancel editing"
                onClick={() => setEditingItem(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>
                Changing category/UI layer is metadata-only; changing API docs or schema may
                require regeneration.
              </span>
            </div>

            {editError && (
              <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                {editError}
              </div>
            )}

            <div>
              <label htmlFor="edit-int-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Integration Name
              </label>
              <input
                id="edit-int-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="edit-int-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                Short Description
              </label>
              <textarea
                id="edit-int-desc"
                rows={2}
                required
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="edit-int-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <select
                id="edit-int-cat"
                value={editCatId}
                onChange={(e) => setEditCatId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Two-Step Destructive Archive / Soft-Delete Dialog */}
      {deletingItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 id="delete-modal-title" className="text-lg font-bold text-slate-900">
                  Archive or Soft-Delete “{deletingItem.name}”
                </h2>
                <p className="text-xs text-slate-600">
                  Saved drafts, runs, and generated files will be removed from the active catalog,
                  while immutable audit logs are retained.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cancel deletion"
                onClick={() => setDeletingItem(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X size={16} />
              </button>
            </div>

            {getActiveDependencyRun(deletingItem.id) && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
                Active run{' '}
                <code className="font-mono">{getActiveDependencyRun(deletingItem.id)?.id}</code> is
                in progress. Direct delete is blocked while a run is active—cancel the run first or
                choose <strong>Archive Integration</strong>.
              </div>
            )}

            {deleteError && (
              <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
                {deleteError}
              </div>
            )}

            <div>
              <label
                htmlFor="confirm-delete-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Type <span className="font-mono text-slate-900">{deletingItem.name}</span> to
                enable Soft-Delete:
              </label>
              <input
                id="confirm-delete-input"
                type="text"
                value={confirmDeleteText}
                onChange={(e) => setConfirmDeleteText(e.target.value)}
                placeholder={deletingItem.name}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => handleConfirmArchiveOrDelete('archive')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg"
              >
                <Archive size={13} />
                Archive Integration
              </button>
              <button
                type="button"
                disabled={
                  deleteBusy ||
                  confirmDeleteText.trim() !== deletingItem.name ||
                  Boolean(getActiveDependencyRun(deletingItem.id))
                }
                onClick={() => handleConfirmArchiveOrDelete('soft_delete')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-40"
              >
                <Trash2 size={13} />
                Confirm Soft-Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
