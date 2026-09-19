'use client';

/**
 * Researcher view for the self-hosted ML backend's data pipeline: pending
 * training candidates (approve/reject) and model manifest promotion.
 *
 * No additional auth layer here beyond the proxy routes' server-held
 * RESEARCHER_API_KEY -- this page is meant to run from the presenter's own
 * local dev server during a demo, not as a public deployment. See
 * src/lib/server/mlBackendClient.ts.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, RefreshCw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Mirrors the shape of a loaded candidate/manifest row, so the list doesn't jump. */
function ListRowSkeleton() {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

interface TrainingCandidate {
  id: string;
  jobId: string;
  status: string;
  createdAt: string;
}

interface ManifestRegistry {
  activeAlias: string;
  manifests: Record<string, { id: string; fusionVersion: string; vectorizerVersion: string }>;
}

export default function ResearchPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<TrainingCandidate[] | null>(null);
  const [manifests, setManifests] = useState<ManifestRegistry | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [candidatesRes, manifestsRes] = await Promise.all([
        fetch('/api/ml-backend/research/training-candidates', { cache: 'no-store' }),
        fetch('/api/ml-backend/research/manifests', { cache: 'no-store' }),
      ]);
      const candidatesBody = await candidatesRes.json();
      const manifestsBody = await manifestsRes.json();
      if (!candidatesRes.ok) throw new Error(candidatesBody.error ?? 'Unable to load training candidates.');
      if (!manifestsRes.ok) throw new Error(manifestsBody.error ?? 'Unable to load manifests.');
      setCandidates(candidatesBody);
      setManifests(manifestsBody);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load research data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/ml-backend/research/training-candidates/${id}/${decision}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to update candidate.');
      toast.success(`Candidate ${decision}d.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update candidate.');
    } finally {
      setBusyId(null);
    }
  };

  const promote = async (manifestId: string) => {
    setBusyId(manifestId);
    try {
      const response = await fetch('/api/ml-backend/research/manifests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifestId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Unable to promote manifest.');
      toast.success(`Promoted ${manifestId}.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to promote manifest.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f2efe7] px-6 py-8 text-[#26221a]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a806e]">Corbel Research</p>
            <h1 className="mt-2 font-display text-3xl">ML backend pipeline</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f685b]">
              Review participant corrections submitted for training, and promote model manifests.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button variant="outline" onClick={() => router.push('/')}>
              <ArrowLeft /> Home
            </Button>
          </div>
        </div>

        <section className="mb-6 overflow-hidden rounded-2xl border border-[#d7d0c2] bg-white/80 shadow-sm">
          <div className="border-b border-[#e3ddd2] px-5 py-4">
            <h2 className="text-sm font-semibold">Pending training candidates</h2>
          </div>
          <div className="divide-y divide-[#e3ddd2]">
            {candidates === null && (
              <>
                <ListRowSkeleton />
                <ListRowSkeleton />
                <ListRowSkeleton />
              </>
            )}
            {candidates?.length === 0 && <p className="px-5 py-6 text-sm text-[#655e52]">No pending corrections.</p>}
            {candidates?.map((candidate) => (
              <div key={candidate.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium">Correction {candidate.id.slice(0, 8)}</p>
                  <p className="mt-0.5 text-xs text-[#655e52]">
                    Job {candidate.jobId.slice(0, 8)} · {new Date(candidate.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" disabled={busyId === candidate.id} onClick={() => decide(candidate.id, 'approve')}>
                    <Check size={14} /> Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === candidate.id} onClick={() => decide(candidate.id, 'reject')}>
                    <X size={14} /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#d7d0c2] bg-white/80 shadow-sm">
          <div className="border-b border-[#e3ddd2] px-5 py-4">
            <h2 className="text-sm font-semibold">Model manifests</h2>
          </div>
          <div className="divide-y divide-[#e3ddd2]">
            {manifests === null && (
              <>
                <ListRowSkeleton />
                <ListRowSkeleton />
              </>
            )}
            {manifests &&
              Object.values(manifests.manifests).map((manifest) => {
                const active = manifest.id === manifests.activeAlias;
                return (
                  <div key={manifest.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-sm font-medium">
                        {manifest.id} {active && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">ACTIVE</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-[#655e52]">
                        {manifest.fusionVersion} · {manifest.vectorizerVersion}
                      </p>
                    </div>
                    {!active && (
                      <Button size="sm" variant="outline" disabled={busyId === manifest.id} onClick={() => promote(manifest.id)}>
                        Promote
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      </div>
    </main>
  );
}
