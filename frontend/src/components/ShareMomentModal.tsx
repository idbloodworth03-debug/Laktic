import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from './ui';
import {
  ShareCardData,
  ShareCardCanvas,
  renderCardToCanvas,
  uploadShareCard,
  downloadShareCard,
  shareCard,
} from './ShareCardCanvas';

interface Props {
  data: ShareCardData;
  onClose: () => void;
  raceResultId?: string;   // if set, saves share_card_url to race result
  onSharedToCommunity?: () => void;
}

export function ShareMomentModal({ data, onClose, raceResultId, onSharedToCommunity }: Props) {
  const [sharing, setSharing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [shareStatus, setShareStatus] = useState<string>('');
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  // Upload card on mount
  useEffect(() => {
    const safeName = `${data.athleteName}-${data.raceName}`
      .replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60);

    const canvas = renderCardToCanvas(data);
    uploadShareCard(canvas, safeName).then(url => {
      if (url) {
        setCardUrl(url);
        // Save to race result if provided
        if (raceResultId) {
          apiFetch('/api/share-events/race-card', {
            method: 'PATCH',
            body: JSON.stringify({ race_result_id: raceResultId, share_card_url: url }),
          }).catch(() => {});
        }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = () => {
    const safeName = `${data.athleteName}-${data.raceName}`
      .replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60);
    const canvas = renderCardToCanvas(data);
    downloadShareCard(canvas, safeName);
    trackShare('download');
  };

  const handleShare = async () => {
    setSharing(true);
    const canvas = renderCardToCanvas(data);
    const title = data.isPr
      ? `New PR! ${data.finishTime} at ${data.raceName}`
      : `${data.finishTime} at ${data.raceName}`;

    const result = await shareCard(canvas, title, cardUrl ?? undefined);
    if (result === 'shared') {
      setShareStatus('Shared!');
      trackShare('native_share');
    } else if (result === 'copied') {
      setShareStatus('Link copied!');
      trackShare('clipboard');
    }
    setSharing(false);
    setTimeout(() => setShareStatus(''), 3000);
  };

  const handlePostToCommunity = async () => {
    setPosting(true);
    try {
      await apiFetch('/api/community/posts', {
        method: 'POST',
        body: JSON.stringify({
          content: data.isPr
            ? `New PR at ${data.raceName}! Finished in ${data.finishTime} over ${data.distance}.`
            : `Finished ${data.raceName} in ${data.finishTime} (${data.distance}).`,
          post_type: 'race_result',
          scope: 'public',
          image_url: cardUrl ?? undefined,
        }),
      });
      trackShare('community');
      setShareStatus('Posted to community!');
      onSharedToCommunity?.();
      setTimeout(() => setShareStatus(''), 3000);
    } catch (e: any) {
      setShareStatus(e.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const trackShare = (platform: string) => {
    apiFetch('/api/share-events', {
      method: 'POST',
      body: JSON.stringify({ event_type: data.eventType ?? 'race_result', platform }),
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <div
        className="relative w-full max-w-lg flex flex-col items-center gap-5 fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Card preview */}
        <div className="rounded-xl overflow-hidden shadow-2xl w-full max-w-sm">
          <ShareCardCanvas data={data} size={360} />
        </div>

        {/* Status */}
        {shareStatus && (
          <div className="text-sm font-medium text-brand-400 bg-brand-950/60 border border-brand-800/40 rounded-lg px-4 py-2">
            {shareStatus}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <Button
            variant="primary"
            size="lg"
            onClick={handleShare}
            loading={sharing}
            className="w-full"
          >
            {typeof navigator !== 'undefined' && 'share' in navigator ? 'Share' : 'Copy Link'}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={handleDownload} className="w-full">
              Download PNG
            </Button>
            <Button
              variant="secondary"
              onClick={handlePostToCommunity}
              loading={posting}
              className="w-full"
            >
              Post to Feed
            </Button>
          </div>

          <Button variant="ghost" onClick={onClose} className="w-full">
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
